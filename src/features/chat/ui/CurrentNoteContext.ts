// src/features/chat/ui/CurrentNoteContext.ts
import { App, MarkdownView, TFile } from 'obsidian';

/**
 * 当前笔记上下文管理器
 * 获取当前活跃笔记的路径和内容，作为 AI 的上下文
 */
export class CurrentNoteContext {
  private app: App;
  private included = false;
  private notePath: string | null = null;

  constructor(app: App) {
    this.app = app;
  }

  /** 切换是否包含当前笔记 */
  toggle(): void {
    this.included = !this.included;
    if (this.included) {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      this.notePath = activeView?.file?.path || null;
    } else {
      this.notePath = null;
    }
  }

  /** 是否已包含当前笔记 */
  isIncluded(): boolean {
    return this.included;
  }

  /** 获取笔记路径 */
  getNotePath(): string | null {
    return this.notePath;
  }

  /** 获取笔记内容 */
  async getNoteContent(): Promise<string | null> {
    if (!this.notePath) return null;
    const file = this.app.vault.getAbstractFileByPath(this.notePath);
    if (file instanceof TFile) {
      return await this.app.vault.read(file);
    }
    return null;
  }

  /** 刷新笔记路径（当前活跃笔记可能已切换） */
  refresh(): void {
    if (this.included) {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      this.notePath = activeView?.file?.path || null;
    }
  }
}
