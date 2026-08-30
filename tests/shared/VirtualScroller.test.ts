// tests/shared/VirtualScroller.test.ts
// Phase 5 §7.6.1 动态高度虚拟滚动：前缀和定位 / 实测高度回填 / 总高度正确
// 用 stub DOM 断言核心布局逻辑，不依赖完整 DOM 环境
import { VirtualScroller } from '../../src/shared/VirtualScroller';

interface FakeEl {
  setCssStyles: jest.Mock;
  getBoundingClientRect: jest.Mock;
  remove: jest.Mock;
  text: string;
}

interface FakeContent {
  style: { height: string };
  appendChild: jest.Mock;
  remove: jest.Mock;
}

function makeItemEl(height: number): FakeEl {
  return {
    setCssStyles: jest.fn(),
    getBoundingClientRect: jest.fn().mockReturnValue({ height }),
    remove: jest.fn(),
    text: '',
  };
}

/** 捕获 rAF 回调，手动 flush（模拟真实渲染后测量时机） */
let rafCallbacks: Array<() => void> = [];

describe('VirtualScroller 动态高度（Phase 5 §7.6.1）', () => {
  // node 环境的 window polyfill 无 rAF，直接赋值并恢复
  const realRAF = (window as { requestAnimationFrame?: unknown }).requestAnimationFrame;
  beforeEach(() => {
    rafCallbacks = [];
    (window as { requestAnimationFrame: unknown }).requestAnimationFrame = (cb: FrameRequestCallback) => {
      rafCallbacks.push(() => cb(0));
      return 0;
    };
  });
  afterEach(() => {
    (window as { requestAnimationFrame: unknown }).requestAnimationFrame = realRAF;
  });

  function createScroller(items: number[], itemHeight = 100) {
    const appended: FakeEl[] = [];
    const contentEl: FakeContent = {
      style: { height: '' },
      appendChild: jest.fn((el: FakeEl) => { appended.push(el); }),
      remove: jest.fn(),
    };
    const container = {
      createDiv: jest.fn(() => contentEl),
      addEventListener: jest.fn(),
      scrollTop: 0,
      clientHeight: 400,
    };
    const scroller = new VirtualScroller<number>(
      container as unknown as HTMLElement,
      { itemHeight, overscan: 2 },
      (n) => {
        const el = makeItemEl(itemHeight);
        el.text = String(n);
        return el as unknown as HTMLElement;
      },
    );
    scroller.setItems(items);
    return { scroller, contentEl, appended, container };
  }

  test('总高度 = 项数 × 估算行高（全部未实测时）', () => {
    const { contentEl } = createScroller([1, 2, 3, 4, 5]);
    expect(contentEl.style.height).toBe('500px');
  });

  test('实测高度回填：总高度与可见项 top 按前缀和更新', () => {
    const { contentEl, appended } = createScroller([1, 2, 3]);
    // 每项实测 200px（估算 100 的两倍）
    for (const el of appended) {
      (el.getBoundingClientRect as jest.Mock).mockReturnValue({ height: 200 });
    }
    // flush 初始渲染的测量回调
    for (const cb of rafCallbacks.splice(0)) cb();

    expect(contentEl.style.height).toBe('600px');
    // 可见项 top：0 / 200 / 400
    const tops = appended.map(el => el.setCssStyles.mock.calls.map(c => c[0].top).pop());
    expect(tops).toEqual(['0px', '200px', '400px']);
  });

  test('滚动位置经二分映射：scrollTop=500 时可见项 top 在窗口附近（含 overscan）', () => {
    const { appended, container } = createScroller(Array.from({ length: 30 }, (_, i) => i));
    appended.length = 0;
    container.scrollTop = 500;
    // 触发滚动
    (container.addEventListener.mock.calls.find(c => c[0] === 'scroll')?.[1] as () => void)();
    for (const cb of rafCallbacks.splice(0)) cb();

    // 可见项 top 全部在窗口附近（估算高度 [400, 1100] + overscan）
    const tops = appended.map(el => parseInt(el.setCssStyles.mock.calls.map(c => c[0].top).pop() as string, 10));
    expect(tops.length).toBeGreaterThan(0);
    for (const top of tops) {
      expect(top).toBeGreaterThanOrEqual(500 - 2 * 100);
      expect(top).toBeLessThanOrEqual(500 + 400 + 2 * 100);
    }
  });

  test('appendItem 增量加入并更新总高度', () => {
    const { scroller, contentEl } = createScroller([1, 2, 3, 4, 5]);
    scroller.appendItem(99);
    expect(contentEl.style.height).toBe('600px');
  });

  test('scrollToBottom 定位到总高度', () => {
    const { scroller, container } = createScroller([1, 2, 3, 4, 5]);
    scroller.scrollToBottom();
    expect(container.scrollTop).toBe(500);
  });
});
