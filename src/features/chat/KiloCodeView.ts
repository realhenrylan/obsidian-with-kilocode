// src/features/chat/KiloCodeView.ts
// 重构：借鉴 claudian 架构，DOM 骨架只创建一次，通过 updateUI() 更新内容
// 解决：(1) 无法发送第二条消息 (2) 切换会话消息消失 (3) 重启后无法发送

import { ItemView, MarkdownView, Notice, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_KILOCODE } from '../../core/types';
import type { ToolCallInfo, Message } from '../../core/types';
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
import { CurrentNoteContext } from './ui/CurrentNoteContext';
import { ImageContext } from './ui/ImageContext';
import { InputToolbar } from './ui/InputToolbar';

export class KiloCodeView extends ItemView {
  private plugin: KiloCodePlugin;
  private tabManager: TabManager;
  private streamController: StreamController;
  private inputController: InputController;
  private conversationService: ConversationService;
  private messageRenderer: MessageRenderer | null = null;
  private planModeController: PlanModeController;
  private approvalManager: ApprovalManager;
  private currentNoteContext: CurrentNoteContext;
  private imageContext: ImageContext;

  // 持久化 DOM 引用（骨架只创建一次）
  private viewContainerEl: HTMLElement | null = null;
  private tabBarEl: HTMLElement | null = null;
  private messagesEl: HTMLElement | null = null;
  private textareaEl: HTMLTextAreaElement | null = null;
  private inputContainerEl: HTMLElement | null = null;
  private modeToggleEl: HTMLElement | null = null;
  private actionBarEl: HTMLElement | null = null;
  private cancelBtnEl: HTMLButtonElement | null = null;
  private sendBtnEl: HTMLButtonElement | null = null;

  // 标记 DOM 是否已初始化
  private isLayoutBuilt = false;

  // 流式发送者标签 ID（防止跨标签渲染）
  private senderTabId: string | null = null;

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
    this.currentNoteContext = new CurrentNoteContext(plugin.app);
    this.imageContext = new ImageContext(5); // 5MB limit

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
        this.updateModeToggle();
      },
      hotkeys: [{ modifiers: ['Shift'], key: 'Tab' }],
    });

    // 只创建一次 DOM 骨架
    this.buildLayout();

    // 恢复当前会话的消息
    const activeTab = this.tabManager.getActiveTab();
    if (activeTab?.state.conversationId) {
      void this.loadConversationMessages(activeTab.state.conversationId);
    }
  }

  async onClose(): Promise<void> {
    this.streamController.cancel();
    this.approvalManager.cancelAll();
    this.inputController.cancel();
    this.messageRenderer = null;
    this.isLayoutBuilt = false;
  }

  // ============================================
  // DOM 骨架（只创建一次）
  // ============================================

  /** 创建 DOM 骨架，所有事件监听器只注册一次 */
  private buildLayout(): void {
    if (this.isLayoutBuilt) return;

    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('kilo-code-view');
    this.viewContainerEl = container;

    // 模式切换
    this.buildModeToggle(container);

    // 标签栏
    this.tabBarEl = container.createDiv({ cls: 'kilo-tab-bar' });

    // 消息区域（持久化）
    this.messagesEl = container.createDiv({ cls: 'kilo-messages' });
    this.messageRenderer = new MessageRenderer(this.messagesEl, this.app, this);

    // 工具栏
    this.buildToolbar(container);

    // 输入区域（持久化）
    this.buildInputArea(container);

    // 操作栏
    this.buildActionBar(container);

    // 注册消息操作事件委托（只注册一次）
    this.registerMessageActionListeners();

    this.isLayoutBuilt = true;

    // 初始更新 UI 内容
    this.updateUI();
  }

  /** 创建模式切换 UI */
  private buildModeToggle(container: HTMLElement): void {
    this.modeToggleEl = container.createDiv({ cls: 'kilo-mode-toggle' });
    const modeBtn = this.modeToggleEl.createEl('button', { cls: 'kilo-mode-btn' });
    modeBtn.createSpan({ cls: 'kilo-mode-hint', text: ' (Shift+Tab)' });
    this.registerDomEvent(modeBtn, 'click', () => {
      this.planModeController.cycleMode();
      this.updateModeToggle();
    });
    this.updateModeToggle();
  }

  /** 更新模式切换按钮文本（不重建 DOM） */
  private updateModeToggle(): void {
    if (!this.modeToggleEl) return;
    const modeBtn = this.modeToggleEl.querySelector('.kilo-mode-btn') as HTMLButtonElement;
    if (!modeBtn) return;
    const currentMode = this.planModeController.getCurrentModeConfig();
    // 只更新第一个文本节点
    const firstChild = modeBtn.firstChild;
    if (firstChild && firstChild.nodeType === Node.TEXT_NODE) {
      firstChild.textContent = `${currentMode.icon} ${currentMode.name}`;
    } else {
      modeBtn.insertBefore(
        document.createTextNode(`${currentMode.icon} ${currentMode.name}`),
        modeBtn.firstChild
      );
    }
  }

  /** 创建工具栏 */
  private buildToolbar(container: HTMLElement): void {
    const toolbarContainer = container.createDiv({ cls: 'kilo-toolbar-container' });
    const inputToolbar = new InputToolbar(toolbarContainer);
    inputToolbar.setActions([
      {
        id: 'mention',
        icon: '@',
        label: 'Mention file, MCP server, or subagent',
        handler: () => this.triggerMention(),
      },
      {
        id: 'command',
        icon: '/',
        label: 'Slash command',
        handler: () => this.triggerSlashCommand(),
      },
      {
        id: 'instruction',
        icon: '#',
        label: 'Add custom instruction',
        handler: () => this.triggerInstructionMode(),
      },
      {
        id: 'attach-file',
        icon: '📎',
        label: 'Attach vault file',
        handler: () => this.attachFile(),
      },
      {
        id: 'attach-image',
        icon: '🖼️',
        label: 'Attach image',
        handler: () => this.handleAttachImage(),
      },
      {
        id: 'current-note',
        icon: '📝',
        label: 'Include current note as context',
        active: this.currentNoteContext.isIncluded(),
        handler: () => this.handleToggleCurrentNote(),
      },
    ]);
    inputToolbar.render();
  }

  /** 创建输入区域（textarea 事件监听器只注册一次） */
  private buildInputArea(container: HTMLElement): void {
    this.inputContainerEl = container.createDiv({ cls: 'kilo-input-container' });

    // 图片预览区域
    this.imageContext.renderPreview(this.inputContainerEl);

    this.textareaEl = this.inputContainerEl.createEl('textarea', {
      cls: 'kilo-input',
      placeholder: 'Type a message... (Enter to send, Shift+Enter for new line)',
    });

    // 粘贴事件
    this.registerDomEvent(this.textareaEl, 'paste', (e) => {
      if (this.imageContext.addFromPaste(e)) {
        this.imageContext.renderPreview(this.inputContainerEl!);
      }
    });

    // 拖拽事件
    this.registerDomEvent(this.textareaEl, 'dragover', (e) => {
      e.preventDefault();
    });
    this.registerDomEvent(this.textareaEl, 'drop', (e) => {
      e.preventDefault();
      if (this.imageContext.addFromDrop(e)) {
        this.imageContext.renderPreview(this.inputContainerEl!);
      }
    });

    // 键盘事件（只注册一次，不会因 render() 丢失）
    this.registerDomEvent(this.textareaEl, 'keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void this.handleSend(this.textareaEl!.value);
        this.textareaEl!.value = '';
      }
    });
  }

  /** 创建操作栏 */
  private buildActionBar(container: HTMLElement): void {
    this.actionBarEl = container.createDiv({ cls: 'kilo-action-bar' });

    // 发送按钮
    this.sendBtnEl = this.actionBarEl.createEl('button', {
      cls: 'kilo-btn kilo-btn-primary',
      text: 'Send',
    });
    this.registerDomEvent(this.sendBtnEl, 'click', () => {
      if (this.textareaEl) {
        void this.handleSend(this.textareaEl.value);
        this.textareaEl.value = '';
      }
    });

    // 取消按钮
    this.cancelBtnEl = this.actionBarEl.createEl('button', {
      cls: 'kilo-btn kilo-btn-cancel',
      text: 'Cancel',
    });
    this.cancelBtnEl.style.display = 'none';
    this.registerDomEvent(this.cancelBtnEl, 'click', () => this.handleCancel());
  }

  // ============================================
  // UI 更新（不销毁 DOM，只更新内容）
  // ============================================

  /** 更新 UI：标签栏、按钮状态（不销毁 DOM） */
  private updateUI(): void {
    this.updateTabBar();
    this.updateButtonStates();
  }

  /** 更新标签栏内容 */
  private updateTabBar(): void {
    if (!this.tabBarEl) return;

    // 清空标签栏内容（不销毁整个容器）
    const tabsContainer = this.tabBarEl.querySelector('.kilo-tabs');
    if (tabsContainer) tabsContainer.remove();
    const addBtn = this.tabBarEl.querySelector('.kilo-tab-add');
    if (addBtn) addBtn.remove();

    // 重建标签页列表
    const tabsEl = this.tabBarEl.createDiv({ cls: 'kilo-tabs' });
    const tabs = this.tabManager.getAllTabs();
    const activeTabId = this.tabManager.getActiveTab()?.id;

    for (const tab of tabs) {
      const isActive = tab.id === activeTabId;
      const tabEl = tabsEl.createDiv({
        cls: `kilo-tab ${isActive ? 'kilo-tab-active' : ''}`,
      });
      const label = tab.state.conversationId
        ? this.truncateId(tab.state.conversationId)
        : 'New';
      tabEl.createSpan({ text: label });
      this.registerDomEvent(tabEl, 'click', () => void this.handleTabClick(tab.id));
    }

    // 新建标签页按钮
    if (this.tabManager.canCreateTab()) {
      const addBtnEl = this.tabBarEl.createDiv({
        cls: 'kilo-tab-add',
        text: '+',
      });
      this.registerDomEvent(addBtnEl, 'click', () => this.handleNewTab());
    }
  }

  /** 更新按钮状态（发送/取消） */
  private updateButtonStates(): void {
    const activeTab = this.tabManager.getActiveTab();
    const isStreaming = activeTab?.state.isStreaming ?? false;

    if (this.sendBtnEl) {
      this.sendBtnEl.disabled = isStreaming;
      this.sendBtnEl.style.display = isStreaming ? 'none' : '';
    }
    if (this.cancelBtnEl) {
      this.cancelBtnEl.style.display = isStreaming ? '' : 'none';
    }
    if (this.textareaEl) {
      this.textareaEl.disabled = isStreaming;
      this.textareaEl.placeholder = isStreaming
        ? 'AI is responding...'
        : 'Type a message... (Enter to send, Shift+Enter for new line)';
    }
  }

  /** 截断 ID 用于标签显示 */
  private truncateId(id: string): string {
    return id.length > 12 ? id.slice(0, 12) + '...' : id;
  }

  // ============================================
  // 消息管理
  // ============================================

  /** 加载并渲染指定会话的消息 */
  private async loadConversationMessages(conversationId: string): Promise<void> {
    if (!this.messageRenderer || !this.messagesEl) return;

    const conversation = await this.conversationService.getConversation(conversationId);
    if (!conversation) {
      console.warn('[KiloCodeView] Conversation not found:', conversationId);
      return;
    }

    // 清空消息区域并重新渲染
    this.messagesEl.empty();
    this.messageRenderer.renderMessages(conversation.messages);
  }

  /** 在消息区域追加一条用户消息 */
  private appendUserMessage(content: string): void {
    if (!this.messagesEl) return;

    const msgEl = this.messagesEl.createDiv({
      cls: 'kilo-message kilo-message-user',
      attr: { 'data-role': 'user' },
    });
    const headerEl = msgEl.createDiv({ cls: 'kilo-message-header' });
    headerEl.createSpan({ cls: 'kilo-message-role', text: 'You' });
    headerEl.createSpan({
      cls: 'kilo-message-time',
      text: new Date().toLocaleTimeString(),
    });
    const contentEl = msgEl.createDiv({ cls: 'kilo-message-content' });
    contentEl.createSpan({ text: content });

    this.scrollToBottom();
  }

  /** 在消息区域追加一条助手消息（流式完成后） */
  private appendAssistantMessage(message: Message): void {
    if (!this.messagesEl || !this.messageRenderer) return;

    this.messageRenderer.renderMessage(message);
    this.scrollToBottom();
  }

  /** 滚动到底部 */
  private scrollToBottom(): void {
    if (this.messagesEl) {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }
  }

  // ============================================
  // 标签页操作
  // ============================================

  /** 处理标签页点击 */
  private async handleTabClick(tabId: string): Promise<void> {
    // 流式进行中时阻止切换标签（防止响应串台）
    const activeTab = this.tabManager.getActiveTab();
    if (activeTab?.state.isStreaming) {
      new Notice('Please wait for the current response to finish before switching tabs.');
      return;
    }

    const tab = this.tabManager.switchTab(tabId);
    if (!tab) return;

    // 保存当前标签的草稿
    this.saveCurrentDraft();

    // 加载新标签的消息
    if (tab.state.conversationId) {
      await this.loadConversationMessages(tab.state.conversationId);
    } else {
      // 新标签，清空消息区域
      this.messagesEl?.empty();
    }

    // 恢复草稿
    this.restoreDraft(tab.state.draftMessage);

    this.updateUI();
  }

  /** 处理新建标签页 */
  private handleNewTab(): void {
    if (this.tabManager.canCreateTab()) {
      this.saveCurrentDraft();
      this.tabManager.createTab();
      this.messagesEl?.empty();
      this.restoreDraft('');
      this.updateUI();
    }
  }

  /** 保存当前标签的草稿消息 */
  private saveCurrentDraft(): void {
    const activeTab = this.tabManager.getActiveTab();
    if (activeTab && this.textareaEl) {
      activeTab.setDraftMessage(this.textareaEl.value);
    }
  }

  /** 恢复草稿消息到 textarea */
  private restoreDraft(draft: string): void {
    if (this.textareaEl) {
      this.textareaEl.value = draft;
    }
  }

  // ============================================
  // 发送消息
  // ============================================

  /** 检查发送者标签是否仍然活跃（防止跨标签渲染） */
  private isSenderTabActive(): boolean {
    if (!this.senderTabId) return false;
    return this.tabManager.getActiveTab()?.id === this.senderTabId;
  }

  /** 获取或启动 ChatRuntime */
  private async getOrCreateRuntime(): Promise<ChatRuntime | null> {
    const runtime = this.inputController.getRuntime();
    if (runtime) return runtime;

    const registration = ProviderRegistry.get('kilocode');
    if (!registration) return null;

    const newRuntime = registration.createRuntime();
    this.inputController.setRuntime(newRuntime);

    try {
      await newRuntime.start();
    } catch (err) {
      console.error('[KiloCodeView] Failed to start runtime:', err);
      return null;
    }

    return newRuntime;
  }

  /** 获取当前活跃笔记路径 */
  private getCurrentNotePath(): string | undefined {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    return activeView?.file?.path;
  }

  /** 处理发送消息 */
  private async handleSend(content: string): Promise<void> {
    if (!content.trim()) return;

    const activeTab = this.tabManager.getActiveTab();
    if (!activeTab) return;

    if (activeTab.state.isStreaming) return;

    try {
      // 0. 递增流式代数（冲突保护）+ 记录发送者标签 ID
      const generation = activeTab.bumpStreamGeneration();
      this.senderTabId = activeTab.id;

      // 1. 确保会话存在
      if (!activeTab.state.conversationId) {
        const conversation = await this.conversationService.createConversation();
        activeTab.setConversation(conversation.id);
        this.updateTabBar();
      }

      // 2. 构建用户消息
      const messageWithPrefix = this.planModeController.getMessageWithPrefix(content);
      const images = this.imageContext.getImages();

      let currentNote: string | undefined;
      if (this.currentNoteContext.isIncluded()) {
        const noteContent = await this.currentNoteContext.getNoteContent();
        if (noteContent) {
          currentNote = noteContent;
        }
      }

      const userMessage: Message = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: messageWithPrefix,
        timestamp: Date.now(),
      };
      await this.conversationService.addMessage(
        activeTab.state.conversationId!,
        userMessage,
      );

      // 3. 立即在 UI 上显示用户消息
      this.appendUserMessage(content);

      // 4. 获取 runtime 并发送
      const runtime = await this.getOrCreateRuntime();
      if (!runtime) {
        new Notice('KiloCode CLI not available');
        return;
      }

      this.approvalManager.setPermissionMode(this.plugin.settings.permissionMode);

      const generator = runtime.sendMessage(content, {
        vaultPath: this.plugin.app.vault.getRoot().path,
        currentNote: currentNote || this.getCurrentNotePath(),
      });

      // 5. 进入流式状态
      activeTab.setStreaming(true);
      this.updateButtonStates();

      // 创建空的助手消息容器（流式渲染目标）
      this.messageRenderer?.addAssistantMessage();

      // 设置审批决定回调
      this.streamController.setApprovalDecisionCallback((toolName, decision) => {
        const rt = this.inputController.getRuntime();
        rt?.sendApproval?.(toolName, decision as 'allow' | 'deny');
      });

      const assistantMessage = await this.streamController.consumeStream(generator, {
        onText: (text) => {
          // 增量渲染文本
          if (this.isSenderTabActive()) {
            this.messageRenderer?.appendText(text);
          }
        },
        onThinking: (text) => {
          // 增量渲染 thinking
          if (this.isSenderTabActive()) {
            this.messageRenderer?.appendThinking(text);
          }
        },
        onToolCall: (toolCall) => {
          if (this.isSenderTabActive()) this.renderToolCall(toolCall);
        },
        onToolResult: (id, result) => {
          if (this.isSenderTabActive()) this.updateToolCallResult(id, result);
        },
        onError: (error) => new Notice(`Error: ${error}`),
        onComplete: () => {
          activeTab.setStreaming(false);
          this.updateButtonStates();
        },
        onApprovalRequired: async (request) => {
          return this.approvalManager.requestApproval(request);
        },
      },
      generation,    // 传入 generation 进行冲突保护
      );

      // 确保 streaming 状态被重置
      activeTab.setStreaming(false);
      this.updateButtonStates();

      // 流完成后做最终 Markdown 渲染
      this.messageRenderer?.finalizeMessage();

      // 6. 保存助手消息到会话
      await this.conversationService.addMessage(
        activeTab.state.conversationId!,
        assistantMessage,
      );

      // 清除图片
      this.imageContext.clearImages();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Failed to send message: ${message}`);
      console.error('[KiloCodeView] handleSend error:', error);
      this.tabManager.getActiveTab()?.setStreaming(false);
      this.updateButtonStates();
    } finally {
      this.senderTabId = null;
    }
  }

  // ============================================
  // 工具调用渲染
  // ============================================

  /** 渲染工具调用卡片 */
  private renderToolCall(toolCall: ToolCallInfo): void {
    if (!this.messagesEl) return;

    let lastMessage = this.messagesEl.querySelector('.kilo-message:last-child');
    if (!lastMessage) {
      // 如果没有消息元素，创建一个助手消息容器
      const msgEl = this.messagesEl.createDiv({ cls: 'kilo-message kilo-message-assistant' });
      msgEl.createDiv({ cls: 'kilo-message-content' });
      lastMessage = msgEl;
    }

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

  // ============================================
  // 其他操作
  // ============================================

  /** 处理取消 */
  private handleCancel(): void {
    this.inputController.cancel();
    this.streamController.cancel();
  }

  /** 处理图片附件 */
  private async handleAttachImage(): Promise<void> {
    await this.imageContext.addFromFile();
    if (this.inputContainerEl) {
      this.imageContext.renderPreview(this.inputContainerEl);
    }
  }

  /** 处理当前笔记切换 */
  private handleToggleCurrentNote(): void {
    this.currentNoteContext.toggle();
  }

  /** 触发 mention */
  private triggerMention(): void {
    new Notice('Mention feature coming soon');
  }

  /** 触发斜杠命令 */
  private triggerSlashCommand(): void {
    new Notice('Slash commands coming soon');
  }

  /** 触发指令模式 */
  private triggerInstructionMode(): void {
    new Notice('Instruction mode coming soon');
  }

  /** 附加文件 */
  private attachFile(): void {
    new Notice('File attachment coming soon');
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

  /** 注册消息操作事件委托（事件冒泡捕获 rewind/fork/copy 按钮点击） */
  private registerMessageActionListeners(): void {
    if (!this.messagesEl) return;

    this.registerDomEvent(this.messagesEl, 'click', (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('.kilo-action-btn') as HTMLElement;
      if (!btn) return;

      const action = btn.dataset.action;
      const messageId = btn.dataset.messageId;
      if (!action || !messageId) return;

      switch (action) {
        case 'rewind':
          void this.handleRewind(messageId);
          break;
        case 'fork':
          void this.handleFork(messageId);
          break;
        case 'copy':
          void this.handleCopy(messageId);
          break;
      }
    });
  }

  /** 回退到指定消息 */
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
      await this.loadConversationMessages(activeTab.state.conversationId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      new Notice(`Rewind failed: ${msg}`);
    }
  }

  /** 从指定消息处 fork 新会话 */
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

      this.saveCurrentDraft();
      const newTab = this.tabManager.createTab();
      newTab.setConversation(forked.id);

      // 加载 fork 的会话消息
      await this.loadConversationMessages(forked.id);
      this.restoreDraft('');

      new Notice(`Forked: ${forked.title}`);
      this.updateUI();
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
