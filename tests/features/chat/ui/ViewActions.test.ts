/**
 * @jest-environment jsdom
 */

// tests/features/chat/ui/ViewActions.test.ts
// 行为契约：Inline Edit 命令 → 指令输入 → inlineEditRunner 桥接（§5.4）

import { ViewActions, type ViewActionsDeps } from '../../../../src/features/chat/ui/ViewActions';
import { InlineEditModal } from '../../../../src/features/inline-edit/InlineEditModal';
import { polyfillObsidianDOM } from '../../../helpers/obsidianDom';

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
  return { Modal, App: class {} };
});

function createDeps(overrides?: Partial<ViewActionsDeps>): ViewActionsDeps {
  return {
    app: {},
    addCommand: jest.fn(),
    getInputContainerEl: () => document.createElement('div'),
    imageContext: { addFromFile: jest.fn(), renderPreview: jest.fn() },
    currentNoteContext: { toggle: jest.fn() },
    notice: jest.fn(),
    commandRegistry: null,
    inlineEditRunner: jest.fn(),
    ...overrides,
  } as any;
}

describe('ViewActions inline edit', () => {
  beforeAll(() => {
    polyfillObsidianDOM();
  });

  test('registerInlineEditCommand 注册命令并带快捷键', () => {
    const deps = createDeps();
    const actions = new ViewActions(deps);
    actions.registerInlineEditCommand();

    expect(deps.addCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'inline-edit',
        hotkeys: expect.arrayContaining([
          expect.objectContaining({ modifiers: expect.arrayContaining(['Ctrl', 'Shift']), key: 'e' }),
        ]),
      })
    );
  });

  test('无选区时不打开 modal', () => {
    const deps = createDeps();
    const actions = new ViewActions(deps);
    actions.registerInlineEditCommand();
    const cmd = (deps.addCommand as jest.Mock).mock.calls[0][0];

    const openSpy = jest.spyOn(InlineEditModal.prototype, 'open').mockImplementation(() => {});
    cmd.editorCallback({ getSelection: () => '' });
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  test('有选区时打开指令输入 modal', () => {
    const deps = createDeps();
    const actions = new ViewActions(deps);
    actions.registerInlineEditCommand();
    const cmd = (deps.addCommand as jest.Mock).mock.calls[0][0];

    const openSpy = jest.spyOn(InlineEditModal.prototype, 'open').mockImplementation(() => {});
    cmd.editorCallback({ getSelection: () => 'selected text' });
    expect(openSpy).toHaveBeenCalled();
    openSpy.mockRestore();
  });

  test('提交指令后调用 inlineEditRunner（带选中文本与指令）', () => {
    const deps = createDeps();
    const actions = new ViewActions(deps);

    let capturedModal: any = null;
    const openSpy = jest.spyOn(InlineEditModal.prototype, 'open').mockImplementation(function (this: any) {
      capturedModal = this;
      this.isOpen = true;
      this.onOpen();
    });
    (actions as any).showInlineEditModal('selected code', {});
    openSpy.mockRestore();

    const textarea = capturedModal.contentEl.querySelector('.kilo-instruction-textarea') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    textarea.value = 'make it async';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(deps.inlineEditRunner).toHaveBeenCalledWith('selected code', 'make it async');
  });
});
