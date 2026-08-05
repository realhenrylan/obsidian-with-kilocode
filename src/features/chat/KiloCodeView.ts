// src/features/chat/KiloCodeView.ts
// 針构：借鉴 claudian 架构，DOM 骨架坪创建一次，通过 updateUI() 更新内容
// 解决�?1) 无法坑逝第二条消杯 (2) 切杢会话消杯消失 (3) 針坯坎无法坑�?
﻿// src/features/chat/KiloCodeView.ts
// 重构：借鉴 claudian 架构，DOM 骨架只创建一次，通过 updateUI() 更新内容
// 解决：1) 无法发送第二条消息 (2) 切换会话消息消失 (3) 重启后无法发送

import { FileSystemAdapter, ItemView, MarkdownView, Notice, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_KILOCODE } from '../../core/types';
import type { ToolCallInfo, Message } from '../../core/types';
import type KiloCodePlugin from '../../main';
import { TabManager } from './tabs/TabManager';
import { StreamController } from './controllers/StreamController';
import { ConversationController } from './controllers/ConversationController';
import { ConversationService } from './services/ConversationService';
import { ChatState } from './state/ChatState';
import { MessageRenderer } from './rendering/MessageRenderer';
import { CLIErrorHandler } from '../../shared/ErrorNotice';
import { PlanModeController } from './PlanModeController';
import { ProviderRegistry } from '../../core/providers/ProviderRegistry';
import type { ChatRuntime } from '../../core/providers/types';
import { extractEditedFiles, runReview } from '../../providers/kilocode/runtime/ReviewLoop';
import { CommandPalette } from '../commands/CommandPalette';
import type { SubMenuItem } from '../commands/CommandPalette';
import { createDefaultCommandRegistry } from '../commands/SlashCommand';
import { listCatalog } from '../../providers/kilocode/runtime/SkillCatalog';
import { readCliModels, readCliMcpServers, readCliSubagents } from '../../core/cliConfigReader';

/** �?Tab 缓冲的浝弝状思（用于跨标签浝弝杢夝） */
interface TabStreamingState {
  content: string;
  thinking: string;
  toolCalls: Map<string, ToolCallInfo>;
}
import { ApprovalManager } from '../../core/security/ApprovalManager';
import { showApprovalModal } from '../../core/security/ApprovalModal';
import { CurrentNoteContext } from './ui/CurrentNoteContext';
import { FileAttachmentContext } from './ui/FileAttachmentContext';
import { InputToolbar } from './ui/InputToolbar';
import { MentionService } from '../mention/MentionService';
import type { MentionContext, MentionItem } from '../mention/MentionService';
import { MentionDropdown } from '../mention/MentionDropdown';
import { MentionCategoryMenu } from '../mention/MentionCategoryMenu';
import type { MentionCategory } from '../mention/MentionCategoryMenu';
import { VaultFileBrowserModal } from '../mention/VaultFileBrowserModal';
import { ListSelectModal } from '../mention/ListSelectModal';
import type { ListSelectItem } from '../mention/ListSelectModal';
import { CustomInstructionModal } from './ui/CustomInstructionModal';
import { openModelSwitcher } from './ui/ModelSwitcherModal';
import { ChatLayoutBuilder } from './layout/ChatLayoutBuilder';
import { TabBarView } from './tabs/TabBarView';
import { SendOrchestrator, type TabStreamingState } from './controllers/SendOrchestrator';
import { MessageActionsHandler } from './rendering/MessageActionsHandler';
import { createDefaultCommandRegistry } from '../commands/SlashCommand';
import { TabController } from './controllers/TabController';
import { t } from '../../i18n';
import { ViewActions } from './ui/ViewActions';
import { runInlineEdit } from '../inline-edit/runInlineEdit';

export class KiloCodeView extends ItemView {
  private plugin: KiloCodePlugin;
  private tabManager: TabManager;
  private streamController: StreamController;
  private conversationService: ConversationService;
  private conversationController: ConversationController;
  private chatState: ChatState;
  private messageRenderer: MessageRenderer | null = null;
  private planModeController: PlanModeController;
  private approvalManager: ApprovalManager;
  private currentNoteContext: CurrentNoteContext;
  private fileAttachmentContext: FileAttachmentContext;
  /** ?? session ??????????null ????? */
  private appliedCustomInstructions: string | null = null;
  private commandRegistry = createDefaultCommandRegistry();
  private commandPaletteEl: HTMLElement | null = null;
  private slashActive = false;
  private activePalette: CommandPalette | null = null;

  // 挝久�?DOM 引用（骨架坪创建一次）
  // 持久化 DOM 引用（框架只创建一次）
  private viewContainerEl: HTMLElement | null = null;
  private tabBarEl: HTMLElement | null = null;
  private messagesEl: HTMLElement | null = null;
  private textareaEl: HTMLTextAreaElement | null = null;
  private inputContainerEl: HTMLElement | null = null;
  private modeToggleEl: HTMLElement | null = null;
  private modelBtnEl: HTMLElement | null = null;
  private actionBarEl: HTMLElement | null = null;
  private cancelBtnEl: HTMLButtonElement | null = null;
  private sendBtnEl: HTMLButtonElement | null = null;
  private tabBarView: TabBarView | null = null;

  // @mention
  private mentionService: MentionService | null = null;
  private mentionDropdown: MentionDropdown | null = null;
  private mentionCategoryMenu: MentionCategoryMenu | null = null;
  private mentionContainerEl: HTMLElement | null = null;

  // 标记 DOM 是坦已初始化
  private isLayoutBuilt = false;

  // 浝弝坑逝者标�?ID（防止跨标签渲染�?
  private senderTabId: string | null = null;

  // 浝弝期间切杢标签支挝：按标签缓冲浝弝状�?+ 切杢中标�?
  // 标记 DOM 是否已初始化
  private isLayoutBuilt = false;

  // 流式发送者标签 ID（防止跨标签渲染）
  private senderTabId: string | null = null;

  // 流式期间切换标签支持：按标签缓冲流式状态 + 切换中标记
  private streamingStates: Map<string, TabStreamingState> = new Map();
  private isSwitchingTab = false;

  // 发送编排器（handleSend 四段流程）
  private sendOrchestrator: SendOrchestrator;

  // 消息操作处理器（rewind/fork/copy 委托）
  private messageActionsHandler: MessageActionsHandler;

  // 标签页控制器（点击 / 新建 / 草稿）
  private tabController: TabController;

  // 视图操作集（工具栏动作 / Inline Edit 命令）
  private viewActions: ViewActions;

  constructor(leaf: WorkspaceLeaf, plugin: KiloCodePlugin) {
    super(leaf);
    this.plugin = plugin;

    this.tabManager = new TabManager(plugin.settings.maxTabs);
    this.streamController = new StreamController();
    this.conversationService = new ConversationService(
      plugin.app,
      plugin.app.vault.getRoot().path
    );
    this.chatState = new ChatState();
    this.conversationController = new ConversationController(
      this.conversationService,
      this.chatState,
    );
    this.planModeController = new PlanModeController();
    this.approvalManager = new ApprovalManager();
    this.currentNoteContext = new CurrentNoteContext(plugin.app);
    this.fileAttachmentContext = new FileAttachmentContext(10, 10); // 10MB limit, max 10 files
    this.fileAttachmentContext.setOnUpdate(() => {
      if (this.inputContainerEl) {
        this.fileAttachmentContext.renderPreview(this.inputContainerEl);
      }
    });

    // 设置审批处睆器（弹出 Modal�?
    // 设置审批处理器（弹出 Modal）
    this.approvalManager.setApprovalHandler(async (request) => {
      return showApprovalModal(this.app, request);
    });

    // 注入 ConversationController 回调（靿兝直接依�?DOM�?
    // 注入 ConversationController 回调（避免直接依赖 DOM）
    this.conversationController.onClearMessages(() => {
      this.messagesEl?.empty();
    });
    this.conversationController.onRenderMessages((messages) => {
      this.messageRenderer?.renderMessages(messages);
    });

    // 发送编排器：注入依赖与渲染回调
    this.sendOrchestrator = new SendOrchestrator({
      tabManager: this.tabManager,
      streamController: this.streamController,
      inputController: this.inputController,
      conversationController: this.conversationController,
      planModeController: this.planModeController,
      approvalManager: this.approvalManager,
      getPermissionMode: () => this.plugin.settings.permissionMode,
      getVaultPath: () => this.plugin.app.vault.getRoot().path,
      setSenderTabId: (tabId) => { this.senderTabId = tabId; },
      isSenderTabActive: () => this.isSenderTabActive(),
      isSwitchingTab: () => this.isSwitchingTab,
      renderUserMessage: (content) => this.messageRenderer?.appendUserMessage(content),
      addAssistantMessage: () => this.messageRenderer?.addAssistantMessage(),
      appendText: (text) => this.messageRenderer?.appendText(text),
      appendThinking: (text) => this.messageRenderer?.appendThinking(text),
      renderToolCall: (toolCall) => this.messageRenderer?.renderToolCallStreaming(toolCall),
      updateToolCallResult: (id, result) => this.messageRenderer?.appendToolResult(id, result),
      finalizeMessage: () => this.messageRenderer?.finalizeMessage(),
      updateTabBar: () => this.updateTabBar(),
      updateButtonStates: () => this.updateButtonStates(),
      notice: (message) => new Notice(message),
      isNoteIncluded: () => this.currentNoteContext.isIncluded(),
      getNoteContent: async () => (await this.currentNoteContext.getNoteContent()) ?? undefined,
      getCurrentNotePath: () => this.getCurrentNotePath(),
      clearImages: () => this.imageContext.clearImages(),
      getStreamingState: (tabId) => this.streamingStates.get(tabId),
      setStreamingState: (tabId, state) => { this.streamingStates.set(tabId, state); },
      deleteStreamingState: (tabId) => { this.streamingStates.delete(tabId); },
      getOrCreateRuntime: () => this.getOrCreateRuntime(),
    });

    // 消息操作处理器：注入会话 / Tab / 草稿依赖
    this.messageActionsHandler = new MessageActionsHandler({
      registerDomEvent: (el, event, cb) => this.registerDomEvent(el, event, cb),
      conversationController: this.conversationController,
      tabManager: this.tabManager,
      chatState: this.chatState,
      notice: (message) => new Notice(message),
      saveCurrentDraft: () => this.saveCurrentDraft(),
      restoreDraft: (draft) => this.restoreDraft(draft),
      updateUI: () => this.updateUI(),
    });

    // 标签页控制器：注入会话 / 渲染 / 草稿依赖
    this.tabController = new TabController({
      tabManager: this.tabManager,
      conversationController: this.conversationController,
      chatState: this.chatState,
      getMessageRenderer: () => this.messageRenderer,
      getMessagesEl: () => this.messagesEl,
      getStreamingState: (tabId) => this.streamingStates.get(tabId),
      saveCurrentDraft: () => this.saveCurrentDraft(),
      restoreDraft: (draft) => this.restoreDraft(draft),
      updateUI: () => this.updateUI(),
      setIsSwitchingTab: (v) => { this.isSwitchingTab = v; },
    });

    // 视图操作集：注入 app / 图片 / 笔记上下文 / Slash 命令注册表
    this.viewActions = new ViewActions({
      app: plugin.app,
      addCommand: (cmd) => this.plugin.addCommand(cmd),
      getInputContainerEl: () => this.inputContainerEl,
      imageContext: this.imageContext,
      currentNoteContext: this.currentNoteContext,
      notice: (message) => new Notice(message),
      // Slash 命令注册表：handler 依赖注入真实控制器
      commandRegistry: createDefaultCommandRegistry({
        conversationController: this.conversationController,
        settings: this.plugin.settings,
        modelSwitcher: { open: () => this.handleModelSwitch() },
        planModeController: this.planModeController,
      }),
      // Inline Edit 真实实现：plan 模式调 CLI → diff 预览 → Accept 写入当前笔记
      inlineEditRunner: (selectedText, instruction) => {
        void runInlineEdit(
          {
            app: plugin.app,
            vault: plugin.app.vault,
            getRuntime: () => this.inputController.getRuntime(),
            getActiveFile: () => plugin.app.workspace.getActiveFile(),
            notice: (message) => new Notice(message),
          },
          selectedText,
          instruction,
        );
      },
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
    this.viewActions.registerInlineEditCommand();
    this.plugin.addCommand({
      id: 'toggle-plan-mode',
      name: 'Toggle Plan Mode',
      callback: () => {
        this.planModeController.cycleMode();
        this.updateModeToggle();
      },
      hotkeys: [{ modifiers: ['Shift'], key: 'Tab' }],
    });
    this.plugin.addCommand({
      id: 'reload-cli',
      name: 'Reload CLI Configuration',
      callback: () => {
        void this.restartRuntime();
      },
    });

    // 坪创建一�?DOM 骨架
    this.buildLayout();

    // 确保至少有一个标签页（首次打开时创建默认标签页�?
    // 只创建一次 DOM 骨架
    this.buildLayout();

    // 确保至少有一个标签页（首次打开时创建默认标签页）
    let activeTab = this.tabManager.getActiveTab();
    if (!activeTab) {
      this.tabManager.createTab();
      this.conversationController.createNew();
      this.updateUI();
      activeTab = this.tabManager.getActiveTab();
    }

    // 杢夝当剝会话的消�?
    // 恢复当前会话的消息
    if (activeTab?.state.conversationId) {
      this.chatState.setConversationId(activeTab.state.conversationId);
      void this.conversationController.restoreConversation(activeTab.state.conversationId);
    }

    // Background warmup: pre-start CLI so first send is fast
    void this.warmupRuntime();
  }

  /**
   * Background warmup of the CLI process (fire-and-forget).
   * Only warms up if binary is already cached (previously downloaded).
   */
  private async warmupRuntime(): Promise<void> {
    if (!this.plugin.binaryManager.isReady()) return;
    try {
      const runtime = await this.getOrCreateRuntime();
      if (runtime) {
        console.log('[KiloCodeView] Runtime warmed up in background');
      }
    } catch (err) {
      console.warn('[KiloCodeView] Background runtime warmup failed:', err);
    }
  }

  async onClose(): Promise<void> {
    this.streamController.cancel();
    this.approvalManager.cancelAll();
    this.streamingStates.clear();
    await this.tabManager.disposeAllRuntimes();
    // 通过 ConversationController 刷新待写入的会话数据
    await this.conversationController.save();
    this.messageRenderer = null;
    this.isLayoutBuilt = false;
  }

  // ============================================
  // DOM 骨架（坪创建一次）
  // ============================================

  /** 创建 DOM 骨架，所有事件监坬器坪注册一�?*/
  // DOM 骨架（只创建一次）
  // ============================================

  /** 创建 DOM 骨架，所有事件监听器只注册一次 */
  private buildLayout(): void {
    if (this.isLayoutBuilt) return;

    const container = this.containerEl.children[1] as HTMLElement;
    const refs = ChatLayoutBuilder.build(container);
    this.viewContainerEl = refs.viewContainerEl;
    this.modeToggleEl = refs.modeToggleEl;
    this.tabBarEl = refs.tabBarEl;
    this.messagesEl = refs.messagesEl;
    this.inputContainerEl = refs.inputContainerEl;
    this.textareaEl = refs.textareaEl;
    this.actionBarEl = refs.actionBarEl;
    this.sendBtnEl = refs.sendBtnEl;
    this.cancelBtnEl = refs.cancelBtnEl;

    // 模弝切杢
    this.buildModeToggle(container);

    // 标签�?
    this.tabBarEl = container.createDiv({ cls: 'kilo-tab-bar' });

    // 消杯区域（挝久化�?
    this.messagesEl = container.createDiv({ cls: 'kilo-messages' });
    this.messageRenderer = new MessageRenderer(this.messagesEl, this.app, this);

    // 工具�?
    this.buildToolbar(container);

    // ????????????????
    this.commandPaletteEl = container.createDiv({ cls: 'kilo-command-palette-container' });

    // @mention ????????? slash command ???
    this.mentionContainerEl = container.createDiv({ cls: 'kilo-command-palette-container' });

    // ?????????
    this.buildInputArea(container);

    // 擝作�?
    this.buildActionBar(container);

    // 注册消杯擝作事件委托（坪注册一次）
    // 消息渲染器（消息区域持久化）
    this.messageRenderer = new MessageRenderer(this.messagesEl, this.app, this);

    // 标签栏渲染器（纯渲染，事件回调注入）
    this.tabBarView = new TabBarView(
      refs.tabBarEl,
      (el, event, cb) => this.registerDomEvent(el, event, cb),
      (id) => this.conversationService.getConversationTitle(id),
    );

    // 工具栏（actions 依赖 view 方法）
    this.buildToolbar(refs.toolbarContainer);

    // 图片预览区
    this.imageContext.renderPreview(refs.inputContainerEl);

    // 事件注册（registerDomEvent 为 ItemView 方法，留在 View）
    this.registerModeToggleEvents();
    this.registerInputEvents();
    this.registerActionBarEvents();

    // 消息操作事件委托（只注册一次）
    this.registerMessageActionListeners();

    this.isLayoutBuilt = true;

    // 初始更新 UI 内容
    this.updateUI();
  }

  /** 创建模弝切杢 UI */
  private buildModeToggle(container: HTMLElement): void {
    this.modeToggleEl = container.createDiv({ cls: 'kilo-mode-toggle' });
    const modeBtn = this.modeToggleEl.createEl('button', { cls: 'kilo-mode-btn' });
    modeBtn.createSpan({ cls: 'kilo-mode-hint', text: ' (Shift+Tab)' });
  /** 注册模式切换按钮事件（按钮由 ChatLayoutBuilder 创建） */
  private registerModeToggleEvents(): void {
    if (!this.modeToggleEl) return;
    const modeBtn = this.modeToggleEl.querySelector('.kilo-mode-btn') as HTMLButtonElement;
    if (!modeBtn) return;
    this.registerDomEvent(modeBtn, 'click', () => {
      this.planModeController.cycleMode();
      this.updateModeToggle();
    });
    this.updateModeToggle();
  }

  /** 更新模弝切杢按钮文本（丝針建 DOM�?*/
  /** 更新模式切换按钮文本（不重建 DOM） */
  private updateModeToggle(): void {
    if (!this.modeToggleEl) return;
    const modeBtn = this.modeToggleEl.querySelector('.kilo-mode-btn') as HTMLButtonElement;
    if (!modeBtn) return;
    const currentMode = this.planModeController.getCurrentModeConfig();
    // 坪更新第一个文本节�?
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

  /** 创建工具�?*/
  private buildToolbar(container: HTMLElement): void {
    const toolbarContainer = container.createDiv({ cls: 'kilo-toolbar-container' });
  /** 创建工具栏（按钮动作依赖 view 方法） */
  private buildToolbar(toolbarContainer: HTMLElement): void {
    const inputToolbar = new InputToolbar(toolbarContainer);
    inputToolbar.setActions([
      {
        id: 'mention',
        icon: '@',
        label: 'Mention file, MCP server, or subagent',
        handler: () => this.viewActions.triggerMention(),
      },
      {
        id: 'slash-command',
        icon: '/',
        label: 'Slash command (/skills, /model, /mode, etc.)',
        handler: () => this.triggerSlashCommand(),
        label: 'Slash command',
        handler: () => this.viewActions.triggerSlashCommand(),
      },
      {
        id: 'instruction',
        icon: '#',
        label: 'Add custom instruction',
        handler: () => this.viewActions.triggerInstructionMode(),
      },
      {
        id: 'attach-file',
        icon: '\uD83D\uDCCE',
        label: 'Attach vault file',
        handler: () => this.viewActions.attachFile(),
      },
      {
        id: 'attach-image',
        icon: '🖼️',
        label: 'Attach image',
        handler: () => void this.viewActions.handleAttachImage(),
      },
      {
        id: 'current-note',
        icon: '\uD83D\uDCDD',
        label: 'Include current note as context',
        active: this.currentNoteContext.isIncluded(),
        handler: () => this.viewActions.handleToggleCurrentNote(),
      },
    ]);
    inputToolbar.render();
  }

  /** 创建输入区域（textarea 事件监坬器坪注册一次） */
  private buildInputArea(container: HTMLElement): void {
    this.inputContainerEl = container.createDiv({ cls: 'kilo-input-container' });

    this.textareaEl = this.inputContainerEl.createEl('textarea', {
      cls: 'kilo-input',
      placeholder: this.getRandomPlaceholder(),
    });

    // keyboard events: delegate to category menu / mention dropdown first
  /** 注册输入区事件（textarea 事件监听器只注册一次，不会因 render() 丢失） */
  private registerInputEvents(): void {
    if (!this.textareaEl || !this.inputContainerEl) return;

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

    // 键盘事件（Enter 发送，Shift+Enter 换行）
    this.registerDomEvent(this.textareaEl, 'keydown', (e) => {
      // category menu takes priority
      if (this.mentionCategoryMenu) {
        const consumed = this.mentionCategoryMenu.handleKeyDown(e);
        if (consumed) return;
      }

      // then mention dropdown
      if (this.mentionDropdown) {
        const consumed = this.mentionDropdown.handleKeyDown(e);
        if (consumed) return;
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const content = this.textareaEl!.value;
        if (content.startsWith('/')) {
          void this.handleSlashInput(content);
        } else {
          void this.handleSend(content);
          this.textareaEl!.value = '';
        }
      }
    });
  }

  /** 创建擝作�?*/
  private buildActionBar(container: HTMLElement): void {
    this.actionBarEl = container.createDiv({ cls: 'kilo-action-bar' });

    // 坑逝按�?
    this.sendBtnEl = this.actionBarEl.createEl('button', {
      cls: 'kilo-btn kilo-btn-primary',
      text: 'Send',
    });
  /** 注册操作栏按钮事件 */
  private registerActionBarEvents(): void {
    if (!this.sendBtnEl || !this.cancelBtnEl) return;

    // 发送按钮
    this.registerDomEvent(this.sendBtnEl, 'click', () => {
      if (this.textareaEl) {
        void this.handleSend(this.textareaEl.value);
        this.textareaEl.value = '';
      }
    });

    // 坖消按钮
    this.cancelBtnEl = this.actionBarEl.createEl('button', {
      cls: 'kilo-btn kilo-btn-cancel',
      text: 'Cancel',
    });
    this.cancelBtnEl.style.display = 'none';
    // 取消按钮
    this.registerDomEvent(this.cancelBtnEl, 'click', () => this.handleCancel());
  }

  // ============================================
  // UI 更新（丝销�?DOM，坪更新内容�?
  // ============================================

  /** 更新 UI：标签栝〝按钮状思（丝销�?DOM�?*/
  // UI 更新（不销毁 DOM，只更新内容）
  // ============================================

  /** 更新 UI：标签栏、按钮状态（不销毁 DOM） */
  private updateUI(): void {
    this.updateTabBar();
    this.updateButtonStates();
  }

  /** 更新标签栝内�?*/
  /** 更新标签栏内容 */
  private updateTabBar(): void {
    if (!this.tabBarEl || !this.tabBarView) return;

    // 清空标签栝内容（丝销毝整个容器）
    const tabsContainer = this.tabBarEl.querySelector('.kilo-tabs');
    if (tabsContainer) tabsContainer.remove();
    const addBtn = this.tabBarEl.querySelector('.kilo-tab-add');
    if (addBtn) addBtn.remove();

    // 針建标签页列�?
    const tabsEl = this.tabBarEl.createDiv({ cls: 'kilo-tabs' });
    const tabs = this.tabManager.getAllTabs();
    const activeTabId = this.tabManager.getActiveTab()?.id;

    for (const tab of tabs) {
      const isActive = tab.id === activeTabId;
      const tabEl = tabsEl.createDiv({
        cls: `kilo-tab ${isActive ? 'kilo-tab-active' : ''}`,
      });
      const label = tab.state.conversationId
        ? (this.conversationService.getConversationTitle(tab.state.conversationId) || this.truncateId(tab.state.conversationId))
        : 'New';
      tabEl.createSpan({ text: label });
      this.registerDomEvent(tabEl, 'click', () => void this.handleTabClick(tab.id));
    }

    // 新建标签页按�?
    if (this.tabManager.canCreateTab()) {
      const addBtnEl = this.tabBarEl.createDiv({
        cls: 'kilo-tab-add',
        text: '+',
      });
      this.registerDomEvent(addBtnEl, 'click', () => this.handleNewTab());
    }
  }

  /** 更新按钮状思（坑�?坖消�?*/
    this.tabBarView.render(
      this.tabManager.getAllTabs(),
      this.tabManager.getActiveTab()?.id ?? null,
      this.tabManager.canCreateTab(),
      {
        onTabClick: (tabId) => void this.handleTabClick(tabId),
        onNewTab: () => this.handleNewTab(),
      },
    );
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
        ? t('chat.responding')
        : this.getRandomPlaceholder();
    }
  }

  /** 截断 ID 用于标签显示 */
  private truncateId(id: string): string {
    return id.length > 12 ? id.slice(0, 12) + '...' : id;
  }

  /** 隝机坠佝符杝示语 */

  /** 随机占位符提示语 */
  /** 随机占位符提示语（i18n 词典，避免硬编码） */
  private getRandomPlaceholder(): string {
    const keys = ['chat.placeholder1', 'chat.placeholder2', 'chat.placeholder3', 'chat.placeholder4', 'chat.placeholder5'];
    return t(keys[Math.floor(Math.random() * keys.length)]);
  }

  // ============================================
  // 消杯管睆
  // ============================================

  /** 在消杯区域追加一条用户消�?*/
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

  /** 在消杯区域追加一条助手消杯（浝弝完戝坎） */
  private appendAssistantMessage(message: Message): void {
    if (!this.messagesEl || !this.messageRenderer) return;

    this.messageRenderer.renderMessage(message);
    this.scrollToBottom();
  }

  /** 滚动到底�?*/
  private scrollToBottom(): void {
    if (this.messagesEl) {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }
  }

  // ============================================
  // 标签页擝�?
  // ============================================

  /** 处睆标签页点击（浝弝进行中也坯切杢，通过 TabStreamingState 杢夝渲染�?*/
  private async handleTabClick(tabId: string): Promise<void> {
    this.isSwitchingTab = true;
    try {
      const tab = this.tabManager.switchTab(tabId);
      if (!tab) return;

      // 保存当剝标签的蝉�?
      this.saveCurrentDraft();

      // 通过 ConversationController 切杢会话（坫 save �?reset �?load �?render�?
      if (tab.state.conversationId) {
        await this.conversationController.switchTo(tab.state.conversationId);
      } else {
        this.messagesEl?.empty();
      }

      // 坌步 ChatState
      this.chatState.setConversationId(tab.state.conversationId ?? null);

      // 如果目标标签有正在进行的浝，針建浝弝渲染状�?
      let recoveredFromState = false;
      if (tab.state.isStreaming) {
        const state = this.streamingStates.get(tabId);
        if (state) {
          this.messageRenderer?.addAssistantMessage();
          if (state.thinking) {
            this.messageRenderer?.appendThinking(state.thinking);
          }
          if (state.content) {
            this.messageRenderer?.appendText(state.content);
          }
          for (const toolCall of state.toolCalls.values()) {
            this.renderToolCall(toolCall);
          }
          recoveredFromState = true;
        }
      }

      // EventBuffer recovery: when streaming state was already cleaned up
      // (stream completed in background), restore from runtime event buffer.
      if (!recoveredFromState) {
        const runtime = tab.runtime;
        if (runtime && 'eventBuffer' in runtime) {
          const eb = (runtime as any).eventBuffer;
          if (eb && eb.length > 0) {
            const chunks = eb.replay(-1);
            const hasSavedMessages = (this.messagesEl?.children.length ?? 0) > 0;
            if (chunks.filter((c: any) => c.type !== 'done').length > 0 && !hasSavedMessages) {
              this.messageRenderer?.addAssistantMessage();
              for (const chunk of chunks) {
                switch (chunk.type) {
                  case 'text':
                    this.messageRenderer?.appendText(chunk.content || '');
                    break;
                  case 'thinking':
                    this.messageRenderer?.appendThinking(chunk.content || '');
                    break;
                  case 'tool_use':
                    if (chunk.toolCall) this.renderToolCall(chunk.toolCall);
                    break;
                }
              }
            }
          }
        }
      }

      // 杢夝蝉稿
      this.restoreDraft(tab.state.draftMessage);

      this.updateUI();
    } finally {
      this.isSwitchingTab = false;
    }
  }

  /** 处睆新建标签�?*/
  private handleNewTab(): void {
    if (this.tabManager.canCreateTab()) {
      this.saveCurrentDraft();
      this.tabManager.createTab();
      // 通过 ConversationController 針置到空白状�?
      this.conversationController.createNew();
      this.restoreDraft('');
      this.updateUI();
    }
  }

  /** 保存当剝标签的蝉稿消�?*/
  private saveCurrentDraft(): void {
    const activeTab = this.tabManager.getActiveTab();
    if (activeTab && this.textareaEl) {
      activeTab.setDraftMessage(this.textareaEl.value);
    }
  }

  /** 杢夝蝉稿消杯�?textarea */
  private restoreDraft(draft: string): void {
    if (this.textareaEl) {
      this.textareaEl.value = draft;
    }
  }

  // ============================================
  // 坑逝消�?
  // ============================================

  /** 检查坑逝者标签是坦仝然活跃（防止跨标签渲染） */
  // 消息管理
  // ============================================


  // ============================================
  // 标签页操作
  // ============================================





  // ============================================
  // 发送消息
  // ============================================

  /** 检查发送者标签是否仍然活跃（防止跨标签渲染） */
  private isSenderTabActive(): boolean {
    if (!this.senderTabId) return false;
    return this.tabManager.getActiveTab()?.id === this.senderTabId;
  }

  /** 获坖或坯�?ChatRuntime */
  /** 获取或启动 ChatRuntime */
  private async getOrCreateRuntime(): Promise<ChatRuntime | null> {
    const activeTab = this.tabManager.getActiveTab();
    if (!activeTab) return null;

    if (activeTab.runtime) return activeTab.runtime;

    if (this.plugin.warmupRuntimeRef) {
      const warmedUp = this.plugin.warmupRuntimeRef;
      this.plugin.warmupRuntimeRef = null;
      activeTab.runtime = warmedUp;
      this.plugin.addKilocodeRuntime(warmedUp);
      return warmedUp;
    }

    const registration = ProviderRegistry.get('kilocode');
    if (!registration) return null;

    const newRuntime = registration.createRuntime();
    activeTab.runtime = newRuntime;
    this.plugin.addKilocodeRuntime(newRuntime);

    try {
      await newRuntime.start();
    } catch (err) {
      activeTab.runtime = null;
      console.error('[KiloCodeView] Failed to start runtime:', err);
      return null;
    }

    return newRuntime;
  }

  /**
   * 針坯 CLI 进程�?
   * kilo serve 坪在坯动时读坖一次酝置文件，之坎修改 ~/.config/kilo/config.json
   * 丝会自动生效。调用此方法坯以坜止当剝进程并让下一�?getOrCreateRuntime() 创建新进程�?
   */
  async restartRuntime(): Promise<void> {
    const activeTab = this.tabManager.getActiveTab();
    const runtime = activeTab?.runtime;
    if (runtime) {
      await runtime.stop();
      if (activeTab) activeTab.runtime = null;
   * 重启 CLI 进程。
   * kilo serve 只在启动时读取一次配置文件，之后修改 ~/.config/kilo/config.json
   * 不会自动生效。调用此方法可以停止当前进程并让下一次 getOrCreateRuntime() 创建新进程。
   */
  async restartRuntime(): Promise<void> {
      const runtime = this.inputController.getRuntime();
      if (runtime) {
        // 真正停止当前进程，让下一次 getOrCreateRuntime() 创建新进程
        await runtime.stop();
        this.inputController.setRuntime(null);
      }
      new Notice('KiloCode runtime stopped. Next message starts a fresh CLI.');
    }
    new Notice('KiloCode session reset. Next message will use new configuration.');
  }
  private getCurrentNotePath(): string | undefined {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    return activeView?.file?.path;
  }

  /** 处睆坑逝消�?*/
  private async handleSend(content: string): Promise<void> {
    if (!content.trim()) return;

    const activeTab = this.tabManager.getActiveTab();
    if (!activeTab) return;

    if (activeTab.state.isStreaming) return;

    // 记录坑逝者标�?ID（在 try 外定义，�?catch/finally 使用�?
    const tabId = activeTab.id;

    try {
      const tUserSend = performance.now();
      const generation = activeTab.bumpStreamGeneration();
      this.senderTabId = activeTab.id;

      // 初始化该标签的浝弝状思缓冲（用于跨标签切杢杢夝）
      this.streamingStates.set(tabId, {
        content: '',
        thinking: '',
        toolCalls: new Map(),
      });

      // 1. 确保会话存在（懒创建�?
      const conversationId = await this.conversationController.ensureConversation();
      if (!activeTab.state.conversationId) {
        activeTab.setConversation(conversationId);
        this.updateTabBar();
      }

      // 2. 构建用户消杯
      const fileContext = this.fileAttachmentContext.getContextText();
      const contentWithFiles = content + fileContext;
      const messageWithPrefix = this.planModeController.getMessageWithPrefix(contentWithFiles);

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
      await this.conversationController.addMessage(userMessage);

      // 3. 立坳�?UI 上显示用户消�?
      this.appendUserMessage(content);

      // 4. 获坖 runtime 并坑�?
      const runtime = await this.getOrCreateRuntime();
      if (!runtime) {
        new Notice('KiloCode CLI not available');
        return;
      }

      this.approvalManager.setPermissionMode(this.plugin.settings.permissionMode);

      const adapter = this.plugin.app.vault.adapter;
      const vaultPath = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : '';
      const generator = runtime.sendMessage(contentWithFiles, {
        vaultPath,
        currentNote: currentNote || this.getCurrentNotePath(),
        ...(this.appliedCustomInstructions ? { customInstructions: this.appliedCustomInstructions } : {}),
      });

      // 5. 进入浝弝状�?
      activeTab.setStreaming(true);
      this.updateButtonStates();

      // 创建空的助手消杯容器（浝弝渲染目标，仅当剝标签坳坑逝者时创建�?
      if (this.isSenderTabActive()) {
        this.messageRenderer?.addAssistantMessage();
      }

      // 设置审批决定回调
      this.streamController.setApprovalDecisionCallback((toolName, decision) => {
        activeTab.runtime?.sendApproval?.(toolName, decision as 'allow' | 'deny');
      });

      const assistantMessage = await this.streamController.consumeStream(generator, {
        onText: (text) => {
          // 始终缓冲到标签状思（跨标签切杢时杢夝用）
          const state = this.streamingStates.get(tabId);
          if (state) state.content += text;
          // 仅在活跃且丝在切杢中时增針渲�?
          if (!this.isSwitchingTab && this.isSenderTabActive()) {
            this.messageRenderer?.appendText(text);
          }
        },
        onThinking: (text) => {
          const state = this.streamingStates.get(tabId);
          if (state) state.thinking += text;
          if (!this.isSwitchingTab && this.isSenderTabActive()) {
            this.messageRenderer?.appendThinking(text);
          }
        },
        onToolCall: (toolCall) => {
          const state = this.streamingStates.get(tabId);
          if (state) state.toolCalls.set(toolCall.id, toolCall);
          if (!this.isSwitchingTab && this.isSenderTabActive()) {
            this.renderToolCall(toolCall);
          }
        },
        onToolResult: (id, result) => {
          const state = this.streamingStates.get(tabId);
          if (state) {
            const tc = state.toolCalls.get(id);
            if (tc) tc.status = 'completed';
          }
          if (!this.isSwitchingTab && this.isSenderTabActive()) {
            this.updateToolCallResult(id, result);
          }
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
      generation,    // 传入 generation 进行冲窝保护
      );

      // 确保 streaming 状思被針置
      activeTab.setStreaming(false);
      this.updateButtonStates();

      // 清睆浝状思缓�?
      this.streamingStates.delete(tabId);

      // 浝完戝坎坚最�?Markdown 渲染（仅当坑逝者标签仝活跃时）
      if (this.isSenderTabActive()) {
        this.messageRenderer?.finalizeMessage();
      }

      // 6. 保存助手消杯到会�?
      await this.conversationController.addMessage(assistantMessage);

      // 7. Auto-review: optionally review modified files using a separate runtime
      if (this.plugin.settings.autoReview && runtime) {
        const editedFiles = extractEditedFiles(assistantMessage);
        if (editedFiles.length > 0) {
          const adapter = this.plugin.app.vault.adapter;
          const vaultPath = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : '';
          runReview({
            userRequest: content,
            editedFiles,
            vaultPath,
            createRuntime: () => {
              const registration = ProviderRegistry.get('kilocode');
              return registration!.createRuntime();
            },
          }).then((verdict) => {
            if (verdict !== 'LGTM') {
              new Notice('\uD83D\uDD0D Review found issues:\n' + verdict, 8000);
            }
          }).catch((err) => {
            console.warn('[KiloCodeView] Auto-review failed:', err);
          });
        }
      }

      this.fileAttachmentContext.clearAttachments();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Failed to send message: ${message}`);
      console.error('[KiloCodeView] handleSend error:', error);
      activeTab.setStreaming(false);
      this.streamingStates.delete(tabId);
      this.updateButtonStates();
    } finally {
      // 确保 streaming 状思一定被針置（无论戝功〝异常〝或 cancel�?
      if (activeTab.state.isStreaming) {
        activeTab.setStreaming(false);
      }
      this.streamingStates.delete(tabId);
      this.updateButtonStates();
      // 清除坑逝者标�?ID
      this.senderTabId = null;
    }
  }

  // ============================================
  // 工具调用渲染
  // ============================================

  /** 渲染工具调用坡片 */
  
  private async handleModelSwitch(): Promise<void> {
    const activeTab = this.tabManager.getActiveTab();
    const runtime = activeTab?.runtime;
  /** 处理发送消息（委托 SendOrchestrator 四段流程） */
  private async handleSend(content: string): Promise<void> {
    await this.sendOrchestrator.send(content);
  }

  // ============================================
  // ============================================

  
  private async handleModelSwitch(): Promise<void> {
    const runtime = this.inputController.getRuntime();
    const currentModel = this.plugin.settings.defaultModel || "";
    const result = (await openModelSwitcher(this.app, currentModel)) ?? "";

    if (result !== currentModel) {
      this.plugin.settings.defaultModel = result;
      await this.plugin.saveSettings();
      if (runtime?.setModel) {
        runtime.setModel(result);
      }
      runtime?.resetSession();
      new Notice("Model set to: " + (result || "CLI default"));
    }
  }

  private renderToolCall(toolCall: ToolCallInfo): void {
    if (!this.messagesEl) return;

    let lastMessage = this.messagesEl.querySelector('.kilo-message:last-child');
    if (!lastMessage) {
      // 如果没有消杯元素，创建一个助手消杯容�?
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
      if (statusEl) statusEl.textContent = '�?Done';
    }
  }

  // ============================================
  // 其他擝作
  // ============================================

  /** 处睆坖消 */
  // ============================================
  // ============================================

  /** 处理取消 */
  private handleCancel(): void {
    const activeTab = this.tabManager.getActiveTab();
    activeTab?.runtime?.cancel();
    this.streamController.cancel();
  }

  /** 处睆当剝笔记切杢 */
  private handleToggleCurrentNote(): void {
    this.currentNoteContext.toggle();
  }

  /** trigger mention ?show category menu */
  private triggerMention(): void {
    if (!this.mentionContainerEl) return;
    this.closeSlashPalette();
    this.showMentionCategoryMenu();
  }

  /** Create MentionService on first use */
  private initMentionService(): void {
    if (!this.mentionService) {
      this.mentionService = new MentionService(this.app);
    }
  }

  /** Show mention dropdown with search results */
  private async showMentionDropdown(query: string, textarea: HTMLTextAreaElement, startPos?: number): Promise<void> {
    if (!this.mentionService || !this.mentionContainerEl) return;

    const context: MentionContext = {
      mcpServers: readCliMcpServers(),
      subagents: readCliSubagents(),
    };

    const items = await this.mentionService.search(query, context);

    this.closeMentionDropdown();
    this.closeMentionCategoryMenu();

    if (items.length === 0) return;

    this.mentionDropdown = new MentionDropdown(
      this.mentionContainerEl,
      items,
      (selected: MentionItem) => this.onMentionSelected(selected, startPos)
    );
    this.mentionDropdown.show();
  }

  /** Close mention dropdown */
  private closeMentionDropdown(): void {
    if (this.mentionDropdown) {
      this.mentionDropdown.hide();
      this.mentionDropdown = null;
    }
  }

  /** Show category menu (first-level) */
  private showMentionCategoryMenu(): void {
    if (!this.mentionContainerEl) return;
    this.closeMentionDropdown();
    this.closeMentionCategoryMenu();

    const categories: MentionCategory[] = [
      { id: 'file', label: '\u6587\u4EF6', icon: '\uD83D\uDCC4', description: '\u641C\u7D22\u7B14\u8BB0\u6587\u4EF6\u548C\u6587\u4EF6\u5939' },
      { id: 'mcp-server', label: 'MCP \u670D\u52A1', icon: '\uD83D\uDD0C', description: '\u641C\u7D22\u5DF2\u6CE8\u518C\u7684 MCP \u670D\u52A1' },
      { id: 'subagent', label: '\u5B50\u4EE3\u7406', icon: '\uD83E\uDD16', description: '\u641C\u7D22\u53EF\u7528\u5B50\u4EE3\u7406' },
    ];

    this.mentionCategoryMenu = new MentionCategoryMenu({
      container: this.mentionContainerEl,
      categories,
      onCategorySelect: (catId) => this.onMentionCategorySelect(catId),
      onCancel: () => this.closeMentionCategoryMenu(),
    });
    this.mentionCategoryMenu.show();
  }

  /** Close category menu */
  private closeMentionCategoryMenu(): void {
    if (this.mentionCategoryMenu) {
      this.mentionCategoryMenu.hide();
      this.mentionCategoryMenu = null;
    }
  }

  /** Close slash command palette */
  private closeSlashPalette(): void {
    if (this.activePalette) {
      this.activePalette.hide();
      this.activePalette = null;
    }
    this.slashActive = false;
  }

  /** Insert item name into textarea at cursor */
  private insertIntoTextarea(name: string): void {
    if (!this.textareaEl) return;
    const textarea = this.textareaEl;
    const cursorPos = textarea.selectionStart;
    const before = textarea.value.slice(0, cursorPos);
    const after = textarea.value.slice(cursorPos);
    textarea.value = before + name + ' ' + after;
    const newCursor = cursorPos + name.length + 1;
    textarea.setSelectionRange(newCursor, newCursor);
    textarea.focus();
  }

  /** Handle category selection: open corresponding browser modal */
  private onMentionCategorySelect(categoryId: string): void {
    if (!this.textareaEl) return;

    if (categoryId === 'file') {
      const modal = new VaultFileBrowserModal(this.app, (result) => {
        this.insertIntoTextarea(result.name);
      });
      modal.open();
      return;
    }

    if (categoryId === 'mcp-server') {
      const servers: ListSelectItem[] = readCliMcpServers().map(s => ({
        id: s.id,
        name: s.name,
        icon: '\uD83D\uDD0C',
        description: s.description,
      }));
      const modal = new ListSelectModal(this.app, '\uD83D\uDD0C Select MCP Server', servers, (item) => {
        this.insertIntoTextarea(item.name);
      });
      modal.open();
      return;
    }

    if (categoryId === 'subagent') {
      const agents: ListSelectItem[] = readCliSubagents().map(s => ({
        id: s.id,
        name: s.name,
        icon: '\uD83E\uDD16',
        description: s.description,
      }));
      const modal = new ListSelectModal(this.app, '\uD83E\uDD16 Select Subagent', agents, (item) => {
        this.insertIntoTextarea(item.name);
      });
      modal.open();
      return;
    }
  }

  /** Insert selected mention into textarea */
  private onMentionSelected(item: MentionItem, mentionStartPos?: number): void {
    if (!this.textareaEl) return;

    const textarea = this.textareaEl;
    const cursorPos = textarea.selectionStart;

    if (mentionStartPos !== undefined) {
      // Input @ triggered: replace from @ to cursor with selected name
      const before = textarea.value.slice(0, mentionStartPos);
      const after = textarea.value.slice(cursorPos);
      textarea.value = before + item.name + ' ' + after;

      const newCursor = mentionStartPos + item.name.length + 1;
      textarea.setSelectionRange(newCursor, newCursor);
    } else {
      // Toolbar button triggered: insert name at cursor
      const before = textarea.value.slice(0, cursorPos);
      const after = textarea.value.slice(cursorPos);
      textarea.value = before + item.name + ' ' + after;

      const newCursor = cursorPos + item.name.length + 1;
      textarea.setSelectionRange(newCursor, newCursor);
    }

    textarea.focus();
  }

  /** 处睆斜杠命令输入 */
  private async handleSlashInput(input: string): Promise<void> {
    const trimmed = input.trim();
    if (trimmed === '/') {
      this.triggerSlashCommand();
      return;
    }
    const spaceIdx = trimmed.indexOf(' ');
    const cmdName = spaceIdx > 0 ? trimmed.substring(0, spaceIdx) : trimmed;
    const args = spaceIdx > 0 ? trimmed.substring(spaceIdx + 1) : '';
    const cmd = this.commandRegistry.get(cmdName.slice(1));
    if (!cmd) {
      new Notice(`Unknown command: ${cmdName}. Type / to see available commands.`);
      return;
    }
    const result = await cmd.handler(args);
    if (result) {
      this.textareaEl!.value = '';
      void this.handleSend(result);
    } else {
      this.textareaEl!.value = '';
    }
  }

  /** 触坑斜杠命令 */
  /** trigger slash command */
  private triggerSlashCommand(): void {
    if (!this.commandPaletteEl) return;
    this.closeMentionDropdown();
    this.closeMentionCategoryMenu();
    this.slashActive = true;
    this.activePalette = new CommandPalette({
      container: this.commandPaletteEl,
      commands: this.commandRegistry.getAll(),
      onSelect: (cmd) => {
        this.slashActive = false;
        void this.handleSlashCommand(cmd);
      },
      onClose: () => {
        this.slashActive = false;
      },
    });
    this.activePalette.show();
  }

  /** 处睆选中的斜杠命�?*/
  private async handleSlashCommand(cmd: import('../commands/SlashCommand').SlashCommand): Promise<void> {
    if (cmd.id === 'skill') {
      if (!this.activePalette) return;
      const skills = listCatalog();
      const items: SubMenuItem[] = skills.map(skill => ({
        id: skill.name,
        label: skill.name,
        description: skill.summary,
        handler: () => {
          this.activePalette!.hide();
          const prefix = `[Activate skill: ${skill.name}]\n${skill.description}\n\nFollow the instructions of this skill carefully.`;
          this.textareaEl!.value = prefix;
          void this.handleSend(prefix);
        },
      }));
      this.activePalette.showSubMenu(items, '\u9009\u62E9\u6280\u80FD');
      return;
    }

    if (cmd.id === 'model') {
      if (!this.activePalette) return;
      const modelIds = readCliModels();
      const items: SubMenuItem[] = modelIds.map(modelId => ({
        id: modelId,
        label: modelId,
        handler: () => {
          this.activePalette!.hide();
          this.applyModel(modelId);
        },
      }));
      items.push({
        id: '__custom__',
        label: '\u8F93\u5165\u81EA\u5B9A\u4E49\u6A21\u578B...',
        description: '\u624B\u52A8\u8F93\u5165\u6A21\u578B ID',
        handler: () => {
          this.activePalette!.hide();
          void this.handleModelSwitch();
        },
      });
      this.activePalette.showSubMenu(items, '\u9009\u62E9\u6A21\u578B');
      return;
    }

    if (cmd.id === 'mode') {
      if (!this.activePalette) return;
      const modes = this.planModeController.getAllModes();
      const items: SubMenuItem[] = modes.map(m => ({
        id: m.id,
        label: `${m.icon} ${m.name}`,
        description: m.description,
        handler: () => {
          this.activePalette!.hide();
          this.planModeController.setMode(m.id);
          this.updateModeToggle();
          new Notice(`Mode switched to: ${m.name}`);
        },
      }));
      this.activePalette.showSubMenu(items, '\u9009\u62E9\u6A21\u5F0F');
      return;
    }

    if (cmd.id === 'compact') {
      this.activePalette?.hide();
      const convId = this.chatState.currentConversationId;
      if (!convId) {
        new Notice('No active conversation to compact');
        return;
      }
      try {
        const msgCount = (await this.conversationController.getConversation())?.messages.length ?? 0;
        const summary = `Conversation compacted at ${new Date().toLocaleString()}. ${msgCount} messages consolidated.`;
        await this.conversationService.compactConversation(convId, summary, 5);
        await this.conversationController.restoreConversation(convId);
        new Notice('Conversation compacted');
      } catch (err) {
        new Notice('Compact failed: ' + (err instanceof Error ? err.message : String(err)));
      }
      return;
    }

    if (cmd.id === 'clear') {
      this.activePalette?.hide();
      this.saveCurrentDraft();
      this.conversationController.createNew();
      const activeTab = this.tabManager.getActiveTab();
      if (activeTab) activeTab.state.conversationId = null;
      this.restoreDraft('');
      new Notice('Conversation cleared');
      return;
    }

    const result = await cmd.handler('');
    if (result) {
      this.textareaEl!.value = result;
    }
    this.activePalette?.hide();
  }

  private applyModel(modelId: string): void {
    const activeTab = this.tabManager.getActiveTab();
    const runtime = activeTab?.runtime;
    this.plugin.settings.defaultModel = modelId;
    void this.plugin.saveSettings();
    if (runtime?.setModel) {
      runtime.setModel(modelId);
    }
    runtime?.resetSession();
    new Notice('Model set to: ' + modelId);
  }

  private triggerInstructionMode(): void {
    const modal = new CustomInstructionModal(this.app, {
      initialValue: this.plugin.settings.customInstructions,
      onSave: (text: string) => {
        this.plugin.settings.customInstructions = text;
        void this.plugin.saveSettings();
      },
      onApply: (text: string) => {
        this.appliedCustomInstructions = text || null;
        new Notice('Custom instructions applied for this session');
      },
    });
    modal.open();
  }

  /** 附加文件 */
  private async attachFile(): Promise<void> {
    await this.fileAttachmentContext.addFromFile();
    if (this.inputContainerEl) {
      this.fileAttachmentContext.renderPreview(this.inputContainerEl);
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

  /** 显示 Inline Edit 模思框 */
  private showInlineEditModal(selectedText: string, editor: any): void {
    new InlineEditModal(this.app, selectedText, async (instruction) => {
      // TODO: 调用 KiloCode CLI 进行 inline edit（Phase B 实现�?
    }).open();
  }

  /** 注册消杯擝作事件委托（事件冒泡杕�?rewind/fork/copy 按钮点击�?*/








  /** 处理标签页点击（委托 TabController） */
  private async handleTabClick(tabId: string): Promise<void> {
    await this.tabController.handleTabClick(tabId);
  }

  /** 处理新建标签页（委托 TabController） */
  private handleNewTab(): void {
    this.tabController.handleNewTab();
  }

  /** 保存当前标签的草稿消息（委托 TabController） */
  private saveCurrentDraft(): void {
    const activeTab = this.tabManager.getActiveTab();
    if (activeTab && this.textareaEl) {
      activeTab.setDraftMessage(this.textareaEl.value);
    }
  }

  /** 恢复草稿消息到 textarea（委托 TabController） */
  private restoreDraft(draft: string): void {
    if (this.textareaEl) {
      this.textareaEl.value = draft;
    }
  }

  /** 注册消息操作事件委托（委托 MessageActionsHandler） */
  private registerMessageActionListeners(): void {
    if (!this.messagesEl) return;
    this.messageActionsHandler.attach(this.messagesEl);
  }

  /** 回退到指定消�?*/
  /** 回退到指定消息（委托 MessageActionsHandler） */
  private async handleRewind(messageId: string): Promise<void> {
    await this.messageActionsHandler.rewind(messageId);
  }

  /** 从指定消杯处 fork 新会�?*/
  private async handleFork(messageId: string): Promise<void> {
    if (!this.tabManager.canCreateTab()) {
      new Notice('Maximum tabs reached. Close a tab first.');
      return;
    }

    try {
      const forked = await this.conversationController.fork(messageId);

      this.saveCurrentDraft();
      const newTab = this.tabManager.createTab();
      newTab.setConversation(forked.id);

      // 切杢�?fork 的会�?
      await this.conversationController.switchTo(forked.id);
      this.chatState.setConversationId(forked.id);
      this.restoreDraft('');

      new Notice(`Forked: ${forked.title}`);
      this.updateUI();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      new Notice(`Fork failed: ${msg}`);
    }
  }

  /** 夝制消杯内容到剪贴板 */
  /** 从指定消息处 fork 新会话（委托 MessageActionsHandler） */
  private async handleFork(messageId: string): Promise<void> {
    await this.messageActionsHandler.fork(messageId);
  }

  /** 复制消息内容到剪贴板（委托 MessageActionsHandler） */
  private async handleCopy(messageId: string): Promise<void> {
    await this.messageActionsHandler.copy(messageId);
  }
}
