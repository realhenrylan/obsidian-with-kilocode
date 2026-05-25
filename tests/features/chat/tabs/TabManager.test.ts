import { Tab, TabState } from '../../../../src/features/chat/tabs/Tab';
import { TabManager } from '../../../../src/features/chat/tabs/TabManager';

describe('Tab', () => {
  test('constructor initializes state with defaults', () => {
    const tab = new Tab('test-id');
    expect(tab.id).toBe('test-id');
    expect(tab.state.conversationId).toBeNull();
    expect(tab.state.isStreaming).toBe(false);
    expect(tab.state.draftMessage).toBe('');
  });

  test('setConversation updates conversationId', () => {
    const tab = new Tab('t1');
    tab.setConversation('conv-1');
    expect(tab.state.conversationId).toBe('conv-1');
  });

  test('setStreaming updates isStreaming', () => {
    const tab = new Tab('t1');
    tab.setStreaming(true);
    expect(tab.state.isStreaming).toBe(true);
  });

  test('setDraftMessage updates draftMessage', () => {
    const tab = new Tab('t1');
    tab.setDraftMessage('hello');
    expect(tab.state.draftMessage).toBe('hello');
  });

  test('restoreFromState restores all fields except id', () => {
    const tab = new Tab('t1');
    const saved: TabState = {
      id: 't1',
      conversationId: 'conv-2',
      isStreaming: true,
      draftMessage: 'draft',
    };
    tab.restoreFromState(saved);
    expect(tab.state.conversationId).toBe('conv-2');
    expect(tab.state.isStreaming).toBe(true);
    expect(tab.state.draftMessage).toBe('draft');
  });

  test('id getter returns state.id', () => {
    const tab = new Tab('my-id');
    expect(tab.id).toBe('my-id');
    expect(tab.id).toBe(tab.state.id);
  });
});

describe('TabManager', () => {
  let manager: TabManager;

  beforeEach(() => {
    manager = new TabManager();
  });

  test('createTab creates a new tab and sets it active', () => {
    const tab = manager.createTab();
    expect(tab).toBeInstanceOf(Tab);
    expect(manager.getActiveTab()).toBe(tab);
    expect(manager.getTabCount()).toBe(1);
  });

  test('createTab generates unique ids', () => {
    const tab1 = manager.createTab();
    const tab2 = manager.createTab();
    expect(tab1.id).not.toBe(tab2.id);
  });

  test('closeTab returns true on success', async () => {
    const tab = manager.createTab();
    expect(await manager.closeTab(tab.id)).toBe(true);
    expect(manager.getTabCount()).toBe(0);
  });

  test('closeTab returns false for non-existent id', async () => {
    expect(await manager.closeTab('nonexistent')).toBe(false);
  });

  test('closeTab updates activeTabId to last remaining tab', async () => {
    const tab1 = manager.createTab();
    const tab2 = manager.createTab();
    await manager.closeTab(tab2.id);
    expect(manager.getActiveTab()).toBe(tab1);
  });

  test('closeTab sets activeTabId to null when no tabs remain', async () => {
    const tab = manager.createTab();
    await manager.closeTab(tab.id);
    expect(manager.getActiveTab()).toBeNull();
  });

  test('switchTab returns tab on success', () => {
    const tab1 = manager.createTab();
    const tab2 = manager.createTab();
    const result = manager.switchTab(tab1.id);
    expect(result).toBe(tab1);
    expect(manager.getActiveTab()).toBe(tab1);
  });

  test('switchTab returns null for invalid id', () => {
    const result = manager.switchTab('nonexistent');
    expect(result).toBeNull();
  });

  test('getActiveTab returns null when no tabs', () => {
    expect(manager.getActiveTab()).toBeNull();
  });

  test('getAllTabs returns all tabs', () => {
    const tab1 = manager.createTab();
    const tab2 = manager.createTab();
    const all = manager.getAllTabs();
    expect(all).toHaveLength(2);
    expect(all).toContain(tab1);
    expect(all).toContain(tab2);
  });

  test('getTabCount returns correct count', () => {
    expect(manager.getTabCount()).toBe(0);
    manager.createTab();
    expect(manager.getTabCount()).toBe(1);
    manager.createTab();
    expect(manager.getTabCount()).toBe(2);
  });

  test('canCreateTab returns true when under limit', () => {
    const mgr = new TabManager(2);
    expect(mgr.canCreateTab()).toBe(true);
    mgr.createTab();
    expect(mgr.canCreateTab()).toBe(true);
  });

  test('canCreateTab returns false at limit', () => {
    const mgr = new TabManager(1);
    mgr.createTab();
    expect(mgr.canCreateTab()).toBe(false);
  });

  test('createTab throws when max tabs reached', () => {
    const mgr = new TabManager(1);
    mgr.createTab();
    expect(() => mgr.createTab()).toThrow('Maximum number of tabs (1) reached');
  });

  test('getPersistedState returns a snapshot', () => {
    const tab = manager.createTab();
    tab.setConversation('conv-1');
    const state = manager.getPersistedState();
    expect(state.openTabs).toHaveLength(1);
    expect(state.openTabs[0].conversationId).toBe('conv-1');
    expect(state.activeTabId).toBe(tab.id);
  });

  test('getPersistedState returns copies, not references', () => {
    manager.createTab();
    const state1 = manager.getPersistedState();
    const state2 = manager.getPersistedState();
    expect(state1.openTabs[0]).not.toBe(state2.openTabs[0]);
    expect(state1.openTabs[0]).toEqual(state2.openTabs[0]);
  });

  test('restoreState restores tabs from valid state', () => {
    const state = {
      openTabs: [
        { id: 'a', conversationId: 'c1', isStreaming: false, draftMessage: '' },
        { id: 'b', conversationId: 'c2', isStreaming: true, draftMessage: 'hi' },
      ],
      activeTabId: 'b',
    };
    manager.restoreState(state);
    expect(manager.getTabCount()).toBe(2);
    expect(manager.getActiveTab()?.id).toBe('b');
    expect(manager.getAllTabs()[0].state.conversationId).toBe('c1');
  });

  test('restoreState sets activeTabId to null if invalid', () => {
    const state = {
      openTabs: [{ id: 'a', conversationId: null, isStreaming: false, draftMessage: '' }],
      activeTabId: 'nonexistent',
    };
    manager.restoreState(state);
    expect(manager.getActiveTab()).toBeNull();
  });

  test('restoreState clears existing tabs', () => {
    manager.createTab();
    manager.createTab();
    const state = {
      openTabs: [{ id: 'x', conversationId: null, isStreaming: false, draftMessage: '' }],
      activeTabId: 'x',
    };
    manager.restoreState(state);
    expect(manager.getTabCount()).toBe(1);
    expect(manager.getActiveTab()?.id).toBe('x');
  });
});
