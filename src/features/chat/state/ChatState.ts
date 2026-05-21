// src/features/chat/state/ChatState.ts
// 集中管理单个标签的聊天状态，使用回调模式通知状态变化
// 参考 claudian 的 ChatState 设计，但不照搬全部字段

import type { ToolCallInfo } from '../../../core/types';

/** ChatState 支持的事件类型 */
type ChatStateEvent = 'streamingChange' | 'cancelRequested' | 'conversationChange';

/** 事件回调函数类型 */
type ChatStateCallback = (...args: unknown[]) => void;

/**
 * 聊天状态管理器
 * 集中管理流式状态、会话状态和内容缓冲
 * 使用 getter/setter + 回调通知模式
 */
export class ChatState {
  // ---- 流式状态 ----
  private _isStreaming = false;
  private _streamGeneration = 0;
  private _cancelRequested = false;

  // ---- 会话状态 ----
  private _currentConversationId: string | null = null;
  private _hasPendingConversationSave = false;

  // ---- 流式内容缓冲（流式过程中实时累积，完成后清空） ----
  private _currentTextContent = '';
  private _currentThinkingContent = '';
  private _toolCalls = new Map<string, ToolCallInfo>();

  // ---- 事件回调 ----
  private listeners = new Map<ChatStateEvent, Set<ChatStateCallback>>();

  // ============================================
  // Getters
  // ============================================

  get isStreaming(): boolean {
    return this._isStreaming;
  }

  get streamGeneration(): number {
    return this._streamGeneration;
  }

  get cancelRequested(): boolean {
    return this._cancelRequested;
  }

  get currentConversationId(): string | null {
    return this._currentConversationId;
  }

  get hasPendingConversationSave(): boolean {
    return this._hasPendingConversationSave;
  }

  get currentTextContent(): string {
    return this._currentTextContent;
  }

  get currentThinkingContent(): string {
    return this._currentThinkingContent;
  }

  get toolCalls(): Map<string, ToolCallInfo> {
    return this._toolCalls;
  }

  // ============================================
  // 流式状态操作
  // ============================================

  setStreaming(streaming: boolean): void {
    this._isStreaming = streaming;
    this.emit('streamingChange', streaming);
  }

  /** 递增流式代数，返回递增后的值 */
  bumpStreamGeneration(): number {
    this._streamGeneration += 1;
    return this._streamGeneration;
  }

  requestCancel(): void {
    this._cancelRequested = true;
    this.emit('cancelRequested');
  }

  resetCancel(): void {
    this._cancelRequested = false;
  }

  // ============================================
  // 会话状态操作
  // ============================================

  setConversationId(id: string | null): void {
    this._currentConversationId = id;
    this.emit('conversationChange', id);
  }

  markPendingSave(pending: boolean): void {
    this._hasPendingConversationSave = pending;
  }

  // ============================================
  // 流式内容缓冲操作
  // ============================================

  appendText(text: string): void {
    this._currentTextContent += text;
  }

  appendThinking(text: string): void {
    this._currentThinkingContent += text;
  }

  addToolCall(toolCall: ToolCallInfo): void {
    this._toolCalls.set(toolCall.id, { ...toolCall });
  }

  updateToolCallStatus(
    toolCallId: string,
    status: ToolCallInfo['status'],
    result?: string,
    error?: string,
  ): void {
    const tc = this._toolCalls.get(toolCallId);
    if (tc) {
      tc.status = status;
      if (result !== undefined) tc.result = result;
      if (error !== undefined) tc.error = error;
      if (status === 'completed' || status === 'error') {
        tc.endTime = Date.now();
      }
    }
  }

  /** 重置流式内容缓冲（流完成后调用） */
  resetStreamingBuffer(): void {
    this._currentTextContent = '';
    this._currentThinkingContent = '';
    this._toolCalls.clear();
  }

  // ============================================
  // 完整重置
  // ============================================

  /** 重置所有状态到初始值 */
  reset(): void {
    this._isStreaming = false;
    this._streamGeneration = 0;
    this._cancelRequested = false;
    this._currentConversationId = null;
    this._hasPendingConversationSave = false;
    this._currentTextContent = '';
    this._currentThinkingContent = '';
    this._toolCalls.clear();
  }

  // ============================================
  // 事件系统
  // ============================================

  /** 注册事件回调，返回取消注册函数 */
  on(event: ChatStateEvent, callback: ChatStateCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  private emit(event: ChatStateEvent, ...args: unknown[]): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      for (const cb of callbacks) {
        try {
          cb(...args);
        } catch (err) {
          console.error(`[ChatState] Error in ${event} callback:`, err);
        }
      }
    }
  }
}
