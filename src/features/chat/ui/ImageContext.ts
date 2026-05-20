// src/features/chat/ui/ImageContext.ts
import type { ImageAttachment } from '../../../core/types';

/**
 * 图片附件管理器
 * 支持文件选择、粘贴、拖拽三种方式添加图片
 */
export class ImageContext {
  private images: ImageAttachment[] = [];
  private maxSizeMB: number;
  private onUpdate?: () => void;

  constructor(maxSizeMB: number = 5) {
    this.maxSizeMB = maxSizeMB;
  }

  /** 设置更新回调（图片变化时通知 UI 刷新） */
  setOnUpdate(callback: () => void): void {
    this.onUpdate = callback;
  }

  /** 从文件选择器添加图片 */
  async addFromFile(): Promise<void> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;

      input.onchange = async () => {
        const files = input.files;
        if (!files) { resolve(); return; }

        for (const file of Array.from(files)) {
          if (file.size > this.maxSizeMB * 1024 * 1024) {
            console.warn(`[ImageContext] Image ${file.name} exceeds ${this.maxSizeMB}MB limit`);
            continue;
          }
          const data = await this.readFileAsBase64(file);
          this.images.push({ data, mimeType: file.type, name: file.name });
        }
        this.onUpdate?.();
        resolve();
      };

      input.click();
    });
  }

  /** 从粘贴事件添加图片 */
  addFromPaste(event: ClipboardEvent): boolean {
    const items = event.clipboardData?.items;
    if (!items) return false;

    let added = false;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) {
          this.readFileAsBase64(blob).then(data => {
            this.images.push({ data, mimeType: blob.type, name: 'pasted-image' });
            this.onUpdate?.();
          });
          added = true;
        }
      }
    }
    return added;
  }

  /** 从拖拽事件添加图片 */
  addFromDrop(event: DragEvent): boolean {
    const files = event.dataTransfer?.files;
    if (!files) return false;

    let added = false;
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        if (file.size > this.maxSizeMB * 1024 * 1024) {
          console.warn(`[ImageContext] Image ${file.name} exceeds ${this.maxSizeMB}MB limit`);
          continue;
        }
        this.readFileAsBase64(file).then(data => {
          this.images.push({ data, mimeType: file.type, name: file.name });
          this.onUpdate?.();
        });
        added = true;
      }
    }
    return added;
  }

  /** 获取所有图片 */
  getImages(): ImageAttachment[] {
    return this.images;
  }

  /** 清除所有图片 */
  clearImages(): void {
    this.images = [];
    this.onUpdate?.();
  }

  /** 是否有图片 */
  hasImages(): boolean {
    return this.images.length > 0;
  }

  /** 移除指定索引的图片 */
  removeImage(index: number): void {
    if (index >= 0 && index < this.images.length) {
      this.images.splice(index, 1);
      this.onUpdate?.();
    }
  }

  /** 渲染图片预览区域 */
  renderPreview(container: HTMLElement): void {
    const existing = container.querySelector('.kilo-image-preview');
    if (existing) existing.remove();

    if (this.images.length === 0) return;

    const previewEl = container.createDiv({ cls: 'kilo-image-preview' });
    for (let i = 0; i < this.images.length; i++) {
      const imgEl = previewEl.createDiv({ cls: 'kilo-image-item' });
      const img = imgEl.createEl('img', {
        attr: { src: this.images[i].data },
      });
      img.style.maxWidth = '60px';
      img.style.maxHeight = '60px';

      const removeBtn = imgEl.createEl('button', {
        cls: 'kilo-image-remove',
        text: '×',
      });
      removeBtn.addEventListener('click', () => this.removeImage(i));
    }
  }

  private readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}
