// src/features/chat/controllers/TabController.ts
// 标签页控制器：处理标签点击 / 新建 / 草稿管理
// 流式期间切换标签通过 TabStreamingState 恢复渲染（跨标签缓冲）

import type { TabManager } from '../tabs/TabManager';
import type { ConversationController } from './ConversationController';
import type { ChatState } from '../state/ChatState';
import type { TabStreamingState } from './SendOrchestrator';

export interface TabControllerDeps {
  tabManager: TabManager;
  conversationController: ConversationController;
  chatState: ChatState;
  // 渲染与 UI 回调（由 View 注入）
  getMessageRenderer: () => { addAssistantMessage(): void; appendThinking(t: string): void; appendText(t: string): void; renderToolCallStreaming(tc: unknown): void } | null;
  getMessagesEl: () => HTMLElement | null;
  getStreamingState: (tabId: string) => TabStreamingState | undefined;
  saveCurrentDraft: () => void;
  restoreDraft: (draft: string) => void;
  updateUI: () => void;
  setIsSwitchingTab: (v: boolean) => void;
}

export class TabController {
  constructor(private deps: TabControllerDeps) {}

  /** 处理标签页点击（流式进行中也可切换，通过 TabStreamingState 恢复渲染） */
  async handleTabClick(tabId: string): Promise<void> {
    this.deps.setIsSwitchingTab(true);
    try {
      const tab = this.deps.tabManager.switchTab(tabId);
      if (!tab) return;

      // 保存当前标签的草稿
      this.deps.saveCurrentDraft();

      // 通过 ConversationController 切换会话（含 save → reset → load → render）
      if (tab.state.conversationId) {
        await this.deps.conversationController.switchTo(tab.state.conversationId);
      } else {
        this.deps.getMessagesEl()?.empty();
      }

      // 同步 ChatState 到当前 Tab 的会话（空会话也重置为 null）
      this.deps.chatState.setConversationId(tab.state.conversationId);

      // 如果目标标签有正在进行的流，重建流式渲染状态
      if (tab.state.isStreaming) {
        const state = this.deps.getStreamingState(tabId);
        if (state) {
          const renderer = this.deps.getMessageRenderer();
          renderer?.addAssistantMessage();
          if (state.thinking) {
            renderer?.appendThinking(state.thinking);
          }
          if (state.content) {
            renderer?.appendText(state.content);
          }
          for (const toolCall of state.toolCalls.values()) {
            renderer?.renderToolCallStreaming(toolCall);
          }
        }
      }

      // 恢复草稿
      this.deps.restoreDraft(tab.state.draftMessage);

      this.deps.updateUI();
    } finally {
      this.deps.setIsSwitchingTab(false);
    }
  }

  /** 处理新建标签页 */
  handleNewTab(): void {
    if (!this.deps.tabManager.canCreateTab()) return;
    this.deps.saveCurrentDraft();
    this.deps.tabManager.createTab();
    // 通过 ConversationController 重置到空白状态
    this.deps.conversationController.createNew();
    this.deps.restoreDraft('');
    this.deps.updateUI();
  }
}
