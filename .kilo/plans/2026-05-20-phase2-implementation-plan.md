# KiloCode for Obsidian - Phase 2 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完善聊天体验，实现多 Tab、会话管理和流式响应

**Architecture:** 基于 Phase 1 的 Provider 架构，实现 TabManager 管理多个聊天标签页，StreamController 处理流式响应

**Tech Stack:** TypeScript, Obsidian Plugin API, CodeMirror 6

---

## Task 1: Tab 管理器

**Files:**
- Create: `src/features/chat/tabs/Tab.ts`
- Create: `src/features/chat/tabs/TabManager.ts`

- [ ] **Step 1: 创建 Tab 类型**

```typescript
// src/features/chat/tabs/Tab.ts

export interface TabState {
  id: string;
  conversationId: string | null;
  isStreaming: boolean;
  draftMessage: string;
}

export class Tab {
  id: string;
  state: TabState;

  constructor(id: string) {
    this.id = id;
    this.state = {
      id,
      conversationId: null,
      isStreaming: false,
      draftMessage: '',
    };
  }

  setConversation(conversationId: string): void {
    this.state.conversationId = conversationId;
  }

  setStreaming(streaming: boolean): void {
    this.state.isStreaming = streaming;
  }

  setDraftMessage(message: string): void {
    this.state.draftMessage = message;
  }
}
```

- [ ] **Step 2: 创建 TabManager**

```typescript
// src/features/chat/tabs/TabManager.ts

import { Tab, type TabState } from './Tab';

export class TabManager {
  private tabs: Map<string, Tab> = new Map();
  private activeTabId: string | null = null;
  private maxTabs: number;

  constructor(maxTabs: number = 3) {
    this.maxTabs = maxTabs;
  }

  /** 创建新标签页 */
  createTab(): Tab {
    if (this.tabs.size >= this.maxTabs) {
      throw new Error(`Maximum number of tabs (${this.maxTabs}) reached`);
    }

    const id = `tab-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const tab = new Tab(id);
    this.tabs.set(id, tab);
    this.activeTabId = id;
    return tab;
  }

  /** 关闭标签页 */
  closeTab(tabId: string): void {
    this.tabs.delete(tabId);
    if (this.activeTabId === tabId) {
      const remaining = Array.from(this.tabs.keys());
      this.activeTabId = remaining.length > 0 ? remaining[remaining.length - 1] : null;
    }
  }

  /** 切换到指定标签页 */
  switchTab(tabId: string): Tab | null {
    const tab = this.tabs.get(tabId);
    if (tab) {
      this.activeTabId = tabId;
    }
    return tab || null;
  }

  /** 获取当前活跃标签页 */
  getActiveTab(): Tab | null {
    if (!this.activeTabId) return null;
    return this.tabs.get(this.activeTabId) || null;
  }

  /** 获取所有标签页 */
  getAllTabs(): Tab[] {
    return Array.from(this.tabs.values());
  }

  /** 获取标签页数量 */
  getTabCount(): number {
    return this.tabs.size;
  }

  /** 是否可以创建新标签页 */
  canCreateTab(): boolean {
    return this.tabs.size < this.maxTabs;
  }

  /** 获取持久化状态 */
  getPersistedState(): { openTabs: TabState[]; activeTabId: string | null } {
    return {
      openTabs: Array.from(this.tabs.values()).map(tab => tab.state),
      activeTabId: this.activeTabId,
    };
  }

  /** 从持久化状态恢复 */
  restoreState(state: { openTabs: TabState[]; activeTabId: string | null }): void {
    this.tabs.clear();
    for (const tabState of state.openTabs) {
      const tab = new Tab(tabState.id);
      tab.state = tabState;
      this.tabs.set(tabState.id, tab);
    }
    this.activeTabId = state.activeTabId;
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add src/features/chat/tabs/
git commit -m "feat: add Tab and TabManager"
```

---

## Task 2: 流式响应控制器

**Files:**
- Create: `src/features/chat/controllers/StreamController.ts`

- [ ] **Step 1: 创建 StreamController**

```typescript
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
```

- [ ] **Step 2: 提交**

```bash
git add src/features/chat/controllers/StreamController.ts
git commit -m "feat: add StreamController for streaming responses"
```

---

## Task 3: 输入控制器

**Files:**
- Create: `src/features/chat/controllers/InputController.ts`

- [ ] **Step 1: 创建 InputController**

```typescript
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
```

- [ ] **Step 2: 提交**

```bash
git add src/features/chat/controllers/InputController.ts
git commit -m "feat: add InputController for message input"
```

---

## Task 4: 会话管理

**Files:**
- Create: `src/features/chat/services/ConversationService.ts`

- [ ] **Step 1: 创建 ConversationService**

```typescript
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
```

- [ ] **Step 2: 提交**

```bash
git add src/features/chat/services/ConversationService.ts
git commit -m "feat: add ConversationService for session management"
```

---

## Task 5: 消息渲染器

**Files:**
- Create: `src/features/chat/rendering/MessageRenderer.ts`

- [ ] **Step 1: 创建 MessageRenderer**

```typescript
// src/features/chat/rendering/MessageRenderer.ts

import type { Message, ToolCallInfo } from '../../../core/types';
import { MarkdownRenderer } from 'obsidian';

/**
 * 消息渲染器
 * 将消息渲染为 HTML
 */
export class MessageRenderer {
  private container: HTMLElement;
  private app: any;

  constructor(container: HTMLElement, app: any) {
    this.container = container;
    this.app = app;
  }

  /** 渲染消息列表 */
  renderMessages(messages: Message[]): void {
    this.container.empty();

    for (const message of messages) {
      this.renderMessage(message);
    }

    this.scrollToBottom();
  }

  /** 渲染单条消息 */
  renderMessage(message: Message): HTMLElement {
    const messageEl = this.container.createDiv({
      cls: `kilo-message kilo-message-${message.role}`,
    });

    // 头部
    const headerEl = messageEl.createDiv({ cls: 'kilo-message-header' });
    headerEl.createSpan({
      cls: 'kilo-message-role',
      text: message.role === 'user' ? 'You' : 'KiloCode',
    });
    headerEl.createSpan({
      cls: 'kilo-message-time',
      text: new Date(message.timestamp).toLocaleTimeString(),
    });

    // 内容
    const contentEl = messageEl.createDiv({ cls: 'kilo-message-content' });

    if (message.role === 'assistant') {
      MarkdownRenderer.renderMarkdown(
        message.content,
        contentEl,
        '',
        this.app
      );
    } else {
      contentEl.createSpan({ text: message.content });
    }

    // 工具调用
    if (message.toolCalls && message.toolCalls.length > 0) {
      const toolsEl = messageEl.createDiv({ cls: 'kilo-tools' });
      for (const toolCall of message.toolCalls) {
        this.renderToolCall(toolsEl, toolCall);
      }
    }

    return messageEl;
  }

  /** 渲染工具调用 */
  private renderToolCall(container: HTMLElement, toolCall: ToolCallInfo): void {
    const toolEl = container.createDiv({
      cls: `kilo-tool kilo-tool-${toolCall.status}`,
    });

    // 工具头部
    const headerEl = toolEl.createDiv({ cls: 'kilo-tool-header' });
    headerEl.createSpan({
      cls: 'kilo-tool-icon',
      text: this.getToolIcon(toolCall.name),
    });
    headerEl.createSpan({
      cls: 'kilo-tool-name',
      text: this.getToolDisplayName(toolCall.name),
    });
    headerEl.createSpan({
      cls: 'kilo-tool-status',
      text: this.getStatusText(toolCall.status),
    });

    // 工具内容（默认折叠）
    const contentEl = toolEl.createDiv({
      cls: 'kilo-tool-content',
    });

    if (toolCall.result) {
      const pre = contentEl.createEl('pre');
      pre.createEl('code', { text: toolCall.result });
    }

    // 点击展开/折叠
    headerEl.addEventListener('click', () => {
      contentEl.classList.toggle('kilo-tool-expanded');
    });
  }

  /** 获取工具图标 */
  private getToolIcon(toolName: string): string {
    const icons: Record<string, string> = {
      read_file: '📄',
      write_file: '✏️',
      search: '🔍',
      bash: '💻',
      edit_file: '📝',
    };
    return icons[toolName] || '🔧';
  }

  /** 获取工具显示名称 */
  private getToolDisplayName(toolName: string): string {
    const names: Record<string, string> = {
      read_file: 'Read File',
      write_file: 'Write File',
      search: 'Search',
      bash: 'Bash',
      edit_file: 'Edit File',
    };
    return names[toolName] || toolName;
  }

  /** 获取状态文本 */
  private getStatusText(status: string): string {
    const texts: Record<string, string> = {
      pending: '⏳ Pending',
      running: '🔄 Running',
      completed: '✅ Done',
      error: '❌ Error',
    };
    return texts[status] || status;
  }

  /** 滚动到底部 */
  scrollToBottom(): void {
    this.container.scrollTop = this.container.scrollHeight;
  }

  /** 追加文本到当前消息 */
  appendText(text: string): void {
    const lastMessage = this.container.lastElementChild;
    if (lastMessage) {
      const contentEl = lastMessage.querySelector('.kilo-message-content');
      if (contentEl) {
        contentEl.createSpan({ text });
        this.scrollToBottom();
      }
    }
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/features/chat/rendering/MessageRenderer.ts
git commit -m "feat: add MessageRenderer for message display"
```

---

## Task 6: 主视图

**Files:**
- Create: `src/features/chat/KiloCodeView.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: 创建 KiloCodeView**

```typescript
// src/features/chat/KiloCodeView.ts

import { ItemView, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_KILOCODE } from '../../core/types';
import type KiloCodePlugin from '../../main';
import { TabManager } from './tabs/TabManager';
import { StreamController } from './controllers/StreamController';
import { InputController } from './controllers/InputController';
import { ConversationService } from './services/ConversationService';
import { MessageRenderer } from './rendering/MessageRenderer';

export class KiloCodeView extends ItemView {
  private plugin: KiloCodePlugin;
  private tabManager: TabManager;
  private streamController: StreamController;
  private inputController: InputController;
  private conversationService: ConversationService;
  private messageRenderer: MessageRenderer | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: KiloCodePlugin) {
    super(leaf);
    this.plugin = plugin;

    this.tabManager = new TabManager(plugin.settings.maxTabs);
    this.streamController = new StreamController();
    this.inputController = new InputController();
    this.conversationService = new ConversationService(
      plugin.app,
      plugin.app.vault.getRoot().path
    );
  }

  getViewType(): string {
    return VIEW_TYPE_KILOCODE;
  }

  getDisplayText(): string {
    return 'KiloCode';
  }

  getIcon(): string {
    return 'bot';
  }

  async onOpen(): Promise<void> {
    await this.conversationService.initialize();
    this.render();
  }

  async onClose(): Promise<void> {
    // 清理资源
  }

  /** 渲染视图 */
  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('kilo-code-view');

    // 标签栏
    this.renderTabBar(container);

    // 消息区域
    const messagesEl = container.createDiv({ cls: 'kilo-messages' });
    this.messageRenderer = new MessageRenderer(messagesEl, this.app);

    // 工具栏
    this.renderToolbar(container);

    // 输入框
    this.renderInput(container);

    // 操作栏
    this.renderActionBar(container);
  }

  /** 渲染标签栏 */
  private renderTabBar(container: HTMLElement): void {
    const tabBarEl = container.createDiv({ cls: 'kilo-tab-bar' });

    // 标签页列表
    const tabsEl = tabBarEl.createDiv({ cls: 'kilo-tabs' });
    const tabs = this.tabManager.getAllTabs();

    for (const tab of tabs) {
      const tabEl = tabsEl.createDiv({
        cls: `kilo-tab ${tab.id === this.tabManager.getActiveTab()?.id ? 'kilo-tab-active' : ''}`,
      });
      tabEl.createSpan({ text: tab.state.conversationId || 'New' });
      tabEl.addEventListener('click', () => this.handleTabClick(tab.id));
    }

    // 新建标签页按钮
    const addBtnEl = tabBarEl.createDiv({
      cls: 'kilo-tab-add',
      text: '+',
    });
    addBtnEl.addEventListener('click', () => this.handleNewTab());
  }

  /** 渲染工具栏 */
  private renderToolbar(container: HTMLElement): void {
    const toolbarEl = container.createDiv({ cls: 'kilo-toolbar' });

    const buttons = [
      { icon: '@', title: 'Mention', handler: () => {} },
      { icon: '/', title: 'Commands', handler: () => {} },
      { icon: '#', title: 'Instructions', handler: () => {} },
      { icon: '📎', title: 'Attach file', handler: () => {} },
      { icon: '🖼️', title: 'Attach image', handler: () => {} },
    ];

    for (const btn of buttons) {
      const btnEl = toolbarEl.createDiv({
        cls: 'kilo-toolbar-btn',
        text: btn.icon,
        title: btn.title,
      });
      btnEl.addEventListener('click', btn.handler);
    }
  }

  /** 渲染输入框 */
  private renderInput(container: HTMLElement): void {
    const inputEl = container.createDiv({ cls: 'kilo-input-container' });

    const textarea = inputEl.createEl('textarea', {
      cls: 'kilo-input',
      placeholder: 'Type a message... (Enter to send, Shift+Enter for new line)',
    });

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend(textarea.value);
        textarea.value = '';
      }
    });
  }

  /** 渲染操作栏 */
  private renderActionBar(container: HTMLElement): void {
    const actionBarEl = container.createDiv({ cls: 'kilo-action-bar' });

    // 发送按钮
    const sendBtnEl = actionBarEl.createEl('button', {
      cls: 'kilo-btn kilo-btn-primary',
      text: 'Send',
    });
    sendBtnEl.addEventListener('click', () => {
      const textarea = container.querySelector('.kilo-input') as HTMLTextAreaElement;
      if (textarea) {
        this.handleSend(textarea.value);
        textarea.value = '';
      }
    });

    // 取消按钮（流式时显示）
    const cancelBtnEl = actionBarEl.createEl('button', {
      cls: 'kilo-btn kilo-btn-cancel',
      text: 'Cancel',
    });
    cancelBtnEl.style.display = 'none';
    cancelBtnEl.addEventListener('click', () => this.handleCancel());
  }

  /** 处理标签页点击 */
  private handleTabClick(tabId: string): void {
    this.tabManager.switchTab(tabId);
    this.render();
  }

  /** 处理新建标签页 */
  private handleNewTab(): void {
    if (this.tabManager.canCreateTab()) {
      this.tabManager.createTab();
      this.render();
    }
  }

  /** 处理发送消息 */
  private async handleSend(content: string): Promise<void> {
    if (!content.trim()) return;

    const activeTab = this.tabManager.getActiveTab();
    if (!activeTab) return;

    // 创建会话（如果需要）
    if (!activeTab.state.conversationId) {
      const conversation = await this.conversationService.createConversation();
      activeTab.setConversation(conversation.id);
    }

    // 添加用户消息
    const userMessage = {
      id: `msg-${Date.now()}`,
      role: 'user' as const,
      content,
      timestamp: Date.now(),
    };

    await this.conversationService.addMessage(
      activeTab.state.conversationId!,
      userMessage
    );

    // 重新渲染
    this.render();

    // TODO: 调用 KiloCode CLI 发送消息
  }

  /** 处理取消 */
  private handleCancel(): void {
    this.inputController.cancel();
    this.streamController.cancel();
  }
}
```

- [ ] **Step 2: 更新 main.ts**

```typescript
// src/main.ts (更新导入)

import { KiloCodeView } from './features/chat/KiloCodeView';
```

- [ ] **Step 3: 提交**

```bash
git add src/features/chat/KiloCodeView.ts src/main.ts
git commit -m "feat: add KiloCodeView main chat interface"
```

---

## Task 7: 样式

**Files:**
- Create: `styles.css`

- [ ] **Step 1: 创建基础样式**

```css
/* styles.css */

/* KiloCode 品牌色变量 */
:root {
  --kilo-primary: #FFB800;
  --kilo-primary-light: #FFD54F;
  --kilo-primary-dark: #E5A600;
  --kilo-bg: #ffffff;
  --kilo-bg-secondary: #f5f5f5;
  --kilo-text: #000000;
  --kilo-text-secondary: #666666;
  --kilo-border: #e0e0e0;
  --kilo-user-msg-bg: #FFF8E1;
  --kilo-ai-msg-bg: #F5F5F5;
  --kilo-error: #FF3B30;
  --kilo-success: #4CAF50;
}

.theme-dark {
  --kilo-bg: #1e1e1e;
  --kilo-bg-secondary: #252525;
  --kilo-text: #FFFFFF;
  --kilo-text-secondary: #AAAAAA;
  --kilo-border: #333333;
  --kilo-user-msg-bg: #3D2E00;
  --kilo-ai-msg-bg: #2C2C2C;
  --kilo-error: #FF453A;
  --kilo-success: #66BB6A;
}

/* 主视图 */
.kilo-code-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--kilo-bg);
  color: var(--kilo-text);
}

/* 标签栏 */
.kilo-tab-bar {
  display: flex;
  align-items: center;
  padding: 8px;
  border-bottom: 1px solid var(--kilo-border);
  background: var(--kilo-bg-secondary);
}

.kilo-tabs {
  display: flex;
  gap: 4px;
  flex: 1;
  overflow-x: auto;
}

.kilo-tab {
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
}

.kilo-tab:hover {
  background: var(--kilo-primary-light);
}

.kilo-tab-active {
  background: var(--kilo-primary);
  color: #000;
  border-bottom: 2px solid var(--kilo-primary);
}

.kilo-tab-add {
  padding: 4px 8px;
  cursor: pointer;
  font-size: 16px;
  color: var(--kilo-text-secondary);
}

.kilo-tab-add:hover {
  color: var(--kilo-primary);
}

/* 消息区域 */
.kilo-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

/* 单条消息 */
.kilo-message {
  margin-bottom: 16px;
  padding: 12px;
  border-radius: 8px;
}

.kilo-message-user {
  background: var(--kilo-user-msg-bg);
  margin-left: 32px;
}

.kilo-message-assistant {
  background: var(--kilo-ai-msg-bg);
  margin-right: 32px;
}

.kilo-message-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 12px;
}

.kilo-message-role {
  font-weight: 600;
}

.kilo-message-time {
  color: var(--kilo-text-secondary);
}

.kilo-message-content {
  line-height: 1.6;
}

/* 工具调用 */
.kilo-tools {
  margin-top: 8px;
}

.kilo-tool {
  border: 1px solid var(--kilo-border);
  border-radius: 4px;
  margin-bottom: 4px;
  overflow: hidden;
}

.kilo-tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  cursor: pointer;
  background: var(--kilo-bg-secondary);
}

.kilo-tool-header:hover {
  background: var(--kilo-primary-light);
}

.kilo-tool-icon {
  font-size: 16px;
}

.kilo-tool-name {
  flex: 1;
  font-weight: 500;
  font-size: 13px;
}

.kilo-tool-status {
  font-size: 12px;
  color: var(--kilo-text-secondary);
}

.kilo-tool-content {
  display: none;
  padding: 8px;
  background: var(--kilo-bg);
  font-size: 12px;
}

.kilo-tool-content pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.kilo-tool-expanded .kilo-tool-content {
  display: block;
}

.kilo-tool-pending {
  border-color: var(--kilo-primary);
}

.kilo-tool-running {
  border-color: var(--kilo-primary);
}

.kilo-tool-completed {
  border-color: var(--kilo-success);
}

.kilo-tool-error {
  border-color: var(--kilo-error);
}

/* 工具栏 */
.kilo-toolbar {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  border-top: 1px solid var(--kilo-border);
}

.kilo-toolbar-btn {
  padding: 4px 8px;
  cursor: pointer;
  font-size: 16px;
  border-radius: 4px;
}

.kilo-toolbar-btn:hover {
  background: var(--kilo-primary-light);
}

/* 输入框 */
.kilo-input-container {
  padding: 0 16px;
}

.kilo-input {
  width: 100%;
  min-height: 60px;
  max-height: 200px;
  padding: 12px;
  border: 1px solid var(--kilo-border);
  border-radius: 8px;
  resize: vertical;
  font-family: inherit;
  font-size: 14px;
  background: var(--kilo-bg);
  color: var(--kilo-text);
}

.kilo-input:focus {
  outline: none;
  border-color: var(--kilo-primary);
  box-shadow: 0 0 0 2px var(--kilo-primary-light);
}

/* 操作栏 */
.kilo-action-bar {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--kilo-border);
}

.kilo-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}

.kilo-btn-primary {
  background: var(--kilo-primary);
  color: #000;
}

.kilo-btn-primary:hover {
  background: var(--kilo-primary-dark);
}

.kilo-btn-cancel {
  background: var(--kilo-error);
  color: #fff;
}

.kilo-btn-cancel:hover {
  opacity: 0.9;
}
```

- [ ] **Step 2: 提交**

```bash
git add styles.css
git commit -m "feat: add base styles with KiloCode branding"
```

---

## Task 8: 构建验证

- [ ] **Step 1: 运行 TypeScript 检查**

```bash
npm run typecheck
```

Expected: 无错误

- [ ] **Step 2: 运行构建**

```bash
npm run build
```

Expected: 生成 `main.js` 和 `styles.css`

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "chore: verify Phase 2 build"
```

---

## Phase 2 完成检查清单

- [ ] Tab 管理器工作正常
- [ ] 流式响应控制器实现
- [ ] 输入控制器实现
- [ ] 会话管理服务实现
- [ ] 消息渲染器实现
- [ ] 主视图可打开
- [ ] 基础样式应用
- [ ] TypeScript 编译通过
- [ ] esbuild 构建成功

---

**下一步：Phase 3 - 高级功能（Inline Edit、Slash Commands、@mention）**
