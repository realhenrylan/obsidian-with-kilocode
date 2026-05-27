import { App, Modal } from 'obsidian';

export interface ListSelectItem {
  id: string;
  name: string;
  icon?: string;
  description?: string;
}

export class ListSelectModal extends Modal {
  private items: ListSelectItem[];
  private titleText: string;
  private onSelect: (item: ListSelectItem) => void;

  constructor(
    app: App,
    titleText: string,
    items: ListSelectItem[],
    onSelect: (item: ListSelectItem) => void
  ) {
    super(app);
    this.titleText = titleText;
    this.items = items;
    this.onSelect = onSelect;
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass('kilo-list-select-modal');

    contentEl.createEl('h2', { text: this.titleText });

    if (this.items.length === 0) {
      contentEl.createDiv({
        cls: 'kilo-list-select-empty',
        text: 'No items available',
      });
      return;
    }

    const listEl = contentEl.createDiv({ cls: 'kilo-list-select-list' });

    for (const item of this.items) {
      const row = listEl.createDiv({ cls: 'kilo-list-select-item' });

      if (item.icon) {
        row.createSpan({ cls: 'kilo-list-select-icon', text: item.icon });
      }

      const infoEl = row.createDiv({ cls: 'kilo-list-select-info' });
      infoEl.createDiv({ cls: 'kilo-list-select-name', text: item.name });
      if (item.description) {
        infoEl.createDiv({ cls: 'kilo-list-select-desc', text: item.description });
      }

      row.addEventListener('click', () => {
        this.onSelect(item);
        this.close();
      });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
