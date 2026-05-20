// src/features/chat/KiloCodeView.ts

import { ItemView, MarkdownView, Notice, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_KILOCODE } from '../../core/types';
import type { ToolCallInfo } from '../../core/types';
import type KiloCodePlugin from '../../main';
import { TabManager } from './tabs/TabManager';
import { StreamController } from './controllers/StreamController';
import { InputController } from './controllers/InputController';
import { ConversationService } from './services/ConversationService';
import { MessageRenderer } from './rendering/MessageRenderer';
import { InlineEditModal } from '../inline-edit/InlineEditModal';
import { DiffViewer } from '../inline-edit/DiffViewer';
import { CLIErrorHandler } from '../../shared/ErrorNotice';
import { PlanModeController } from './PlanModeController';
import { ProviderRegistry } from '../../core/providers/ProviderRegistry';
import type { ChatRuntime } from '../../core/providers/types';
import { ApprovalManager } from '../../core/security/ApprovalManager';
import { showApprovalModal } from '../../core/security/ApprovalModal';

export class KiloCodeView extends ItemView {
  private plugin: KiloCodePlugin;
  private tabManager: TabManager;
  private streamController: StreamController;
  private inputController: InputController;
  private conversationService: ConversationService;
  private messageRenderer: MessageRenderer | null = null;
  private planModeController: PlanModeController;
  private approvalManager: ApprovalManager;

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
    this.planModeController = new PlanModeController();
    this.approvalManager = new ApprovalManager();

    // 设置审批处理器（弹出 Modal）
    this.approvalManager.setApprovalHandler(async (request) => {
      return showApprovalModal(this.app, request);
    });
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
    this.registerInlineEditCommand();
    this.plugin.addCommand({
      id: 'toggle-plan-mode',
      name: 'Toggle Plan Mode',
      callback: () => {
        this.planModeController.cycleMode();
        this.render();
      },
      hotkeys: [{ modifiers: ['Shift'], key: 'Tab' }],
    });
    this.render();
  }

  async onClose(): Promise<void> {
    this.streamController.cancel();
    this.approvalManager.cancelAll();
    this.inputController.cancel();
    this.messageRenderer = null;
  }

  /** 渲染视图 */
  private render(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('kilo-code-view');

    // 模式切换
    this.renderModeToggle(container);

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

    // 注册消息操作事件委托（rewind/fork/copy）
    this.registerMessageActionListeners();
  }

  /** 渲染模式切换 */
  private renderModeToggle(container: HTMLElement): void {
    const modeToggleEl = container.createDiv({ cls: 'kilo-mode-toggle' });
    const currentMode = this.planModeController.getCurrentModeConfig();
    const modeBtn = modeToggleEl.createEl('button', {
      cls: 'kilo-mode-btn',
      text: `${currentMode.icon} ${currentMode.name}`,
    });
    this.registerDomEvent(modeBtn, 'click', () => {
      this.planModeController.cycleMode();
      this.render();
    });
    modeBtn.createSpan({
      cls: 'kilo-mode-hint',
      text: ' (Shift+Tab)',
    });
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
      this.registerDomEvent(tabEl, 'click', () => this.handleTabClick(tab.id));
    }

    // 新建标签页按钮
    const addBtnEl = tabBarEl.createDiv({
      cls: 'kilo-tab-add',
      text: '+',
    });
    this.registerDomEvent(addBtnEl, 'click', () => this.handleNewTab());
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
      this.registerDomEvent(btnEl, 'click', btn.handler);
    }
  }

  /** 渲染输入框 */
  private renderInput(container: HTMLElement): void {
    const inputEl = container.createDiv({ cls: 'kilo-input-container' });

    const textarea = inputEl.createEl('textarea', {
      cls: 'kilo-input',
      placeholder: 'Type a message... (Enter to send, Shift+Enter for new line)',
    });

    this.registerDomEvent(textarea, 'keydown', (e) => {
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
    this.registerDomEvent(sendBtnEl, 'click', () => {
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
    this.registerDomEvent(cancelBtnEl, 'click', () => this.handleCancel());
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

  /** 获取或启动 ChatRuntime */
  private getOrCreateRuntime(): ChatRuntime | null {
    const runtime = this.inputController.getRuntime();
    if (runtime) return runtime;

    const registration = ProviderRegistry.get('kilocode');
    if (!registration) return null;

    const newRuntime = registration.createRuntime();
    this.inputController.setRuntime(newRuntime);

    newRuntime.start().catch(err => {
      console.error('[KiloCodeView] Failed to start runtime:', err);
    });

    return newRuntime;
  }

  /** 获取当前活跃笔记路径 */
  private getCurrentNotePath(): string | undefined {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    return activeView?.file?.path;
  }

  /** 增量追加文本到最后一条消息 */
  private appendToLastMessage(text: string): void {
    const container = this.containerEl.querySelector('.kilo-messages');
    if (!container) return;

    let lastContent = container.querySelector('.kilo-message:last-child .kilo-message-content');
    if (!lastContent) {
      const messageEl = container.createDiv({ cls: 'kilo-message kilo-message-assistant' });
      const headerEl = messageEl.createDiv({ cls: 'kilo-message-header' });
      headerEl.createSpan({ cls: 'kilo-message-role', text: 'KiloCode' });
      headerEl.createSpan({ cls: 'kilo-message-time', text: new Date().toLocaleTimeString() });
      lastContent = messageEl.createDiv({ cls: 'kilo-message-content' });
    }

    lastContent.createSpan({ text });
    container.scrollTop = container.scrollHeight;
  }

  /** 渲染工具调用卡片 */
  private renderToolCall(toolCall: ToolCallInfo): void {
    const container = this.containerEl.querySelector('.kilo-messages');
    if (!container) return;

    const lastMessage = container.querySelector('.kilo-message:last-child');
    if (!lastMessage) return;

    let toolsEl = lastMessage.querySelector('.kilo-tools') as HTMLElement;
    if (!toolsEl) {
      toolsEl = lastMessage.createDiv({ cls: 'kilo-tools' });
    }

    const toolEl = toolsEl.createDiv({ cls: `kilo-tool kilo-tool-${toolCall.status}` });
    toolEl.setAttribute('data-tool-id', toolCall.id);
    const headerEl = toolEl.createDiv({ cls: 'kilo-tool-header' });
    headerEl.createSpan({ cls: 'kilo-tool-name', text: toolCall.name });
    headerEl.createSpan({ cls: 'kilo-tool-status', text: '🔄 Running' });
  }

  /** 更新工具调用结果 */
  private updateToolCallResult(toolCallId: string, result: string): void {
    const toolEl = this.containerEl.querySelector(`[data-tool-id="${toolCallId}"]`);
    if (toolEl) {
      const statusEl = toolEl.querySelector('.kilo-tool-status');
      if (statusEl) statusEl.textContent = '✅ Done';
    }
  }

  /** 处理发送消息 */
  private async handleSend(content: string): Promise<void> {
    if (!content.trim()) return;

    const activeTab = this.tabManager.getActiveTab();
    if (!activeTab || activeTab.state.isStreaming) return;

    try {
      // 1. 确保会话存在
      if (!activeTab.state.conversationId) {
        const conversation = await this.conversationService.createConversation();
        activeTab.setConversation(conversation.id);
      }

      // 2. 保存用户消息
      const messageWithPrefix = this.planModeController.getMessageWithPrefix(content);
      const userMessage = {
        id: `msg-${Date.now()}`,
        role: 'user' as const,
        content: messageWithPrefix,
        timestamp: Date.now(),
      };
      await this.conversationService.addMessage(
        activeTab.state.conversationId!,
        userMessage,
      );

      // 3. 获取 runtime 并发送
      const runtime = this.getOrCreateRuntime();
      if (!runtime) {
        new Notice('KiloCode CLI not available');
        return;
      }

      // 同步权限模式
      this.approvalManager.setPermissionMode(this.plugin.settings.permissionMode);

      const generator = runtime.sendMessage(content, {
        vaultPath: this.plugin.app.vault.getRoot().path,
        currentNote: this.getCurrentNotePath(),
      });

      // 4. 消费流式响应
      activeTab.setStreaming(true);
      this.render();

      // 设置审批决定回调
      this.streamController.setApprovalDecisionCallback((toolName, decision) => {
        const rt = this.inputController.getRuntime();
        rt?.sendApproval?.(toolName, decision as 'allow' | 'deny');
      });

      const assistantMessage = await this.streamController.consumeStream(generator, {
        onText: (text) => this.appendToLastMessage(text),
        onToolCall: (toolCall) => this.renderToolCall(toolCall),
        onToolResult: (id, result) => this.updateToolCallResult(id, result),
        onError: (error) => new Notice(`Error: ${error}`),
        onComplete: () => {
          activeTab.setStreaming(false);
        },
        onApprovalRequired: async (request) => {
          return this.approvalManager.requestApproval(request);
        },
      });

      // 5. 保存助手消息
      await this.conversationService.addMessage(
        activeTab.state.conversationId!,
        assistantMessage,
      );

      this.render();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Failed to send message: ${message}`);
      console.error('[KiloCodeView] handleSend error:', error);
      this.tabManager.getActiveTab()?.setStreaming(false);
      this.render();
    }
  }

  /** 注册 Inline Edit 命令 */
  private registerInlineEditCommand(): void {
    this.plugin.addCommand({
      id: 'inline-edit',
      name: 'Inline Edit',
      editorCallback: (editor) => {
        const selection = editor.getSelection();
        if (selection) {
          this.showInlineEditModal(selection, editor);
        }
      },
      hotkeys: [{ modifiers: ['Ctrl', 'Shift'], key: 'e' }],
    });
  }

  /** 显示 Inline Edit 模态框 */
  private showInlineEditModal(selectedText: string, editor: any): void {
    new InlineEditModal(this.app, selectedText, async (instruction) => {
      // TODO: 调用 KiloCode CLI 进行 inline edit（Phase B 实现）
    }).open();
  }

  /** 显示 diff 预览 */
  private showDiffPreview(editor: any, originalText: string, newText: string): void {
    const diffContainer = document.createElement('div');
    document.body.appendChild(diffContainer);

    const diffViewer = new DiffViewer(diffContainer, originalText, newText);
    diffViewer.render();

    diffContainer.addEventListener('diff-accepted', ((e: CustomEvent) => {
      editor.replaceSelection(e.detail.newText);
      diffContainer.remove();
    }) as EventListener);

    diffContainer.addEventListener('diff-rejected', () => {
      diffContainer.remove();
    });
  }

  /** 处理取消 */
  private handleCancel(): void {
    this.inputController.cancel();
    this.streamController.cancel();
  }

  /** 注册消息操作事件委托（事件冒泡捕获 rewind/fork/copy 按钮点击） */
  private registerMessageActionListeners(): void {
    const container = this.containerEl.querySelector('.kilo-messages');
    if (!container) return;

    this.registerDomEvent(container as HTMLElement, 'click', (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('.kilo-action-btn') as HTMLElement;
      if (!btn) return;

      const action = btn.dataset.action;
      const messageId = btn.dataset.messageId;
      if (!action || !messageId) return;

      switch (action) {
        case 'rewind':
          this.handleRewind(messageId);
          break;
        case 'fork':
          this.handleFork(messageId);
          break;
        case 'copy':
          this.handleCopy(messageId);
          break;
      }
    });
  }

  /** 回退到指定消息，丢弃之后的所有消息 */
  private async handleRewind(messageId: string): Promise<void> {
    const activeTab = this.tabManager.getActiveTab();
    if (!activeTab?.state.conversationId) return;

    const confirmed = confirm('Rewind to this message? All subsequent messages will be removed.');
    if (!confirmed) return;

    try {
      const removed = await this.conversationService.rewindToMessage(
        activeTab.state.conversationId,
        messageId,
      );
      new Notice(`Rewound. Removed ${removed.length} message(s).`);
      this.render();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      new Notice(`Rewind failed: ${msg}`);
    }
  }

  /** 从指定消息处 fork 新会话并在新标签页打开 */
  private async handleFork(messageId: string): Promise<void> {
    const activeTab = this.tabManager.getActiveTab();
    if (!activeTab?.state.conversationId) return;

    if (!this.tabManager.canCreateTab()) {
      new Notice('Maximum tabs reached. Close a tab first.');
      return;
    }

    try {
      const forked = await this.conversationService.forkConversation(
        activeTab.state.conversationId,
        messageId,
      );

      // 创建新 tab 并切换到 fork 的会话
      const newTab = this.tabManager.createTab();
      newTab.setConversation(forked.id);

      new Notice(`Forked: ${forked.title}`);
      this.render();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      new Notice(`Fork failed: ${msg}`);
    }
  }

  /** 复制消息内容到剪贴板 */
  private async handleCopy(messageId: string): Promise<void> {
    const activeTab = this.tabManager.getActiveTab();
    if (!activeTab?.state.conversationId) return;

    const conversation = await this.conversationService.getConversation(
      activeTab.state.conversationId,
    );
    if (!conversation) return;

    const message = conversation.messages.find(m => m.id === messageId);
    if (!message) return;

    await navigator.clipboard.writeText(message.content);
    new Notice('Copied to clipboard');
  }
}
