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
