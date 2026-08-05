// src/features/chat/ui/ViewActions.ts
// 视图操作集：工具栏按钮动作 + Inline Edit 命令注册
// 从 KiloCodeView 提取的薄动作层

import { InlineEditModal } from '../../inline-edit/InlineEditModal';
import { CommandPalette } from '../../commands/CommandPalette';
import type { CommandRegistry } from '../../commands/SlashCommand';
import type { App } from 'obsidian';

export interface ViewActionsDeps {
  app: App;
  addCommand: (command: {
    id: string;
    name: string;
    callback?: () => void;
    editorCallback?: (editor: any) => void;
    hotkeys?: Array<{ modifiers: Array<'Mod' | 'Ctrl' | 'Meta' | 'Shift' | 'Alt'>; key: string }>;
  }) => void;
  getInputContainerEl: () => HTMLElement | null;
  imageContext: {
    addFromFile(): Promise<void>;
    renderPreview(el: HTMLElement): void;
  };
  currentNoteContext: { toggle(): void };
  notice: (message: string) => void;
  /** Slash 命令注册表（未注入时 slash 保持 coming-soon） */
  commandRegistry: CommandRegistry | null;
}

export class ViewActions {
  constructor(private deps: ViewActionsDeps) {}

  /** 注册 Inline Edit 命令（选中文本 + Ctrl/Cmd+Shift+E） */
  registerInlineEditCommand(): void {
    this.deps.addCommand({
      id: 'inline-edit',
      name: 'Inline Edit',
      editorCallback: (editor) => {
        const selection = editor.getSelection();
        if (selection) {
          this.showInlineEditModal(selection, editor);
        }
      },
      hotkeys: [{ modifiers: ['Ctrl', 'Shift'], key: 'e' }],
    });
  }

  /** 显示 Inline Edit 模态框 */
  private showInlineEditModal(selectedText: string, _editor: any): void {
    new InlineEditModal(this.deps.app, selectedText, async (_instruction) => {
      // TODO: 调用 KiloCode CLI 进行 inline edit（Phase B 实现）
    }).open();
  }

  /** 处理图片附件 */
  async handleAttachImage(): Promise<void> {
    await this.deps.imageContext.addFromFile();
    const container = this.deps.getInputContainerEl();
    if (container) {
      this.deps.imageContext.renderPreview(container);
    }
  }

  /** 处理当前笔记切换 */
  handleToggleCurrentNote(): void {
    this.deps.currentNoteContext.toggle();
  }

  /** 触发 mention（Phase 3 实现） */
  triggerMention(): void {
    this.deps.notice('Mention feature coming soon');
  }

  /**
   * 触发斜杠命令：打开 CommandPalette 展示所有命令，
   * 选中后执行 handler（/compact /clear /model /mode）
   */
  triggerSlashCommand(): void {
    if (!this.deps.commandRegistry) {
      this.deps.notice('Slash commands coming soon');
      return;
    }
    const container = this.deps.getInputContainerEl();
    if (!container) return;

    // 复用已存在的 palette 容器（输入区顶部）
    let wrapEl = container.querySelector('.kilo-command-palette-wrap') as HTMLElement | null;
    if (!wrapEl) {
      wrapEl = document.createElement('div');
      wrapEl.className = 'kilo-command-palette-wrap';
      container.insertBefore(wrapEl, container.firstChild);
    }

    const palette = new CommandPalette(wrapEl, this.deps.commandRegistry.getAll(), async (cmd) => {
      await cmd.handler('');
      this.deps.notice(`Executed ${cmd.name}`);
    });
    palette.show();
  }

  /** 触发指令模式（Phase 3 实现） */
  triggerInstructionMode(): void {
    this.deps.notice('Instruction mode coming soon');
  }

  /** 附加文件（Phase 3 实现） */
  attachFile(): void {
    this.deps.notice('File attachment coming soon');
  }
}
