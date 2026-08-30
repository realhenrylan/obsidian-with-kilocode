/**
 * @jest-environment jsdom
 */

// tests/features/chat/KiloCodeView.test.ts
// KiloCodeView 行为契约测试（Phase 1 安全网）
// 原则：测公共行为而非私有实现细节；内部组件（TabManager/ConversationController 等）
// 使用真实实现，只 mock obsidian API 与 ChatRuntime。

import { KiloCodeView } from '../../../src/features/chat/KiloCodeView';
import { ProviderRegistry } from '../../../src/core/providers/ProviderRegistry';
import type { ChatRuntime } from '../../../src/core/providers/types';
import { polyfillObsidianDOM } from '../../helpers/obsidianDom';
import { createMockApp, createMockRuntime } from '../../helpers/factory';

// ─── obsidian mock（hoisted：引用以 mock 前缀开头的变量） ───

let mockNoticeMessages: string[] = [];

jest.mock('obsidian', () => {
  class Notice {
    message: string;
    constructor(message: string, _timeout?: number) {
      this.message = message;
      // 运行时引用（工厂执行时变量尚未初始化）
      mockNoticeMessages.push(message);
    }
  }

  // ItemView：containerEl 含 header(children[0]) + content(children[1])，
  // KiloCodeView.buildLayout 使用 children[1] 作为视图容器
  class ItemView {
    app: any;
    containerEl: HTMLElement;
    constructor(leaf: any) {
      this.app = leaf?.app;
      this.containerEl = document.createElement('div');
      this.containerEl.appendChild(document.createElement('div')); // header
      this.containerEl.appendChild(document.createElement('div')); // content
    }
    registerDomEvent(el: HTMLElement, event: string, callback: (e: Event) => void) {
      el.addEventListener(event, callback);
      return () => el.removeEventListener(event, callback);
    }
  }

  class MarkdownView {}
  class WorkspaceLeaf {}
  class Modal {
    app: any;
    isOpen = false;
    constructor(app: any) { this.app = app; }
    open() { this.isOpen = true; this.onOpen?.(); }
    close() { this.isOpen = false; this.onClose?.(); }
  }

  return {
    Notice,
    ItemView,
    MarkdownView,
    WorkspaceLeaf,
    Modal,
    MarkdownRenderer: {
      // 0.9.6 起统一为 render(app, markdown, el, ...) 新签名
      render: jest.fn(async (_app: unknown, content: string, el: HTMLElement) => {
        el.createSpan({ text: content });
      }),
    },
  };
});

// ─── setup ───

describe('KiloCodeView', () => {
  let view: KiloCodeView;
  let plugin: any;
  let runtime: ChatRuntime;

  /** 构造 view：plugin.app 使用共享 mockApp，保证 vault.adapter 一致 */
  function createView(maxTabs = 3): KiloCodeView {
    const leaf = { app: plugin.app } as any;
    return new KiloCodeView(leaf, plugin);
  }

  beforeAll(() => {
    polyfillObsidianDOM();
  });

  beforeEach(async () => {
    mockNoticeMessages = [];
    plugin = {
      settings: {
        maxTabs: 3,
        permissionMode: 'normal',
        defaultModel: '',
        temperature: 0.7,
        compactKeepRecent: 5,
        autoSave: true,
      },
      app: createMockApp(),
      saveSettings: jest.fn(),
      addCommand: jest.fn(),
      // warmup / getOrCreateRuntime 依赖（与 main.ts 真实成员对齐）
      binaryManager: { isReady: jest.fn(() => false) },
      addKilocodeRuntime: jest.fn(),
      warmupRuntimeRef: null,
    } as any;

    // 注册 mock runtime provider（ProviderRegistry 为静态注册）
    runtime = createMockRuntime();
    ProviderRegistry.register({
      id: 'kilocode',
      name: 'KiloCode',
      createRuntime: () => runtime,
    } as any);

    view = createView();
    await view.onOpen();
  });

  afterEach(async () => {
    await view.onClose();
  });

  // ─── onOpen ────────────────────────────────────────────

  describe('onOpen', () => {
    test('无 Tab 时自动创建一个默认 Tab', () => {
      expect((view as any).tabManager.getTabCount()).toBe(1);
      expect((view as any).tabManager.getActiveTab()).not.toBeNull();
    });

    test('注册 Inline Edit / 模式切换 / CLI 重载命令', () => {
      const commands = (plugin.addCommand as jest.Mock).mock.calls.map(c => c[0].id);
      expect(commands).toContain('inline-edit');
      expect(commands).toContain('toggle-plan-mode');
      expect(commands).toContain('reload-cli');
    });
  });

  // ─── handleSend ────────────────────────────────────────

  describe('handleSend', () => {
    test('空内容静默返回：不创建会话、不调用 runtime', async () => {
      const sendSpy = (runtime.sendMessage as jest.Mock);
      await (view as any).handleSend('');
      await (view as any).handleSend('   ');
      expect(sendSpy).not.toHaveBeenCalled();
      expect((view as any).chatState.currentConversationId).toBeNull();
    });

    test('activeTab.isStreaming 时静默返回', async () => {
      const activeTab = (view as any).tabManager.getActiveTab();
      activeTab.setStreaming(true);

      await (view as any).handleSend('hello');

      expect(runtime.sendMessage).not.toHaveBeenCalled();
      // 无任何 Notice 提示
      expect(mockNoticeMessages).toHaveLength(0);
    });

    test('全流程：懒创建会话 → 渲染用户消息 → 调 runtime → 保存助手消息', async () => {
      (runtime.sendMessage as jest.Mock).mockImplementation(async function* () {
        yield { type: 'text', content: 'Hi there' };
        yield { type: 'done' };
      });

      await (view as any).handleSend('Hello');

      // runtime 收到消息与 vault 上下文
      expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
      expect(runtime.sendMessage).toHaveBeenCalledWith(
        'Hello',
        expect.objectContaining({ vaultPath: '/vault' }),
      );

      // 用户消息渲染在消息区
      const userMsg = (view as any).messagesEl.querySelector('.kilo-message-user');
      expect(userMsg).not.toBeNull();

      // 会话已创建并保存了两条消息（user + assistant）
      const convId = (view as any).chatState.currentConversationId;
      expect(convId).toMatch(/^conv-\d{13}-[a-z0-9]{7}$/);
      const conv = await (view as any).conversationService.getConversation(convId);
      expect(conv.messages).toHaveLength(2);
      expect(conv.messages[0].role).toBe('user');
      expect(conv.messages[1].role).toBe('assistant');
      expect(conv.messages[1].content).toBe('Hi there');
    });

    test('流结束清理：senderTabId 与流式缓冲被清空', async () => {
      (runtime.sendMessage as jest.Mock).mockImplementation(async function* () {
        yield { type: 'text', content: 'x' };
        yield { type: 'done' };
      });

      await (view as any).handleSend('ping');

      expect((view as any).senderTabId).toBeNull();
      expect((view as any).streamingStates.size).toBe(0);
    });

    test('runtime 不可用时 Notice 提示且不崩溃', async () => {
      // 移除 provider 注册，getOrCreateRuntime 返回 null
      const registry = ProviderRegistry as any;
      const original = registry.providers.get('kilocode');
      registry.providers.delete('kilocode');
      try {
        await (view as any).handleSend('hello');
        expect(mockNoticeMessages).toContain('KiloCode CLI not available');
      } finally {
        registry.providers.set('kilocode', original);
      }
    });

    test('runtime.start 失败返回 null 且不崩溃', async () => {
      const registry = ProviderRegistry as any;
      const original = registry.providers.get('kilocode');
      registry.providers.set('kilocode', {
        createRuntime: () => createMockRuntime({ start: jest.fn().mockRejectedValue(new Error('spawn failed')) }),
      } as any);
      try {
        const rt = await (view as any).getOrCreateRuntime();
        expect(rt).toBeNull();
      } finally {
        registry.providers.set('kilocode', original);
      }
    });

    test('发送异常时 Notice 提示并重置流式状态', async () => {
      (runtime.sendMessage as jest.Mock).mockImplementation(async function* () {
        throw new Error('stream broke');
      });

      await (view as any).handleSend('boom');

      // StreamController 捕获 generator 异常 → onError 回调 Notice
      expect(mockNoticeMessages.some(m => m.includes('stream broke'))).toBe(true);
      const activeTab = (view as any).tabManager.getActiveTab();
      expect(activeTab.state.isStreaming).toBe(false);
      expect((view as any).senderTabId).toBeNull();
    });
  });

  // ─── cancel ────────────────────────────────────────────

  describe('cancel', () => {
    test('同时调 inputController 与 streamController 的 cancel', () => {
      const inputCancel = jest.spyOn((view as any).inputController, 'cancel');
      const streamCancel = jest.spyOn((view as any).streamController, 'cancel');

      (view as any).handleCancel();

      expect(inputCancel).toHaveBeenCalledTimes(1);
      expect(streamCancel).toHaveBeenCalledTimes(1);
    });
  });

  // ─── rewind ────────────────────────────────────────────

  describe('handleRewind', () => {
    beforeEach(async () => {
      // 准备含 2 条消息的会话
      const convId = await (view as any).conversationController.ensureConversation();
      await (view as any).conversationController.addMessage({
        id: 'msg-1', role: 'user', content: 'first', timestamp: Date.now(),
      });
      await (view as any).conversationController.addMessage({
        id: 'msg-2', role: 'assistant', content: 'second', timestamp: Date.now(),
      });
    });

    test('确认框被拒绝时不移除消息', async () => {
      global.confirm = jest.fn().mockReturnValue(false);

      await (view as any).handleRewind('msg-1');

      const conv = await (view as any).conversationService.getConversation(
        (view as any).chatState.currentConversationId,
      );
      expect(conv.messages).toHaveLength(2);
    });

    test('确认后移除后续消息并提示', async () => {
      global.confirm = jest.fn().mockReturnValue(true);

      await (view as any).handleRewind('msg-1');

      const conv = await (view as any).conversationService.getConversation(
        (view as any).chatState.currentConversationId,
      );
      expect(conv.messages).toHaveLength(1);
      expect(conv.messages[0].id).toBe('msg-1');
      expect(mockNoticeMessages.some(m => m.startsWith('Rewound'))).toBe(true);
    });
  });

  // ─── fork ──────────────────────────────────────────────

  describe('handleFork', () => {
    test('达到 maxTabs 时 Notice 拒绝且不创建新 Tab', async () => {
      // 单 Tab 限制：重建 view 使 maxTabs=1
      await view.onClose();
      plugin.settings.maxTabs = 1;
      view = createView(1);
      await view.onOpen();

      await (view as any).handleFork('msg-x');

      expect((view as any).tabManager.getTabCount()).toBe(1);
      expect(mockNoticeMessages).toContain('Maximum tabs reached. Close a tab first.');
    });
  });

  // ─── restartRuntime ────────────────────────────────────

  describe('restartRuntime', () => {
    test('真正 stop 当前 runtime 并清空 inputController', async () => {
      (view as any).inputController.setRuntime(runtime);
      const stopSpy = (runtime.stop as jest.Mock);
      const resetSpy = (runtime.resetSession as jest.Mock);

      await view.restartRuntime();

      // Phase 2 §4.4：不再只是 resetSession，而是真正 stop 进程
      expect(stopSpy).toHaveBeenCalledTimes(1);
      expect(resetSpy).not.toHaveBeenCalled();
      expect((view as any).inputController.getRuntime()).toBeNull();
    });
  });

  // ─── copy ──────────────────────────────────────────────

  describe('handleCopy', () => {
    test('将消息内容写入剪贴板并提示', async () => {
      const writeText = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });

      const convId = await (view as any).conversationController.ensureConversation();
      await (view as any).conversationController.addMessage({
        id: 'msg-1', role: 'user', content: 'copy me', timestamp: Date.now(),
      });

      await (view as any).handleCopy('msg-1');

      expect(writeText).toHaveBeenCalledWith('copy me');
      expect(mockNoticeMessages).toContain('Copied to clipboard');
    });
  });

  // ─── Tab 操作 ──────────────────────────────────────────

  describe('Tab 操作', () => {    test('handleNewTab 创建新 Tab', () => {
      (view as any).handleNewTab();
      expect((view as any).tabManager.getTabCount()).toBe(2);
    });

    test('handleTabClick 切换 Tab 并同步 ChatState 会话 ID', async () => {
      // tab1 发送消息获得会话
      (runtime.sendMessage as jest.Mock).mockImplementation(async function* () {
        yield { type: 'text', content: 'ok' };
        yield { type: 'done' };
      });
      await (view as any).handleSend('first msg');
      const tab1 = (view as any).tabManager.getActiveTab();
      expect(tab1.state.conversationId).not.toBeNull();

      // 新建 tab2（无会话）
      (view as any).handleNewTab();
      const tab2 = (view as any).tabManager.getActiveTab();
      expect(tab2.state.conversationId).toBeNull();

      // 切回 tab1：激活状态与 ChatState 同步
      await (view as any).handleTabClick(tab1.id);
      expect((view as any).tabManager.getActiveTab().id).toBe(tab1.id);
      expect((view as any).chatState.currentConversationId).toBe(tab1.state.conversationId);
    });
  });

  // ─── 其他操作（Phase 3 前的当前行为契约，实现在 ViewActions） ──────────

  describe('其他操作', () => {
    // coming-soon 占位已由 Phase 3 真实实现替换（mention/slash/instruction/attach），原 Red 驱动用例移除

    test('triggerSlashCommand 打开命令面板并渲染全部内置命令', async () => {
      (view as any).triggerSlashCommand();

      const paletteEl = (view as any).commandPaletteEl;
      expect(paletteEl).not.toBeNull();
      const items = paletteEl.querySelectorAll('.kilo-command-item');
      expect(items.length).toBe(6);

      // 点击 /compact 应执行 handler（当前会话存在时压缩）
      const compactItem = items[0];
      const convId = await (view as any).conversationController.ensureConversation();
      await (view as any).conversationController.addMessage({
        id: 'msg-1', role: 'user', content: 'hello', timestamp: Date.now(),
      });
      compactItem.click();
      await new Promise(r => setTimeout(r, 10));
      const conv = await (view as any).conversationService.getConversation(convId);
      expect(conv.messages[0].role).toBe('system'); // compact 插入摘要
    });

    test('showInlineEditModal 打开 InlineEditModal', async () => {
      const { InlineEditModal } = await import('../../../src/features/inline-edit/InlineEditModal');
      const openSpy = jest.spyOn(InlineEditModal.prototype, 'open').mockImplementation(() => {});

      (view as any).viewActions.showInlineEditModal('selected text', {});

      expect(openSpy).toHaveBeenCalledTimes(1);
      openSpy.mockRestore();
    });

    test('inline-edit 命令在有选区时打开 InlineEditModal', async () => {
      const { InlineEditModal } = await import('../../../src/features/inline-edit/InlineEditModal');
      const openSpy = jest.spyOn(InlineEditModal.prototype, 'open').mockImplementation(() => {});

      const commands = (plugin.addCommand as jest.Mock).mock.calls.map(c => c[0]);
      const inlineEditCmd = commands.find(c => c.id === 'inline-edit');
      inlineEditCmd.editorCallback({ getSelection: () => 'selected' });

      expect(openSpy).toHaveBeenCalledTimes(1);
      openSpy.mockRestore();
    });

    test('handleAttachImage 委托 imageContext', async () => {
      const addFromFileSpy = jest.spyOn((view as any).imageContext, 'addFromFile').mockResolvedValue(undefined);

      await (view as any).viewActions.handleAttachImage();

      expect(addFromFileSpy).toHaveBeenCalledTimes(1);
      addFromFileSpy.mockRestore();
    });
  });
});
