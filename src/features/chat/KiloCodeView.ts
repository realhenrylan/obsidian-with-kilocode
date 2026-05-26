// src/features/chat/KiloCodeView.ts
// 閲嶆瀯锛氬€熼壌 claudian 鏋舵瀯锛孌OM 楠ㄦ灦鍙垱寤轰竴娆★紝閫氳繃 updateUI() 鏇存柊鍐呭
// 瑙ｅ喅锛?1) 鏃犳硶鍙戦€佺浜屾潯娑堟伅 (2) 鍒囨崲浼氳瘽娑堟伅娑堝け (3) 閲嶅惎鍚庢棤娉曞彂閫?

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
import { InlineEditModal } from '../inline-edit/InlineEditModal';
import { DiffViewer } from '../inline-edit/DiffViewer';
import { CLIErrorHandler } from '../../shared/ErrorNotice';
import { PlanModeController } from './PlanModeController';
import { ProviderRegistry } from '../../core/providers/ProviderRegistry';
import type { ChatRuntime } from '../../core/providers/types';
import { extractEditedFiles, runReview } from '../../providers/kilocode/runtime/ReviewLoop';

/** 鎸?Tab 缂撳啿鐨勬祦寮忕姸鎬侊紙鐢ㄤ簬璺ㄦ爣绛炬祦寮忔仮澶嶏級 */
interface TabStreamingState {
  content: string;
  thinking: string;
  toolCalls: Map<string, ToolCallInfo>;
}
import { ApprovalManager } from '../../core/security/ApprovalManager';
import { showApprovalModal } from '../../core/security/ApprovalModal';
import { CurrentNoteContext } from './ui/CurrentNoteContext';
import { ImageContext } from './ui/ImageContext';
import { InputToolbar } from './ui/InputToolbar';

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
  private imageContext: ImageContext;

  // 鎸佷箙鍖?DOM 寮曠敤锛堥鏋跺彧鍒涘缓涓€娆★級
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

  // 鏍囪 DOM 鏄惁宸插垵濮嬪寲
  private isLayoutBuilt = false;

  // 娴佸紡鍙戦€佽€呮爣绛?ID锛堥槻姝㈣法鏍囩娓叉煋锛?
  private senderTabId: string | null = null;

  // 娴佸紡鏈熼棿鍒囨崲鏍囩鏀寔锛氭寜鏍囩缂撳啿娴佸紡鐘舵€?+ 鍒囨崲涓爣蹇?
  private streamingStates: Map<string, TabStreamingState> = new Map();
  private isSwitchingTab = false;

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
    this.imageContext = new ImageContext(5); // 5MB limit

    // 璁剧疆瀹℃壒澶勭悊鍣紙寮瑰嚭 Modal锛?
    this.approvalManager.setApprovalHandler(async (request) => {
      return showApprovalModal(this.app, request);
    });

    // 娉ㄥ叆 ConversationController 鍥炶皟锛堥伩鍏嶇洿鎺ヤ緷璧?DOM锛?
    this.conversationController.onClearMessages(() => {
      this.messagesEl?.empty();
    });
    this.conversationController.onRenderMessages((messages) => {
      this.messageRenderer?.renderMessages(messages);
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
    this.plugin.addCommand({
      id: 'reload-cli',
      name: 'Reload CLI Configuration',
      callback: () => {
        void this.restartRuntime();
      },
    });

    // 鍙垱寤轰竴娆?DOM 楠ㄦ灦
    this.buildLayout();

    // 纭繚鑷冲皯鏈変竴涓爣绛鹃〉锛堥娆℃墦寮€鏃跺垱寤洪粯璁ゆ爣绛鹃〉锛?
    let activeTab = this.tabManager.getActiveTab();
    if (!activeTab) {
      this.tabManager.createTab();
      this.conversationController.createNew();
      this.updateUI();
      activeTab = this.tabManager.getActiveTab();
    }

    // 鎭㈠褰撳墠浼氳瘽鐨勬秷鎭?
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
    await this.conversationController.save();
    this.messageRenderer = null;
    this.isLayoutBuilt = false;
  }

  // ============================================
  // DOM 楠ㄦ灦锛堝彧鍒涘缓涓€娆★級
  // ============================================

  /** 鍒涘缓 DOM 楠ㄦ灦锛屾墍鏈変簨浠剁洃鍚櫒鍙敞鍐屼竴娆?*/
  private buildLayout(): void {
    if (this.isLayoutBuilt) return;

    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass('kilo-code-view');
    this.viewContainerEl = container;

    // 妯″紡鍒囨崲
    this.buildModeToggle(container);

    // 鏍囩鏍?
    this.tabBarEl = container.createDiv({ cls: 'kilo-tab-bar' });

    // 娑堟伅鍖哄煙锛堟寔涔呭寲锛?
    this.messagesEl = container.createDiv({ cls: 'kilo-messages' });
    this.messageRenderer = new MessageRenderer(this.messagesEl, this.app, this);

    // 宸ュ叿鏍?
    this.buildToolbar(container);

    // 杈撳叆鍖哄煙锛堟寔涔呭寲锛?
    this.buildInputArea(container);

    // 鎿嶄綔鏍?
    this.buildActionBar(container);

    // 娉ㄥ唽娑堟伅鎿嶄綔浜嬩欢濮旀墭锛堝彧娉ㄥ唽涓€娆★級
    this.registerMessageActionListeners();

    this.isLayoutBuilt = true;

    // 鍒濆鏇存柊 UI 鍐呭
    this.updateUI();
  }

  /** 鍒涘缓妯″紡鍒囨崲 UI */
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

  /** 鏇存柊妯″紡鍒囨崲鎸夐挳鏂囨湰锛堜笉閲嶅缓 DOM锛?*/
  private updateModeToggle(): void {
    if (!this.modeToggleEl) return;
    const modeBtn = this.modeToggleEl.querySelector('.kilo-mode-btn') as HTMLButtonElement;
    if (!modeBtn) return;
    const currentMode = this.planModeController.getCurrentModeConfig();
    // 鍙洿鏂扮涓€涓枃鏈妭鐐?
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

  /** 鍒涘缓宸ュ叿鏍?*/
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

  /** 鍒涘缓杈撳叆鍖哄煙锛坱extarea 浜嬩欢鐩戝惉鍣ㄥ彧娉ㄥ唽涓€娆★級 */
  private buildInputArea(container: HTMLElement): void {
    this.inputContainerEl = container.createDiv({ cls: 'kilo-input-container' });

    // 鍥剧墖棰勮鍖哄煙
    this.imageContext.renderPreview(this.inputContainerEl);

    this.textareaEl = this.inputContainerEl.createEl('textarea', {
      cls: 'kilo-input',
      placeholder: this.getRandomPlaceholder(),
    });

    // 绮樿创浜嬩欢
    this.registerDomEvent(this.textareaEl, 'paste', (e) => {
      if (this.imageContext.addFromPaste(e)) {
        this.imageContext.renderPreview(this.inputContainerEl!);
      }
    });

    // 鎷栨嫿浜嬩欢
    this.registerDomEvent(this.textareaEl, 'dragover', (e) => {
      e.preventDefault();
    });
    this.registerDomEvent(this.textareaEl, 'drop', (e) => {
      e.preventDefault();
      if (this.imageContext.addFromDrop(e)) {
        this.imageContext.renderPreview(this.inputContainerEl!);
      }
    });

    // 閿洏浜嬩欢锛堝彧娉ㄥ唽涓€娆★紝涓嶄細鍥?render() 涓㈠け锛?
    this.registerDomEvent(this.textareaEl, 'keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void this.handleSend(this.textareaEl!.value);
        this.textareaEl!.value = '';
      }
    });
  }

  /** 鍒涘缓鎿嶄綔鏍?*/
  private buildActionBar(container: HTMLElement): void {
    this.actionBarEl = container.createDiv({ cls: 'kilo-action-bar' });

    // 鍙戦€佹寜閽?
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

    // 鍙栨秷鎸夐挳
    this.cancelBtnEl = this.actionBarEl.createEl('button', {
      cls: 'kilo-btn kilo-btn-cancel',
      text: 'Cancel',
    });
    this.cancelBtnEl.style.display = 'none';
    this.registerDomEvent(this.cancelBtnEl, 'click', () => this.handleCancel());
  }

  // ============================================
  // UI 鏇存柊锛堜笉閿€姣?DOM锛屽彧鏇存柊鍐呭锛?
  // ============================================

  /** 鏇存柊 UI锛氭爣绛炬爮銆佹寜閽姸鎬侊紙涓嶉攢姣?DOM锛?*/
  private updateUI(): void {
    this.updateTabBar();
    this.updateButtonStates();
  }

  /** 鏇存柊鏍囩鏍忓唴瀹?*/
  private updateTabBar(): void {
    if (!this.tabBarEl) return;

    // 娓呯┖鏍囩鏍忓唴瀹癸紙涓嶉攢姣佹暣涓鍣級
    const tabsContainer = this.tabBarEl.querySelector('.kilo-tabs');
    if (tabsContainer) tabsContainer.remove();
    const addBtn = this.tabBarEl.querySelector('.kilo-tab-add');
    if (addBtn) addBtn.remove();

    // 閲嶅缓鏍囩椤靛垪琛?
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

    // 鏂板缓鏍囩椤垫寜閽?
    if (this.tabManager.canCreateTab()) {
      const addBtnEl = this.tabBarEl.createDiv({
        cls: 'kilo-tab-add',
        text: '+',
      });
      this.registerDomEvent(addBtnEl, 'click', () => this.handleNewTab());
    }
  }

  /** 鏇存柊鎸夐挳鐘舵€侊紙鍙戦€?鍙栨秷锛?*/
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
        : this.getRandomPlaceholder();
    }
  }

  /** 鎴柇 ID 鐢ㄤ簬鏍囩鏄剧ず */
  private truncateId(id: string): string {
    return id.length > 12 ? id.slice(0, 12) + '...' : id;
  }

  /** 闅忔満鍗犱綅绗︽彁绀鸿 */
  private getRandomPlaceholder(): string {
    const placeholders = [
      'Type a message... (Enter to send, Shift+Enter for new line)',
      'Ask me anything about your vault...',
      'What can I help you with?',
      'Describe what you need...',
      'Type your question here...',
    ];
    return placeholders[Math.floor(Math.random() * placeholders.length)];
  }

  // ============================================
  // 娑堟伅绠＄悊
  // ============================================

  /** 鍦ㄦ秷鎭尯鍩熻拷鍔犱竴鏉＄敤鎴锋秷鎭?*/
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

  /** 鍦ㄦ秷鎭尯鍩熻拷鍔犱竴鏉″姪鎵嬫秷鎭紙娴佸紡瀹屾垚鍚庯級 */
  private appendAssistantMessage(message: Message): void {
    if (!this.messagesEl || !this.messageRenderer) return;

    this.messageRenderer.renderMessage(message);
    this.scrollToBottom();
  }

  /** 婊氬姩鍒板簳閮?*/
  private scrollToBottom(): void {
    if (this.messagesEl) {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }
  }

  // ============================================
  // 鏍囩椤垫搷浣?
  // ============================================

  /** 澶勭悊鏍囩椤电偣鍑伙紙娴佸紡杩涜涓篃鍙垏鎹紝閫氳繃 TabStreamingState 鎭㈠娓叉煋锛?*/
  private async handleTabClick(tabId: string): Promise<void> {
    this.isSwitchingTab = true;
    try {
      const tab = this.tabManager.switchTab(tabId);
      if (!tab) return;

      // 淇濆瓨褰撳墠鏍囩鐨勮崏绋?
      this.saveCurrentDraft();

      // 閫氳繃 ConversationController 鍒囨崲浼氳瘽锛堝惈 save 鈫?reset 鈫?load 鈫?render锛?
      if (tab.state.conversationId) {
        await this.conversationController.switchTo(tab.state.conversationId);
      } else {
        this.messagesEl?.empty();
      }

      // 鍚屾 ChatState
      this.chatState.setConversationId(tab.state.conversationId ?? null);

      // 濡傛灉鐩爣鏍囩鏈夋鍦ㄨ繘琛岀殑娴侊紝閲嶅缓娴佸紡娓叉煋鐘舵€?
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

      // 鎭㈠鑽夌
      this.restoreDraft(tab.state.draftMessage);

      this.updateUI();
    } finally {
      this.isSwitchingTab = false;
    }
  }

  /** 澶勭悊鏂板缓鏍囩椤?*/
  private handleNewTab(): void {
    if (this.tabManager.canCreateTab()) {
      this.saveCurrentDraft();
      this.tabManager.createTab();
      // 閫氳繃 ConversationController 閲嶇疆鍒扮┖鐧界姸鎬?
      this.conversationController.createNew();
      this.restoreDraft('');
      this.updateUI();
    }
  }

  /** 淇濆瓨褰撳墠鏍囩鐨勮崏绋挎秷鎭?*/
  private saveCurrentDraft(): void {
    const activeTab = this.tabManager.getActiveTab();
    if (activeTab && this.textareaEl) {
      activeTab.setDraftMessage(this.textareaEl.value);
    }
  }

  /** 鎭㈠鑽夌娑堟伅鍒?textarea */
  private restoreDraft(draft: string): void {
    if (this.textareaEl) {
      this.textareaEl.value = draft;
    }
  }

  // ============================================
  // 鍙戦€佹秷鎭?
  // ============================================

  /** 妫€鏌ュ彂閫佽€呮爣绛炬槸鍚︿粛鐒舵椿璺冿紙闃叉璺ㄦ爣绛炬覆鏌擄級 */
  private isSenderTabActive(): boolean {
    if (!this.senderTabId) return false;
    return this.tabManager.getActiveTab()?.id === this.senderTabId;
  }

  /** 鑾峰彇鎴栧惎鍔?ChatRuntime */
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
   * 閲嶅惎 CLI 杩涚▼銆?
   * kilo serve 鍙湪鍚姩鏃惰鍙栦竴娆￠厤缃枃浠讹紝涔嬪悗淇敼 ~/.config/kilo/config.json
   * 涓嶄細鑷姩鐢熸晥銆傝皟鐢ㄦ鏂规硶鍙互鍋滄褰撳墠杩涚▼骞惰涓嬩竴娆?getOrCreateRuntime() 鍒涘缓鏂拌繘绋嬨€?
   */
  async restartRuntime(): Promise<void> {
    const activeTab = this.tabManager.getActiveTab();
    const runtime = activeTab?.runtime;
    if (runtime) {
      await runtime.stop();
      if (activeTab) activeTab.runtime = null;
    }
    new Notice('KiloCode session reset. Next message will use new configuration.');
  }
  private getCurrentNotePath(): string | undefined {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    return activeView?.file?.path;
  }

  /** 澶勭悊鍙戦€佹秷鎭?*/
  private async handleSend(content: string): Promise<void> {
    if (!content.trim()) return;

    const activeTab = this.tabManager.getActiveTab();
    if (!activeTab) return;

    if (activeTab.state.isStreaming) return;

    // 璁板綍鍙戦€佽€呮爣绛?ID锛堝湪 try 澶栧畾涔夛紝渚?catch/finally 浣跨敤锛?
    const tabId = activeTab.id;

    try {
      const tUserSend = performance.now();
      const generation = activeTab.bumpStreamGeneration();
      this.senderTabId = activeTab.id;

      // 鍒濆鍖栬鏍囩鐨勬祦寮忕姸鎬佺紦鍐诧紙鐢ㄤ簬璺ㄦ爣绛惧垏鎹㈡仮澶嶏級
      this.streamingStates.set(tabId, {
        content: '',
        thinking: '',
        toolCalls: new Map(),
      });

      // 1. 纭繚浼氳瘽瀛樺湪锛堟噿鍒涘缓锛?
      const conversationId = await this.conversationController.ensureConversation();
      if (!activeTab.state.conversationId) {
        activeTab.setConversation(conversationId);
        this.updateTabBar();
      }

      // 2. 鏋勫缓鐢ㄦ埛娑堟伅
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
      await this.conversationController.addMessage(userMessage);

      // 3. 绔嬪嵆鍦?UI 涓婃樉绀虹敤鎴锋秷鎭?
      this.appendUserMessage(content);

      // 4. 鑾峰彇 runtime 骞跺彂閫?
      const runtime = await this.getOrCreateRuntime();
      if (!runtime) {
        new Notice('KiloCode CLI not available');
        return;
      }

      this.approvalManager.setPermissionMode(this.plugin.settings.permissionMode);

      const adapter = this.plugin.app.vault.adapter;
      const vaultPath = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : '';
      const generator = runtime.sendMessage(content, {
        vaultPath,
        currentNote: currentNote || this.getCurrentNotePath(),
      });

      // 5. 杩涘叆娴佸紡鐘舵€?
      activeTab.setStreaming(true);
      this.updateButtonStates();

      // 鍒涘缓绌虹殑鍔╂墜娑堟伅瀹瑰櫒锛堟祦寮忔覆鏌撶洰鏍囷紝浠呭綋鍓嶆爣绛惧嵆鍙戦€佽€呮椂鍒涘缓锛?
      if (this.isSenderTabActive()) {
        this.messageRenderer?.addAssistantMessage();
      }

      // 璁剧疆瀹℃壒鍐冲畾鍥炶皟
      this.streamController.setApprovalDecisionCallback((toolName, decision) => {
        activeTab.runtime?.sendApproval?.(toolName, decision as 'allow' | 'deny');
      });

      const assistantMessage = await this.streamController.consumeStream(generator, {
        onText: (text) => {
          // 濮嬬粓缂撳啿鍒版爣绛剧姸鎬侊紙璺ㄦ爣绛惧垏鎹㈡椂鎭㈠鐢級
          const state = this.streamingStates.get(tabId);
          if (state) state.content += text;
          // 浠呭湪娲昏穬涓斾笉鍦ㄥ垏鎹腑鏃跺閲忔覆鏌?
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
      generation,    // 浼犲叆 generation 杩涜鍐茬獊淇濇姢
      );

      // 纭繚 streaming 鐘舵€佽閲嶇疆
      activeTab.setStreaming(false);
      this.updateButtonStates();

      // 娓呯悊娴佺姸鎬佺紦鍐?
      this.streamingStates.delete(tabId);

      // 娴佸畬鎴愬悗鍋氭渶缁?Markdown 娓叉煋锛堜粎褰撳彂閫佽€呮爣绛句粛娲昏穬鏃讹級
      if (this.isSenderTabActive()) {
        this.messageRenderer?.finalizeMessage();
      }

      // 6. 淇濆瓨鍔╂墜娑堟伅鍒颁細璇?
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

      // 娓呴櫎鍥剧墖
      this.imageContext.clearImages();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Failed to send message: ${message}`);
      console.error('[KiloCodeView] handleSend error:', error);
      activeTab.setStreaming(false);
      this.streamingStates.delete(tabId);
      this.updateButtonStates();
    } finally {
      // 纭繚 streaming 鐘舵€佷竴瀹氳閲嶇疆锛堟棤璁烘垚鍔熴€佸紓甯搞€佹垨 cancel锛?
      if (activeTab.state.isStreaming) {
        activeTab.setStreaming(false);
      }
      this.streamingStates.delete(tabId);
      this.updateButtonStates();
      // 娓呴櫎鍙戦€佽€呮爣绛?ID
      this.senderTabId = null;
    }
  }

  // ============================================
  // 宸ュ叿璋冪敤娓叉煋
  // ============================================

  /** 娓叉煋宸ュ叿璋冪敤鍗＄墖 */
  
  private async handleModelSwitch(): Promise<void> {
    const activeTab = this.tabManager.getActiveTab();
    const runtime = activeTab?.runtime;
    const currentModel = this.plugin.settings.defaultModel || "";

    class ModelSelectModal extends (this.app as any).Modal {
      result: string;
      resolve: (v: string | null) => void;
      constructor(app: any) { super(app); this.result = currentModel; this.resolve = (v: any) => {}; }
      onOpen() {
        const contentEl = this.contentEl;
        contentEl.createEl("h2", { text: "Switch AI Model" });
        contentEl.createEl("p", { 
          text: "Enter model ID (e.g. kilocode/anthropic/claude-sonnet-4) or leave empty for CLI default.",
          cls: "kilo-setting-note"
        });
        const input = contentEl.createEl("input", {
          type: "text",
          placeholder: "kilocode/anthropic/claude-sonnet-4",
          cls: "kilo-input"
        });
        input.value = currentModel;
        input.style.width = "100%";
        input.style.marginBottom = "12px";
        const applyBtn = contentEl.createEl("button", { text: "Apply", cls: "kilo-btn kilo-btn-primary" });
        applyBtn.onclick = () => { (this as any).result = (input.value || '') as string; this.close(); };
        const cancelBtn = contentEl.createEl("button", { text: "Cancel", cls: "kilo-btn" });
        cancelBtn.onclick = () => { this.result = currentModel; this.close(); };
        input.addEventListener("keydown", (e: KeyboardEvent) => {
          if (e.key === "Enter") { this.result = input.value || ""; this.close(); }
        });
      }
      onClose() {
        const resolve = (this as any).resolve;
        if (resolve) (resolve as any)(this.result);
      }
    }

    const modal = new ModelSelectModal(this.app);
    const result: string = await new Promise<string>((resolve) => {
      (modal as any).resolve = resolve;
      modal.open();
    });

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
      // 濡傛灉娌℃湁娑堟伅鍏冪礌锛屽垱寤轰竴涓姪鎵嬫秷鎭鍣?
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
    headerEl.createSpan({ cls: 'kilo-tool-status', text: '馃攧 Running' });
  }

  /** 鏇存柊宸ュ叿璋冪敤缁撴灉 */
  private updateToolCallResult(toolCallId: string, result: string): void {
    const toolEl = this.containerEl.querySelector(`[data-tool-id="${toolCallId}"]`);
    if (toolEl) {
      const statusEl = toolEl.querySelector('.kilo-tool-status');
      if (statusEl) statusEl.textContent = '鉁?Done';
    }
  }

  // ============================================
  // 鍏朵粬鎿嶄綔
  // ============================================

  /** 澶勭悊鍙栨秷 */
  private handleCancel(): void {
    const activeTab = this.tabManager.getActiveTab();
    activeTab?.runtime?.cancel();
    this.streamController.cancel();
  }

  /** 澶勭悊鍥剧墖闄勪欢 */
  private async handleAttachImage(): Promise<void> {
    await this.imageContext.addFromFile();
    if (this.inputContainerEl) {
      this.imageContext.renderPreview(this.inputContainerEl);
    }
  }

  /** 澶勭悊褰撳墠绗旇鍒囨崲 */
  private handleToggleCurrentNote(): void {
    this.currentNoteContext.toggle();
  }

  /** 瑙﹀彂 mention */
  private triggerMention(): void {
    new Notice('Mention feature coming soon');
  }

  /** 瑙﹀彂鏂滄潬鍛戒护 */
  private triggerSlashCommand(): void {
    new Notice('Slash commands coming soon');
  }

  /** 瑙﹀彂鎸囦护妯″紡 */
  private triggerInstructionMode(): void {
    new Notice('Instruction mode coming soon');
  }

  /** 闄勫姞鏂囦欢 */
  private attachFile(): void {
    new Notice('File attachment coming soon');
  }

  /** 娉ㄥ唽 Inline Edit 鍛戒护 */
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

  /** 鏄剧ず Inline Edit 妯℃€佹 */
  private showInlineEditModal(selectedText: string, editor: any): void {
    new InlineEditModal(this.app, selectedText, async (instruction) => {
      // TODO: 璋冪敤 KiloCode CLI 杩涜 inline edit锛圥hase B 瀹炵幇锛?
    }).open();
  }

  /** 娉ㄥ唽娑堟伅鎿嶄綔浜嬩欢濮旀墭锛堜簨浠跺啋娉℃崟鑾?rewind/fork/copy 鎸夐挳鐐瑰嚮锛?*/
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

  /** 鍥為€€鍒版寚瀹氭秷鎭?*/
  private async handleRewind(messageId: string): Promise<void> {
    const confirmed = confirm('Rewind to this message? All subsequent messages will be removed.');
    if (!confirmed) return;

    try {
      const removed = await this.conversationController.rewind(messageId);
      new Notice(`Rewound. Removed ${removed.length} message(s).`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      new Notice(`Rewind failed: ${msg}`);
    }
  }

  /** 浠庢寚瀹氭秷鎭 fork 鏂颁細璇?*/
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

      // 鍒囨崲鍒?fork 鐨勪細璇?
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

  /** 澶嶅埗娑堟伅鍐呭鍒板壀璐存澘 */
  private async handleCopy(messageId: string): Promise<void> {
    const conversation = await this.conversationController.getConversation();
    if (!conversation) return;

    const message = conversation.messages.find(m => m.id === messageId);
    if (!message) return;

    await navigator.clipboard.writeText(message.content);
    new Notice('Copied to clipboard');
  }
}


