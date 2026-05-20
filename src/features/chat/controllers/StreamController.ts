// src/features/chat/controllers/StreamController.ts
import type { StreamChunk, Message, ToolCallInfo } from '../../../core/providers/types';

export interface StreamCallbacks {
  onText?: (text: string) => void;
  onToolCall?: (toolCall: ToolCallInfo) => void;
  onToolResult?: (toolCallId: string, result: string) => void;
  onError?: (error: string) => void;
  onComplete?: () => void;
}

/**
 * 流式响应控制器
 * 通过 for await 消费 AsyncGenerator<StreamChunk>，组装完整 Message
 */
export class StreamController {
  private abortController: AbortController | null = null;

  /**
   * 消费 AsyncGenerator 流式响应，返回组装好的 Message
   */
  async consumeStream(
    generator: AsyncGenerator<StreamChunk>,
    callbacks: StreamCallbacks,
  ): Promise<Message> {
    this.abortController = new AbortController();

    const message: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      toolCalls: [],
    };

    try {
      for await (const chunk of generator) {
        if (this.abortController.signal.aborted) break;

        switch (chunk.type) {
          case 'text':
            message.content += chunk.content || '';
            callbacks.onText?.(chunk.content || '');
            break;

          case 'tool_use':
            if (chunk.toolCall) {
              message.toolCalls!.push(chunk.toolCall);
              callbacks.onToolCall?.(chunk.toolCall);
            }
            break;

          case 'tool_result':
            if (chunk.toolCall) {
              this.updateToolCall(message.toolCalls!, chunk.toolCall);
              callbacks.onToolResult?.(chunk.toolCall.id, chunk.toolCall.result || '');
            }
            break;

          case 'error':
            callbacks.onError?.(chunk.error || 'Unknown error');
            break;

          case 'done':
            callbacks.onComplete?.();
            break;
        }
      }
    } catch (err) {
      callbacks.onError?.(err instanceof Error ? err.message : String(err));
    }

    return message;
  }

  cancel(): void {
    this.abortController?.abort();
  }

  private updateToolCall(toolCalls: ToolCallInfo[], update: ToolCallInfo): void {
    const existing = toolCalls.find(tc => tc.id === update.id);
    if (existing) {
      existing.status = update.status;
      existing.result = update.result;
      existing.error = update.error;
      existing.endTime = Date.now();
    }
  }
}
