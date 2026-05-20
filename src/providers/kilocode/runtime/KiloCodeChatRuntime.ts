// src/providers/kilocode/runtime/KiloCodeChatRuntime.ts

import type { ChatRuntime, MessageContext, StreamMessage } from '../../../core/providers/types';
import { spawn, type ChildProcess } from 'child_process';

/**
 * KiloCode Chat Runtime
 * 通过 JSON-RPC over stdio 与 KiloCode CLI 通信
 */
export class KiloCodeChatRuntime implements ChatRuntime {
  private process: ChildProcess | null = null;
  private streaming = false;
  private messageCallback: ((message: StreamMessage) => void) | null = null;
  private errorCallback: ((error: Error) => void) | null = null;
  private completeCallback: (() => void) | null = null;
  private cliPath: string;
  private stdoutBuffer = '';

  constructor(cliPath: string = 'kilo') {
    this.cliPath = cliPath;
  }

  async start(): Promise<void> {
    try {
      this.process = spawn(this.cliPath, ['--mode', 'json-rpc'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.process.stdout?.on('data', (data: Buffer) => {
        this.handleStdout(data.toString());
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        console.error('KiloCode CLI stderr:', data.toString());
      });

      this.process.on('error', (error) => {
        this.errorCallback?.(error);
      });

      this.process.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          this.errorCallback?.(new Error(`KiloCode CLI exited with code ${code}`));
        }
      });
    } catch (error) {
      throw new Error(`Failed to start KiloCode CLI: ${error}`);
    }
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  async sendMessage(content: string, context?: MessageContext): Promise<void> {
    if (!this.process || !this.process.stdin) {
      throw new Error('Runtime not started');
    }

    this.streaming = true;

    const request = {
      jsonrpc: '2.0',
      method: 'sendMessage',
      params: {
        content,
        context: context || {},
      },
      id: Date.now(),
    };

    this.process.stdin.write(JSON.stringify(request) + '\n');
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
    this.streaming = false;
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
  }

  isStreaming(): boolean {
    return this.streaming;
  }

  onMessage(callback: (message: StreamMessage) => void): void {
    this.messageCallback = callback;
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallback = callback;
  }

  onComplete(callback: () => void): void {
    this.completeCallback = callback;
  }

  private handleStdout(data: string): void {
    // 累积数据到缓冲区，处理跨 chunk 的部分行
    this.stdoutBuffer += data;
    const lines = this.stdoutBuffer.split('\n');
    // 最后一个元素可能是不完整的行，保留在缓冲区
    this.stdoutBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const message = JSON.parse(trimmed) as StreamMessage;
        this.messageCallback?.(message);

        if (message.type === 'done') {
          this.streaming = false;
          this.completeCallback?.();
        }
      } catch {
        // 非 JSON 输出，忽略
      }
    }
  }
}
