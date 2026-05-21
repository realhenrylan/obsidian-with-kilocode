// src/features/chat/services/ConversationService.ts

import type { Conversation, ConversationMeta, Message } from '../../../core/types';
import { App } from 'obsidian';

/**
 * 磁盘写入防抖间隔（ms）。
 * 流式响应期间每条消息都会触发 addMessage，防抖合并可减少磁盘 I/O 次数。
 */
const SAVE_DEBOUNCE_MS = 300;

/**
 * 会话服务
 * 管理会话的创建、保存、恢复和删除
 */
export class ConversationService {
  private app: App;
  private conversations: Map<string, Conversation> = new Map();
  private storagePath: string;
  // 简单的 Promise 队列，确保 addMessage 等操作按顺序执行，避免竞态条件
  private queue: Promise<void> = Promise.resolve();
  // 磁盘写入防抖：标记脏会话，延迟批量写入
  private dirtyConversations: Set<string> = new Set();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(app: App, vaultPath: string) {
    this.app = app;
    this.storagePath = `${vaultPath}/.kilocode/sessions`;
  }

  /** 校验会话 ID 格式，防止路径注入 */
  private validateId(id: string): void {
    if (!/^conv-\d{13}-[a-z0-9]{7}$/.test(id)) {
      throw new Error(`Invalid conversation id format: ${id}`);
    }
  }

  /** 将操作排入队列顺序执行 */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task, task);
    this.queue = result.then(() => {}, () => {});
    return result;
  }

  /** 调度防抖写入：重置定时器，SAVE_DEBOUNCE_MS 后执行 */
  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flushDirty();
    }, SAVE_DEBOUNCE_MS);
  }

  /** 将所有脏会话写入磁盘 */
  private async flushDirty(): Promise<void> {
    const ids = [...this.dirtyConversations];
    this.dirtyConversations.clear();
    for (const id of ids) {
      const conversation = this.conversations.get(id);
      if (!conversation) continue;
      try {
        await this.saveMetadata(conversation);
        await this.saveMessages(conversation);
      } catch (err) {
        console.error('[ConversationService] flushDirty failed for', id, err);
        // 写入失败时重新标记为脏，下次重试
        this.dirtyConversations.add(id);
      }
    }
  }

  /** 初始化存储目录 */
  async initialize(): Promise<void> {
    const adapter = this.app.vault.adapter;
    if (!(await adapter.exists(this.storagePath))) {
      await adapter.mkdir(this.storagePath);
    }
    await this.loadAllMetadata();
  }

  /** 创建新会话 */
  async createConversation(): Promise<Conversation> {
    const id = `conv-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = Date.now();

    const conversation: Conversation = {
      id,
      providerId: 'kilocode',
      title: this.generateDefaultTitle(),
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      preview: 'New conversation',
      messages: [],
    };

    this.conversations.set(id, conversation);
    await this.saveMetadata(conversation);

    return conversation;
  }

  /** 获取会话 */
  async getConversation(id: string): Promise<Conversation | null> {
    this.validateId(id);
    const conversation = this.conversations.get(id);
    if (!conversation) {
      console.warn('[ConversationService] getConversation: not found:', id);
      return null;
    }
    if (conversation.messages.length === 0) {
      await this.loadMessages(conversation);
    }
    console.log('[ConversationService] getConversation:', id, 'messages:', conversation.messages.length);
    return conversation;
  }

  /** 添加消息（内存立即更新 + 磁盘写入防抖） */
  async addMessage(conversationId: string, message: Message): Promise<void> {
    return this.enqueue(async () => {
      this.validateId(conversationId);
      const conversation = this.conversations.get(conversationId);
      if (!conversation) {
        console.error('[ConversationService] addMessage: conversation not found:', conversationId, 'keys:', [...this.conversations.keys()]);
        throw new Error(`Conversation ${conversationId} not found`);
      }

      console.log('[ConversationService] addMessage:', message.role, 'to', conversationId, 'current count:', conversation.messages.length);
      // 内存立即更新（保证后续读取一致性）
      conversation.messages.push(message);
      conversation.messageCount = conversation.messages.length;
      conversation.updatedAt = Date.now();
      conversation.lastResponseAt = message.timestamp;

      // 更新预览
      if (message.role === 'user') {
        conversation.preview = message.content.substring(0, 50) + (message.content.length > 50 ? '...' : '');
      }

      // 标记脏并调度防抖写入（而非立即写磁盘）
      this.dirtyConversations.add(conversationId);
      this.scheduleSave();
    });
  }

  /**
   * 立即将所有脏会话写入磁盘。
   * 在标签切换、视图关闭、插件卸载时调用，防止数据丢失。
   */
  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.flushDirty();
  }

  /** 删除会话 */
  async deleteConversation(id: string): Promise<void> {
    this.validateId(id);
    this.conversations.delete(id);

    const adapter = this.app.vault.adapter;
    const metadataPath = `${this.storagePath}/${id}.json`;
    const messagesPath = `${this.storagePath}/${id}.messages.json`;

    if (await adapter.exists(metadataPath)) {
      await adapter.remove(metadataPath);
    }
    if (await adapter.exists(messagesPath)) {
      await adapter.remove(messagesPath);
    }
  }

  /** 获取会话列表 */
  getConversationList(): ConversationMeta[] {
    return Array.from(this.conversations.values())
      .sort((a, b) => (b.lastResponseAt || b.updatedAt) - (a.lastResponseAt || a.updatedAt))
      .map(c => ({
        id: c.id,
        providerId: c.providerId,
        title: c.title,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        lastResponseAt: c.lastResponseAt,
        messageCount: c.messageCount,
        preview: c.preview,
      }));
  }

  /** 重命名会话 */
  async renameConversation(id: string, title: string): Promise<void> {
    this.validateId(id);
    const conversation = this.conversations.get(id);
    if (!conversation) {
      throw new Error(`Conversation ${id} not found`);
    }

    conversation.title = title.trim() || this.generateDefaultTitle();
    conversation.updatedAt = Date.now();

    await this.saveMetadata(conversation);
  }

  /** 从指定消息处 fork 新会话 */
  async forkConversation(sourceId: string, fromMessageId: string): Promise<Conversation> {
    this.validateId(sourceId);
    const source = this.conversations.get(sourceId);
    if (!source) {
      throw new Error(`Source conversation ${sourceId} not found`);
    }

    // 加载源会话消息（如果未加载）
    if (source.messages.length === 0) {
      await this.loadMessages(source);
    }

    const forkIndex = source.messages.findIndex(m => m.id === fromMessageId);
    if (forkIndex === -1) {
      throw new Error(`Message ${fromMessageId} not found in conversation ${sourceId}`);
    }

    // 深拷贝到 forkIndex（包含）为止的消息，生成新 ID 避免冲突
    const forkedMessages: Message[] = source.messages.slice(0, forkIndex + 1).map(m => ({
      ...m,
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    }));

    const newConv = await this.createConversation();
    newConv.messages = forkedMessages;
    newConv.messageCount = forkedMessages.length;
    newConv.title = `Fork: ${source.title}`;
    newConv.forkedFrom = sourceId;
    newConv.forkedAtMessageId = fromMessageId;

    // 更新最后一条消息的预览
    const lastUserMsg = [...forkedMessages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      newConv.preview = lastUserMsg.content.substring(0, 50) +
        (lastUserMsg.content.length > 50 ? '...' : '');
    }

    await this.saveMetadata(newConv);
    await this.saveMessages(newConv);

    return newConv;
  }

  /** 回退到指定消息，返回被丢弃的消息列表 */
  async rewindToMessage(conversationId: string, messageId: string): Promise<Message[]> {
    this.validateId(conversationId);
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    if (conversation.messages.length === 0) {
      await this.loadMessages(conversation);
    }

    const targetIndex = conversation.messages.findIndex(m => m.id === messageId);
    if (targetIndex === -1) {
      throw new Error(`Message ${messageId} not found in conversation ${conversationId}`);
    }

    const removedMessages = conversation.messages.slice(targetIndex + 1);
    conversation.messages = conversation.messages.slice(0, targetIndex + 1);
    conversation.messageCount = conversation.messages.length;
    conversation.updatedAt = Date.now();

    // 更新预览
    const lastUserMsg = [...conversation.messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      conversation.preview = lastUserMsg.content.substring(0, 50) +
        (lastUserMsg.content.length > 50 ? '...' : '');
    }

    await this.saveMetadata(conversation);
    await this.saveMessages(conversation);

    return removedMessages;
  }

  /** 压缩会话历史，保留最近 keepRecent 条消息 */
  async compactConversation(
    conversationId: string,
    summary: string,
    keepRecent: number = 5,
  ): Promise<void> {
    this.validateId(conversationId);
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    if (conversation.messages.length === 0) {
      await this.loadMessages(conversation);
    }

    // 如果消息数不超过 keepRecent + 1，仍然执行压缩（插入摘要 + 保留全部）
    const recentMessages = conversation.messages.slice(-keepRecent);
    const compactedMessage: Message = {
      id: `msg-${Date.now()}-compact`,
      role: 'system',
      content: `[Compacted History]\n${summary}`,
      timestamp: Date.now(),
    };

    conversation.messages = [compactedMessage, ...recentMessages];
    conversation.messageCount = conversation.messages.length;
    conversation.updatedAt = Date.now();
    conversation.isCompacted = true;

    await this.saveMetadata(conversation);
    await this.saveMessages(conversation);
  }

  /** 恢复历史会话，加载完整消息 */
  async resumeConversation(id: string): Promise<Conversation> {
    this.validateId(id);
    const conversation = this.conversations.get(id);
    if (!conversation) {
      throw new Error(`Conversation ${id} not found`);
    }

    if (conversation.messages.length === 0) {
      await this.loadMessages(conversation);
    }

    return conversation;
  }

  /** 保存元数据 */
  private async saveMetadata(conversation: Conversation): Promise<void> {
    const adapter = this.app.vault.adapter;
    const path = `${this.storagePath}/${conversation.id}.json`;

    const metadata: ConversationMeta = {
      id: conversation.id,
      providerId: conversation.providerId,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      lastResponseAt: conversation.lastResponseAt,
      messageCount: conversation.messageCount,
      preview: conversation.preview,
    };

    await adapter.write(path, JSON.stringify(metadata, null, 2));
  }

  /** 保存消息 */
  private async saveMessages(conversation: Conversation): Promise<void> {
    const adapter = this.app.vault.adapter;
    const path = `${this.storagePath}/${conversation.id}.messages.json`;
    await adapter.write(path, JSON.stringify(conversation.messages, null, 2));
  }

  /** 加载所有元数据 */
  private async loadAllMetadata(): Promise<void> {
    const adapter = this.app.vault.adapter;

    if (!(await adapter.exists(this.storagePath))) {
      return;
    }

    const files = await adapter.list(this.storagePath);
    for (const file of files.files) {
      if (file.endsWith('.json') && !file.endsWith('.messages.json')) {
        try {
          const content = await adapter.read(file);
          const metadata = JSON.parse(content) as ConversationMeta;
          this.conversations.set(metadata.id, {
            ...metadata,
            messages: [],
          });
        } catch (e) {
          console.warn(`[ConversationService] Failed to load metadata from ${file}:`, e);
        }
      }
    }
  }

  /** 加载消息 */
  private async loadMessages(conversation: Conversation): Promise<void> {
    const adapter = this.app.vault.adapter;
    const path = `${this.storagePath}/${conversation.id}.messages.json`;

    if (await adapter.exists(path)) {
      try {
        const content = await adapter.read(path);
        conversation.messages = JSON.parse(content) as Message[];
      } catch (e) {
        console.warn(`[ConversationService] Failed to load messages for ${conversation.id}:`, e);
        conversation.messages = [];
      }
    }
  }

  /** 生成默认标题 */
  private generateDefaultTitle(): string {
    const now = new Date();
    return now.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
