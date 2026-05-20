import type { MentionItem, MentionType } from './MentionService';

/**
 * 提及下拉菜单
 */
export class MentionDropdown {
  private container: HTMLElement;
  private items: MentionItem[];
  private onSelect: (item: MentionItem) => void;
  private selectedIndex: number = 0;

  constructor(container: HTMLElement, items: MentionItem[], onSelect: (item: MentionItem) => void) {
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
        text: 'No results found',
      });
      return;
    }

    const grouped = this.groupByType();

    for (const [type, items] of Object.entries(grouped)) {
      const typeEl = this.container.createDiv({
        cls: 'kilo-mention-type',
        text: this.getTypeLabel(type as MentionType),
      });

      for (const item of items) {
        const itemEl = this.container.createDiv({ cls: 'kilo-mention-item' });

        itemEl.createSpan({ cls: 'kilo-mention-icon', text: item.icon });
        itemEl.createSpan({ cls: 'kilo-mention-name', text: item.name });
        itemEl.createSpan({ cls: 'kilo-mention-path', text: item.path });

        itemEl.addEventListener('click', () => {
          this.onSelect(item);
          this.hide();
        });
      }
    }
  }

  /** 隐藏下拉菜单 */
  hide(): void {
    this.container.empty();
    this.container.removeClass('kilo-mention-dropdown');
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

  /** 获取类型标签 */
  private getTypeLabel(type: MentionType): string {
    const labels: Record<MentionType, string> = {
      file: 'Files',
      folder: 'Folders',
      tag: 'Tags',
      'mcp-server': 'MCP Servers',
      subagent: 'Subagents',
    };
    return labels[type] || type;
  }
}
