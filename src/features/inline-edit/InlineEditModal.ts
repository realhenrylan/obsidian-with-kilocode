import { App, Modal, Setting } from 'obsidian';

/**
 * Inline Edit 模态框
 * 用户选中文本后弹出，输入编辑指令
 */
export class InlineEditModal extends Modal {
  private selectedText: string;
  private onSubmit: (instruction: string) => void;
  private instruction: string = '';

  constructor(app: App, selectedText: string, onSubmit: (instruction: string) => void) {
    super(app);
    this.selectedText = selectedText;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kilo-inline-edit-modal');

    // 标题
    contentEl.createEl('h2', { text: 'Inline Edit' });

    // 选中文本预览
    const previewEl = contentEl.createDiv({ cls: 'kilo-preview' });
    previewEl.createEl('label', { text: 'Selected Text:' });
    const preEl = previewEl.createEl('pre');
    preEl.createEl('code', { text: this.selectedText });

    // 指令输入
    const inputContainer = contentEl.createDiv({ cls: 'kilo-instruction-input' });
    inputContainer.createEl('label', { text: 'Edit Instruction:' });

    const textarea = inputContainer.createEl('textarea', {
      cls: 'kilo-instruction-textarea',
      placeholder: 'Describe how to edit the selected text...',
    });
    textarea.addEventListener('input', (e) => {
      this.instruction = (e.target as HTMLTextAreaElement).value;
    });

    // 快捷键提示
    const hintEl = contentEl.createDiv({ cls: 'kilo-hint' });
    hintEl.createSpan({ text: 'Enter to submit, Shift+Enter for new line, Esc to cancel' });

    // 按钮
    const buttonContainer = contentEl.createDiv({ cls: 'kilo-modal-buttons' });

    const submitBtn = buttonContainer.createEl('button', {
      cls: 'kilo-btn kilo-btn-primary',
      text: 'Edit',
    });
    submitBtn.addEventListener('click', () => this.handleSubmit());

    const cancelBtn = buttonContainer.createEl('button', {
      cls: 'kilo-btn kilo-btn-cancel',
      text: 'Cancel',
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

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
