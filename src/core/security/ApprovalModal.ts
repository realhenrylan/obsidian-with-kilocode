// src/core/security/ApprovalModal.ts
import { App, Modal } from 'obsidian';
import type { ApprovalRequest, ApprovalDecision } from './ApprovalManager';

/**
 * 审批对话框
 * 当 AI 需要执行写入/bash 等危险操作时弹出
 */
export class ApprovalModal extends Modal {
  private request: ApprovalRequest;
  private resolve: (decision: ApprovalDecision) => void;

  constructor(app: App, request: ApprovalRequest, resolve: (decision: ApprovalDecision) => void) {
    super(app);
    this.request = request;
    this.resolve = resolve;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kilo-approval-modal');

    // 标题
    contentEl.createEl('h3', {
      text: `🔧 Tool Approval: ${this.request.toolName}`,
    });

    // 描述
    contentEl.createEl('p', {
      text: this.request.description,
      cls: 'kilo-approval-description',
    });

    // 输入参数预览
    const preEl = contentEl.createEl('pre', { cls: 'kilo-approval-input' });
    preEl.createEl('code', {
      text: JSON.stringify(this.request.input, null, 2),
    });

    // 按钮组
    const buttonGroup = contentEl.createDiv({ cls: 'kilo-approval-buttons' });

    const allowBtn = buttonGroup.createEl('button', {
      cls: 'kilo-btn kilo-btn-primary',
      text: 'Allow',
    });
    allowBtn.addEventListener('click', () => {
      this.resolve('allow');
      this.close();
    });

    const allowAlwaysBtn = buttonGroup.createEl('button', {
      cls: 'kilo-btn kilo-btn-secondary',
      text: 'Always Allow',
    });
    allowAlwaysBtn.addEventListener('click', () => {
      this.resolve('allow-always');
      this.close();
    });

    const denyBtn = buttonGroup.createEl('button', {
      cls: 'kilo-btn kilo-btn-danger',
      text: 'Deny',
    });
    denyBtn.addEventListener('click', () => {
      this.resolve('deny');
      this.close();
    });

    const cancelBtn = buttonGroup.createEl('button', {
      cls: 'kilo-btn kilo-btn-cancel',
      text: 'Cancel',
    });
    cancelBtn.addEventListener('click', () => {
      this.resolve('cancel');
      this.close();
    });

    // ESC 键取消
    this.scope.register([], 'Escape', () => {
      this.resolve('cancel');
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

/**
 * 创建审批对话框的 Promise 包装
 * 返回一个 Promise，在用户做出决定后 resolve
 */
export function showApprovalModal(app: App, request: ApprovalRequest): Promise<ApprovalDecision> {
  return new Promise<ApprovalDecision>((resolve) => {
    const modal = new ApprovalModal(app, request, resolve);
    modal.open();
  });
}
