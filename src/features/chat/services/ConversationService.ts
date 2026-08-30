// src/features/chat/services/ConversationService.ts

import type { Conversation, ConversationMeta, Message } from '../../../core/types';
import { App } from 'obsidian';

/**
 * 磁盘写入防抖间隔（ms）。
 * 流式响应期间每条消息都会触发 addMessage，防抖合并可减少磁盘 I/O 次数。
 */
const SAVE_DEBOUNCE_MS = 300;

/**
 * flushDirty 失败后的重试策略：5s 后自动重试，最多 3 次，仍失败则告警。
 * 写失败若只依赖下一次消息触发的防抖，长会话静默期可能丢失整段数据。
 */
const FLUSH_RETRY_DELAY_MS = 5000;
const FLUSH_MAX_RETRIES = 3;

/**
 * 消息文件 schema 版本。
 * v1: 裸 Message[] 数组（历史格式）；v2: { schemaVersion, messages } 包裹结构，
 * 为后续字段演进留出迁移空间。
 */
const SCHEMA_VERSION = 2;

/** v2 持久化结构 */
interface PersistedMessages {
  schemaVersion: number;
  messages: Message[];
}

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
  private saveTimer: number | null = null;
  // flushDirty 失败独立重试定时器与计数（成功后归零）
  private retryTimer: number | null = null;
  private retryCount = 0;

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
    if (this.saveTimer) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.flushDirty();
    }, SAVE_DEBOUNCE_MS);
  }

  /** 将所有脏会话写入磁盘 */
  private async flushDirty(): Promise<void> {
    const ids = [...this.dirtyConversations];
    this.dirtyConversations.clear();
    let allSucceeded = true;
    for (const id of ids) {
      const conversation = this.conversations.get(id);
      if (!conversation) continue;
      try {
        // 消息是关键数据，先写；metadata 丢失可由消息重建，反之不行
        await this.saveMessages(conversation);
        await this.saveMetadata(conversation);
        this.retryCount = 0;
      } catch (err) {
        allSucceeded = false;
        console.error('[ConversationService] flushDirty failed for', id, err);
        // 写入失败时重新标记为脏，并调度独立重试（而非等下一次消息触发）
        this.dirtyConversations.add(id);
      }
    }

    if (allSucceeded) return;
    if (this.retryCount < FLUSH_MAX_RETRIES) {
      this.retryCount++;
      if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
      this.retryTimer = window.setTimeout(() => {
        this.retryTimer = null;
        void this.flushDirty();
      }, FLUSH_RETRY_DELAY_MS);
    } else {
      // 连续重试仍失败：保留内存数据与脏标记，告警提示磁盘异常
      console.error(
        '[ConversationService] flushDirty failed after ' + FLUSH_MAX_RETRIES +
        ' retries; data kept in memory and will be retried on next save',
      );
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
      messagesLoaded: true,
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
    if (!conversation.messagesLoaded) {
      await this.loadMessages(conversation);
    }
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

      // 内存立即更新（保证后续读取一致性）
      conversation.messages.push(message);
      conversation.messageCount = conversation.messages.length;
      conversation.updatedAt = Date.now();
      conversation.lastResponseAt = message.timestamp;

      // 更新预览
      if (message.role === 'user') {
        conversation.preview = message.content.substring(0, 50) + (message.content.length > 50 ? '...' : '');
      }

      // 内存已持有最新消息，标记已加载（否则 getConversation 会用磁盘旧数据覆盖）
      conversation.messagesLoaded = true;
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
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.retryTimer !== null) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
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

  /** 获取会话标题（不加载消息，轻量查询） */
  getConversationTitle(id: string): string | null {
    const conversation = this.conversations.get(id);
    return conversation?.title ?? null;
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
    if (!source.messagesLoaded) {
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
    newConv.messagesLoaded = true;
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

    if (!conversation.messagesLoaded) {
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

    if (!conversation.messagesLoaded) {
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

    if (!conversation.messagesLoaded) {
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

  /** 保存消息（v2 包裹结构，携带 schema 版本） */
  private async saveMessages(conversation: Conversation): Promise<void> {
    const adapter = this.app.vault.adapter;
    const path = `${this.storagePath}/${conversation.id}.messages.json`;
    const payload: PersistedMessages = {
      schemaVersion: SCHEMA_VERSION,
      messages: conversation.messages,
    };
    await adapter.write(path, JSON.stringify(payload, null, 2));
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

  /**
   * 加载消息：兼容 v1（裸数组）与 v2（包裹结构），并对每条消息做最小结构校验。
   * 校验失败返回空数组并保留原文件（降级不破坏旧数据）；无论成败都标记 messagesLoaded，
   * 避免空会话每次读取都触发空 IO。
   */
  private async loadMessages(conversation: Conversation): Promise<void> {
    const adapter = this.app.vault.adapter;
    const path = `${this.storagePath}/${conversation.id}.messages.json`;
    conversation.messagesLoaded = true;

    if (!(await adapter.exists(path))) {
      conversation.messages = [];
      return;
    }

    try {
      const content = await adapter.read(path);
      const parsed = JSON.parse(content) as Message[] | PersistedMessages;
      let msgs: Message[];
      if (Array.isArray(parsed)) {
        msgs = parsed; // v1 历史格式
      } else if (parsed && Array.isArray((parsed as PersistedMessages).messages)) {
        msgs = (parsed as PersistedMessages).messages;
      } else {
        throw new Error('unrecognized messages schema');
      }
      // 最小结构校验：id/role 缺失视为损坏数据
      const valid = msgs.every(m => m && typeof m.id === 'string' && typeof m.role === 'string');
      if (!valid) {
        console.warn('[ConversationService] Corrupt message entries in ' + conversation.id + ', discarding file contents');
        conversation.messages = [];
        return;
      }
      conversation.messages = msgs;
    } catch (e) {
      console.warn(`[ConversationService] Failed to load messages for ${conversation.id}:`, e);
      conversation.messages = [];
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
