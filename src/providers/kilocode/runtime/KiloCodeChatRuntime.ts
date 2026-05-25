import type { ChatRuntime, MessageContext, StreamChunk, StreamChunkType } from '../../../core/providers/types';
import type { BinaryManager } from '../../../core/binary/BinaryManager';
import type { KiloCodeSettings } from '../../../core/types';

import { createKiloServer, type ServerOptions } from '@kilocode/sdk/server';
import { createKiloClient } from '@kilocode/sdk/client';
import type { KiloClient } from '@kilocode/sdk/client';

const DEFAULT_AGENT = 'code';
const SERVE_TIMEOUT = 15000;

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

  constructor(binaryManager: BinaryManager, getSettings: () => KiloCodeSettings) {
    this.binaryManager = binaryManager;
    this.getSettings = getSettings;
  }

  async start(): Promise<void> {
    if (this.serverHandle && this.client) return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.ensureServer();
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
    await this.start();
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
      const eventPromise = (this.client.event as any).subscribe({ query: { directory: '.' }, signal });
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
      const eventResult = await eventPromise;
      if (eventResult?.stream) {
        let gotContent = false;
        // The SDK SSE client yields already-parsed JSON objects from the SSE data: field.
        // Format: { type: "event.name", properties: { ... } }
        for await (const rawData of eventResult.stream) {
          if (signal.aborted) break;
          if (!rawData) continue;

          // Break out when message is complete (message.updated) or session is idle
          if (rawData.type === 'message.updated' || (rawData.type === 'session.status' && rawData.properties?.status === 'idle')) {
            gotContent = true;
            break;
          }

          // Wrap in the format expected by parseEvent
          const event = { type: rawData.type, data: rawData.properties || rawData };
          const parsed = this.parseEvent(event);
          if (parsed) { gotContent = true; yield parsed; }
        }
        if (!gotContent && promptResult.data?.parts) {
          const parts = promptResult.data.parts;
          if (Array.isArray(parts)) {
            for (const part of parts) {
              const chunk = this.parsePart(part);
              if (chunk) yield chunk;
            }
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

  private async ensureServer(): Promise<void> {
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
      cors: ['app://obsidian.md'],
    });
    this.client = createKiloClient({ baseUrl: this.serverHandle.url });
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
