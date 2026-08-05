// src/features/chat/rendering/MessageActionsHandler.ts
// 消息操作处理器：rewind / fork / copy 委托
// 事件冒泡捕获按钮点击（事件注册由 View 注入，因为 registerDomEvent 是 ItemView 方法）

import type { ConversationController } from '../controllers/ConversationController';
import type { TabManager } from '../tabs/TabManager';
import type { ChatState } from '../state/ChatState';

export interface MessageActionsDeps {
  registerDomEvent: (
    el: HTMLElement,
    event: keyof HTMLElementEventMap,
    cb: (e: Event) => void,
  ) => void;
  conversationController: ConversationController;
  tabManager: TabManager;
  chatState: ChatState;
  notice: (message: string) => void;
  saveCurrentDraft: () => void;
  restoreDraft: (draft: string) => void;
  updateUI: () => void;
}

export class MessageActionsHandler {
  constructor(private deps: MessageActionsDeps) {}

  /** 注册消息操作事件委托（事件冒泡捕获 rewind/fork/copy 按钮点击） */
  attach(messagesEl: HTMLElement): void {
    this.deps.registerDomEvent(messagesEl, 'click', (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('.kilo-action-btn') as HTMLElement;
      if (!btn) return;

      const action = btn.dataset.action;
      const messageId = btn.dataset.messageId;
      if (!action || !messageId) return;

      switch (action) {
        case 'rewind':
          void this.rewind(messageId);
          break;
        case 'fork':
          void this.fork(messageId);
          break;
        case 'copy':
          void this.copy(messageId);
          break;
      }
    });
  }

  /** 回退到指定消息 */
  async rewind(messageId: string): Promise<void> {
    const confirmed = confirm('Rewind to this message? All subsequent messages will be removed.');
    if (!confirmed) return;

    try {
      const removed = await this.deps.conversationController.rewind(messageId);
      this.deps.notice(`Rewound. Removed ${removed.length} message(s).`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.deps.notice(`Rewind failed: ${msg}`);
    }
  }

  /** 从指定消息处 fork 新会话 */
  async fork(messageId: string): Promise<void> {
    if (!this.deps.tabManager.canCreateTab()) {
      this.deps.notice('Maximum tabs reached. Close a tab first.');
      return;
    }

    try {
      const forked = await this.deps.conversationController.fork(messageId);

      this.deps.saveCurrentDraft();
      const newTab = this.deps.tabManager.createTab();
      newTab.setConversation(forked.id);

      // 切换到 fork 的会话
      await this.deps.conversationController.switchTo(forked.id);
      this.deps.chatState.setConversationId(forked.id);
      this.deps.restoreDraft('');

      this.deps.notice(`Forked: ${forked.title}`);
      this.deps.updateUI();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.deps.notice(`Fork failed: ${msg}`);
    }
  }

  /** 复制消息内容到剪贴板 */
  async copy(messageId: string): Promise<void> {
    const conversation = await this.deps.conversationController.getConversation();
    if (!conversation) return;

    const message = conversation.messages.find(m => m.id === messageId);
    if (!message) return;

    await navigator.clipboard.writeText(message.content);
    this.deps.notice('Copied to clipboard');
  }
}
