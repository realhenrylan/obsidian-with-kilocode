/**
 * @jest-environment jsdom
 */

// tests/features/chat/ui/ImageContext.test.ts

import { ImageContext } from '../../../../src/features/chat/ui/ImageContext';

/**
 * Polyfill Obsidian DOM helpers (createDiv/createSpan/createEl)
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

describe('ImageContext', () => {
  let ctx: ImageContext;

  beforeAll(() => {
    polyfillObsidianDOM();
  });

  beforeEach(() => {
    ctx = new ImageContext(5); // 5MB limit
  });

  describe('基本状态', () => {
    test('初始状态无图片', () => {
      expect(ctx.hasImages()).toBe(false);
      expect(ctx.getImages()).toEqual([]);
    });
  });

  describe('clearImages', () => {
    test('清除所有图片', () => {
      (ctx as any).images = [
        { data: 'data:image/png;base64,abc', mimeType: 'image/png', name: 'test.png' },
      ];
      expect(ctx.hasImages()).toBe(true);

      ctx.clearImages();
      expect(ctx.hasImages()).toBe(false);
      expect(ctx.getImages()).toEqual([]);
    });
  });

  describe('removeImage', () => {
    test('移除指定索引的图片', () => {
      (ctx as any).images = [
        { data: 'a', mimeType: 'image/png', name: 'a.png' },
        { data: 'b', mimeType: 'image/jpeg', name: 'b.jpg' },
        { data: 'c', mimeType: 'image/png', name: 'c.png' },
      ];

      ctx.removeImage(1);
      expect(ctx.getImages()).toHaveLength(2);
      expect(ctx.getImages()[0].name).toBe('a.png');
      expect(ctx.getImages()[1].name).toBe('c.png');
    });

    test('越界索引不报错', () => {
      (ctx as any).images = [{ data: 'a', mimeType: 'image/png' }];

      ctx.removeImage(-1);
      expect(ctx.getImages()).toHaveLength(1);

      ctx.removeImage(5);
      expect(ctx.getImages()).toHaveLength(1);
    });
  });

  describe('onUpdate 回调', () => {
    test('clearImages 触发 onUpdate', () => {
      const onUpdate = jest.fn();
      ctx.setOnUpdate(onUpdate);

      ctx.clearImages();
      expect(onUpdate).toHaveBeenCalledTimes(1);
    });

    test('removeImage 触发 onUpdate', () => {
      const onUpdate = jest.fn();
      ctx.setOnUpdate(onUpdate);

      (ctx as any).images = [
        { data: 'a', mimeType: 'image/png' },
        { data: 'b', mimeType: 'image/png' },
      ];
      ctx.removeImage(0);
      expect(onUpdate).toHaveBeenCalledTimes(1);
    });

    test('removeImage 越界不触发 onUpdate', () => {
      const onUpdate = jest.fn();
      ctx.setOnUpdate(onUpdate);

      ctx.removeImage(0);
      expect(onUpdate).not.toHaveBeenCalled();
    });
  });

  describe('renderPreview', () => {
    let container: HTMLElement;

    beforeEach(() => {
      container = document.createElement('div');
    });

    test('无图片时不渲染', () => {
      ctx.renderPreview(container);
      expect(container.querySelector('.kilo-image-preview')).toBeNull();
    });

    test('有图片时渲染预览', () => {
      (ctx as any).images = [
        { data: 'data:image/png;base64,abc', mimeType: 'image/png', name: 'test.png' },
      ];

      ctx.renderPreview(container);

      const preview = container.querySelector('.kilo-image-preview');
      expect(preview).not.toBeNull();

      const items = preview!.querySelectorAll('.kilo-image-item');
      expect(items).toHaveLength(1);

      const img = items[0].querySelector('img');
      expect(img).not.toBeNull();
      expect(img!.getAttribute('src')).toBe('data:image/png;base64,abc');

      const removeBtn = items[0].querySelector('.kilo-image-remove');
      expect(removeBtn).not.toBeNull();
      expect(removeBtn!.textContent).toBe('×');
    });

    test('多次调用 renderPreview 不重复创建', () => {
      (ctx as any).images = [
        { data: 'a', mimeType: 'image/png' },
      ];

      ctx.renderPreview(container);
      ctx.renderPreview(container);

      const previews = container.querySelectorAll('.kilo-image-preview');
      expect(previews).toHaveLength(1);
    });
  });
});
