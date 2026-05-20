/**
 * Diff 查看器
 * 显示编辑前后的差异
 */
export class DiffViewer {
  private container: HTMLElement;
  private originalText: string;
  private newText: string;

  constructor(container: HTMLElement, originalText: string, newText: string) {
    this.container = container;
    this.originalText = originalText;
    this.newText = newText;
  }

  /** 渲染 diff 视图 */
  render(): void {
    this.container.empty();
    this.container.addClass('kilo-diff-viewer');

    // 标题
    const headerEl = this.container.createDiv({ cls: 'kilo-diff-header' });
    headerEl.createSpan({ text: 'Changes Preview', cls: 'kilo-diff-title' });

    // Diff 内容
    const diffEl = this.container.createDiv({ cls: 'kilo-diff-content' });

    // 简单的逐行对比
    const originalLines = this.originalText.split('\n');
    const newLines = this.newText.split('\n');

    const maxLines = Math.max(originalLines.length, newLines.length);

    for (let i = 0; i < maxLines; i++) {
      const originalLine = originalLines[i] || '';
      const newLine = newLines[i] || '';

      if (originalLine !== newLine) {
        // 删除的行
        if (originalLine) {
          const delEl = diffEl.createDiv({ cls: 'kilo-diff-line kilo-diff-del' });
          delEl.createSpan({ text: '- ', cls: 'kilo-diff-marker' });
          delEl.createSpan({ text: originalLine });
        }
        // 添加的行
        if (newLine) {
          const addEl = diffEl.createDiv({ cls: 'kilo-diff-line kilo-diff-add' });
          addEl.createSpan({ text: '+ ', cls: 'kilo-diff-marker' });
          addEl.createSpan({ text: newLine });
        }
      } else {
        // 未改变的行
        const unchangedEl = diffEl.createDiv({ cls: 'kilo-diff-line kilo-diff-unchanged' });
        unchangedEl.createSpan({ text: '  ', cls: 'kilo-diff-marker' });
        unchangedEl.createSpan({ text: originalLine });
      }
    }

    // 操作按钮
    const actionsEl = this.container.createDiv({ cls: 'kilo-diff-actions' });

    const acceptBtn = actionsEl.createEl('button', {
      cls: 'kilo-btn kilo-btn-primary',
      text: 'Accept Changes',
    });
    acceptBtn.addEventListener('click', () => this.onAccept());

    const rejectBtn = actionsEl.createEl('button', {
      cls: 'kilo-btn kilo-btn-cancel',
      text: 'Reject',
    });
    rejectBtn.addEventListener('click', () => this.onReject());
  }

  private onAccept(): void {
    this.container.dispatchEvent(new CustomEvent('diff-accepted', {
      detail: { newText: this.newText },
    }));
  }

  private onReject(): void {
    this.container.dispatchEvent(new CustomEvent('diff-rejected'));
  }
}
