// src/features/chat/ui/ModelSwitcherModal.ts
// 模型切换模态框
// 从 KiloCodeView.handleModelSwitch 内嵌类提取，返回 Promise<string|null>：
// - 输入模型 ID 并 Apply / Enter → resolve 新值
// - Cancel / Esc → resolve 原值（调用方据此判断是否有变更）

import { Modal, type App } from 'obsidian';

class ModelSelectModal extends Modal {
  protected result: string;
  private readonly initialModel: string;

  constructor(app: App, currentModel: string) {
    super(app);
    this.initialModel = currentModel;
    this.result = currentModel;
  }

  onOpen(): void {
    const contentEl = this.contentEl;
    contentEl.createEl('h2', { text: 'Switch AI Model' });
    contentEl.createEl('p', {
      text: 'Enter model ID (e.g. kilocode/anthropic/claude-sonnet-4) or leave empty for CLI default.',
      cls: 'kilo-setting-note',
    });

    const input = contentEl.createEl('input', {
      type: 'text',
      placeholder: 'kilocode/anthropic/claude-sonnet-4',
      cls: 'kilo-input',
    });
    input.value = this.initialModel;
    input.style.width = '100%';
    input.style.marginBottom = '12px';

    const applyBtn = contentEl.createEl('button', { text: 'Apply', cls: 'kilo-btn kilo-btn-primary' });
    applyBtn.onclick = () => {
      this.result = input.value || '';
      this.close();
    };

    const cancelBtn = contentEl.createEl('button', { text: 'Cancel', cls: 'kilo-btn' });
    cancelBtn.onclick = () => {
      this.result = this.initialModel;
      this.close();
    };

    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        this.result = input.value || '';
        this.close();
      }
      if (e.key === 'Escape') {
        this.result = this.initialModel;
        this.close();
      }
    });

    input.focus();
  }
}

/** 打开模型切换弹窗，返回用户选择的模型 ID（取消时返回原值） */
export function openModelSwitcher(app: App, currentModel: string): Promise<string | null> {
  return new Promise((resolve) => {
    class ResolvingModal extends ModelSelectModal {
      onClose(): void {
        super.onClose();
        resolve(this.result);
      }
    }
    const modal = new ResolvingModal(app, currentModel);
    modal.open();
  });
}
