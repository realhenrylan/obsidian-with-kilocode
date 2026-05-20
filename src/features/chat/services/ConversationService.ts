// src/features/chat/services/ConversationService.ts

import type { Conversation, ConversationMeta, Message } from '../../../core/types';
import { App } from 'obsidian';

/**
 * 会话服务
 * 管理会话的创建、保存、恢复和删除
 */
export class ConversationService {
  private app: App;
  private conversations: Map<string, Conversation> = new Map();
  private storagePath: string;

  constructor(app: App, vaultPath: string) {
    this.app = app;
    this.storagePath = `${vaultPath}/.kilocode/sessions`;
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
    const conversation = this.conversations.get(id);
    if (!conversation) return null;

    // 如果消息为空，尝试加载
    if (conversation.messages.length === 0) {
      await this.loadMessages(conversation);
    }

    return conversation;
  }

  /** 添加消息 */
  async addMessage(conversationId: string, message: Message): Promise<void> {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    conversation.messages.push(message);
    conversation.messageCount = conversation.messages.length;
    conversation.updatedAt = Date.now();
    conversation.lastResponseAt = message.timestamp;

    // 更新预览
    if (message.role === 'user') {
      conversation.preview = message.content.substring(0, 50) + (message.content.length > 50 ? '...' : '');
    }

    await this.saveMetadata(conversation);
    await this.saveMessages(conversation);
  }

  /** 删除会话 */
  async deleteConversation(id: string): Promise<void> {
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
    const conversation = this.conversations.get(id);
    if (!conversation) {
      throw new Error(`Conversation ${id} not found`);
    }

    conversation.title = title.trim() || this.generateDefaultTitle();
    conversation.updatedAt = Date.now();

    await this.saveMetadata(conversation);
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
        } catch {
          // 忽略损坏的文件
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
      } catch {
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
