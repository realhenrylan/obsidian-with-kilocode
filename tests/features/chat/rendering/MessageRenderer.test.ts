/**
 * @jest-environment jsdom
 */

// tests/features/chat/rendering/MessageRenderer.test.ts

import { MessageRenderer } from '../../../../src/features/chat/rendering/MessageRenderer';
import type { Message } from '../../../../src/core/types';

// Mock Obsidian
jest.mock('obsidian', () => ({
  App: class {},
  Component: class {},
  MarkdownRenderer: { renderMarkdown: jest.fn() },
}));

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
          if (Array.isArray(attrs.cls)) {
            el.className = attrs.cls.join(' ');
          } else {
            el.className = attrs.cls;
          }
        }
        if (attrs.text) el.textContent = attrs.text;
        if (attrs.title) el.title = attrs.title;
        if (attrs.attr) {
          for (const [key, val] of Object.entries(attrs.attr)) {
            el.setAttribute(key, String(val));
          }
        }
        if (attrs.type) el.setAttribute('type', attrs.type);
        if (attrs.placeholder) el.setAttribute('placeholder', attrs.type);
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

describe('MessageRenderer', () => {
  let container: HTMLElement;
  let renderer: MessageRenderer;

  beforeAll(() => {
    polyfillObsidianDOM();
  });

  beforeEach(() => {
    container = document.createElement('div');
    renderer = new MessageRenderer(container, {} as any);
  });

  test('renderMessage 渲染消息操作按钮', () => {
    const message: Message = {
      id: 'msg-1',
      role: 'user',
      content: 'Hello',
      timestamp: Date.now(),
    };

    renderer.renderMessage(message);

    const actionsEl = container.querySelector('.kilo-message-actions');
    expect(actionsEl).not.toBeNull();

    const buttons = actionsEl!.querySelectorAll('.kilo-action-btn');
    expect(buttons.length).toBeGreaterThanOrEqual(3); // rewind, fork, copy
  });

  test('操作按钮包含正确的 title', () => {
    const message: Message = {
      id: 'msg-1',
      role: 'assistant',
      content: 'Response',
      timestamp: Date.now(),
    };

    renderer.renderMessage(message);

    const buttons = container.querySelectorAll('.kilo-action-btn');
    const titles = Array.from(buttons).map(b => b.getAttribute('title'));
    expect(titles).toContain('Rewind to here');
    expect(titles).toContain('Fork from here');
    expect(titles).toContain('Copy');
  });

  test('操作按钮包含正确的 data-action 和 data-message-id', () => {
    const message: Message = {
      id: 'msg-42',
      role: 'user',
      content: 'Test',
      timestamp: Date.now(),
    };

    renderer.renderMessage(message);

    const rewindBtn = container.querySelector('[data-action="rewind"]');
    const forkBtn = container.querySelector('[data-action="fork"]');
    const copyBtn = container.querySelector('[data-action="copy"]');

    expect(rewindBtn).not.toBeNull();
    expect(forkBtn).not.toBeNull();
    expect(copyBtn).not.toBeNull();

    expect(rewindBtn!.getAttribute('data-message-id')).toBe('msg-42');
    expect(forkBtn!.getAttribute('data-message-id')).toBe('msg-42');
    expect(copyBtn!.getAttribute('data-message-id')).toBe('msg-42');
  });
});
