// src/shared/VirtualScroller.ts

export interface VirtualScrollerConfig {
  /** 估算行高：未测量的项用该值占位，挂载后按实测高度修正（§7.6.1 动态高度） */
  itemHeight: number;
  overscan: number;
}

/**
 * 虚拟滚动器（动态高度版）：
 * - 每项高度先按估算值参与布局，渲染后用 getBoundingClientRect 实测回填；
 * - 前缀和（offsets）支持 O(log n) 定位滚动位置对应的项；
 * - 实测高度与缓存差异超过 1px 时触发一次重排，滚动跳动显著减小。
 */
export class VirtualScroller<T = unknown> {
  private container: HTMLElement;
  private contentEl: HTMLElement;
  private items: T[] = [];
  private config: VirtualScrollerConfig;
  private renderItem: (item: T, index: number) => HTMLElement;
  private visibleItems: Map<number, HTMLElement> = new Map();
  // 每项高度（未测 = estimate）与前缀和 offsets[i] = 第 i 项的 top
  private heights: number[] = [];
  private offsets: number[] = [];
  // 同帧内渲染的多项合并为一次测量批处理
  private pendingMeasure: Array<{ el: HTMLElement; index: number }> = [];
  private measureScheduled = false;

  constructor(
    container: HTMLElement,
    config: VirtualScrollerConfig,
    renderItem: (item: T, index: number) => HTMLElement
  ) {
    this.container = container;
    this.config = config;
    this.renderItem = renderItem;

    this.contentEl = container.createDiv({ cls: 'kilo-virtual-content' });
    container.addEventListener('scroll', () => this.onScroll());
  }

  setItems(items: T[]): void {
    this.items = items;
    this.heights = new Array(items.length).fill(this.config.itemHeight);
    this.recalcOffsets();
    this.renderVisibleItems();
  }

  appendItem(item: T): void {
    this.items.push(item);
    this.heights.push(this.config.itemHeight);
    this.recalcOffsets();
    this.renderVisibleItems();
  }

  /** 第 i 项的 top 偏移（前缀和） */
  private offsetOf(index: number): number {
    return this.offsets[index] ?? 0;
  }

  private recalcOffsets(): void {
    const offsets = new Array<number>(this.items.length + 1);
    offsets[0] = 0;
    for (let i = 0; i < this.items.length; i++) {
      offsets[i + 1] = offsets[i] + this.heights[i];
    }
    this.offsets = offsets;
    const totalHeight = offsets[this.items.length] ?? 0;
    this.contentEl.style.height = `${totalHeight}px`;
  }

  /** 二分查找 scrollTop 落在第几项 */
  private indexAt(pixel: number): number {
    let lo = 0;
    let hi = this.items.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.offsets[mid] <= pixel) lo = mid;
      else hi = mid - 1;
    }
    return Math.max(0, lo);
  }

  private totalHeight(): number {
    return this.offsets[this.items.length] ?? 0;
  }

  private renderVisibleItems(): void {
    if (this.items.length === 0) return;
    const scrollTop = this.container.scrollTop;
    const containerHeight = this.container.clientHeight;

    const startIndex = Math.max(0, this.indexAt(scrollTop) - this.config.overscan);
    let endIndex = this.indexAt(scrollTop + containerHeight) + 1 + this.config.overscan;
    endIndex = Math.min(this.items.length, Math.max(endIndex, startIndex + 1));

    for (const [index, el] of this.visibleItems.entries()) {
      if (index < startIndex || index >= endIndex) {
        el.remove();
        this.visibleItems.delete(index);
      }
    }

    for (let i = startIndex; i < endIndex; i++) {
      if (!this.visibleItems.has(i)) {
        const el = this.renderItem(this.items[i], i);
        el.setCssStyles({
          position: 'absolute',
          top: `${this.offsetOf(i)}px`,
          width: '100%',
        });
        this.contentEl.appendChild(el);
        this.visibleItems.set(i, el);
        this.scheduleMeasure(el, i);
      }
    }
  }

  /** 渲染后实测高度：与缓存差异 >1px 时更新并重排；同帧多项合并为一批测量 */
  private scheduleMeasure(el: HTMLElement, index: number): void {
    this.pendingMeasure.push({ el, index });
    if (this.measureScheduled) return;
    this.measureScheduled = true;
    window.requestAnimationFrame(() => {
      this.measureScheduled = false;
      const batch = this.pendingMeasure.splice(0);
      let changed = false;
      for (const { el, index } of batch) {
        const actual = el.getBoundingClientRect().height;
        if (actual > 0 && Math.abs(actual - this.heights[index]) > 1) {
          this.heights[index] = actual;
          changed = true;
        }
      }
      if (changed) {
        // 记录当前锚点项与偏移，重排后保持视觉位置稳定
        const anchorScrollTop = this.container.scrollTop;
        const anchorIndex = this.indexAt(anchorScrollTop);
        const anchorOffsetInItem = anchorScrollTop - this.offsetOf(anchorIndex);

        this.recalcOffsets();
        for (const [i, visibleEl] of this.visibleItems.entries()) {
          visibleEl.setCssStyles({ top: `${this.offsetOf(i)}px` });
        }

        // 保持锚点项在视口中的相对位置不变
        this.container.scrollTop = this.offsetOf(anchorIndex) + anchorOffsetInItem;
        this.renderVisibleItems();
      }
    });
  }

  private onScroll(): void {
    window.requestAnimationFrame(() => this.renderVisibleItems());
  }

  scrollToBottom(): void {
    this.container.scrollTop = this.totalHeight();
  }

  destroy(): void {
    this.contentEl.remove();
  }
}
