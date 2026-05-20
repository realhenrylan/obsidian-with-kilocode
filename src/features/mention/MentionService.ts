import { App, TFile } from 'obsidian';

export type MentionType = 'file' | 'folder' | 'tag' | 'mcp-server' | 'subagent';

export interface MentionItem {
  type: MentionType;
  name: string;
  path: string;
  icon: string;
  description?: string;
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
  async search(query: string, context?: {
    mcpServers?: Array<{ id: string; name: string; description?: string }>;
    subagents?: Array<{ id: string; name: string; description?: string }>;
  }): Promise<MentionItem[]> {
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

    // 搜索 MCP 服务器
    if (context?.mcpServers) {
      for (const server of context.mcpServers) {
        if (server.name.toLowerCase().includes(query.toLowerCase())) {
          results.push({
            type: 'mcp-server',
            name: server.name,
            path: server.id,
            icon: '🔌',
            description: server.description,
          });
        }
      }
    }

    // 搜索子代理
    if (context?.subagents) {
      for (const agent of context.subagents) {
        if (agent.name.toLowerCase().includes(query.toLowerCase())) {
          results.push({
            type: 'subagent',
            name: agent.name,
            path: agent.id,
            icon: '🤖',
            description: agent.description,
          });
        }
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
