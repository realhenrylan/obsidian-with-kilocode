import type { SlashCommand } from './SlashCommand';

/**
 * 命令面板
 * 显示斜杠命令列表
 */
export class CommandPalette {
  private container: HTMLElement;
  private commands: SlashCommand[];
  private onSelect: (command: SlashCommand) => void;
  private selectedIndex: number = 0;

  constructor(container: HTMLElement, commands: SlashCommand[], onSelect: (command: SlashCommand) => void) {
    this.container = container;
    this.commands = commands;
    this.onSelect = onSelect;
  }

  /** 显示命令面板 */
  show(): void {
    this.container.empty();
    this.container.addClass('kilo-command-palette');

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
        this.hide();
      });

      itemEl.addEventListener('mouseenter', () => {
        this.selectedIndex = index;
        this.updateSelection();
      });
    });

    this.container.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.commands.length - 1);
        this.updateSelection();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.updateSelection();
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (this.commands[this.selectedIndex]) {
          this.onSelect(this.commands[this.selectedIndex]);
          this.hide();
        }
      }
      if (e.key === 'Escape') {
        this.hide();
      }
    });
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
