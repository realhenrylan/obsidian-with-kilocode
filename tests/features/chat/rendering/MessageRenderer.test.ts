/**
 * @jest-environment jsdom
 */

// tests/features/chat/rendering/MessageRenderer.test.ts

import { MessageRenderer } from '../../../../src/features/chat/rendering/MessageRenderer';
import type { Message, ContentBlock } from '../../../../src/core/types';

// Mock Obsidian — renderMarkdown 在目标容器中创建 <pre><code> 结构
jest.mock('obsidian', () => ({
  App: class {},
  Component: class {},
  MarkdownRenderer: {
    renderMarkdown: jest.fn((content: string, el: HTMLElement) => {
      // 模拟 Obsidian 的代码块渲染：` ```lang\ncode\n``` → <pre><code class="language-lang">code</code></pre>  `
      const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
      let match;
      let lastIndex = 0;
      let hasContent = false;

      while ((match = codeBlockRegex.exec(content)) !== null) {
        hasContent = true;
        // 代码块之前的文本
        const before = content.slice(lastIndex, match.index);
        if (before) el.createSpan({ text: before });

        const pre = el.createEl('pre');
        const code = pre.createEl('code', {
          cls: match[1] ? `language-${match[1]}` : '',
          text: match[2],
        });

        lastIndex = match.index + match[0].length;
      }

      if (!hasContent) {
        el.createSpan({ text: content });
      } else {
        const after = content.slice(lastIndex);
        if (after) el.createSpan({ text: after });
      }
    }),
  },
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

  // ============================================
  // 代码块优化测试
  // ============================================

  test('代码块被包裹到 .kilo-code-wrapper', () => {
    const message: Message = {
      id: 'msg-code',
      role: 'assistant',
      content: '```javascript\nconsole.log("hello");\n```',
      timestamp: Date.now(),
    };

    renderer.renderMessage(message);

    const wrapper = container.querySelector('.kilo-code-wrapper');
    expect(wrapper).not.toBeNull();
    expect(wrapper!.querySelector('pre')).not.toBeNull();
  });

  test('代码块显示语言标签', () => {
    const message: Message = {
      id: 'msg-lang',
      role: 'assistant',
      content: '```python\nprint("hello")\n```',
      timestamp: Date.now(),
    };

    renderer.renderMessage(message);

    const langLabel = container.querySelector('.kilo-code-lang');
    expect(langLabel).not.toBeNull();
    expect(langLabel!.textContent).toBe('python');
  });

  test('代码块有复制按钮', () => {
    const message: Message = {
      id: 'msg-copy',
      role: 'assistant',
      content: '```typescript\nconst x = 1;\n```',
      timestamp: Date.now(),
    };

    renderer.renderMessage(message);

    const copyBtn = container.querySelector('.kilo-code-copy');
    expect(copyBtn).not.toBeNull();
    expect(copyBtn!.textContent).toBe('Copy');
  });

  test('无语言标识时显示 code', () => {
    const message: Message = {
      id: 'msg-nolang',
      role: 'assistant',
      content: '```\nplain code\n```',
      timestamp: Date.now(),
    };

    renderer.renderMessage(message);

    const langLabel = container.querySelector('.kilo-code-lang');
    expect(langLabel).not.toBeNull();
    expect(langLabel!.textContent).toBe('code');
  });

  // ============================================
  // ContentBlock 类型测试
  // ============================================

  test('Message 支持 contentBlocks 字段', () => {
    const blocks: ContentBlock[] = [
      { type: 'thinking', content: 'Let me think...' },
      { type: 'text', content: 'Here is the answer.' },
    ];
    const message: Message = {
      id: 'msg-blocks',
      role: 'assistant',
      content: 'Here is the answer.',
      timestamp: Date.now(),
      thinking: 'Let me think...',
      contentBlocks: blocks,
    };

    expect(message.contentBlocks).toHaveLength(2);
    expect(message.contentBlocks![0].type).toBe('thinking');
    expect(message.contentBlocks![1].type).toBe('text');
  });
});
