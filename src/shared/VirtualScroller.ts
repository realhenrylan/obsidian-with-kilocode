// src/shared/VirtualScroller.ts

export interface VirtualScrollerConfig {
  itemHeight: number;
  overscan: number;
}

export class VirtualScroller {
  private container: HTMLElement;
  private contentEl: HTMLElement;
  private items: any[] = [];
  private config: VirtualScrollerConfig;
  private renderItem: (item: any, index: number) => HTMLElement;
  private visibleItems: Map<number, HTMLElement> = new Map();

  constructor(
    container: HTMLElement,
    config: VirtualScrollerConfig,
    renderItem: (item: any, index: number) => HTMLElement
  ) {
    this.container = container;
    this.config = config;
    this.renderItem = renderItem;

    this.contentEl = container.createDiv({ cls: 'kilo-virtual-content' });
    container.addEventListener('scroll', () => this.onScroll());
  }

  setItems(items: any[]): void {
    this.items = items;
    this.updateTotalHeight();
    this.renderVisibleItems();
  }

  appendItem(item: any): void {
    this.items.push(item);
    this.updateTotalHeight();
    this.renderVisibleItems();
  }

  private updateTotalHeight(): void {
    const totalHeight = this.items.length * this.config.itemHeight;
    this.contentEl.style.height = `${totalHeight}px`;
  }

  private renderVisibleItems(): void {
    const scrollTop = this.container.scrollTop;
    const containerHeight = this.container.clientHeight;

    const startIndex = Math.max(0, Math.floor(scrollTop / this.config.itemHeight) - this.config.overscan);
    const endIndex = Math.min(
      this.items.length,
      Math.ceil((scrollTop + containerHeight) / this.config.itemHeight) + this.config.overscan
    );

    for (const [index, el] of this.visibleItems.entries()) {
      if (index < startIndex || index >= endIndex) {
        el.remove();
        this.visibleItems.delete(index);
      }
    }

    for (let i = startIndex; i < endIndex; i++) {
      if (!this.visibleItems.has(i)) {
        const el = this.renderItem(this.items[i], i);
        el.style.position = 'absolute';
        el.style.top = `${i * this.config.itemHeight}px`;
        el.style.width = '100%';
        this.contentEl.appendChild(el);
        this.visibleItems.set(i, el);
      }
    }
  }

  private onScroll(): void {
    requestAnimationFrame(() => this.renderVisibleItems());
  }

  scrollToBottom(): void {
    this.container.scrollTop = this.container.scrollHeight;
  }

  destroy(): void {
    this.contentEl.remove();
  }
}
