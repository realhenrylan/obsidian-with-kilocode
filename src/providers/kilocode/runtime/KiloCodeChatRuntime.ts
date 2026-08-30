import type { ChatRuntime, MessageContext, StreamChunk, StreamChunkType } from '../../../core/providers/types';
import type { BinaryManager } from '../../../core/binary/BinaryManager';
import type { KiloCodeSettings } from '../../../core/types';

import { createKiloServer } from '@kilocode/sdk/server';
import { createKiloClient, type KiloClient, type Config } from '@kilocode/sdk/client';
import * as http from 'http';
import * as pathModule from 'path';
import { EventBuffer } from './EventBuffer';
import { loadSkills } from './SkillLoader';
import { QUESTION_PROTOCOL } from './prompts';

const DEFAULT_AGENT = 'code';
const SERVE_TIMEOUT = 15000;
/** 健康检查（探活）超时：进程死连接会立即 ECONNREFUSED，超时视为僵死 */
const HEALTH_CHECK_TIMEOUT = 3000;

/** 为 Promise 加超时限制；超时后调用 onTimeout 供调用方中断底层操作 */
async function withTimeout<T>(p: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error(`Operation timed out after ${ms}ms`));
    }, ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

interface KiloSession {
  create(params: { body: Record<string, unknown>; signal?: AbortSignal }): Promise<{ error?: unknown; data?: { id: string } }>;
  abort(params: { path: { id: string } }): Promise<void>;
  prompt(params: { path: { id: string }; body: Record<string, unknown>; signal?: AbortSignal }): Promise<{ error?: unknown; data?: { parts?: Array<Record<string, unknown>> } }>;
}

interface KiloClientInternals {
  _client?: { setConfig(config: { headers: Record<string, string> }): void };
  postSessionIdPermissionsPermissionId(params: { path: { id: string; permissionID: string }; body: { decision: string } }): Promise<void>;
}

interface StreamEventPart {
  type?: string;
  text?: string;
  name?: string;
  toolName?: string;
  id?: string;
  input?: Record<string, unknown>;
  arguments?: Record<string, unknown>;
  output?: string;
  content?: string;
  thinking?: string;
  delta?: string;
  part?: StreamEventPart;
  properties?: Record<string, unknown>;
  error?: unknown;
  message?: string;
  status?: string;
  state?: string;
  description?: string;
}

/** Node.js http-based fetch that bypasses CORS in Obsidian's Electron renderer.
 *  The standard fetch() in Electron renderer is subject to CORS (origin = app://obsidian.md
 *  cannot access http://127.0.0.1). This wrapper uses the Node.js http module directly,
 *  which has no CORS restrictions.
 *
 *  - SSE responses (Content-Type: text/event-stream): returns a Response with a streaming
 *    ReadableStream body so the SSE client can consume events in real time
 *  - All other responses: buffers the full body and returns a standard Response */
function nodeFetch(input: RequestInfo | URL, init?: RequestInit, agent?: http.Agent): Promise<Response> {
  const request = new Request(input, init);
  const url = new URL(request.url);

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: request.method,
        headers: Object.fromEntries(request.headers.entries()),
        agent,
      },
      (res) => {
        const status = res.statusCode ?? 500;
        const statusText = res.statusMessage ?? '';
        const headers = new Headers();
        for (let i = 0; i < res.rawHeaders.length; i += 2) {
          headers.append(res.rawHeaders[i], res.rawHeaders[i + 1]);
        }

        // Check Content-Type to decide streaming vs buffering
        const ct = (res.headers['content-type'] || '').toLowerCase();
        const isSSE = ct.includes('text/event-stream');

        if (isSSE) {
          // SSE: bridge Node.js Readable → Web ReadableStream
          const stream = new ReadableStream({
            start(controller) {
              res.on('data', (chunk: Buffer) => controller.enqueue(chunk));
              res.on('end', () => controller.close());
              res.on('error', (err) => controller.error(err));
            },
          });
          resolve(new Response(stream, { status, statusText, headers }));
        } else {
          // Regular requests: buffer the full response
          const bodyBuffer: Buffer[] = [];
          res.on('data', (chunk: Buffer) => bodyBuffer.push(chunk));
          res.on('end', () => {
            const body = Buffer.concat(bodyBuffer);
            resolve(new Response(body, { status, statusText, headers }));
          });
          res.on('error', reject);
        }
      },
    );

    if (init?.signal) {
      init.signal.addEventListener('abort', () => { req.destroy(); }, { once: true });
    }

    req.on('error', (err) => {
      // Ignore abort errors
      if ((err as { code?: string })?.code === 'ABORT_ERR') return;
      reject(err);
    });

    if (request.body) {
      request.arrayBuffer().then((buf) => {
        if (buf.byteLength > 0) req.write(Buffer.from(buf));
        req.end();
      }).catch(reject);
    } else {
      req.end();
    }
  });
}

/**
 * MCP 配置提供者：返回 vault/.kilocode/mcp.json 的 mcp 字段内容（SDK Config.mcp 格式）。
 * 读取失败时应 resolve null（不影响 serve 启动）。
 */
export type McpConfigProvider = () => Promise<Record<string, unknown> | null>;

export class KiloCodeChatRuntime implements ChatRuntime {
  private binaryManager: BinaryManager;
  private getSettings: () => KiloCodeSettings;
  private mcpConfigProvider: McpConfigProvider | null;
  private serverHandle: { url: string; close(): void } | null = null;
  private startPromise: Promise<void> | null = null;
  private client: KiloClient | null = null;
  private sessionId: string | null = null;
  private abortController: AbortController | null = null;
  private streaming = false;
  private pendingModel: string | null = null;
  private vaultPath: string | null = null;
  private idleTimer: number | null = null;
  private httpAgent: http.Agent;
  private boundFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

  readonly eventBuffer = new EventBuffer();

  constructor(binaryManager: BinaryManager, getSettings: () => KiloCodeSettings, mcpConfigProvider?: McpConfigProvider | null) {
    this.binaryManager = binaryManager;
    this.getSettings = getSettings;
    this.httpAgent = new http.Agent({
      keepAlive: true,
      keepAliveMsecs: 30000,
      maxSockets: 1,
    });
    this.boundFetch = (input, init) => nodeFetch(input, init, this.httpAgent);
    this.mcpConfigProvider = mcpConfigProvider ?? null;
  }

  async start(vaultPath?: string): Promise<void> {
    if (vaultPath) this.vaultPath = vaultPath;
    if (this.serverHandle && this.client) {
      // If the client was created without a vault path (e.g. during warmup),
      // push the directory header now so the CLI knows which vault to operate in.
      if (this.vaultPath) this.applyVaultPathToClient();
      return;
    }
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.ensureServer(this.vaultPath ?? undefined);
    try {
      await this.startPromise;
    } catch (err) {
      console.error('[KiloCodeChatRuntime] Failed to start kilo serve:', err);
      throw err;
    } finally {
      this.startPromise = null;
    }
  }

  async stop(): Promise<void> {
    this.clearIdleTimer();
    this.abortController?.abort();
    if (this.client && this.sessionId) {
      try {
        await (this.client.session as unknown as KiloSession).abort({ path: { id: this.sessionId } });
      } catch (err) {
        // 会话可能已随进程结束，仅记录便于诊断
        console.warn('[KiloCodeChatRuntime] session abort during stop failed:', err);
      }
    }
    if (this.serverHandle) {
      try { this.serverHandle.close(); } catch (err) {
        console.warn('[KiloCodeChatRuntime] server close during stop failed:', err);
      }
    }
    this.client = null;
    this.serverHandle = null;
    this.sessionId = null;
    this.eventBuffer.clear();
    this.httpAgent.destroy();
  }

/** 同步强制终止 CLI 进程（用于 process.on('exit') 兜底清理） */
  killSync(): void {
    this.clearIdleTimer();
    this.abortController?.abort();
    if (this.serverHandle) {
      try { this.serverHandle.close(); } catch { /* ignore: server already closed */ }
    }
    this.client = null;
    this.serverHandle = null;
    this.sessionId = null;
    this.eventBuffer.clear();
    this.httpAgent.destroy();
  }

  setModel(modelId: string): void {
    this.pendingModel = modelId;
  }

  getModel(): string | null {
    return this.pendingModel;
  }

  resetSession(): void {
    this.sessionId = null;
  }

  isStreaming(): boolean {
    return this.streaming;
  }

  cancel(): void {
    this.clearIdleTimer();
    this.abortController?.abort();
    if (this.client && this.sessionId) {
      void (this.client.session as unknown as KiloSession).abort({ path: { id: this.sessionId } })
        .catch((err) => console.warn('[KiloCodeChatRuntime] cancel abort failed:', err));
    }
    this.streaming = false;
  }

  async *sendMessage(content: string, context?: MessageContext): AsyncGenerator<StreamChunk> {
    this.clearIdleTimer();
    await this.start(context?.vaultPath);
    // 进程可能在空闲超时/崩溃后已死：探活失败自动重建，避免后续所有调用静默失败
    await this.ensureAlive();
    if (!this.client || !this.serverHandle) {
      yield this.emit({ type: 'error', error: 'KiloCode server is not ready' });
      yield this.emit({ type: 'done' });
      return;
    }
    this.streaming = true;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    // prompt 空闲超时：CLI 卡死时用户无需手动 Cancel（复用 idleTimeoutSeconds 语义）
    const promptTimeoutMs = Math.max((this.getSettings().idleTimeoutSeconds ?? 120), 30) * 1000;
    try {
      if (!this.sessionId) {
        const created = await this.createSession(signal);
        if (!created) {
          yield this.emit({ type: 'error', error: 'Failed to create session' });
          yield this.emit({ type: 'done' });
          return;
        }
      }

      const t0 = performance.now();
      const skillsContext = await this.buildSkillsContent(context?.vaultPath);
      let enhancedContent = skillsContext ? skillsContext + '\n\n' + content : content;
      if (context?.customInstructions) {
        enhancedContent += `\n\n[User Custom Instructions]\n${context.customInstructions}`;
      }

      let promptResult = await withTimeout(
        this.promptSession(enhancedContent, signal),
        promptTimeoutMs,
        () => this.abortController?.abort(),
      );
      if (promptResult.error && this.isSessionGone(String(promptResult.error))) {
        // CLI 端会话失效（如 serve 重启后 sessionId 过期）：重建会话重试一次
        console.warn('[KiloCodeChatRuntime] session gone, recreating and retrying once');
        this.sessionId = null;
        if (!(await this.createSession(signal))) {
          yield this.emit({ type: 'error', error: 'Failed to recreate session' });
          yield this.emit({ type: 'done' });
          return;
        }
        promptResult = await withTimeout(
          this.promptSession(enhancedContent, signal),
          promptTimeoutMs,
          () => this.abortController?.abort(),
        );
      }
      if (promptResult.error) {
        yield this.emit({ type: 'error', error: String(promptResult.error) });
        yield this.emit({ type: 'done' });
        return;
      }
      const t1 = performance.now();
      console.log('[KiloCodeTiming] prompt latency:', `${(t1 - t0).toFixed(0)}ms`);

      if (promptResult.data?.parts) {
        const parts = promptResult.data.parts;
        if (Array.isArray(parts)) {
      for (const part of parts) {
        if (signal.aborted) break;
        const chunk = this.parsePart(part);
        if (chunk) yield this.emit(chunk);
      }
        }
      }
      yield this.emit({ type: 'done' });
    } catch (err: unknown) {
      const errObj = err as { name?: string; message?: string };
      if (errObj?.name === 'AbortError') {
        yield this.emit({ type: 'done' });
      } else {
        console.error('[KiloCodeChatRuntime] sendMessage error:', err);
        yield this.emit({ type: 'error', error: errObj?.message || String(err) });
        yield this.emit({ type: 'done' });
      }
    } finally {
      this.streaming = false;
      this.startIdleTimer();
    }
  }

  /**
   * 探活：对 serve 发一个轻量 GET（连接成功即认为进程存活，不关心状态码）。
   * 失败说明进程已死（崩溃/被杀），stop 后重建，避免后续调用静默失败。
   */
  private async ensureAlive(): Promise<void> {
    if (!this.serverHandle || !this.client) return;
    try {
      const res = await withTimeout(this.boundFetch(this.serverHandle.url), HEALTH_CHECK_TIMEOUT);
      void res; // 只验证连接，不消费响应体
    } catch (err) {
      console.warn('[KiloCodeChatRuntime] health check failed, restarting server:', err);
      try {
        await this.stop();
        await this.start(this.vaultPath ?? undefined);
      } catch (restartErr) {
        console.error('[KiloCodeChatRuntime] server restart failed:', restartErr);
      }
    }
  }

  /** 创建 CLI 会话；失败返回 null（错误已记录） */
  private async createSession(signal: AbortSignal): Promise<string | null> {
    if (!this.client) return null;
    try {
      const sessionResult = await (this.client.session as unknown as KiloSession).create({
        body: { agent: DEFAULT_AGENT, ...this.buildModelConfig() },
        signal,
      });
      if (sessionResult.error) {
        console.error('[KiloCodeChatRuntime] session.create error:', sessionResult.error);
        return null;
      }
      this.sessionId = sessionResult.data!.id;
      return this.sessionId;
    } catch (err) {
      console.error('[KiloCodeChatRuntime] session.create failed:', err);
      return null;
    }
  }

  private promptSession(content: string, signal: AbortSignal) {
    return (this.client as unknown as { session: KiloSession }).session.prompt({
      path: { id: this.sessionId! },
      body: {
        agent: DEFAULT_AGENT,
        parts: [{ type: 'text', text: content }],
      },
      signal,
    });
  }

  /** 判断错误是否为会话失效（serve 重启后旧 sessionId 不再存在） */
  private isSessionGone(errStr: string): boolean {
    const lower = errStr.toLowerCase();
    return lower.includes('not found') || lower.includes('404') || lower.includes('session');
  }

  sendApproval?(toolName: string, decision: 'allow' | 'deny'): void {
    if (this.client && this.sessionId) {
      void (this.client as unknown as KiloClientInternals).postSessionIdPermissionsPermissionId({
        path: { id: this.sessionId, permissionID: toolName },
        body: { decision },
      }).catch((err) => {
        // 审批回执丢失会导致 CLI 端工具调用永久挂起，必须留下诊断信息
        console.error('[KiloCodeChatRuntime] Failed to send approval:', err);
      });
    }
  }

  /** Push the vault directory into the existing client's request headers so the
   *  CLI knows which vault to operate on. This handles the warmup case where
   *  the client was created before the vault path was available. */
  private applyVaultPathToClient(): void {
    if (!this.vaultPath || !this.client) return;
    const underlying = (this.client as unknown as KiloClientInternals)._client;
    if (underlying?.setConfig) {
      underlying.setConfig({
        headers: { 'x-kilo-directory': encodeURIComponent(this.vaultPath) },
      });
    }
  }

  private async ensureServer(vaultPath?: string): Promise<void> {
    const settings = this.getSettings();
    const cliPath = await this.binaryManager.getBinaryPath(settings);
    if (!cliPath) {
      throw new Error('KiloCode CLI binary not found. Configure it in settings.');
    }
    const binDir = pathModule.dirname(cliPath);
    const origPath = process.env.PATH || '';
    const pathSep = pathModule.delimiter;
    const pathDirs = [origPath];

    // Add the binary's directory to PATH if it's a real directory
    if (binDir && binDir !== '.' && !origPath.split(pathSep).includes(binDir)) {
      pathDirs.unshift(binDir);
    }

    // On Windows, ensure %APPDATA%\npm is in PATH for .cmd wrappers
    if (process.platform === 'win32' && process.env.APPDATA) {
      const npmGlobalDir = pathModule.join(process.env.APPDATA, 'npm');
      if (!origPath.split(pathSep).includes(npmGlobalDir)) {
        pathDirs.unshift(npmGlobalDir);
        console.debug('[KiloCode] Added npm global dir to PATH:', npmGlobalDir);
      }
    }

    // PATH 增强：把 CLI 所在目录（及 Windows 的 npm 全局目录）临时前插，仅作用于
    // 本次 serve 进程 spawn；finally 恢复，避免多窗口/多次启动累积污染全局 PATH。
    // createKiloServer 无 env 选项，只能借助 process.env 传递给子进程。
    const prevPath = process.env.PATH;
    process.env.PATH = pathDirs.join(pathSep);
    try {
      console.debug('[KiloCode] ensureServer: cliPath=' + cliPath + ' method=' + (typeof this.binaryManager.getDetectionMethod === 'function' ? this.binaryManager.getDetectionMethod() : 'unknown'));

      // 路径 A：插件级 MCP 配置（vault/.kilocode/mcp.json）透传给 kilo serve（KILO_CONFIG_CONTENT）
      let mcpConfig: Record<string, unknown> | null = null;
      if (this.mcpConfigProvider) {
        try {
          mcpConfig = await this.mcpConfigProvider();
        } catch (err) {
          // MCP 配置读取失败不应阻塞 serve 启动
          console.error('[KiloCode] Failed to read MCP config, starting serve without it:', err);
        }
      }

      this.serverHandle = await createKiloServer({
        hostname: '127.0.0.1',
        port: 0,
        timeout: SERVE_TIMEOUT,
        cors: ['app://obsidian.md'],
        // mcp.json 是 JSON 文件内容（unknown），此处安全转换为 SDK Config 结构
        ...(mcpConfig ? { config: { mcp: mcpConfig } as Config } : {}),
      });
    } finally {
      if (prevPath !== undefined) {
        process.env.PATH = prevPath;
      } else {
        delete process.env.PATH;
      }
    }
    this.client = createKiloClient({
      baseUrl: this.serverHandle.url,
      fetch: this.boundFetch,
      ...(vaultPath ? { directory: vaultPath } : {}),
    });
  }

  /** 查询 CLI 的 MCP server 真实状态（路径 A 下连接由 CLI 管理，插件只查询呈现） */
  async getMcpStatus(): Promise<Record<string, { status: string; error?: string }>> {
    await this.start();
    if (!this.client) return {};
    try {
      const result = await (this.client.mcp as any).status({});
      return (result?.data ?? {}) as Record<string, { status: string; error?: string }>;
    } catch (err) {
      console.error('[KiloCode] getMcpStatus error:', err);
      return {};
    }
  }

  private buildModelConfig(): Record<string, unknown> {
    // temperature 为独立设置项，总是透传（PoC 已验证 kilo serve session.create 接受）
    const config: Record<string, unknown> = {
      temperature: this.getSettings().temperature,
    };
    const model = this.resolveModel();
    if (!model) return config;
    config.modelID = model.modelID;
    config.providerID = model.providerID;
    return config;
  }

  private resolveModel(): { providerID: string; modelID: string } | null {
    if (this.pendingModel) {
      const parsed = this.parseModelId(this.pendingModel);
      if (parsed) return parsed;
    }
    const settings = this.getSettings();
    const modelStr = settings.model || settings.defaultModel;
    if (modelStr) {
      const parsed = this.parseModelId(modelStr);
      if (parsed) return parsed;
    }
    return null;
  }

  private parseModelId(s: string): { providerID: string; modelID: string } | null {
    const parts = s.split('/');
    if (parts.length === 2) return { providerID: parts[0], modelID: parts[1] };
    if (parts.length === 3 && parts[0] === 'kilo') return { providerID: parts[1], modelID: parts[2] };
    if (parts.length >= 3) return { providerID: parts[parts.length - 2], modelID: parts[parts.length - 1] };
    if (parts.length === 1) return { providerID: '', modelID: parts[0] };
    return null;
  }

  private emit(chunk: StreamChunk): StreamChunk {
    this.eventBuffer.append(chunk);
    return chunk;
  }

  private async buildSkillsContent(vaultPath?: string): Promise<string | null> {
    if (!vaultPath) return null;

    const skills = await loadSkills(vaultPath);
    if (skills.length === 0) return null;

    const parts: string[] = [];

    const coreSkills = skills.filter(s => s.name === 'kilocode-core');
    const specialistSkills = skills.filter(s => s.name !== 'kilocode-core');

    if (coreSkills.length > 0) {
      parts.push('[SYSTEM CONTEXT — Obsidian KiloCode Core]');
      for (const core of coreSkills) {
        parts.push(core.content);
      }
    }

    if (specialistSkills.length > 0) {
      parts.push('[AVAILABLE SPECIALIST SKILLS]');
      for (const skill of specialistSkills) {
        parts.push(`- ${skill.name}: ${skill.description}`);
      }
      parts.push('Use the `skill` tool to load any of these when needed.');
    }

    parts.push(QUESTION_PROTOCOL);

    return parts.join('\n\n');
  }

  private clearIdleTimer(): void {
    if (this.idleTimer !== null) {
      window.clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private startIdleTimer(): void {
    this.clearIdleTimer();
    const timeoutSeconds = this.getSettings().idleTimeoutSeconds ?? 120;
    if (timeoutSeconds <= 0) return;
    this.idleTimer = window.setTimeout(() => {
      console.log('[KiloCodeChatRuntime] Idle timeout reached, stopping server');
      void this.stop();
    }, timeoutSeconds * 1000);
  }

  private parseSSEBlock(block: string): { type: string; data: Record<string, unknown> } | null {
    const lines = block.split(String.fromCharCode(10));
    let eventType = '';
    let dataStr = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) eventType = line.slice(7).trim();
      else if (line.startsWith('data: ')) dataStr = line.slice(6).trim();
    }
    if (!eventType || !dataStr) return null;
    try { return { type: eventType, data: JSON.parse(dataStr) as Record<string, unknown> }; } catch { return null; }
  }

  private parseEvent(event: { type: string; data: Record<string, unknown> }): StreamChunk | null {
    const { type, data } = event;
    const props = (data.properties ?? data) as StreamEventPart;
    switch (type) {
      // Server lifecycle events - ignore
      case 'server.connected':
      case 'server.heartbeat':
      case 'server.disconnected':
        return null;

      // Streaming text / reasoning / tool parts
      case 'message.part.delta':
      case 'message.stream.chunk': {
        const dataPart = data.part as StreamEventPart | undefined;
        const partType = props.type || dataPart?.type;
        const partBody = props.part || dataPart || props;
        const text = partBody.text || partBody.delta || '';

        if (partType === 'reasoning' || partType === 'thinking') {
          return { type: 'thinking' as StreamChunkType, content: text };
        }
        if (partType === 'text') {
          return { type: 'text' as StreamChunkType, content: text };
        }
        if (partType === 'tool_use' && (partBody.name || partBody.toolName)) {
          return { type: 'tool_use' as StreamChunkType, toolCall: { id: partBody.id || ('tool-' + Date.now()), name: partBody.name || partBody.toolName || '', input: partBody.input || partBody.arguments || {}, status: 'running' } };
        }
        if (partType === 'tool_result' && partBody.id) {
          return { type: 'tool_result' as StreamChunkType, toolCall: { id: partBody.id, name: partBody.name || '', input: partBody.input || {}, status: 'completed', result: partBody.output || partBody.content || '' } };
        }
        // Also try raw parsePart for backward compatibility
        const parsed = this.parsePart(props.part || dataPart || props);
        if (parsed) return parsed;
        return null;
      }

      // Part completed (final part state)
      case 'message.part.updated':
        if (props.error) {
          return { type: 'error' as StreamChunkType, error: typeof props.error === 'string' ? props.error : JSON.stringify(props.error) };
        }
        return null;

      // Full message updated — signal done
      case 'message.updated':
        if (props.error) {
          return { type: 'error' as StreamChunkType, error: typeof props.error === 'string' ? props.error : JSON.stringify(props.error) };
        }
        return { type: 'done' as StreamChunkType };

      // Session status — used to detect completion
      case 'session.status':
        if (props.status === 'error' || props.state === 'error') {
          return { type: 'error' as StreamChunkType, error: typeof props.error === 'string' ? props.error : props.message || 'Session error' };
        }
        return null;

      // Tool permission request
      case 'tool.permission.required':
        return { type: 'approval_required' as StreamChunkType, approvalRequest: { toolName: props.toolName || props.name || 'unknown', input: props.input || props.arguments || {}, description: props.description || ('Allow tool call: ' + (props.toolName || props.name)) } };

      // Legacy event types
      case 'message.stream.begin': return null;
      case 'message.stream.end':
        if (props.error) return { type: 'error' as StreamChunkType, error: typeof props.error === 'string' ? props.error : JSON.stringify(props.error) };
        return null;
      case 'message.stream.error':
        return { type: 'error' as StreamChunkType, error: props.message || (typeof props.error === 'string' ? props.error : '') || 'Unknown error' };

      default: return null;
    }
  }

  private parsePart(part: StreamEventPart): StreamChunk | null {
    if (!part) return null;
    if (part.type === 'reasoning' || part.type === 'thinking' || part.thinking) return { type: 'thinking' as StreamChunkType, content: part.text || part.thinking || '' };
    if (part.type === 'text' && part.text) return { type: 'text' as StreamChunkType, content: part.text };
    if (part.type === 'tool_use' && part.name) return { type: 'tool_use' as StreamChunkType, toolCall: { id: part.id || ('tool-' + Date.now()), name: part.name, input: part.input || {}, status: 'running' } };
    if (part.type === 'tool_result' && part.id) return { type: 'tool_result' as StreamChunkType, toolCall: { id: part.id, name: part.name || '', input: part.input || {}, status: 'completed', result: part.output || part.content || '' } };
    return null;
  }
}
