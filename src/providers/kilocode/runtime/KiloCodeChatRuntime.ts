import type { ChatRuntime, MessageContext, StreamChunk } from '../../../core/providers/types';
import type { BinaryManager } from '../../../core/binary/BinaryManager';
import type { KiloCodeSettings } from '../../../core/types';
import { execFile, spawn, type ChildProcess } from 'child_process';
import { randomBytes } from 'crypto';
import http from 'http';

interface KiloModel {
  providerID: string;
  modelID: string;
}

interface ProviderListResponse {
  all?: Array<{
    id: string;
    models?: Record<string, unknown>;
  }>;
}

const SERVER_READY_TIMEOUT_MS = 10000;
const PORT_DISCOVERY_DELAY_MS = 1500;
const DEFAULT_AGENT = 'code';
const DEFAULT_PROVIDER = 'anthropic';

/**
 * KiloCode Chat Runtime
 *
 * Uses `kilo serve` as the persistent transport and sends prompts through the
 * local HTTP API. The CLI server is protected with a per-runtime Basic Auth
 * password via KILO_SERVER_PASSWORD.
 */
interface ExtractedContent {
  thinking: string[];
  text: string[];
}

export class KiloCodeChatRuntime implements ChatRuntime {
  private binaryManager: BinaryManager;
  /** 设置获取器——每次访问返回最新设置，而非构建时的快照 */
  private getSettings: () => KiloCodeSettings;
  private currentProcess: ChildProcess | null = null;
  private startPromise: Promise<void> | null = null;
  private serverBaseUrl: string | null = null;
  private serverPassword: string | null = null;
  private sessionId: string | null = null;
  private streaming = false;
  private abortController: AbortController | null = null;
  private providerCache: ProviderListResponse | null = null;

  /**
   * @param binaryManager 二进制管理器
   * @param getSettings 设置获取器——每次访问时调用，返回最新设置。不要传快照对象，
   *                    否则用户修改设置后运行时不会生效。
   */
  constructor(binaryManager: BinaryManager, getSettings: () => KiloCodeSettings) {
    this.binaryManager = binaryManager;
    this.getSettings = getSettings;
  }

  async start(): Promise<void> {
    if (this.serverBaseUrl && this.currentProcess && !this.currentProcess.killed) return;
    if (this.startPromise) return this.startPromise;

    this.startPromise = this.startServer();
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
    this.abortController?.abort();
    this.killProcess();
    this.resetServerState();
  }

  async *sendMessage(content: string, context?: MessageContext): AsyncGenerator<StreamChunk> {
    await this.start();

    if (!this.serverBaseUrl || !this.sessionId) {
      console.error('[KiloCodeChatRuntime] Not ready — serverBaseUrl:', this.serverBaseUrl, 'sessionId:', this.sessionId);
      yield { type: 'error', error: 'KiloCode server is not ready' };
      yield { type: 'done' };
      return;
    }

    this.streaming = true;
    this.abortController = new AbortController();

    try {
      const payload = await this.buildMessagePayload(content, context);
      const response = await this.request(`/session/${encodeURIComponent(this.sessionId)}/message`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          'Content-Type': 'application/json',
        },
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error('[KiloCodeChatRuntime] HTTP error:', response.status, errorText.slice(0, 200));
        yield {
          type: 'error',
          error: `KiloCode HTTP API returned ${response.status}${errorText ? `: ${errorText}` : ''}`,
        };
        yield { type: 'done' };
        return;
      }

      const contentType = response.headers.get('content-type') ?? '';

      let emitted = false;
      for await (const chunk of this.parseResponse(response)) {
        emitted = true;
        yield chunk;
      }

      yield { type: 'done' };
    } catch (error) {
      if (!this.abortController?.signal.aborted) {
        yield { type: 'error', error: error instanceof Error ? error.message : String(error) };
      }
      yield { type: 'done' };
    } finally {
      this.streaming = false;
      this.abortController = null;
    }
  }

  cancel(): void {
    this.abortController?.abort();
    this.killProcess();
    this.resetServerState();
    this.streaming = false;
  }

  resetSession(): void {
    this.sessionId = null;
  }

  isStreaming(): boolean {
    return this.streaming;
  }

  sendApproval(): void {}

  private async startServer(): Promise<void> {
    const settings = this.getSettings();
    const cliPath = await this.binaryManager.getBinaryPath(settings);
    this.serverPassword = this.generatePassword();
    this.providerCache = null;

    const env = this.buildEnv(this.serverPassword);
    this.currentProcess = spawn(cliPath, ['serve', '--port', '0'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });

    this.currentProcess.on('error', (err) => {
      console.error('[KiloCodeChatRuntime] Process error event:', err);
    });
    this.currentProcess.on('exit', (code, signal) => {
      console.warn('[KiloCodeChatRuntime] Process exited:', { code, signal });
    });
    this.currentProcess.stderr?.on('data', (data: Buffer) => {
      console.warn('[KiloCodeChatRuntime] stderr:', data.toString());
    });

    const port = await this.waitForServerPort(this.currentProcess);
    this.serverBaseUrl = `http://127.0.0.1:${port}`;
    await this.waitForHttpReady();
    this.sessionId = await this.createSession();
  }

  private waitForServerPort(proc: ChildProcess): Promise<number> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let output = '';
      let discoveryTimer: ReturnType<typeof setTimeout> | null = null;
      let startupTimer: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (discoveryTimer) clearTimeout(discoveryTimer);
        if (startupTimer) clearTimeout(startupTimer);
        proc.stdout?.off('data', onData);
        proc.stderr?.off('data', onData);
        proc.off('error', onError);
        proc.off('exit', onExit);
      };

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn();
      };

      const onData = (data: Buffer) => {
        output += data.toString();
        const port = this.parsePort(output);
        if (port) settle(() => resolve(port));
      };

      const onError = (error: Error) => {
        settle(() => reject(error));
      };

      const onExit = (code: number | null) => {
        settle(() => reject(new Error(`kilo serve exited before startup completed${code === null ? '' : ` with code ${code}`}`)));
      };

      proc.stdout?.on('data', onData);
      proc.stderr?.on('data', onData);
      proc.on('error', onError);
      proc.on('exit', onExit);

      discoveryTimer = setTimeout(() => {
        this.discoverListeningPort(proc.pid)
          .then((port) => {
            if (port) settle(() => resolve(port));
          })
          .catch(() => {});
      }, PORT_DISCOVERY_DELAY_MS);

      startupTimer = setTimeout(() => {
        settle(() => reject(new Error('Timed out waiting for kilo serve to report its listening port')));
      }, SERVER_READY_TIMEOUT_MS);
    });
  }

  private parsePort(output: string): number | null {
    const urlMatch = output.match(/https?:\/\/(?:\[[^\]]+\]|[^:\s]+):(\d+)/i);
    if (urlMatch) return Number(urlMatch[1]);

    const portMatch = output.match(/\bport\s+(\d+)\b/i);
    return portMatch ? Number(portMatch[1]) : null;
  }

  private async discoverListeningPort(pid?: number): Promise<number | null> {
    if (!pid) return null;

    if (process.platform === 'win32') {
      const output = await this.execFileText('netstat.exe', ['-ano', '-p', 'tcp']);
      for (const line of output.split(/\r?\n/)) {
        if (!line.includes('LISTENING')) continue;
        const columns = line.trim().split(/\s+/);
        if (columns[columns.length - 1] !== String(pid)) continue;
        const localAddress = columns[1] ?? '';
        const port = Number(localAddress.match(/:(\d+)$/)?.[1]);
        if (port) return port;
      }
      return null;
    }

    const output = await this.execFileText('lsof', ['-Pan', '-p', String(pid), '-iTCP', '-sTCP:LISTEN']);
    for (const line of output.split(/\r?\n/)) {
      const port = Number(line.match(/:(\d+)\s+\(LISTEN\)/)?.[1]);
      if (port) return port;
    }
    return null;
  }

  private execFileText(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(command, args, { windowsHide: true }, (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(`${stdout}${stderr}`);
      });
    });
  }

  private async waitForHttpReady(): Promise<void> {
    const startedAt = Date.now();
    let lastError: unknown;

    while (Date.now() - startedAt < SERVER_READY_TIMEOUT_MS) {
      try {
        const response = await this.request('/session', { method: 'GET' });
        if (response.ok) return;
      } catch (error) {
        lastError = error;
      }
      await this.delay(200);
    }

    throw new Error(`Timed out waiting for kilo HTTP API${lastError instanceof Error ? `: ${lastError.message}` : ''}`);
  }

  private async createSession(): Promise<string> {
    const response = await this.request('/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(`Failed to create KiloCode session: HTTP ${response.status}`);
    }

    const session = await response.json() as { id?: string; sessionId?: string };
    const id = session.id ?? session.sessionId;
    if (!id) throw new Error('KiloCode session response did not include an id');
    return id;
  }

  private async buildMessagePayload(content: string, context?: MessageContext): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = {
      messageID: this.makeId('msg'),
      agent: this.resolveAgent(),
      parts: [{ type: 'text', text: content }],
    };

    // 传递 vault 路径上下文，让 CLI 知道在哪个 vault 中操作
    if (context?.vaultPath) {
      payload.vaultPath = context.vaultPath;
    }

    // 仅在用户在插件设置中显式配置了模型时才发送 modelID，
    // 否则让 CLI 使用自身配置文件中的默认模型。
    const model = await this.resolveModel();
    if (model) {
      payload.modelID = model.modelID;
      // 只在用户显式指定 providerID 时发送（格式如 "anthropic/claude-sonnet-4"）
      if (model.providerID) {
        payload.providerID = model.providerID;
        payload.model = model;
      }
    }

    return payload;
  }

  /**
   * 解析用户配置的模型。
   * @returns 用户显式指定了模型时返回 KiloModel，否则返回 null（让 CLI 使用自身默认）。
   */
  private async resolveModel(): Promise<KiloModel | null> {
    const settings = this.getSettings();
    const configuredModel = (settings.defaultModel || settings.model || '').trim();
    if (!configuredModel) return null;

    const parsed = this.parseConfiguredModel(configuredModel);
    if (parsed) return parsed;

    // 没有 provider 前缀（如 "claude-sonnet-4"），只返回 modelID，让服务器路由
    return {
      providerID: '',
      modelID: configuredModel,
    };
  }

  private parseConfiguredModel(model: string): KiloModel | null {
    const match = model.match(/^(anthropic|openai|google|groq|kilo|apertis|helicone)\/(.+)$/);
    if (!match) return null;
    return {
      providerID: match[1],
      modelID: match[2],
    };
  }

  private async findProviderForModel(modelID: string): Promise<KiloModel | null> {
    if (!modelID) return null;

    try {
      if (!this.providerCache) {
        const response = await this.request('/provider', { method: 'GET' });
        if (!response.ok) return null;
        this.providerCache = await response.json() as ProviderListResponse;
      }

      for (const provider of this.providerCache.all ?? []) {
        if (provider.models && Object.prototype.hasOwnProperty.call(provider.models, modelID)) {
          return {
            providerID: provider.id,
            modelID,
          };
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  private resolveAgent(): string {
    if (this.getSettings().permissionMode === 'plan') return 'plan';
    return DEFAULT_AGENT;
  }

  private async *parseResponse(response: Response): AsyncGenerator<StreamChunk> {
    const contentType = response.headers.get('content-type') ?? '';

    if (response.body && contentType.includes('text/event-stream')) {
      yield* this.parseEventStream(response.body);
      return;
    }

    const bodyText = await response.text();
    if (!bodyText.trim()) return;

    try {
      const json = JSON.parse(bodyText);
      const extracted = this.extractThinkingAndText(json);
      for (const t of extracted.thinking) {
        yield { type: 'thinking', content: t };
      }
      for (const t of extracted.text) {
        yield { type: 'text', content: t };
      }
    } catch {
      yield { type: 'text', content: bodyText };
    }
  }

  /**
   * 解析 SSE 流，合并同一次 read() 内的相邻同类 chunk。
   * 单次 read() 可能包含多个 SSE event，将连续的 text/thinking 合并后 yield，
   * 减少下游 for-await 循环和 DOM 更新次数。
   */
  private async *parseEventStream(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamChunk> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? '';

      // 收集本次 read() 的所有 chunk，合并相邻同类
      const chunks: StreamChunk[] = [];

      for (const event of events) {
        const dataLines = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim());

        for (const data of dataLines) {
          if (!data || data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const extracted = this.extractThinkingAndText(parsed);
            for (const t of extracted.thinking) {
              chunks.push({ type: 'thinking', content: t });
            }
            for (const t of extracted.text) {
              chunks.push({ type: 'text', content: t });
            }
          } catch {
            chunks.push({ type: 'text', content: data });
          }
        }
      }

      // 合并相邻同类 chunk 后 yield
      yield* this.mergeAdjacentChunks(chunks);
    }

    // 处理 buffer 中剩余的数据
    if (buffer.trim()) {
      const remaining = buffer.split(/\r?\n\r?\n/);
      for (const event of remaining) {
        const dataLines = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim());
        for (const data of dataLines) {
          if (!data || data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const extracted = this.extractThinkingAndText(parsed);
            for (const t of extracted.thinking) yield { type: 'thinking', content: t };
            for (const t of extracted.text) yield { type: 'text', content: t };
          } catch {
            yield { type: 'text', content: data };
          }
        }
      }
    }
  }

  /** 合并相邻同类 chunk（连续 text 合并为一个，连续 thinking 合并为一个） */
  private *mergeAdjacentChunks(chunks: StreamChunk[]): Generator<StreamChunk> {
    if (chunks.length === 0) return;

    let current: StreamChunk = { ...chunks[0] };
    for (let i = 1; i < chunks.length; i++) {
      const next = chunks[i];
      if (next.type === current.type && (current.type === 'text' || current.type === 'thinking')) {
        // 同类文本 chunk，合并内容
        current = {
          type: current.type,
          content: (current.content || '') + (next.content || ''),
        };
      } else {
        yield current;
        current = { ...next };
      }
    }
    yield current;
  }

  private extractText(value: unknown): string[] {
    if (value === null || value === undefined) return [];
    if (typeof value === 'string') return value ? [value] : [];
    if (typeof value !== 'object') return [];

    if (Array.isArray(value)) {
      const results: string[] = [];
      for (const item of value) {
        results.push(...this.extractText(item));
      }
      return results;
    }

    const record = value as Record<string, unknown>;
    if (record.type === 'text' && typeof record.text === 'string') {
      return [record.text];
    }
    if (typeof record.content === 'string') {
      return [record.content];
    }
    if (typeof record.text === 'string') {
      return [record.text];
    }
    if (Array.isArray(record.parts)) {
      return this.extractText(record.parts);
    }
    if (record.message) {
      return this.extractText(record.message);
    }
    if (record.data) {
      return this.extractText(record.data);
    }
    return [];
  }

  private extractThinkingAndText(value: unknown): ExtractedContent {
    const result: ExtractedContent = { thinking: [], text: [] };
    this.collectThinkingAndText(value, result);
    return result;
  }

  private collectThinkingAndText(value: unknown, result: ExtractedContent): void {
    if (value === null || value === undefined) return;

    if (typeof value === 'string') {
      if (value) result.text.push(value);
      return;
    }

    if (typeof value !== 'object') return;

    if (Array.isArray(value)) {
      for (const item of value) {
        this.collectThinkingAndText(item, result);
      }
      return;
    }

    const record = value as Record<string, unknown>;

    // type === 'thinking' → thinking
    if (record.type === 'thinking' && typeof record.text === 'string') {
      result.thinking.push(record.text);
      return;
    }
    // type === 'reasoning' → thinking（DeepSeek 等模型可能用 reasoning）
    if (record.type === 'reasoning' && typeof record.text === 'string') {
      result.thinking.push(record.text);
      return;
    }
    // 有 reasoning_content 字段 → thinking 内容单独提取
    if (typeof record.reasoning_content === 'string' && record.reasoning_content) {
      result.thinking.push(record.reasoning_content);
      // 如果同时有 text，继续处理 text
      if (typeof record.text === 'string') {
        result.text.push(record.text);
      }
      return;
    }
    // type === 'text' → text
    if (record.type === 'text' && typeof record.text === 'string') {
      result.text.push(record.text);
      return;
    }

    if (Array.isArray(record.parts)) {
      this.collectThinkingAndText(record.parts, result);
      return;
    }

    if (typeof record.text === 'string' && record.text) {
      result.text.push(record.text);
    } else if (typeof record.content === 'string' && record.content) {
      result.text.push(record.content);
    }
  }

  /**
   * 使用 Node.js http 模块发送 HTTP 请求。
   * 浏览器 fetch() 在 Electron renderer 进程中受 CORS 限制，
   * 而 Node.js http 模块不受此限制。
   */
  private request(path: string, init: RequestInit = {}): Promise<Response> {
    if (!this.serverBaseUrl) throw new Error('KiloCode server URL is not available');

    // 捕获到局部变量，确保 TypeScript 类型缩窄（string 而非 string | null）
    const baseUrl = this.serverBaseUrl;

    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const method = (init.method || 'GET') as string;

      // 从 init.headers 提取键值对
      const headers: Record<string, string> = {};
      if (init.headers instanceof Headers) {
        init.headers.forEach((value, key) => { headers[key] = value; });
      } else if (init.headers && typeof init.headers === 'object') {
        for (const [key, value] of Object.entries(init.headers)) {
          if (typeof value === 'string') headers[key] = value;
        }
      }
      headers['Authorization'] = this.basicAuthHeader();

      const req = http.request({
        hostname: url.hostname,
        port: Number(url.port),
        path: url.pathname + url.search,
        method,
        headers,
      }, (res) => {
        // 将 Node.js headers 转为 plain object（合并多值 header）
        const resHeaders: Record<string, string> = {};
        for (const [key, value] of Object.entries(res.headers)) {
          if (typeof value === 'string') resHeaders[key] = value;
          else if (Array.isArray(value)) resHeaders[key] = value.join(', ');
        }

        const contentType = res.headers['content-type'] ?? '';

        if (contentType.includes('text/event-stream')) {
          // SSE 流式：将 Node.js IncomingMessage 包装为 Web ReadableStream
          const readable = new ReadableStream({
            start(controller) {
              res.on('data', (chunk: Buffer) => {
                controller.enqueue(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
              });
              res.on('end', () => controller.close());
              res.on('error', (err) => controller.error(err));
            },
          });
          resolve(new Response(readable, { status: res.statusCode ?? 0, headers: resHeaders }));
        } else {
          // 非流式：收集完整 body
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf-8');
            resolve(new Response(body, { status: res.statusCode ?? 0, headers: resHeaders }));
          });
          res.on('error', reject);
        }
      });

      req.on('error', reject);

      // AbortController 信号：销毁请求
      if (init.signal) {
        if (init.signal.aborted) {
          req.destroy();
          reject(new DOMException('The operation was aborted.', 'AbortError'));
          return;
        }
        init.signal.addEventListener('abort', () => req.destroy(), { once: true });
      }

      if (init.body && typeof init.body === 'string') {
        req.write(init.body);
      }
      req.end();
    });
  }

  private basicAuthHeader(): string {
    if (!this.serverPassword) throw new Error('KiloCode server password is not available');
    return `Basic ${Buffer.from(`kilo:${this.serverPassword}`).toString('base64')}`;
  }

  private buildEnv(serverPassword: string): Record<string, string> {
    const env: Record<string, string> = { ...(process.env as Record<string, string>) };
    env.KILO_SERVER_PASSWORD = serverPassword;

    const settings = this.getSettings();
    if (settings.apiKey) {
      env.KILO_API_KEY = settings.apiKey;
    }
    if (settings.environmentVariables?.['KILO_BASE_URL']) {
      env.KILO_BASE_URL = settings.environmentVariables['KILO_BASE_URL'];
    }
    return env;
  }

  private killProcess(): void {
    if (this.currentProcess && !this.currentProcess.killed) {
      this.currentProcess.kill();
    }
    this.currentProcess = null;
  }

  private resetServerState(): void {
    this.startPromise = null;
    this.serverBaseUrl = null;
    this.serverPassword = null;
    this.sessionId = null;
    this.providerCache = null;
  }

  private makeId(prefix: string): string {
    return `${prefix}_${Date.now().toString(36)}${randomBytes(6).toString('hex')}`;
  }

  private generatePassword(): string {
    return randomBytes(24).toString('base64url');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
