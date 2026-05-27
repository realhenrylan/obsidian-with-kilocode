import { App, Modal } from 'obsidian';

export interface CustomInstructionModalOptions {
  initialValue: string;
  onSave: (text: string) => void;
  onApply: (text: string) => void;
}

/**
 * Custom Instruction 编辑器弹窗
 * 用户编写指令文本，自动保存到 settings，
 * 点击 Apply 后注入当前对话的 system prompt。
 */
export class CustomInstructionModal extends Modal {
  private options: CustomInstructionModalOptions;

  constructor(app: App, options: CustomInstructionModalOptions) {
    super(app);
    this.options = options;
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass('kilo-instruction-modal');

    // 标题
    contentEl.createEl('h2', { text: 'Custom Instructions' });

    // textarea
    const textarea = contentEl.createEl('textarea', {
      cls: 'kilo-instruction-textarea',
      text: this.options.initialValue,
    });
    textarea.placeholder = 'e.g. Always use 2-space indentation.\nFollow the Single Responsibility Principle.\nWrite tests before implementation.';

    const autoResize = (): void => {
      textarea.style.height = '0';
      textarea.style.height = textarea.scrollHeight + 'px';
    };

    // auto-save + auto-resize on input
    textarea.addEventListener('input', () => {
      this.options.onSave(textarea.value);
      autoResize();
    });

    // initial resize
    requestAnimationFrame(autoResize);

    // 提示
    contentEl.createEl('p', {
      cls: 'instruction-hint',
      text: 'Click Apply to inject these instructions into the current conversation session. The text is auto-saved, but you need to re-apply for each session.',
    });

    // 按钮组
    const buttonGroup = contentEl.createDiv({ cls: 'kilo-instruction-buttons' });

    const applyBtn = buttonGroup.createEl('button', {
      cls: 'kilo-btn kilo-btn-primary',
      text: 'Apply',
    });
    applyBtn.addEventListener('click', () => {
      this.options.onApply(textarea.value);
      this.close();
    });

    const cancelBtn = buttonGroup.createEl('button', {
      cls: 'kilo-btn kilo-btn-secondary',
      text: 'Cancel',
    });
    cancelBtn.addEventListener('click', () => {
      this.close();
    });

    // ESC 键关闭（不 Apply）
    this.scope.register([], 'Escape', () => {
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
