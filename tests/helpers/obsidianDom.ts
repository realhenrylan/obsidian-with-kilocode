// tests/helpers/obsidianDom.ts
// Obsidian DOM helpers polyfill（createDiv/createSpan/createEl/empty/addClass 等）
// Obsidian 通过扩展 HTMLElement 提供这些方法，jsdom 原生没有。
// 供所有需要渲染 DOM 的测试复用（KiloCodeView / MessageRenderer / SettingsTab 等）。

interface DomAttrs {
  cls?: string | string[];
  text?: string;
  title?: string;
  placeholder?: string;
  type?: string;
  attr?: Record<string, string>;
  value?: string;
}

declare global {
  interface HTMLElement {
    createEl<K extends keyof HTMLElementTagNameMap>(
      tag: K,
      attrs?: DomAttrs
    ): HTMLElementTagNameMap[K];
    createDiv(attrs?: DomAttrs): HTMLDivElement;
    createSpan(attrs?: DomAttrs): HTMLSpanElement;
    empty(): void;
    addClass(...classes: string[]): void;
    removeClass(...classes: string[]): void;
    setAttr(attr: string, value: string): void;
    getAttr(attr: string): string | null;
  }
}

export function polyfillObsidianDOM(): void {
  const proto = HTMLElement.prototype as any;

  if (!proto.createEl) {
    proto.createEl = function (tag: string, attrs?: DomAttrs): HTMLElement {
      const el = document.createElement(tag);
      if (attrs) {
        if (attrs.cls) {
          el.className = Array.isArray(attrs.cls) ? attrs.cls.join(' ') : attrs.cls;
        }
        if (attrs.text !== undefined) el.textContent = attrs.text;
        if (attrs.title) el.title = attrs.title;
        if (attrs.placeholder) el.setAttribute('placeholder', attrs.placeholder);
        if (attrs.type) el.setAttribute('type', attrs.type);
        if (attrs.value) el.setAttribute('value', attrs.value);
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
    proto.createDiv = function (attrs?: DomAttrs): HTMLElement {
      return this.createEl('div', attrs);
    };
  }

  if (!proto.createSpan) {
    proto.createSpan = function (attrs?: DomAttrs): HTMLElement {
      return this.createEl('span', attrs);
    };
  }

  if (!proto.empty) {
    proto.empty = function (): void {
      while (this.firstChild) {
        this.removeChild(this.firstChild);
      }
    };
  }

  if (!proto.addClass) {
    proto.addClass = function (...classes: string[]): void {
      this.classList.add(...classes);
    };
  }

  if (!proto.removeClass) {
    proto.removeClass = function (...classes: string[]): void {
      this.classList.remove(...classes);
    };
  }

  if (!proto.setAttr) {
    proto.setAttr = function (attr: string, value: string): void {
      this.setAttribute(attr, value);
    };
  }

  if (!proto.getAttr) {
    proto.getAttr = function (attr: string): string | null {
      return this.getAttribute(attr);
    };
  }
}
