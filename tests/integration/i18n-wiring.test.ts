/**
 * @jest-environment jsdom
 */

// tests/integration/i18n-wiring.test.ts
// i18n 全链路接入测试（Phase 1.4）：
// - 测试 1：main.onload 应调用 initI18n() → 当前 main.ts 未调用 → Red（@phase3 §5.1）
// - 测试 2：KiloCodeView 的 UI 文本应经 t() 渲染 → 当前硬编码 'Send' → Red（@phase3 §5.1）
// Phase 3 实现 i18n 接入后两个测试转 Green。

import { polyfillObsidianDOM } from '../helpers/obsidianDom';
import { createMockApp } from '../helpers/factory';

// ─── mock 模块 ───

// i18n 模块：spy initI18n，t() 返回唯一标记以便断言 UI 文本来源
jest.mock('../../src/i18n/index', () => ({
  initI18n: jest.fn(),
  setLocale: jest.fn(),
  detectLocale: jest.fn().mockReturnValue('en'),
  t: jest.fn().mockReturnValue('SEND_BUTTON_LABEL'),
}));

// BinaryManager：避免真实 fs 操作
jest.mock('../../src/core/binary/BinaryManager', () => ({
  BinaryManager: jest.fn().mockImplementation(() => ({
    preload: jest.fn().mockResolvedValue(undefined),
  })),
}));

// @kilocode/sdk：避免真实 spawn（沿 KiloCodeChatRuntime.test.ts 的 mock 模式）
jest.mock('@kilocode/sdk/server', () => ({
  createKiloServer: jest.fn().mockResolvedValue({ url: 'http://127.0.0.1:4096', close: jest.fn() }),
}));

jest.mock('@kilocode/sdk/client', () => {
  const mockClient = {
    session: {
      create: jest.fn().mockResolvedValue({ data: { id: 's1' }, error: null }),
      prompt: jest.fn().mockResolvedValue({ data: { info: { id: 'm1' }, parts: [] }, error: null }),
      abort: jest.fn().mockResolvedValue({ data: true }),
      status: jest.fn().mockResolvedValue({ data: { status: 'idle' }, error: null }),
    },
    event: { subscribe: jest.fn().mockResolvedValue({ stream: (async function* () {})() }) },
  };
  return { createKiloClient: jest.fn().mockReturnValue(mockClient), KiloClient: class {} };
});

let mockNoticeMessages: string[] = [];

jest.mock('obsidian', () => {
  class Plugin {
    app: any;
    manifest: any = { dir: '.obsidian/plugins/kilocode' };
    constructor(app?: any) {
      this.app = app;
    }
    loadData = jest.fn().mockResolvedValue({});
    saveData = jest.fn().mockResolvedValue(undefined);
    registerView = jest.fn();
    addRibbonIcon = jest.fn();
    addCommand = jest.fn();
    addSettingTab = jest.fn();
    registerEvent = jest.fn();
  }
  class FileSystemAdapter {}
  class Notice {
    message: string;
    constructor(message: string, _timeout?: number) {
      this.message = message;
      mockNoticeMessages.push(message);
    }
  }
  // KiloCodeView 链路所需
  class ItemView {
    app: any;
    containerEl: HTMLElement;
    constructor(leaf: any) {
      this.app = leaf?.app;
      this.containerEl = document.createElement('div');
      this.containerEl.appendChild(document.createElement('div'));
      this.containerEl.appendChild(document.createElement('div'));
    }
    registerDomEvent(el: HTMLElement, event: string, cb: (e: Event) => void) {
      el.addEventListener(event, cb);
      return () => el.removeEventListener(event, cb);
    }
  }
  class MarkdownView {}
  class WorkspaceLeaf {}
  class Modal {}
  class PluginSettingTab {
    app: any;
    plugin: any;
    containerEl: HTMLElement;
    constructor(app: any, plugin: any) {
      this.app = app;
      this.plugin = plugin;
      this.containerEl = document.createElement('div');
    }
    display() {}
  }

  return {
    Plugin, FileSystemAdapter, Notice, ItemView, MarkdownView, WorkspaceLeaf, Modal, PluginSettingTab,
    MarkdownRenderer: {
      renderMarkdown: jest.fn((content: string, el: HTMLElement) => {
        el.createSpan({ text: content });
      }),
    },
  };
});

// ─── 测试 ───

describe('i18n 全链路接入（@phase3 §5.1）', () => {
  let initI18nMock: jest.Mock;

  beforeAll(() => {
    polyfillObsidianDOM();
  });

  beforeEach(() => {
    mockNoticeMessages = [];
    jest.clearAllMocks();
    // 重新获取 mock 引用（clearAllMocks 后仍有效）
    const i18n = require('../../src/i18n/index') as { initI18n: jest.Mock };
    initI18nMock = i18n.initI18n;
  });

  test('main.onload 调用 initI18n()', async () => {
    // 当前 main.ts 未调用 → Red；Phase 3 §5.1 接入后 Green
    const { default: KiloCodePlugin } = await import('../../src/main');
    const plugin = new KiloCodePlugin(createMockApp(), jest.fn()) as any;

    await plugin.onload();

    expect(initI18nMock).toHaveBeenCalled();
  });

  test('KiloCodeView 发送按钮文本经 t() 渲染', async () => {
    // 当前硬编码 'Send' → Red；Phase 3 §5.1 替换为 t('action.send') 后 Green
    const { KiloCodeView } = await import('../../src/features/chat/KiloCodeView');
    const plugin = {
      settings: { maxTabs: 3, permissionMode: 'normal', defaultModel: '', temperature: 0.7, compactKeepRecent: 5 },
      app: createMockApp(),
      addCommand: jest.fn(),
      saveSettings: jest.fn(),
    } as any;
    const view = new KiloCodeView({ app: plugin.app } as any, plugin) as any;
    await view.onOpen();

    const sendBtn = view.containerEl.querySelector('.kilo-btn-primary');
    expect(sendBtn).not.toBeNull();
    expect(sendBtn!.textContent).toBe('SEND_BUTTON_LABEL');
  });

  test('activateView 按 chatViewPlacement=left-sidebar 选择左栏（§5.5）', async () => {
    const { default: KiloCodePlugin } = await import('../../src/main');
    const getRightLeaf = jest.fn().mockReturnValue({ setViewState: jest.fn().mockResolvedValue(undefined) });
    const getLeftLeaf = jest.fn().mockReturnValue({ setViewState: jest.fn().mockResolvedValue(undefined) });
    const revealLeaf = jest.fn();
    const app = createMockApp({
      workspace: {
        getLeavesOfType: jest.fn().mockReturnValue([]),
        getRightLeaf,
        getLeftLeaf,
        getLeaf: jest.fn(),
        revealLeaf,
        getActiveViewOfType: jest.fn().mockReturnValue(null),
      },
    });
    const plugin = new KiloCodePlugin(app, jest.fn()) as any;
    plugin.settings.chatViewPlacement = 'left-sidebar';

    await plugin.activateView();

    expect(getLeftLeaf).toHaveBeenCalledWith(false);
    expect(getRightLeaf).not.toHaveBeenCalled();
    expect(revealLeaf).toHaveBeenCalled();
  });

  test('activateView 按 chatViewPlacement=main-tab 选择主编辑区（§5.5）', async () => {
    const { default: KiloCodePlugin } = await import('../../src/main');
    const getRightLeaf = jest.fn().mockReturnValue({ setViewState: jest.fn().mockResolvedValue(undefined) });
    const getLeaf = jest.fn().mockReturnValue({ setViewState: jest.fn().mockResolvedValue(undefined) });
    const revealLeaf = jest.fn();
    const app = createMockApp({
      workspace: {
        getLeavesOfType: jest.fn().mockReturnValue([]),
        getRightLeaf,
        getLeftLeaf: jest.fn(),
        getLeaf,
        revealLeaf,
        getActiveViewOfType: jest.fn().mockReturnValue(null),
      },
    });
    const plugin = new KiloCodePlugin(app, jest.fn()) as any;
    plugin.settings.chatViewPlacement = 'main-tab';

    await plugin.activateView();

    expect(getLeaf).toHaveBeenCalledWith(false);
    expect(getRightLeaf).not.toHaveBeenCalled();
  });
});
