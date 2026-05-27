/**
 * MentionDropdown
 * @mention 下拉菜单，支持分组显示、鼠标点击、键盘导航。
 * 
 * 键盘交互：
 * - ↑ / ↓ 在列表项间移动
 * - Enter 选中当前高亮项
 * - Esc 关闭菜单
 * 
 * i18n：使用项目中已有的翻译系统（src/i18n/index.ts），
 * 类型标签改为可翻译键（mention.files, mention.folders 等）。
 */

import type { MentionItem, MentionType } from './MentionService';
import { t } from '../../i18n';

export class MentionDropdown {
  private container: HTMLElement;
  private items: MentionItem[];
  private onSelect: (item: MentionItem) => void;

  /** 当前键盘选中的索引（相对于 itemEls 数组） */
  private selectedIndex: number = -1;
  /** 渲染后的项 DOM 元素列表，用于键盘导航高亮 */
  private itemEls: HTMLElement[] = [];

  constructor(
    container: HTMLElement,
    items: MentionItem[],
    onSelect: (item: MentionItem) => void
  ) {
    this.container = container;
    this.items = items;
    this.onSelect = onSelect;
  }

  /** 显示下拉菜单 */
  show(): void {
    this.container.empty();
    this.container.addClass('kilo-mention-dropdown');

    if (this.items.length === 0) {
      this.container.createDiv({
        cls: 'kilo-mention-empty',
        text: t('mention.noResults'),
      });
      this.itemEls = [];
      return;
    }

    this.itemEls = [];
    const grouped = this.groupByType();

    for (const [type, typeItems] of Object.entries(grouped)) {
      // 类型标题行
      this.container.createDiv({
        cls: 'kilo-mention-type-header',
        text: this.getTypeLabel(type as MentionType),
      });

      // 该类下的项
      for (const item of typeItems) {
        const itemEl = this.container.createDiv({ cls: 'kilo-mention-item' });
        itemEl.createSpan({ cls: 'kilo-mention-icon', text: item.icon });
        itemEl.createSpan({ cls: 'kilo-mention-name', text: item.name });
        itemEl.createSpan({ cls: 'kilo-mention-path', text: item.path });

        // 鼠标点击
        itemEl.addEventListener('click', () => {
          this.selectItem(item);
        });

        // 鼠标悬浮高亮
        itemEl.addEventListener('mouseenter', () => {
          this.setSelectedIndex(this.itemEls.indexOf(itemEl));
        });

        this.itemEls.push(itemEl);
      }
    }

    // 默认选中第一项
    if (this.itemEls.length > 0) {
      this.setSelectedIndex(0);
    }
  }

  /** 隐藏下拉菜单 */
  hide(): void {
    this.container.empty();
    this.container.removeClass('kilo-mention-dropdown');
    this.itemEls = [];
    this.selectedIndex = -1;
  }

  /** 键盘事件处理。返回 true 表示事件已被消费 */
  handleKeyDown(e: KeyboardEvent): boolean {
    if (this.itemEls.length === 0) return false;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.setSelectedIndex(
          this.selectedIndex < this.itemEls.length - 1 ? this.selectedIndex + 1 : 0
        );
        return true;

      case 'ArrowUp':
        e.preventDefault();
        this.setSelectedIndex(
          this.selectedIndex > 0 ? this.selectedIndex - 1 : this.itemEls.length - 1
        );
        return true;

      case 'Enter':
        e.preventDefault();
        if (this.selectedIndex >= 0 && this.selectedIndex < this.itemEls.length) {
          this.selectItem(this.items[this.selectedIndex]);
        }
        return true;

      case 'Escape':
        e.preventDefault();
        this.hide();
        return true;

      default:
        return false;
    }
  }

  /** 选中某项并触发回调 */
  private selectItem(item: MentionItem): void {
    this.onSelect(item);
    this.hide();
  }

  /** 更新选中索引并刷新高亮样式 */
  private setSelectedIndex(index: number): void {
    // 清除旧高亮
    if (this.selectedIndex >= 0 && this.selectedIndex < this.itemEls.length) {
      this.itemEls[this.selectedIndex].removeClass('selected');
    }

    this.selectedIndex = index;

    // 设置新高亮
    if (this.selectedIndex >= 0 && this.selectedIndex < this.itemEls.length) {
      this.itemEls[this.selectedIndex].addClass('selected');
      // 滚动到可见区域
      this.itemEls[this.selectedIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  /** 按类型分组 */
  private groupByType(): Record<string, MentionItem[]> {
    const grouped: Record<string, MentionItem[]> = {};
    for (const item of this.items) {
      if (!grouped[item.type]) {
        grouped[item.type] = [];
      }
      grouped[item.type].push(item);
    }
    return grouped;
  }

  /** 获取类型标签（使用 i18n 翻译） */
  private getTypeLabel(type: MentionType): string {
    const keyMap: Record<MentionType, string> = {
      file: 'mention.files',
      folder: 'mention.folders',
      tag: 'mention.tags',
      'mcp-server': 'mention.mcpServers',
      subagent: 'mention.subagents',
    };
    if (keyMap[type]) {
      return t(keyMap[type]);
    }
    return type;
  }
}
