// src/features/chat/controllers/InputController.ts

import type { ChatRuntime } from '../../../core/providers/types';

export interface InputCallbacks {
  onSend?: (message: string) => void;
  onCancel?: () => void;
}

/**
 * 输入控制器
 * 处理用户输入和消息发送
 */
export class InputController {
  private runtime: ChatRuntime | null = null;
  private callbacks: InputCallbacks = {};
  private isStreaming = false;

  /** 设置运行时 */
  setRuntime(runtime: ChatRuntime): void {
    this.runtime = runtime;
  }

  /** 设置回调 */
  setCallbacks(callbacks: InputCallbacks): void {
    this.callbacks = callbacks;
  }

  /** 发送消息 */
  async sendMessage(content: string): Promise<void> {
    if (!this.runtime) {
      throw new Error('Runtime not set');
    }

    if (this.isStreaming) {
      return;
    }

    this.isStreaming = true;
    this.callbacks.onSend?.(content);

    try {
      await this.runtime.sendMessage(content);
    } catch (error) {
      this.isStreaming = false;
      throw error;
    }
  }

  /** 取消当前请求 */
  cancel(): void {
    if (this.runtime && this.isStreaming) {
      this.runtime.cancel();
      this.isStreaming = false;
      this.callbacks.onCancel?.();
    }
  }

  /** 是否正在流式响应 */
  isCurrentlyStreaming(): boolean {
    return this.isStreaming;
  }

  /** 设置流式状态 */
  setStreaming(streaming: boolean): void {
    this.isStreaming = streaming;
  }
}
