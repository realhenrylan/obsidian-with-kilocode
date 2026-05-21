// src/features/chat/controllers/ConversationController.ts
// 会话生命周期控制器
// 职责：创建/切换/保存/回退/分支会话，从 KiloCodeView 中抽取会话管理逻辑
// 遵循单一职责原则：只管会话生命周期，不管 UI 渲染和流式处理

import type { ConversationService } from '../services/ConversationService';
import type { ChatState } from '../state/ChatState';
import type { Message, Conversation } from '../../../core/types';

/** 消息渲染回调（由 View 层注入） */
type RenderCallback = (messages: Message[]) => void;

/** 清空消息容器回调 */
type ClearCallback = () => void;

/**
 * 会话生命周期控制器
 * 管理会话的创建、切换、保存、回退和分支
 * 实现懒创建：有第一条消息时才创建会话
 */
export class ConversationController {
  private service: ConversationService;
  private state: ChatState;

  // 回调（由 View 层注入，避免直接依赖 DOM）
  private renderCallback: RenderCallback | null = null;
  private clearCallback: ClearCallback | null = null;

  constructor(service: ConversationService, state: ChatState) {
    this.service = service;
    this.state = state;
  }

  // ============================================
  // 回调注册
  // ============================================

  /** 注册消息渲染回调 */
  onRenderMessages(callback: RenderCallback): void {
    this.renderCallback = callback;
  }

  /** 注册清空消息容器回调 */
  onClearMessages(callback: ClearCallback): void {
    this.clearCallback = callback;
  }

  // ============================================
  // createNew — 重置到空白入口
  // ============================================

  /** 重置到空白状态（不创建会话，懒创建） */
  createNew(): void {
    this.state.setConversationId(null);
    this.state.resetStreamingBuffer();
    this.clearCallback?.();
  }

  // ============================================
  // switchTo — 切换到其他会话
  // ============================================

  /**
   * 切换到指定会话
   * 流程：save 当前 → reset → load 目标 → render
   */
  async switchTo(conversationId: string): Promise<void> {
    // 1. 保存当前会话的待写入数据
    await this.save();

    // 2. 加载目标会话
    const conversation = await this.service.getConversation(conversationId);
    if (!conversation) {
      console.warn('[ConversationController] switchTo: conversation not found:', conversationId);
      return;
    }

    // 3. 更新状态
    this.state.setConversationId(conversationId);
    this.state.resetStreamingBuffer();

    // 4. 渲染消息
    this.clearCallback?.();
    this.renderCallback?.(conversation.messages);
  }

  // ============================================
  // ensureConversation — 懒创建
  // ============================================

  /**
   * 确保当前有活跃会话，如果没有则懒创建
   * @returns conversationId
   */
  async ensureConversation(): Promise<string> {
    const existing = this.state.currentConversationId;
    if (existing) return existing;

    // 懒创建
    const conversation = await this.service.createConversation();
    this.state.setConversationId(conversation.id);
    return conversation.id;
  }

  // ============================================
  // save — 保存当前会话
  // ============================================

  /** 保存当前会话的待写入数据 */
  async save(): Promise<void> {
    await this.service.flush();
    this.state.markPendingSave(false);
  }

  // ============================================
  // restoreConversation — 恢复会话到 UI
  // ============================================

  /**
   * 恢复会话消息到 UI（供 View 层调用）
   * 会触发 renderCallback
   */
  async restoreConversation(conversationId: string): Promise<void> {
    const conversation = await this.service.getConversation(conversationId);
    if (!conversation) return;

    this.clearCallback?.();
    this.renderCallback?.(conversation.messages);
  }

  // ============================================
  // rewind — 回退到指定消息
  // ============================================

  /**
   * 回退到指定消息
   * @returns 被丢弃的消息列表
   */
  async rewind(messageId: string): Promise<Message[]> {
    const convId = this.state.currentConversationId;
    if (!convId) {
      throw new Error('No active conversation to rewind');
    }

    const removed = await this.service.rewindToMessage(convId, messageId);

    // 重新渲染剩余消息
    await this.restoreConversation(convId);

    return removed;
  }

  // ============================================
  // fork — 从指定消息处创建分支
  // ============================================

  /**
   * 从指定消息处创建分支会话
   * @returns 新会话
   */
  async fork(messageId: string): Promise<Conversation> {
    const convId = this.state.currentConversationId;
    if (!convId) {
      throw new Error('No active conversation to fork from');
    }

    return this.service.forkConversation(convId, messageId);
  }

  // ============================================
  // addMessage — 添加消息到当前会话
  // ============================================

  /** 添加消息到当前会话 */
  async addMessage(message: Message): Promise<void> {
    const convId = this.state.currentConversationId;
    if (!convId) {
      throw new Error('No active conversation to add message to');
    }

    await this.service.addMessage(convId, message);
    this.state.markPendingSave(true);
  }

  // ============================================
  // getConversation — 获取当前会话
  // ============================================

  /** 获取当前会话 */
  async getConversation(): Promise<Conversation | null> {
    const convId = this.state.currentConversationId;
    if (!convId) return null;
    return this.service.getConversation(convId);
  }
}
