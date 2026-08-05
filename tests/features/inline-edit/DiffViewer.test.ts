/**
 * @jest-environment jsdom
 */

// tests/features/inline-edit/DiffViewer.test.ts
// 行为契约：新增行绿色、删除行红色、相等行无 diff 标记、接受/拒绝事件

import { DiffViewer } from '../../../src/features/inline-edit/DiffViewer';
import { polyfillObsidianDOM } from '../../helpers/obsidianDom';

describe('DiffViewer', () => {
  let container: HTMLElement;

  beforeAll(() => {
    polyfillObsidianDOM();
  });

  beforeEach(() => {
    container = document.createElement('div');
  });

  test('新增行标记为 kilo-diff-add（绿色）', () => {
    const viewer = new DiffViewer(container, 'line1', 'line1\nline2');
    viewer.render();

    const addLine = container.querySelector('.kilo-diff-add');
    expect(addLine).not.toBeNull();
    expect(addLine!.textContent).toContain('line2');
    expect(addLine!.className).toContain('kilo-diff-add');
  });

  test('删除行标记为 kilo-diff-del（红色）', () => {
    const viewer = new DiffViewer(container, 'line1\nline2', 'line1');
    viewer.render();

    const delLine = container.querySelector('.kilo-diff-del');
    expect(delLine).not.toBeNull();
    expect(delLine!.textContent).toContain('line2');
    expect(delLine!.className).toContain('kilo-diff-del');
  });

  test('相等文本渲染为 kilo-diff-unchanged 且无增删标记', () => {
    const viewer = new DiffViewer(container, 'same', 'same');
    viewer.render();

    const unchanged = container.querySelector('.kilo-diff-unchanged');
    expect(unchanged).not.toBeNull();
    expect(unchanged!.textContent).toContain('same');
    expect(container.querySelector('.kilo-diff-add')).toBeNull();
    expect(container.querySelector('.kilo-diff-del')).toBeNull();
  });

  test('Accept 按钮触发 diff-accepted 事件（携带 newText）', () => {
    const viewer = new DiffViewer(container, 'old', 'new');
    viewer.render();

    const listener = jest.fn();
    container.addEventListener('diff-accepted', listener);
    (container.querySelector('.kilo-btn-primary') as HTMLButtonElement).click();

    expect(listener).toHaveBeenCalled();
    expect(listener.mock.calls[0][0].detail.newText).toBe('new');
  });

  test('Reject 按钮触发 diff-rejected 事件', () => {
    const viewer = new DiffViewer(container, 'old', 'new');
    viewer.render();

    const listener = jest.fn();
    container.addEventListener('diff-rejected', listener);
    (container.querySelector('.kilo-btn-cancel') as HTMLButtonElement).click();

    expect(listener).toHaveBeenCalled();
  });
});
