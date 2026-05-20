import { App, TFile } from 'obsidian';

export type MentionType = 'file' | 'folder' | 'tag';

export interface MentionItem {
  type: MentionType;
  name: string;
  path: string;
  icon: string;
}

/**
 * 提及服务
 * 搜索可提及的内容
 */
export class MentionService {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /** 搜索可提及的内容 */
  async search(query: string): Promise<MentionItem[]> {
    const results: MentionItem[] = [];

    // 搜索文件
    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      if (file.basename.toLowerCase().includes(query.toLowerCase())) {
        results.push({
          type: 'file',
          name: file.basename,
          path: file.path,
          icon: '📄',
        });
      }
    }

    // 搜索文件夹
    const folders = this.app.vault.getRoot().children;
    for (const folder of folders) {
      if ('children' in folder && folder.name.toLowerCase().includes(query.toLowerCase())) {
        results.push({
          type: 'folder',
          name: folder.name,
          path: folder.path,
          icon: '📁',
        });
      }
    }

    return results.slice(0, 20);
  }

  /** 获取文件内容 */
  async getFileContent(path: string): Promise<string | null> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      return await this.app.vault.read(file);
    }
    return null;
  }
}
