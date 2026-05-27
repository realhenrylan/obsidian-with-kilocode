import type { SlashCommand } from './SlashCommand';

/**
 * 二级菜单项
 */
export interface SubMenuItem {
  id: string;
  label: string;
  description?: string;
  handler: () => void;
}

export interface CommandPaletteOptions {
  container: HTMLElement;
  commands: SlashCommand[];
  onSelect: (command: SlashCommand) => void;
  onClose?: () => void;
}

/**
 * 命令面板
 * 显示斜杠命令列表，支持二级子菜单
 */
export class CommandPalette {
  private container: HTMLElement;
  private commands: SlashCommand[];
  private onSelect: (command: SlashCommand) => void;
  private onClose: (() => void) | undefined;
  private selectedIndex: number = 0;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private onBack: (() => void) | null = null;

  constructor(options: CommandPaletteOptions) {
    this.container = options.container;
    this.commands = options.commands;
    this.onSelect = options.onSelect;
    this.onClose = options.onClose;
  }

  /** 显示命令面板 */
  show(): void {
    this.onBack = null;
    this.renderMainList();
    this.attachKeydown();
  }

  /** 显示二级子菜单 */
  showSubMenu(items: SubMenuItem[], title: string): void {
    this.container.empty();
    this.container.addClass('kilo-command-palette');

    const headerEl = this.container.createDiv({ cls: 'kilo-submenu-header' });
    const backBtn = headerEl.createSpan({ cls: 'kilo-submenu-back', text: '\u2190 \u8FD4\u56DE' });
    headerEl.createSpan({ cls: 'kilo-submenu-title', text: title });

    this.selectedIndex = 0;

    const listEl = this.container.createDiv({ cls: 'kilo-command-list' });

    items.forEach((item, index) => {
      const itemEl = listEl.createDiv({
        cls: `kilo-command-item ${index === this.selectedIndex ? 'kilo-command-selected' : ''}`,
      });
      itemEl.createSpan({ cls: 'kilo-command-name', text: item.label });
      if (item.description) {
        itemEl.createSpan({ cls: 'kilo-command-desc', text: item.description });
      }
      itemEl.addEventListener('click', () => {
        item.handler();
      });
      itemEl.addEventListener('mouseenter', () => {
        this.selectedIndex = index;
        this.updateSelection();
      });
    });

    backBtn.addEventListener('click', () => this.show());

    this.onBack = () => this.show();

    this.detachKeydown();
    this.attachKeydown();
  }

  private renderMainList(): void {
    this.container.empty();
    this.container.addClass('kilo-command-palette');

    const headerEl = this.container.createDiv({ cls: 'kilo-submenu-header' });
    const closeBtn = headerEl.createSpan({ cls: 'kilo-submenu-back', text: '\u00D7' });
    headerEl.createSpan({ cls: 'kilo-submenu-title', text: '\u5E38\u7528\u547D\u4EE4' });

    closeBtn.addEventListener('click', () => {
      this.hide();
      this.onClose?.();
    });

    const listEl = this.container.createDiv({ cls: 'kilo-command-list' });

    this.commands.forEach((cmd, index) => {
      const itemEl = listEl.createDiv({
        cls: `kilo-command-item ${index === this.selectedIndex ? 'kilo-command-selected' : ''}`,
      });

      itemEl.createSpan({ cls: 'kilo-command-icon', text: cmd.icon });
      itemEl.createSpan({ cls: 'kilo-command-name', text: cmd.name });
      itemEl.createSpan({ cls: 'kilo-command-desc', text: cmd.description });

      itemEl.addEventListener('click', () => {
        this.onSelect(cmd);
      });

      itemEl.addEventListener('mouseenter', () => {
        this.selectedIndex = index;
        this.updateSelection();
      });
    });
  }

  private attachKeydown(): void {
    this.keydownHandler = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const items = this.container.querySelectorAll('.kilo-command-item');
        this.selectedIndex = Math.min(this.selectedIndex + 1, items.length - 1);
        this.updateSelection();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.updateSelection();
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const items = this.container.querySelectorAll('.kilo-command-item');
        const target = items[this.selectedIndex] as HTMLElement;
        target?.click();
      }
      if (e.key === 'Escape') {
        if (this.onBack) {
          this.onBack();
        } else {
          this.hide();
          this.onClose?.();
        }
      }
    };
    this.container.addEventListener('keydown', this.keydownHandler);
  }

  private detachKeydown(): void {
    if (this.keydownHandler) {
      this.container.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
  }

  /** 隐藏命令面板 */
  hide(): void {
    this.container.empty();
    this.container.removeClass('kilo-command-palette');
  }

  /** 更新选择状态 */
  private updateSelection(): void {
    const items = this.container.querySelectorAll('.kilo-command-item');
    items.forEach((item, index) => item.classList.toggle('kilo-command-selected', index === this.selectedIndex));
  }

  /** 过滤命令 */
  filter(query: string): void {
    this.commands = this.commands.filter(cmd =>
      cmd.name.toLowerCase().includes(query.toLowerCase()) ||
      cmd.description.toLowerCase().includes(query.toLowerCase())
    );
    this.selectedIndex = 0;
    this.show();
  }
}
