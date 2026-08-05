// src/features/chat/tabs/TabBarView.ts
// 标签栏渲染器
// 纯渲染：重建标签列表与新建按钮，不持有业务状态。
// 事件注册通过注入的 registerDomEvent 完成（由 ItemView 提供）。

import type { Tab } from './Tab';

export interface TabBarCallbacks {
  onTabClick: (tabId: string) => void;
  onNewTab: () => void;
}

export class TabBarView {
  constructor(
    private el: HTMLElement,
    private registerDomEvent: (
      el: HTMLElement,
      event: keyof HTMLElementEventMap,
      cb: (e: Event) => void,
    ) => void,
    private getTitle: (conversationId: string) => string | null,
  ) {}

  /** 重建标签栏（不销毁容器本身，只重建内部内容） */
  render(
    tabs: Tab[],
    activeTabId: string | null,
    canCreateTab: boolean,
    callbacks: TabBarCallbacks,
  ): void {
    // 清空旧内容
    const oldTabs = this.el.querySelector('.kilo-tabs');
    if (oldTabs) oldTabs.remove();
    const oldAddBtn = this.el.querySelector('.kilo-tab-add');
    if (oldAddBtn) oldAddBtn.remove();

    // 重建标签列表
    const tabsEl = this.el.createDiv({ cls: 'kilo-tabs' });
    for (const tab of tabs) {
      const isActive = tab.id === activeTabId;
      const tabEl = tabsEl.createDiv({
        cls: `kilo-tab ${isActive ? 'kilo-tab-active' : ''}`,
      });
      const label = tab.state.conversationId
        ? (this.getTitle(tab.state.conversationId) || this.truncateId(tab.state.conversationId))
        : 'New';
      tabEl.createSpan({ text: label });
      this.registerDomEvent(tabEl, 'click', () => callbacks.onTabClick(tab.id));
    }

    // 新建标签按钮
    if (canCreateTab) {
      const addBtnEl = this.el.createDiv({ cls: 'kilo-tab-add', text: '+' });
      this.registerDomEvent(addBtnEl, 'click', () => callbacks.onNewTab());
    }
  }

  /** 截断会话 ID 用于标签显示 */
  private truncateId(id: string): string {
    return id.length > 12 ? id.slice(0, 12) + '...' : id;
  }
}
