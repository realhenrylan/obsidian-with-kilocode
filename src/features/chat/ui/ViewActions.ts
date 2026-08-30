// src/features/chat/ui/ViewActions.ts
// 视图操作集：工具栏按钮动作 + Inline Edit 命令注册
// 从 KiloCodeView 提取的薄动作层

import { InlineEditModal } from '../../inline-edit/InlineEditModal';
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
  /** Inline Edit 执行器（KiloCodeView 注入 runInlineEdit 真实实现） */
  inlineEditRunner: (selectedText: string, instruction: string) => void;
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

  /** 显示 Inline Edit 模态框：收集指令后交给 inlineEditRunner 执行 */
  private showInlineEditModal(selectedText: string, _editor: any): void {
    const modal = new InlineEditModal(this.deps.app, selectedText, (instruction) => {
      this.deps.inlineEditRunner(selectedText, instruction);
    });
    modal.open();
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

  /**
   * 触发斜杠命令：打开 CommandPalette 展示所有命令，
   * 选中后执行 handler（/compact /clear /model /mode）
   */}
