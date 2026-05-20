// src/features/chat/KiloCodeView.ts

import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';
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
    this.streamController.cancel();
    this.inputController.cancel();
    this.messageRenderer = null;
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

  /** 处理发送消息 */
  private async handleSend(content: string): Promise<void> {
    if (!content.trim()) return;

    const activeTab = this.tabManager.getActiveTab();
    if (!activeTab) return;

    try {
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Failed to send message: ${message}`);
      console.error('[KiloCodeView] handleSend error:', error);
    }
  }

  /** 处理取消 */
  private handleCancel(): void {
    this.inputController.cancel();
    this.streamController.cancel();
  }
}
