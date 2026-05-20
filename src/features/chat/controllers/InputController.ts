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

  /** 设置运行时，并绑定 onComplete/onError 回调自动管理 isStreaming 状态 */
  setRuntime(runtime: ChatRuntime): void {
    this.runtime = runtime;

    this.runtime.onComplete(() => {
      this.isStreaming = false;
    });
    this.runtime.onError(() => {
      this.isStreaming = false;
    });
  }

  /** 设置回调，与已有回调合并 */
  setCallbacks(callbacks: InputCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
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

    try {
      await this.runtime.sendMessage(content);
      this.callbacks.onSend?.(content);
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
}
