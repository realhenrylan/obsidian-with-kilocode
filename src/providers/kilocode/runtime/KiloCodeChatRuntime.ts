import type { ChatRuntime, MessageContext, StreamChunk } from '../../../core/providers/types';
import { spawn, type ChildProcess } from 'child_process';

/**
 * KiloCode Chat Runtime
 * 通过 JSON-RPC over stdio 与 KiloCode CLI 通信
 * 使用 AsyncGenerator 模式：sendMessage 返回生成器，stdout 推数据到队列，生成器拉取
 */
export class KiloCodeChatRuntime implements ChatRuntime {
  private process: ChildProcess | null = null;
  private cliPath: string;
  private stdoutBuffer = '';
  private streaming = false;

  // AsyncGenerator 内部队列机制
  private pendingChunks: StreamChunk[] = [];
  private resolveNext: ((value: IteratorResult<StreamChunk>) => void) | null = null;
  private done = false;
  private streamError: Error | null = null;

  constructor(cliPath: string = 'kilo') {
    this.cliPath = cliPath;
  }

  async start(): Promise<void> {
    if (this.process) return;

    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(this.cliPath, ['--mode', 'json-rpc'], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.process.stdout?.on('data', (data: Buffer) => {
          this.handleStdout(data.toString());
        });

        this.process.stderr?.on('data', (data: Buffer) => {
          console.error('[KiloCode] stderr:', data.toString());
        });

        this.process.on('error', (error) => {
          this.streamError = error;
          this.resolvePending(error);
          reject(error);
        });

        this.process.on('exit', (code) => {
          if (code !== 0 && code !== null) {
            const err = new Error(`KiloCode CLI exited with code ${code}`);
            this.streamError = err;
            this.resolvePending(err);
          }
        });

        setTimeout(() => resolve(), 100);
      } catch (error) {
        reject(new Error(`Failed to start KiloCode CLI: ${error}`));
      }
    });
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.resetInternalState();
  }

  async *sendMessage(content: string, context?: MessageContext): AsyncGenerator<StreamChunk> {
    if (!this.process || !this.process.stdin) {
      throw new Error('Runtime not started');
    }

    this.resetInternalState();
    this.streaming = true;

    const request = {
      jsonrpc: '2.0',
      method: 'sendMessage',
      params: { content, context: context || {} },
      id: Date.now(),
    };
    this.process.stdin.write(JSON.stringify(request) + '\n');

    try {
      while (true) {
        const chunk = await this.nextChunk();
        if (!chunk) break;
        yield chunk;
      }
    } finally {
      this.streaming = false;
    }
  }

  cancel(): void {
    if (this.process && this.process.stdin) {
      const cancelRequest = {
        jsonrpc: '2.0',
        method: 'cancel',
        id: Date.now(),
      };
      this.process.stdin.write(JSON.stringify(cancelRequest) + '\n');
    }
    this.done = true;
    this.streaming = false;
    this.resolveNext?.({ value: undefined as unknown as StreamChunk, done: true });
    this.resolveNext = null;
  }

  resetSession(): void {
    if (this.process && this.process.stdin) {
      const resetRequest = {
        jsonrpc: '2.0',
        method: 'resetSession',
        id: Date.now(),
      };
      this.process.stdin.write(JSON.stringify(resetRequest) + '\n');
    }
    this.resetInternalState();
  }

  isStreaming(): boolean {
    return this.streaming;
  }

  sendApproval(toolName: string, decision: 'allow' | 'deny'): void {
    if (!this.process || !this.process.stdin) return;
    const request = {
      jsonrpc: '2.0',
      method: 'approval',
      params: { toolName, decision },
      id: Date.now(),
    };
    this.process.stdin.write(JSON.stringify(request) + '\n');
  }

  private resetInternalState(): void {
    this.pendingChunks = [];
    this.resolveNext = null;
    this.done = false;
    this.streamError = null;
    this.stdoutBuffer = '';
  }

  private nextChunk(): Promise<StreamChunk | null> {
    if (this.pendingChunks.length > 0) {
      return Promise.resolve(this.pendingChunks.shift()!);
    }
    if (this.done) return Promise.resolve(null);
    if (this.streamError) throw this.streamError;

    return new Promise((resolve) => {
      this.resolveNext = (result) => {
        if (result.done) {
          resolve(null);
          return;
        }
        resolve(result.value);
      };
    });
  }

  /** 判断 chunk 是否为终止类型（done 或 error） */
  private isTerminalChunk(chunk: StreamChunk): boolean {
    return chunk.type === 'done' || chunk.type === 'error';
  }

  private handleStdout(data: string): void {
    this.stdoutBuffer += data;
    const lines = this.stdoutBuffer.split('\n');
    this.stdoutBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const chunk = JSON.parse(trimmed) as StreamChunk;
        this.handleParsedChunk(chunk);
      } catch {
        // 非 JSON 输出，忽略
      }
    }
  }

  private handleParsedChunk(chunk: StreamChunk): void {
    if (this.isTerminalChunk(chunk)) {
      this.done = true;
      this.streaming = false;
    }

    if (this.resolveNext) {
      const resolve = this.resolveNext;
      this.resolveNext = null;
      resolve({ value: chunk, done: false });
    } else {
      this.pendingChunks.push(chunk);
    }
  }

  private resolvePending(error: Error): void {
    if (this.resolveNext) {
      const resolve = this.resolveNext;
      this.resolveNext = null;
      resolve({ value: undefined as unknown as StreamChunk, done: true });
    }
    this.done = true;
    this.streaming = false;
  }
}
