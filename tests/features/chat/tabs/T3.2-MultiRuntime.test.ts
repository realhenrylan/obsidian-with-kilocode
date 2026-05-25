// T3.2 多 Runtime 支持 — 单元测试
//
// 覆盖范围：
// - 每个标签独立的 runtime 实例（不同的 sessionId/serverPassword）
// - 标签切换使用对应标签的 runtime
// - 关闭标签清理对应 runtime
// - 进程数不超过标签数（无泄露）

import { Tab } from '../../../../src/features/chat/tabs/Tab';
import { TabManager } from '../../../../src/features/chat/tabs/TabManager';
import type { ChatRuntime } from '../../../../src/core/providers/types';

// ── Mock Runtime Factory ────────────────────────────────────────────────────────

let runtimeCounter = 0;

function createMockRuntime(id?: string): ChatRuntime {
  const runtimeId = id ?? `runtime-${++runtimeCounter}`;
  return {
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    sendMessage: jest.fn(),
    cancel: jest.fn(),
    resetSession: jest.fn(),
    isStreaming: jest.fn().mockReturnValue(false),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('T3.2 Multi-Runtime Support', () => {
  beforeEach(() => {
    runtimeCounter = 0;
  });

  // ================================================================
  // Tab 持有独立 runtime
  // ================================================================

  describe('Tab owns independent runtime', () => {
    test('each tab starts with null runtime', () => {
      const tab = new Tab('tab-1');
      expect(tab.runtime).toBeNull();
    });

    test('each tab can hold a different runtime instance', () => {
      const tab1 = new Tab('tab-1');
      const tab2 = new Tab('tab-2');

      const rt1 = createMockRuntime('rt-a');
      const rt2 = createMockRuntime('rt-b');

      tab1.runtime = rt1;
      tab2.runtime = rt2;

      expect(tab1.runtime).toBe(rt1);
      expect(tab2.runtime).toBe(rt2);
      expect(tab1.runtime).not.toBe(tab2.runtime);
    });

    test('disposeRuntime stops the runtime and sets to null', async () => {
      const tab = new Tab('tab-1');
      const rt = createMockRuntime();
      tab.runtime = rt;

      await tab.disposeRuntime();

      expect(rt.stop).toHaveBeenCalledTimes(1);
      expect(tab.runtime).toBeNull();
    });

    test('disposeRuntime is idempotent when runtime is null', async () => {
      const tab = new Tab('tab-1');
      expect(tab.runtime).toBeNull();
      await tab.disposeRuntime(); // should not throw
      expect(tab.runtime).toBeNull();
    });
  });

  // ================================================================
  // TabManager runtime 生命周期
  // ================================================================

  describe('TabManager runtime lifecycle', () => {
    test('closeTab disposes the tab runtime', async () => {
      const manager = new TabManager();
      const tab = manager.createTab();
      const rt = createMockRuntime();
      tab.runtime = rt;

      await manager.closeTab(tab.id);

      expect(rt.stop).toHaveBeenCalledTimes(1);
      expect(tab.runtime).toBeNull();
      expect(manager.getTabCount()).toBe(0);
    });

    test('switchTab preserves each tab runtime', () => {
      const manager = new TabManager();
      const tab1 = manager.createTab();
      const tab2 = manager.createTab();

      const rt1 = createMockRuntime('rt-1');
      const rt2 = createMockRuntime('rt-2');
      tab1.runtime = rt1;
      tab2.runtime = rt2;

      manager.switchTab(tab1.id);
      expect(manager.getActiveTab()?.runtime).toBe(rt1);

      manager.switchTab(tab2.id);
      expect(manager.getActiveTab()?.runtime).toBe(rt2);
    });

    test('disposeAllRuntimes stops all tab runtimes', async () => {
      const manager = new TabManager();
      const tab1 = manager.createTab();
      const tab2 = manager.createTab();

      const rt1 = createMockRuntime();
      const rt2 = createMockRuntime();
      tab1.runtime = rt1;
      tab2.runtime = rt2;

      await manager.disposeAllRuntimes();

      expect(rt1.stop).toHaveBeenCalledTimes(1);
      expect(rt2.stop).toHaveBeenCalledTimes(1);
      expect(tab1.runtime).toBeNull();
      expect(tab2.runtime).toBeNull();
    });

    test('process count equals tab count (no leaks)', async () => {
      const manager = new TabManager(5);

      // Create 3 tabs, each with a runtime
      const tabs: Tab[] = [];
      const runtimes: ChatRuntime[] = [];
      for (let i = 0; i < 3; i++) {
        const tab = manager.createTab();
        const rt = createMockRuntime();
        tab.runtime = rt;
        tabs.push(tab);
        runtimes.push(rt);
      }

      // All runtimes alive
      expect(manager.getTabCount()).toBe(3);
      for (const rt of runtimes) {
        expect(rt.stop).not.toHaveBeenCalled();
      }

      // Close one tab → one runtime stopped
      await manager.closeTab(tabs[0].id);
      expect(runtimes[0].stop).toHaveBeenCalledTimes(1);
      expect(manager.getTabCount()).toBe(2);

      // Remaining runtimes still alive
      expect(runtimes[1].stop).not.toHaveBeenCalled();
      expect(runtimes[2].stop).not.toHaveBeenCalled();

      // Close another tab → second runtime stopped
      await manager.closeTab(tabs[1].id);
      expect(runtimes[1].stop).toHaveBeenCalledTimes(1);
      expect(manager.getTabCount()).toBe(1);

      // Only one runtime left
      expect(runtimes[2].stop).not.toHaveBeenCalled();
    });
  });
});
