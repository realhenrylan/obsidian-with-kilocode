/**
 * @jest-environment jsdom
 */

// tests/features/inline-edit/runInlineEdit.test.ts
// 行为契约：plan 模式 prompt → 收集 AI 建议 → diff 预览 → Accept 写入 vault / Reject 取消

import { runInlineEdit, buildInlineEditPrompt } from '../../../src/features/inline-edit/runInlineEdit';
import { InlineEditModal } from '../../../src/features/inline-edit/InlineEditModal';
import { polyfillObsidianDOM } from '../../helpers/obsidianDom';

jest.mock('obsidian', () => {
  class Modal {
    app: any;
    contentEl: HTMLElement;
    isOpen = false;
    constructor(app: any) {
      this.app = app;
      this.contentEl = document.createElement('div');
    }
    open() {
      this.isOpen = true;
      this.onOpen?.();
    }
    close() {
      this.isOpen = false;
      this.onClose?.();
    }
  }
  return { Modal, App: class {}, TFile: class {} };
});

describe('buildInlineEditPrompt', () => {
  test('包含文件路径、选中文本与指令，且为只读 plan 语义', () => {
    const prompt = buildInlineEditPrompt('Notes/demo.md', 'old code', 'make it async');
    expect(prompt).toContain('Notes/demo.md');
    expect(prompt).toContain('old code');
    expect(prompt).toContain('make it async');
    expect(prompt).toContain('DO NOT write any files');
  });
});

describe('runInlineEdit', () => {
  let runtime: { sendMessage: jest.Mock };
  let vault: { modify: jest.Mock };
  let notice: jest.Mock;
  let getRuntime: jest.Mock;
  let getActiveFile: jest.Mock;
  let deps: any;
  let capturedModal: any;
  let openSpy: jest.SpyInstance;

  function makeStream(...chunks: any[]) {
    return async function* () {
      for (const c of chunks) yield c;
    };
  }

  beforeEach(() => {
    polyfillObsidianDOM();
    runtime = { sendMessage: jest.fn() };
    vault = { modify: jest.fn().mockResolvedValue(undefined) };
    notice = jest.fn();
    getRuntime = jest.fn().mockReturnValue(runtime);
    getActiveFile = jest.fn().mockReturnValue({ path: 'Notes/demo.md' });
    deps = {
      app: {},
      vault,
      getRuntime,
      getActiveFile,
      notice,
    };
    // 捕获 runInlineEdit 内部创建的 diff modal 实例
    capturedModal = null;
    openSpy = jest.spyOn(InlineEditModal.prototype, 'open').mockImplementation(function (this: any) {
      capturedModal = this;
      this.isOpen = true;
      this.onOpen();
    });
  });

  afterEach(() => {
    openSpy.mockRestore();
  });

  function diffEl(): HTMLElement | null {
    return capturedModal ? capturedModal.contentEl.querySelector('.kilo-diff-viewer') : null;
  }

  test('无活动文件时提示且不调用 runtime', async () => {
    getActiveFile.mockReturnValue(null);
    await runInlineEdit(deps, 'old', 'edit it');
    expect(runtime.sendMessage).not.toHaveBeenCalled();
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('note'));
  });

  test('runtime 不可用时提示', async () => {
    getRuntime.mockReturnValue(null);
    await runInlineEdit(deps, 'old', 'edit it');
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('runtime'));
  });

  test('成功流程：收集 AI 文本 → diff 预览 → Accept 写入 vault', async () => {
    runtime.sendMessage.mockImplementation(makeStream(
      { type: 'text', content: 'new ' },
      { type: 'text', content: 'content' },
      { type: 'done' },
    ));

    await runInlineEdit(deps, 'old text', 'rewrite it');

    // 消息发给了 runtime
    expect(runtime.sendMessage).toHaveBeenCalledTimes(1);
    const prompt = runtime.sendMessage.mock.calls[0][0];
    expect(prompt).toContain('old text');

    // diff 预览 modal 打开，Accept 写入 vault
    expect(capturedModal).not.toBeNull();
    const diff = diffEl();
    expect(diff).not.toBeNull();
    const acceptBtn = diff!.querySelector('.kilo-btn-primary') as HTMLButtonElement;
    expect(acceptBtn).not.toBeNull();
    acceptBtn.click();
    // onAccept 为 async 回调，等待微任务完成后再断言
    await new Promise(r => setTimeout(r, 0));

    expect(vault.modify).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'Notes/demo.md' }),
      'new content',
    );
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('applied'));
  });

  test('AI 返回 error chunk 时提示失败且不打开 diff', async () => {
    runtime.sendMessage.mockImplementation(makeStream(
      { type: 'error', error: 'CLI exploded' },
      { type: 'done' },
    ));

    await runInlineEdit(deps, 'old', 'edit');

    expect(notice).toHaveBeenCalledWith(expect.stringContaining('CLI exploded'));
    expect(capturedModal).toBeNull();
    expect(vault.modify).not.toHaveBeenCalled();
  });

  test('AI 未返回任何文本时提示无修改', async () => {
    runtime.sendMessage.mockImplementation(makeStream({ type: 'done' }));

    await runInlineEdit(deps, 'old', 'edit');

    expect(notice).toHaveBeenCalledWith(expect.stringContaining('no changes'));
    expect(capturedModal).toBeNull();
  });

  test('Reject 不写入 vault', async () => {
    runtime.sendMessage.mockImplementation(makeStream(
      { type: 'text', content: 'new content' },
      { type: 'done' },
    ));

    await runInlineEdit(deps, 'old text', 'rewrite it');

    const diff = diffEl();
    const rejectBtn = diff!.querySelector('.kilo-btn-cancel') as HTMLButtonElement;
    rejectBtn.click();

    expect(vault.modify).not.toHaveBeenCalled();
  });
});
