import { App, Modal, TFile, TFolder } from 'obsidian';

export interface VaultFileSelectResult {
  path: string;
  name: string;
  basename: string;
}

export class VaultFileBrowserModal extends Modal {
  private onSelect: (result: VaultFileSelectResult) => void;
  private selectedFolder: TFolder | null = null;
  private treeEl!: HTMLElement;
  private filesEl!: HTMLElement;

  constructor(app: App, onSelect: (result: VaultFileSelectResult) => void) {
    super(app);
    this.onSelect = onSelect;
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass('kilo-file-browser-modal');

    contentEl.createEl('h2', { text: '\uD83D\uDCC1 Select Note' });

    const container = contentEl.createDiv({ cls: 'kilo-file-browser-container' });

    // left: folder tree
    this.treeEl = container.createDiv({ cls: 'kilo-file-browser-tree' });
    this.buildTree();

    // right: file list
    this.filesEl = container.createDiv({ cls: 'kilo-file-browser-files' });
    if (this.selectedFolder) {
      this.renderFiles(this.selectedFolder);
    }

    // footer buttons
    const footer = contentEl.createDiv({ cls: 'kilo-file-browser-footer' });
    const cancelBtn = footer.createEl('button', {
      cls: 'kilo-btn kilo-btn-secondary',
      text: 'Cancel',
    });
    cancelBtn.addEventListener('click', () => this.close());

    this.scope.register([], 'Escape', () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private buildTree(): void {
    const root = this.app.vault.getRoot();
    this.selectedFolder = root;
    const treeList = this.treeEl.createDiv({ cls: 'kilo-file-tree-list' });
    this.renderTreeFolder(root, treeList, 0);
  }

  private renderTreeFolder(folder: TFolder, parentEl: HTMLElement, depth: number): void {
    // Sort: folders first, then alphabetically
    const children = [...folder.children].sort((a, b) => {
      if (a instanceof TFolder && !(b instanceof TFolder)) return -1;
      if (!(a instanceof TFolder) && b instanceof TFolder) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const child of children) {
      if (child instanceof TFolder) {
        const itemEl = parentEl.createDiv({
          cls: `kilo-file-tree-item ${this.selectedFolder === child ? 'selected' : ''}`,
          attr: { style: `padding-left: ${12 + depth * 16}px` },
        });
        itemEl.createSpan({ text: '\uD83D\uDCC1 ' + child.name });
        itemEl.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectFolder(child);
        });

        const childContainer = parentEl.createDiv({ cls: 'kilo-file-tree-children' });
        this.renderTreeFolder(child, childContainer, depth + 1);
      }
    }
  }

  private selectFolder(folder: TFolder): void {
    this.selectedFolder = folder;
    this.treeEl.querySelectorAll('.kilo-file-tree-item').forEach(el => el.removeClass('selected'));
    const allItems = this.treeEl.querySelectorAll('.kilo-file-tree-item');
    for (const item of allItems) {
      if (item.textContent?.trim() === '\uD83D\uDCC1 ' + folder.name) {
        item.addClass('selected');
        break;
      }
    }
    this.renderFiles(folder);
  }

  private renderFiles(folder: TFolder): void {
    this.filesEl.empty();

    const files = folder.children.filter((c): c is TFile => c instanceof TFile)
      .sort((a, b) => a.name.localeCompare(b.name));

    if (files.length === 0) {
      this.filesEl.createDiv({
        cls: 'kilo-file-browser-empty',
        text: 'No files in this folder',
      });
      return;
    }

    const listEl = this.filesEl.createDiv({ cls: 'kilo-file-list' });

    for (const file of files) {
      const itemEl = listEl.createDiv({ cls: 'kilo-file-item' });
      const icon = file.extension === 'md' ? '\uD83D\uDCDD' : '\uD83D\uDCC4';
      itemEl.createSpan({ cls: 'kilo-file-item-icon', text: icon });
      const nameEl = itemEl.createSpan({ cls: 'kilo-file-item-name', text: file.name });
      const pathEl = itemEl.createSpan({ cls: 'kilo-file-item-path', text: file.path });

      itemEl.addEventListener('click', () => {
        this.onSelect({
          path: file.path,
          name: file.name,
          basename: file.basename,
        });
        this.close();
      });

      itemEl.addEventListener('dblclick', () => {
        this.onSelect({
          path: file.path,
          name: file.name,
          basename: file.basename,
        });
        this.close();
      });
    }
  }
}
