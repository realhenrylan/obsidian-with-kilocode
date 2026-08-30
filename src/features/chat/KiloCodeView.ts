// src/features/chat/KiloCodeView.ts
// 針构：借鉴 claudian 架构，DOM 骨架坪创建一次，通过 updateUI() 更新内容
// 解决�?1) 无法坑逝第二条消杯 (2) 切杢会话消杯消失 (3) 針坯坎无法坑�?
// src/features/chat/KiloCodeView.ts
// 重构：借鉴 claudian 架构，DOM 骨架只创建一次，通过 updateUI() 更新内容
// 解决：1) 无法发送第二条消息 (2) 切换会话消息消失 (3) 重启后无法发送

import { ItemView, MarkdownView, Notice, WorkspaceLeaf } from 'obsidian';
import { VIEW_TYPE_KILOCODE } from '../../core/types';
import type KiloCodePlugin from '../../main';
import { TabManager } from './tabs/TabManager';
import { StreamController } from './controllers/StreamController';
import { ConversationController } from './controllers/ConversationController';
import { ConversationService } from './services/ConversationService';
import { ChatState } from './state/ChatState';
import { MessageRenderer } from './rendering/MessageRenderer';
import { InputController } from './controllers/InputController';
import { ImageContext } from './ui/ImageContext';
import { PlanModeController } from './PlanModeController';
import { ProviderRegistry } from '../../core/providers/ProviderRegistry';
import type { ChatRuntime } from '../../core/providers/types';
import { CommandPalette } from '../commands/CommandPalette';
import type { SubMenuItem } from '../commands/CommandPalette';
import { listCatalog } from '../../providers/kilocode/runtime/SkillCatalog';
import { readCliModels, readCliMcpServers, readCliSubagents } from '../../core/cliConfigReader';

import { ApprovalManager } from '../../core/security/ApprovalManager';
import { showApprovalModal } from '../../core/security/ApprovalModal';
import { CurrentNoteContext } from './ui/CurrentNoteContext';
import { FileAttachmentContext } from './ui/FileAttachmentContext';
import { InputToolbar } from './ui/InputToolbar';
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
  private inputController: InputController;
  private imageContext: ImageContext;
  /** ?? session ??????????null ????? */
  private appliedCustomInstructions: string | null = null;
  private commandRegistry = createDefaultCommandRegistry();
  private commandPaletteEl: HTMLElement | null = null;
  private activePalette: CommandPalette | null = null;

  // 挝久�?DOM 引用（骨架坪创建一次）
  // 持久化 DOM 引用（框架只创建一次）
  private tabBarEl: HTMLElement | null = null;
  private messagesEl: HTMLElement | null = null;
  private textareaEl: HTMLTextAreaElement | null = null;
  private inputContainerEl: HTMLElement | null = null;
  private modeToggleEl: HTMLElement | null = null;
  private cancelBtnEl: HTMLButtonElement | null = null;
  private sendBtnEl: HTMLButtonElement | null = null;
  private tabBarView: TabBarView | null = null;

  // @mention
  private mentionCategoryMenu: MentionCategoryMenu | null = null;
  private mentionContainerEl: HTMLElement | null = null;

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
    this.inputController = new InputController();
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
    this.imageContext = new ImageContext(5); // 5MB limit

    this.fileAttachmentContext.setOnUpdate(() => {
      if (this.inputContainerEl) {
        this.fileAttachmentContext.renderPreview(this.inputContainerEl);
      }
    });

    // 设置审批处理器（弹出 Modal）
    this.approvalManager.setApprovalHandler(async (request) => {
      return showApprovalModal(this.app, request);
    });

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
      getAppliedCustomInstructions: () => this.appliedCustomInstructions,
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
  // DOM 骨架（只创建一次）
  // ============================================

  /** 创建 DOM 骨架，所有事件监听器只注册一次 */
  private buildLayout(): void {
    if (this.isLayoutBuilt) return;

    const container = this.containerEl.children[1] as HTMLElement;
    const refs = ChatLayoutBuilder.build(container);
    this.modeToggleEl = refs.modeToggleEl;
    this.tabBarEl = refs.tabBarEl;
    this.messagesEl = refs.messagesEl;
    this.inputContainerEl = refs.inputContainerEl;
    this.textareaEl = refs.textareaEl;
    this.sendBtnEl = refs.sendBtnEl;
    this.cancelBtnEl = refs.cancelBtnEl;

    // Slash 命令面板与 @mention 下拉容器（挂视图容器，仅创建一次）
    this.commandPaletteEl = container.createDiv({ cls: 'kilo-command-palette-container' });
    this.mentionContainerEl = container.createDiv({ cls: 'kilo-command-palette-container' });

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

  /** 创建工具栏（按钮动作依赖 view 方法） */
  private buildToolbar(toolbarContainer: HTMLElement): void {
    const inputToolbar = new InputToolbar(toolbarContainer);
    inputToolbar.setActions([
      {
        id: 'mention',
        icon: '@',
        label: 'Mention file, MCP server, or subagent',
        handler: () => this.triggerMention(),
      },
      {
        id: 'slash-command',
        icon: '/',
        label: 'Slash command (/skills, /model, /mode, etc.)',
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
        icon: '\uD83D\uDCCE',
        label: 'Attach vault file',
        handler: () => void this.attachFile(),
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

  private registerActionBarEvents(): void {
    if (!this.sendBtnEl || !this.cancelBtnEl) return;

    // 发送按钮
    this.registerDomEvent(this.sendBtnEl, 'click', () => {
      if (this.textareaEl) {
        void this.handleSend(this.textareaEl.value);
        this.textareaEl.value = '';
      }
    });

    // 取消按钮
    this.registerDomEvent(this.cancelBtnEl, 'click', () => this.handleCancel());
  }

  // ============================================
  // UI 更新（丝销�?DOM，坪更新内容�?
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
    if (!this.tabBarEl || !this.tabBarView) return;
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


  /** 隝机坠佝符杝示语 */

  /** 随机占位符提示语 */
  /** 随机占位符提示语（i18n 词典，避免硬编码） */
  private getRandomPlaceholder(): string {
    const keys = ['chat.placeholder1', 'chat.placeholder2', 'chat.placeholder3', 'chat.placeholder4', 'chat.placeholder5'];
    return t(keys[Math.floor(Math.random() * keys.length)]);
  }




  // ============================================
  // 标签页 / 流式状态
  // ============================================

  /** 检查发送者标签是否仍然活跃（防止跨标签渲染） */
  private isSenderTabActive(): boolean {
    if (!this.senderTabId) return false;
    return this.tabManager.getActiveTab()?.id === this.senderTabId;
  }

  /** 获取或启动 ChatRuntime */
  private async getOrCreateRuntime(): Promise<ChatRuntime | null> {
    const activeTab = this.tabManager.getActiveTab();
    if (!activeTab) return null;

    if (activeTab.runtime) return activeTab.runtime;

    if (this.plugin.warmupRuntimeRef) {
      const warmedUp = this.plugin.warmupRuntimeRef;
      this.plugin.warmupRuntimeRef = null;
      this.inputController.setRuntime(warmedUp);
      activeTab.runtime = warmedUp;
      this.plugin.addKilocodeRuntime(warmedUp);
      return warmedUp;
    }

    const registration = ProviderRegistry.get('kilocode');
    if (!registration) return null;

    const newRuntime = registration.createRuntime();
    this.inputController.setRuntime(newRuntime);
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
  private getCurrentNotePath(): string | undefined {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    return activeView?.file?.path;
  }
  private async handleSend(content: string): Promise<void> {
    await this.sendOrchestrator.send(content);
  }

  // ============================================
  // 模型切换
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

  // ============================================
  // 其他操作
  // ============================================

  /** 处理取消 */
  private handleCancel(): void {
    // inputController.cancel 内部调 runtime.cancel（引用统一收口）
    this.inputController.cancel();
    this.streamController.cancel();
  }


  /** trigger mention ?show category menu */
  private triggerMention(): void {
    if (!this.mentionContainerEl) return;
    this.closeSlashPalette();
    this.showMentionCategoryMenu();
  }




  /** Show category menu (first-level) */
  private showMentionCategoryMenu(): void {
    if (!this.mentionContainerEl) return;
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


  /** 处理斜杠命令输入 */
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

  /** 触发斜杠命令面板 */
  private triggerSlashCommand(): void {
    if (!this.commandPaletteEl) return;
    this.closeMentionCategoryMenu();
    this.activePalette = new CommandPalette({
      container: this.commandPaletteEl,
      commands: this.commandRegistry.getAll(),
      onSelect: (cmd) => {
          void this.handleSlashCommand(cmd);
      },
      onClose: () => {
        },
    });
    this.activePalette.show();
  }

  /** 处理选中的斜杠命令 */
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

  /** 回退到指定消息（委托 MessageActionsHandler） */
  async handleRewind(messageId: string): Promise<void> {
    await this.messageActionsHandler.rewind(messageId);
  }


  /** 从指定消息处 fork 新会话（委托 MessageActionsHandler） */
  async handleFork(messageId: string): Promise<void> {
    await this.messageActionsHandler.fork(messageId);
  }

  /** 复制消息内容到剪贴板（委托 MessageActionsHandler） */
  async handleCopy(messageId: string): Promise<void> {
    await this.messageActionsHandler.copy(messageId);
  }
}
