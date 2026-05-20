// src/features/chat/controllers/StreamController.ts

import type { StreamMessage, Message, ToolCallInfo } from '../../../core/types';

export interface StreamCallbacks {
  onText?: (text: string) => void;
  onToolCall?: (toolCall: ToolCallInfo) => void;
  onToolResult?: (toolCallId: string, result: string) => void;
  onError?: (error: string) => void;
  onComplete?: () => void;
}

/**
 * 流式响应控制器
 * 处理来自 KiloCode CLI 的流式消息
 */
export class StreamController {
  private callbacks: StreamCallbacks = {};
  private currentMessage: Partial<Message> = {};
  private isStreaming = false;

  /** 设置回调 */
  setCallbacks(callbacks: StreamCallbacks): void {
    this.callbacks = callbacks;
  }

  /** 开始新的流式响应 */
  startStream(): void {
    this.isStreaming = true;
    this.currentMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      toolCalls: [],
    };
  }

  /** 处理流式消息 */
  handleMessage(message: StreamMessage): void {
    switch (message.type) {
      case 'text':
        this.handleTextMessage(message.content || '');
        break;
      case 'tool_use':
        this.handleToolUse(message.toolCall!);
        break;
      case 'tool_result':
        this.handleToolResult(message.toolCall!);
        break;
      case 'error':
        this.handleError(message.error || 'Unknown error');
        break;
      case 'done':
        this.handleDone();
        break;
    }
  }

  /** 处理文本消息 */
  private handleTextMessage(text: string): void {
    if (this.currentMessage) {
      this.currentMessage.content = (this.currentMessage.content || '') + text;
    }
    this.callbacks.onText?.(text);
  }

  /** 处理工具调用 */
  private handleToolUse(toolCall: ToolCallInfo): void {
    if (this.currentMessage?.toolCalls) {
      this.currentMessage.toolCalls.push(toolCall);
    }
    this.callbacks.onToolCall?.(toolCall);
  }

  /** 处理工具结果 */
  private handleToolResult(toolCall: ToolCallInfo): void {
    if (this.currentMessage?.toolCalls) {
      const existing = this.currentMessage.toolCalls.find(tc => tc.id === toolCall.id);
      if (existing) {
        existing.status = toolCall.status;
        existing.result = toolCall.result;
        existing.error = toolCall.error;
        existing.endTime = Date.now();
      }
    }
    this.callbacks.onToolResult?.(toolCall.id, toolCall.result || '');
  }

  /** 处理错误 */
  private handleError(error: string): void {
    this.isStreaming = false;
    this.callbacks.onError?.(error);
  }

  /** 处理完成 */
  private handleDone(): void {
    this.isStreaming = false;
    this.callbacks.onComplete?.();
  }

  /** 获取当前消息 */
  getCurrentMessage(): Message | null {
    if (!this.currentMessage || !this.currentMessage.id) return null;
    return this.currentMessage as Message;
  }

  /** 是否正在流式响应 */
  isCurrentlyStreaming(): boolean {
    return this.isStreaming;
  }

  /** 取消流式响应 */
  cancel(): void {
    this.isStreaming = false;
  }
}
