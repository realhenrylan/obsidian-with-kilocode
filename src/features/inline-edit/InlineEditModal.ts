import { App, Modal } from 'obsidian';
import { t } from '../../i18n';
import { DiffViewer } from './DiffViewer';

/**
 * Inline Edit 模态框
 * 用户选中文本后弹出，输入编辑指令
 * showDiff=true 时为 diff 预览模式：不渲染指令输入区，只展示 attachDiff 挂载的变更预览
 */
export class InlineEditModal extends Modal {
  private selectedText: string;
  private onSubmit: (instruction: string) => void;
  private instruction: string = '';
  private showDiff: boolean;
  private onAcceptCb?: (newText: string) => void;
  private onRejectCb?: () => void;

  constructor(app: App, selectedText: string, onSubmit: (instruction: string) => void, showDiff = false) {
    super(app);
    this.selectedText = selectedText;
    this.onSubmit = onSubmit;
    this.showDiff = showDiff;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kilo-inline-edit-modal');

    if (this.showDiff) return;

    // 标题
    contentEl.createEl('h2', { text: t('editor.title') });

    // 选中文本预览
    const previewEl = contentEl.createDiv({ cls: 'kilo-preview' });
    previewEl.createEl('label', { text: t('editor.selectedText') });
    const preEl = previewEl.createEl('pre');
    preEl.createEl('code', { text: this.selectedText });

    // 指令输入
    const inputContainer = contentEl.createDiv({ cls: 'kilo-instruction-input' });
    inputContainer.createEl('label', { text: t('editor.instruction') });

    const textarea = inputContainer.createEl('textarea', {
      cls: 'kilo-instruction-textarea',
      placeholder: t('editor.placeholder'),
    });
    textarea.addEventListener('input', (e) => {
      this.instruction = (e.target as HTMLTextAreaElement).value;
    });

    // 快捷键提示
    const hintEl = contentEl.createDiv({ cls: 'kilo-hint' });
    hintEl.createSpan({ text: t('editor.hint') });

    // 按钮
    const buttonContainer = contentEl.createDiv({ cls: 'kilo-modal-buttons' });

    const submitBtn = buttonContainer.createEl('button', {
      cls: 'kilo-btn kilo-btn-primary',
      text: t('editor.edit'),
    });
    submitBtn.addEventListener('click', () => this.handleSubmit());

    const cancelBtn = buttonContainer.createEl('button', {
      cls: 'kilo-btn kilo-btn-cancel',
      text: t('editor.cancel'),
    });
    cancelBtn.addEventListener('click', () => this.close());

    // 键盘事件
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSubmit();
      }
      if (e.key === 'Escape') {
        this.close();
      }
    });

    // 自动聚焦
    textarea.focus();
  }

  private handleSubmit(): void {
    if (this.instruction.trim()) {
      this.onSubmit(this.instruction.trim());
      this.close();
    }
  }

  /** 注册 Accept 回调（diff 预览模式下用户接受修改时触发，参数为 AI 返回的新文本） */
  onAccept(cb: (newText: string) => void): void {
    this.onAcceptCb = cb;
  }

  /** 注册 Reject 回调 */
  onReject(cb: () => void): void {
    this.onRejectCb = cb;
  }

  /** 挂载 diff 预览（showDiff 模式下唯一内容区；DiffViewer 自带 Accept/Reject 按钮） */
  attachDiff(originalText: string, newText: string): void {
    const diffContainer = this.contentEl.createDiv();
    const viewer = new DiffViewer(diffContainer, originalText, newText);
    viewer.render();

    diffContainer.addEventListener('diff-accepted', (e) => {
      const detail = (e as CustomEvent).detail as { newText?: string } | undefined;
      this.onAcceptCb?.(detail?.newText ?? newText);
      this.close();
    });
    diffContainer.addEventListener('diff-rejected', () => {
      this.onRejectCb?.();
      this.close();
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
