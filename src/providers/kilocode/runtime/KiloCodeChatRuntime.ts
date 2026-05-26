import type { ChatRuntime, MessageContext, StreamChunk, StreamChunkType } from '../../../core/providers/types';
import type { BinaryManager } from '../../../core/binary/BinaryManager';
import type { KiloCodeSettings } from '../../../core/types';

import { createKiloServer, type ServerOptions } from '@kilocode/sdk/server';
import { createKiloClient } from '@kilocode/sdk/client';
import type { KiloClient } from '@kilocode/sdk/client';
import * as http from 'http';

const DEFAULT_AGENT = 'code';
const SERVE_TIMEOUT = 15000;

/** Node.js http-based fetch that bypasses CORS in Obsidian's Electron renderer.
 *  The standard fetch() in Electron renderer is subject to CORS (origin = app://obsidian.md
 *  cannot access http://127.0.0.1). This wrapper uses the Node.js http module directly,
 *  which has no CORS restrictions.
 *
 *  - SSE responses (Content-Type: text/event-stream): returns a Response with a streaming
 *    ReadableStream body so the SSE client can consume events in real time
 *  - All other responses: buffers the full body and returns a standard Response */
function nodeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
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
      if ((err as any)?.code === 'ABORT_ERR') return;
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

export class KiloCodeChatRuntime implements ChatRuntime {
  private binaryManager: BinaryManager;
  private getSettings: () => KiloCodeSettings;
  private serverHandle: { url: string; close(): void } | null = null;
  private startPromise: Promise<void> | null = null;
  private client: KiloClient | null = null;
  private sessionId: string | null = null;
  private abortController: AbortController | null = null;
  private streaming = false;
  private pendingModel: string | null = null;
  private vaultPath: string | null = null;

  constructor(binaryManager: BinaryManager, getSettings: () => KiloCodeSettings) {
    this.binaryManager = binaryManager;
    this.getSettings = getSettings;
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
    this.abortController?.abort();
    if (this.client && this.sessionId) {
      try {
        await (this.client.session as any).abort({ path: { id: this.sessionId } });
      } catch {}
    }
    if (this.serverHandle) {
      try { this.serverHandle.close(); } catch {}
    }
    this.client = null;
    this.serverHandle = null;
    this.sessionId = null;
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
    this.abortController?.abort();
    if (this.client && this.sessionId) {
      (this.client.session as any).abort({ path: { id: this.sessionId } }).catch(() => {});
    }
    this.streaming = false;
  }

  async *sendMessage(content: string, context?: MessageContext): AsyncGenerator<StreamChunk> {
    // Pass vault path through start() so it's available even when the client
    // was already created without directory config (e.g. during warmup).
    await this.start(context?.vaultPath);
    if (!this.client || !this.serverHandle) {
      yield { type: 'error', error: 'KiloCode server is not ready' };
      yield { type: 'done' };
      return;
    }
    this.streaming = true;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    try {
      if (!this.sessionId) {
        const sessionResult = await (this.client.session as any).create({
          body: { agent: DEFAULT_AGENT, ...this.buildModelConfig() },
          signal,
        });
        if (sessionResult.error) {
          yield { type: 'error', error: String(sessionResult.error) };
          yield { type: 'done' };
          return;
        }
        this.sessionId = sessionResult.data.id as string;
      }

      // Note: kilo serve v7.3.1 returns the complete response in POST /session/{id}/message
      // directly. The /global/event SSE endpoint exists but does not emit any events during
      // normal prompt processing (verified by direct HTTP testing). We skip the SDK's SSE
      // event subscription and parse the prompt response parts directly instead.
      const promptResult = await (this.client.session as any).prompt({
        path: { id: this.sessionId },
        body: { agent: DEFAULT_AGENT, parts: [{ type: 'text', text: content }] },
        signal,
      });
      if (promptResult.error) {
        yield { type: 'error', error: String(promptResult.error) };
        yield { type: 'done' };
        return;
      }
      if (promptResult.data?.parts) {
        const parts = promptResult.data.parts;
        if (Array.isArray(parts)) {
          for (const part of parts) {
            if (signal.aborted) break;
            const chunk = this.parsePart(part);
            if (chunk) yield chunk;
          }
        }
      }
      yield { type: 'done' };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        yield { type: 'done' };
      } else {
        console.error('[KiloCodeChatRuntime] sendMessage error:', err);
        yield { type: 'error', error: err?.message || String(err) };
        yield { type: 'done' };
      }
    } finally {
      this.streaming = false;
    }
  }

  sendApproval?(toolName: string, decision: 'allow' | 'deny'): void {
    if (this.client && this.sessionId) {
      (this.client as any).postSessionIdPermissionsPermissionId({
        path: { id: this.sessionId, permissionID: toolName },
        body: { decision },
      }).catch(() => {});
    }
  }

  /** Push the vault directory into the existing client's request headers so the
   *  CLI knows which vault to operate on. This handles the warmup case where
   *  the client was created before the vault path was available. */
  private applyVaultPathToClient(): void {
    if (!this.vaultPath || !this.client) return;
    const underlying = (this.client as any)._client;
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
    const pathModule = require('path');
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

    process.env.PATH = pathDirs.join(pathSep);
    console.debug('[KiloCode] ensureServer: cliPath=' + cliPath + ' method=' + (typeof this.binaryManager.getDetectionMethod === 'function' ? this.binaryManager.getDetectionMethod() : 'unknown'));

    this.serverHandle = await createKiloServer({
      hostname: '127.0.0.1',
      port: 0,
      timeout: SERVE_TIMEOUT,
    });
    this.client = createKiloClient({
      baseUrl: this.serverHandle.url,
      fetch: nodeFetch,
      ...(vaultPath ? { directory: vaultPath } : {}),
    });
  }

  private buildModelConfig(): Record<string, unknown> {
    const model = this.resolveModel();
    if (!model) return {};
    return { modelID: model.modelID, providerID: model.providerID };
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

  private parseSSEBlock(block: string): { type: string; data: any } | null {
    const lines = block.split(String.fromCharCode(10));
    let eventType = '';
    let dataStr = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) eventType = line.slice(7).trim();
      else if (line.startsWith('data: ')) dataStr = line.slice(6).trim();
    }
    if (!eventType || !dataStr) return null;
    try { return { type: eventType, data: JSON.parse(dataStr) }; } catch { return null; }
  }

  private parseEvent(event: { type: string; data: any }): StreamChunk | null {
    const { type, data } = event;
    const props = data.properties || data;
    switch (type) {
      // Server lifecycle events - ignore
      case 'server.connected':
      case 'server.heartbeat':
      case 'server.disconnected':
        return null;

      // Streaming text / reasoning / tool parts
      case 'message.part.delta':
      case 'message.stream.chunk': {
        const partType = props.type || data.part?.type;
        const partBody = props.part || data.part || props;
        const text = partBody.text || partBody.delta || '';

        if (partType === 'reasoning' || partType === 'thinking') {
          return { type: 'thinking' as StreamChunkType, content: text };
        }
        if (partType === 'text') {
          return { type: 'text' as StreamChunkType, content: text };
        }
        if (partType === 'tool_use' && (partBody.name || partBody.toolName)) {
          return { type: 'tool_use' as StreamChunkType, toolCall: { id: partBody.id || ('tool-' + Date.now()), name: partBody.name || partBody.toolName, input: partBody.input || partBody.arguments || {}, status: 'running' } };
        }
        if (partType === 'tool_result' && partBody.id) {
          return { type: 'tool_result' as StreamChunkType, toolCall: { id: partBody.id, name: partBody.name || '', input: partBody.input || {}, status: 'completed', result: partBody.output || partBody.content || '' } };
        }
        // Also try raw parsePart for backward compatibility
        const parsed = this.parsePart(props.part || data.part || props);
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
          return { type: 'error' as StreamChunkType, error: props.error || 'Session error' };
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
        return { type: 'error' as StreamChunkType, error: props.message || props.error || 'Unknown error' };

      default: return null;
    }
  }

  private parsePart(part: any): StreamChunk | null {
    if (!part) return null;
    if (part.type === 'reasoning' || part.type === 'thinking' || part.thinking) return { type: 'thinking' as StreamChunkType, content: part.text || part.thinking || '' };
    if (part.type === 'text' && part.text) return { type: 'text' as StreamChunkType, content: part.text };
    if (part.type === 'tool_use' && part.name) return { type: 'tool_use' as StreamChunkType, toolCall: { id: part.id || ('tool-' + Date.now()), name: part.name, input: part.input || {}, status: 'running' } };
    if (part.type === 'tool_result' && part.id) return { type: 'tool_result' as StreamChunkType, toolCall: { id: part.id, name: part.name || '', input: part.input || {}, status: 'completed', result: part.output || part.content || '' } };
    return null;
  }
}
