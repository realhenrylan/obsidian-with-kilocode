/**
 * @jest-environment jsdom
 */

// tests/features/inline-edit/InlineEditModal.test.ts
// 行为契约：输入指令回调、空输入拒绝、取消关闭

import { InlineEditModal } from '../../../src/features/inline-edit/InlineEditModal';
import { polyfillObsidianDOM } from '../../helpers/obsidianDom';

let mockNoticeMessages: string[] = [];

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
      this.onOpen();
    }
    close() {
      this.isOpen = false;
      this.onClose();
    }
  }
  class Notice {
    message: string;
    constructor(message: string, _timeout?: number) {
      this.message = message;
      mockNoticeMessages.push(message);
    }
  }
  return { Modal, Notice };
});

describe('InlineEditModal', () => {
  let modal: InlineEditModal;
  let onSubmit: jest.Mock;

  function openModal(selectedText = 'selected code', cb = onSubmit): InlineEditModal {
    const m = new InlineEditModal({} as any, selectedText, cb);
    m.open();
    return m;
  }

  beforeAll(() => {
    polyfillObsidianDOM();
  });

  beforeEach(() => {
    onSubmit = jest.fn();
  });

  test('onOpen 渲染选中文本预览', () => {
    modal = openModal('function foo() {}');
    const codeEl = modal.contentEl.querySelector('pre code');
    expect(codeEl).not.toBeNull();
    expect(codeEl!.textContent).toBe('function foo() {}');
  });

  test('输入指令后回车提交回调', () => {
    modal = openModal('old text');
    const textarea = modal.contentEl.querySelector('.kilo-instruction-textarea') as HTMLTextAreaElement;

    // 输入指令
    textarea.value = 'refactor to arrow function';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    // 按 Enter 提交
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(onSubmit).toHaveBeenCalledWith('refactor to arrow function');
    expect(modal.isOpen).toBe(false);
  });

  test('空输入拒绝提交', () => {
    modal = openModal('old text');
    const textarea = modal.contentEl.querySelector('.kilo-instruction-textarea') as HTMLTextAreaElement;

    textarea.value = '   ';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(modal.isOpen).toBe(true);
  });

  test('点击 Edit 按钮提交回调', () => {
    modal = openModal('old text');
    const textarea = modal.contentEl.querySelector('.kilo-instruction-textarea') as HTMLTextAreaElement;
    textarea.value = 'add comments';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    const editBtn = modal.contentEl.querySelector('.kilo-btn-primary') as HTMLButtonElement;
    editBtn.click();

    expect(onSubmit).toHaveBeenCalledWith('add comments');
  });

  test('点击 Cancel 按钮关闭但不提交', () => {
    modal = openModal('old text');
    const cancelBtn = modal.contentEl.querySelector('.kilo-btn-cancel') as HTMLButtonElement;
    cancelBtn.click();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(modal.isOpen).toBe(false);
  });

  test('Esc 键关闭', () => {
    modal = openModal('old text');
    const textarea = modal.contentEl.querySelector('.kilo-instruction-textarea') as HTMLTextAreaElement;
    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(modal.isOpen).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // ─── diff 预览模式（Phase 3 §5.4） ─────────────────────────────

  test('showDiff 模式渲染 DiffViewer（attachDiff 前无 diff 区）', () => {
    modal = new InlineEditModal({} as any, 'old', () => {}, true);
    modal.open();
    expect(modal.contentEl.querySelector('.kilo-diff-viewer')).toBeNull();

    modal.attachDiff('old text', 'new text');
    expect(modal.contentEl.querySelector('.kilo-diff-viewer')).not.toBeNull();
    // diff 模式下不渲染指令输入区（DiffViewer 自带 Accept/Reject 按钮）
    expect(modal.contentEl.querySelector('.kilo-instruction-textarea')).toBeNull();
  });

  test('attachDiff 后 Accept 触发 onAccept（带新文本）并关闭', () => {
    const onAccept = jest.fn();
    modal = new InlineEditModal({} as any, 'old', () => {}, true);
    modal.onAccept(onAccept);
    modal.open();
    modal.attachDiff('old text', 'new text');

    const acceptBtn = modal.contentEl.querySelector('.kilo-btn-primary') as HTMLButtonElement;
    expect(acceptBtn).not.toBeNull();
    acceptBtn.click();

    expect(onAccept).toHaveBeenCalledWith('new text');
    expect(modal.isOpen).toBe(false);
  });

  test('attachDiff 后 Reject 触发 onReject 并关闭', () => {
    const onReject = jest.fn();
    modal = new InlineEditModal({} as any, 'old', () => {}, true);
    modal.onReject(onReject);
    modal.open();
    modal.attachDiff('old text', 'new text');

    const rejectBtn = modal.contentEl.querySelector('.kilo-btn-cancel') as HTMLButtonElement;
    expect(rejectBtn).not.toBeNull();
    rejectBtn.click();

    expect(onReject).toHaveBeenCalled();
    expect(modal.isOpen).toBe(false);
  });

  test('非 diff 模式 attachDiff 前不渲染 diff 区', () => {
    modal = openModal('old text');
    expect(modal.contentEl.querySelector('.kilo-diff-viewer')).toBeNull();
  });
});
