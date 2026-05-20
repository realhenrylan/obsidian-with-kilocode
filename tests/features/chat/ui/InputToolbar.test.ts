/**
 * @jest-environment jsdom
 */

// tests/features/chat/ui/InputToolbar.test.ts

import { InputToolbar } from '../../../../src/features/chat/ui/InputToolbar';
import type { ToolbarAction } from '../../../../src/features/chat/ui/InputToolbar';

/**
 * Polyfill Obsidian DOM helpers (createDiv/createSpan/createEl)
 * Obsidian extends HTMLElement with these methods; jsdom doesn't have them.
 */
function polyfillObsidianDOM(): void {
  const proto = HTMLElement.prototype as any;

  if (!proto.createEl) {
    proto.createEl = function (tag: string, attrs?: Record<string, any>): HTMLElement {
      const el = document.createElement(tag);
      if (attrs) {
        if (attrs.cls) {
          el.className = Array.isArray(attrs.cls) ? attrs.cls.join(' ') : attrs.cls;
        }
        if (attrs.text) el.textContent = attrs.text;
        if (attrs.title) el.title = attrs.title;
        if (attrs.attr) {
          for (const [key, val] of Object.entries(attrs.attr)) {
            el.setAttribute(key, String(val));
          }
        }
      }
      this.appendChild(el);
      return el;
    };
  }

  if (!proto.createDiv) {
    proto.createDiv = function (attrs?: Record<string, any>): HTMLElement {
      return this.createEl('div', attrs);
    };
  }

  if (!proto.createSpan) {
    proto.createSpan = function (attrs?: Record<string, any>): HTMLElement {
      return this.createEl('span', attrs);
    };
  }
}

describe('InputToolbar', () => {
  let container: HTMLElement;
  let toolbar: InputToolbar;

  beforeAll(() => {
    polyfillObsidianDOM();
  });

  beforeEach(() => {
    container = document.createElement('div');
    toolbar = new InputToolbar(container);
  });

  describe('render', () => {
    test('渲染工具栏元素', () => {
      const handler = jest.fn();
      toolbar.setActions([
        { id: 'btn1', icon: '@', label: 'Mention', handler },
        { id: 'btn2', icon: '/', label: 'Command', handler },
      ]);
      toolbar.render();

      const toolbarEl = container.querySelector('.kilo-input-toolbar');
      expect(toolbarEl).not.toBeNull();

      const buttons = toolbarEl!.querySelectorAll('.kilo-toolbar-btn');
      expect(buttons).toHaveLength(2);
      expect(buttons[0].textContent).toBe('@');
      expect(buttons[1].textContent).toBe('/');
    });

    test('按钮点击调用 handler', () => {
      const handler = jest.fn();
      toolbar.setActions([
        { id: 'test-btn', icon: '🎯', label: 'Test', handler },
      ]);
      toolbar.render();

      const btn = container.querySelector('.kilo-toolbar-btn') as HTMLElement;
      btn.click();
      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('active 状态的按钮有 kilo-toolbar-btn-active 类', () => {
      toolbar.setActions([
        { id: 'active-btn', icon: '📝', label: 'Active', active: true, handler: jest.fn() },
        { id: 'inactive-btn', icon: '📎', label: 'Inactive', handler: jest.fn() },
      ]);
      toolbar.render();

      const buttons = container.querySelectorAll('.kilo-toolbar-btn');
      expect(buttons[0].classList.contains('kilo-toolbar-btn-active')).toBe(true);
      expect(buttons[1].classList.contains('kilo-toolbar-btn-active')).toBe(false);
    });

    test('data-action-id 属性正确设置', () => {
      toolbar.setActions([
        { id: 'my-action', icon: '⚡', label: 'My Action', handler: jest.fn() },
      ]);
      toolbar.render();

      const btn = container.querySelector('.kilo-toolbar-btn') as HTMLElement;
      expect(btn.dataset.actionId).toBe('my-action');
    });
  });

  describe('updateButton', () => {
    test('更新按钮 active 状态', () => {
      toolbar.setActions([
        { id: 'toggle', icon: '📝', label: 'Toggle', handler: jest.fn() },
      ]);
      toolbar.render();

      const btn = container.querySelector('.kilo-toolbar-btn') as HTMLElement;
      expect(btn.classList.contains('kilo-toolbar-btn-active')).toBe(false);

      toolbar.updateButton('toggle', true);
      expect(btn.classList.contains('kilo-toolbar-btn-active')).toBe(true);

      toolbar.updateButton('toggle', false);
      expect(btn.classList.contains('kilo-toolbar-btn-active')).toBe(false);
    });

    test('不存在的 actionId 不报错', () => {
      toolbar.setActions([
        { id: 'real', icon: '📎', label: 'Real', handler: jest.fn() },
      ]);
      toolbar.render();

      toolbar.updateButton('nonexistent', true);
    });

    test('未渲染时不报错', () => {
      toolbar.updateButton('any', true);
    });
  });

  describe('destroy', () => {
    test('销毁后移除工具栏元素', () => {
      toolbar.setActions([
        { id: 'btn', icon: '📎', label: 'Attach', handler: jest.fn() },
      ]);
      toolbar.render();

      expect(container.querySelector('.kilo-input-toolbar')).not.toBeNull();

      toolbar.destroy();
      expect(container.querySelector('.kilo-input-toolbar')).toBeNull();
    });

    test('未渲染时不报错', () => {
      toolbar.destroy();
    });
  });

  describe('多次 render', () => {
    test('重复 render 替换旧工具栏', () => {
      toolbar.setActions([
        { id: 'first', icon: '1️⃣', label: 'First', handler: jest.fn() },
      ]);
      toolbar.render();

      toolbar.setActions([
        { id: 'second', icon: '2️⃣', label: 'Second', handler: jest.fn() },
      ]);
      toolbar.render();

      const toolbars = container.querySelectorAll('.kilo-input-toolbar');
      expect(toolbars).toHaveLength(1);

      const buttons = toolbars[0].querySelectorAll('.kilo-toolbar-btn');
      expect(buttons).toHaveLength(1);
      expect(buttons[0].textContent).toBe('2️⃣');
    });
  });
});
