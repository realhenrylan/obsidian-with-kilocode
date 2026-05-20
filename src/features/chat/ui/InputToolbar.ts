// src/features/chat/ui/InputToolbar.ts

export interface ToolbarAction {
  id: string;
  icon: string;
  label: string;
  active?: boolean;
  handler: () => void;
}

/**
 * 输入工具栏组件
 * 管理聊天输入框上方的工具按钮
 */
export class InputToolbar {
  private container: HTMLElement;
  private actions: ToolbarAction[] = [];
  private toolbarEl: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  /** 设置工具栏动作 */
  setActions(actions: ToolbarAction[]): void {
    this.actions = actions;
  }

  /** 渲染工具栏 */
  render(): void {
    if (this.toolbarEl) this.toolbarEl.remove();

    this.toolbarEl = this.container.createDiv({ cls: 'kilo-input-toolbar' });

    for (const action of this.actions) {
      const btnEl = this.toolbarEl.createDiv({
        cls: `kilo-toolbar-btn ${action.active ? 'kilo-toolbar-btn-active' : ''}`,
        text: action.icon,
        title: action.label,
      });
      btnEl.dataset.actionId = action.id;
      btnEl.addEventListener('click', action.handler);
    }
  }

  /** 更新按钮状态 */
  updateButton(actionId: string, active: boolean): void {
    if (!this.toolbarEl) return;
    const btn = this.toolbarEl.querySelector(`[data-action-id="${actionId}"]`);
    if (btn) {
      btn.classList.toggle('kilo-toolbar-btn-active', active);
    }
  }

  /** 销毁工具栏 */
  destroy(): void {
    if (this.toolbarEl) {
      this.toolbarEl.remove();
      this.toolbarEl = null;
    }
  }
}
