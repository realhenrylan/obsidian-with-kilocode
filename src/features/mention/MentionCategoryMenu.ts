/**
 * MentionCategoryMenu
 * @mention 一级分类菜单，视觉风格与 slash command 子菜单（CommandPalette）一致。
 *
 * 交互：
 * - 点击分类项 → 回调 onCategorySelect(categoryId)
 * - 点击 × 按钮 → 回调 onCancel
 * - 键盘 ↑↓ 切换、Enter 确认、Esc 取消
 */

export interface MentionCategory {
  id: string;
  label: string;
  icon: string;
  description?: string;
}

export interface MentionCategoryMenuOptions {
  container: HTMLElement;
  categories: MentionCategory[];
  onCategorySelect: (categoryId: string) => void;
  onCancel: () => void;
}

export class MentionCategoryMenu {
  private container: HTMLElement;
  private categories: MentionCategory[];
  private onCategorySelect: (categoryId: string) => void;
  private onCancel: () => void;
  private selectedIndex: number = 0;

  constructor(options: MentionCategoryMenuOptions) {
    this.container = options.container;
    this.categories = options.categories;
    this.onCategorySelect = options.onCategorySelect;
    this.onCancel = options.onCancel;
  }

  show(): void {
    this.container.empty();
    this.container.addClass('kilo-command-palette');

    const headerEl = this.container.createDiv({ cls: 'kilo-submenu-header' });
    const closeBtn = headerEl.createSpan({ cls: 'kilo-submenu-back', text: '\u00D7' });
    headerEl.createSpan({ cls: 'kilo-submenu-title', text: '@ \u5F15\u7528' });

    this.selectedIndex = 0;
    const listEl = this.container.createDiv({ cls: 'kilo-command-list' });

    this.categories.forEach((cat, index) => {
      const itemEl = listEl.createDiv({
        cls: `kilo-command-item ${index === this.selectedIndex ? 'kilo-command-selected' : ''}`,
        attr: { tabindex: '0' },
      });

      itemEl.createSpan({ cls: 'kilo-command-icon', text: cat.icon });
      itemEl.createSpan({ cls: 'kilo-command-name', text: cat.label });
      if (cat.description) {
        itemEl.createSpan({ cls: 'kilo-command-desc', text: cat.description });
      }

      itemEl.addEventListener('click', () => {
        this.selectCategory(cat.id);
      });

      itemEl.addEventListener('mouseenter', () => {
        this.selectedIndex = index;
        this.updateSelection();
      });
    });

    closeBtn.addEventListener('click', () => {
      this.hide();
      this.onCancel();
    });

    this.container.setAttribute('tabindex', '-1');
    this.container.focus();
  }

  hide(): void {
    this.container.empty();
    this.container.removeClass('kilo-command-palette');
  }

  handleKeyDown(e: KeyboardEvent): boolean {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.categories.length - 1);
        this.updateSelection();
        return true;
      case 'ArrowUp':
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.updateSelection();
        return true;
      case 'Enter':
        e.preventDefault();
        if (this.selectedIndex >= 0 && this.selectedIndex < this.categories.length) {
          this.selectCategory(this.categories[this.selectedIndex].id);
        }
        return true;
      case 'Escape':
        e.preventDefault();
        this.hide();
        this.onCancel();
        return true;
      default:
        return false;
    }
  }

  private selectCategory(categoryId: string): void {
    this.hide();
    this.onCategorySelect(categoryId);
  }

  private updateSelection(): void {
    const items = this.container.querySelectorAll('.kilo-command-item');
    items.forEach((el, index) => {
      el.classList.toggle('kilo-command-selected', index === this.selectedIndex);
    });
  }
}
