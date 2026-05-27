export interface FileAttachment {
  name: string;
  content: string;
  mimeType: string;
  size: number;
  isText: boolean;
}

const TEXT_EXTENSIONS = new Set([
  'md', 'txt', 'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift',
  'json', 'yaml', 'yml', 'toml', 'xml', 'csv',
  'css', 'scss', 'less', 'html', 'htm',
  'sql', 'graphql', 'sh', 'bash', 'zsh',
  'env', 'gitignore', 'dockerfile', 'ini', 'cfg', 'conf',
  'log', 'diff', 'patch',
]);

function isTextFile(mimeType: string, name: string): boolean {
  if (mimeType.startsWith('text/')) return true;
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return TEXT_EXTENSIONS.has(ext);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export class FileAttachmentContext {
  private attachments: FileAttachment[] = [];
  private maxSizeMB: number;
  private maxFiles: number;
  private onUpdate?: () => void;

  constructor(maxSizeMB: number = 10, maxFiles: number = 10) {
    this.maxSizeMB = maxSizeMB;
    this.maxFiles = maxFiles;
  }

  setOnUpdate(callback: () => void): void {
    this.onUpdate = callback;
  }

  async addFromFile(): Promise<void> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;

      input.onchange = async () => {
        const files = input.files;
        if (!files) { resolve(); return; }

        for (const file of Array.from(files)) {
          if (this.attachments.length >= this.maxFiles) {
            console.warn(`[FileAttachment] Max ${this.maxFiles} files reached, skipping ${file.name}`);
            continue;
          }
          if (file.size > this.maxSizeMB * 1024 * 1024) {
            console.warn(`[FileAttachment] ${file.name} exceeds ${this.maxSizeMB}MB limit`);
            continue;
          }
          const attachment = await this.readFile(file);
          this.attachments.push(attachment);
        }
        this.onUpdate?.();
        resolve();
      };

      input.click();
    });
  }

  private async readFile(file: File): Promise<FileAttachment> {
    const isText = isTextFile(file.type, file.name);
    let content: string;
    if (isText) {
      content = await this.readFileAsText(file);
    } else {
      content = await this.readFileAsBase64(file);
    }
    return {
      name: file.name,
      content,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      isText,
    };
  }

  private readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }

  private readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  getAttachments(): FileAttachment[] {
    return this.attachments;
  }

  clearAttachments(): void {
    this.attachments = [];
    this.onUpdate?.();
  }

  hasAttachments(): boolean {
    return this.attachments.length > 0;
  }

  removeAttachment(index: number): void {
    if (index >= 0 && index < this.attachments.length) {
      this.attachments.splice(index, 1);
      this.onUpdate?.();
    }
  }

  renderPreview(container: HTMLElement): void {
    const existing = container.querySelector('.kilo-file-preview');
    if (existing) existing.remove();

    if (this.attachments.length === 0) return;

    const previewEl = container.createDiv({ cls: 'kilo-file-preview' });
    for (let i = 0; i < this.attachments.length; i++) {
      const att = this.attachments[i];
      const chipEl = previewEl.createDiv({ cls: 'kilo-file-chip' });

      const iconEl = chipEl.createSpan({ cls: 'kilo-file-chip-icon', text: '📎' });
      const infoEl = chipEl.createSpan({ cls: 'kilo-file-chip-info' });

      infoEl.createSpan({ cls: 'kilo-file-chip-name', text: att.name });
      infoEl.createSpan({ cls: 'kilo-file-chip-size', text: formatFileSize(att.size) });

      const removeBtn = chipEl.createEl('button', {
        cls: 'kilo-file-chip-remove',
        text: '×',
      });
      removeBtn.addEventListener('click', () => this.removeAttachment(i));
    }
  }

  getContextText(): string {
    if (this.attachments.length === 0) return '';

    const parts: string[] = [];
    for (const att of this.attachments) {
      if (att.isText) {
        parts.push(`[Attached file: ${att.name}]\n${att.content}\n[/Attached file]`);
      } else {
        parts.push(`[Attached file: ${att.name}] (${formatFileSize(att.size)}, binary)`);
      }
    }
    return '\n\n---\n' + parts.join('\n\n---\n') + '\n';
  }
}
