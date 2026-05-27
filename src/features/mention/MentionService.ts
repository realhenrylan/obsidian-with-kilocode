/**
 * MentionService
 * 搜索可提及的内容：文件、文件夹（递归）、MCP Server、Subagent。
 * 
 * 搜索策略（方案 B）：
 * 1. 先做前缀匹配（startsWith）
 * 2. 若无结果则回退到子串匹配（includes）
 * 
 * 这么做是为了避免前缀和子串结果混杂，给用户更清晰的体验。
 */

import { App, TFile, TFolder } from 'obsidian';

export type MentionType = 'file' | 'folder' | 'tag' | 'mcp-server' | 'subagent';

export interface MentionItem {
  type: MentionType;
  name: string;
  path: string;
  icon: string;
  description?: string;
}

export interface MentionContext {
  mcpServers?: Array<{ id: string; name: string; description?: string }>;
  subagents?: Array<{ id: string; name: string; description?: string }>;
}

/** 每组上限，避免某类结果过多淹没其他类型 */
const MAX_PER_TYPE = 10;
/** 总上限 */
const MAX_TOTAL = 20;

export class MentionService {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /** 搜索可提及的内容 */
  async search(query: string, context?: MentionContext): Promise<MentionItem[]> {
    const results: MentionItem[] = [];

    // 先尝试前缀匹配
    const prefixResults = this.searchAll(query, context, true);
    if (prefixResults.length > 0) {
      results.push(...prefixResults);
    } else if (query.length > 0) {
      // 前缀无结果，回退到子串匹配
      results.push(...this.searchAll(query, context, false));
    }

    return results.slice(0, MAX_TOTAL);
  }

  /** 根据匹配模式搜索所有类型 */
  private searchAll(query: string, context?: MentionContext, prefixOnly: boolean = true): MentionItem[] {
    const allResults: MentionItem[] = [];

    // 文件搜索
    const files = this.searchFiles(query, prefixOnly);
    allResults.push(...files.slice(0, MAX_PER_TYPE));

    // 文件夹搜索（递归）
    const folders = this.searchFolders(query, prefixOnly);
    allResults.push(...folders.slice(0, MAX_PER_TYPE));

    // MCP Server 搜索
    if (context?.mcpServers) {
      const servers = this.searchMcpServers(query, context.mcpServers, prefixOnly);
      allResults.push(...servers.slice(0, MAX_PER_TYPE));
    }

    // Subagent 搜索
    if (context?.subagents) {
      const agents = this.searchSubagents(query, context.subagents, prefixOnly);
      allResults.push(...agents.slice(0, MAX_PER_TYPE));
    }

    return allResults;
  }

  /** 搜索文件——按名称匹配 */
  private searchFiles(query: string, prefixOnly: boolean): MentionItem[] {
    const results: MentionItem[] = [];
    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      if (this.matches(file.basename, query, prefixOnly)) {
        results.push({
          type: 'file',
          name: file.basename,
          path: file.path,
          icon: '📄',
        });
      }
    }
    return results;
  }

  /**
   * 搜索文件夹——递归遍历所有子文件夹
   * Obsidian API 中 TFolder 有 children 属性，递归遍历即可。
   */
  private searchFolders(query: string, prefixOnly: boolean): MentionItem[] {
    const results: MentionItem[] = [];
    this.traverseFolders(this.app.vault.getRoot(), query, prefixOnly, results);
    return results;
  }

  /** 递归遍历文件夹收集匹配结果 */
  private traverseFolders(folder: TFolder, query: string, prefixOnly: boolean, results: MentionItem[]): void {
    for (const child of folder.children) {
      if (child instanceof TFolder) {
        if (this.matches(child.name, query, prefixOnly)) {
          results.push({
            type: 'folder',
            name: child.name,
            path: child.path,
            icon: '📁',
          });
        }
        // 递归进入子文件夹
        this.traverseFolders(child, query, prefixOnly, results);
      }
    }
  }

  /** 搜索 MCP Server */
  private searchMcpServers(
    query: string,
    servers: Array<{ id: string; name: string; description?: string }>,
    prefixOnly: boolean
  ): MentionItem[] {
    const results: MentionItem[] = [];
    for (const server of servers) {
      if (this.matches(server.name, query, prefixOnly)) {
        results.push({
          type: 'mcp-server',
          name: server.name,
          path: server.id,
          icon: '🔌',
          description: server.description,
        });
      }
    }
    return results;
  }

  /** 搜索 Subagent */
  private searchSubagents(
    query: string,
    agents: Array<{ id: string; name: string; description?: string }>,
    prefixOnly: boolean
  ): MentionItem[] {
    const results: MentionItem[] = [];
    for (const agent of agents) {
      if (this.matches(agent.name, query, prefixOnly)) {
        results.push({
          type: 'subagent',
          name: agent.name,
          path: agent.id,
          icon: '🤖',
          description: agent.description,
        });
      }
    }
    return results;
  }

  /** 匹配逻辑：前缀模式使用 startsWith，非前缀模式使用 includes */
  private matches(value: string, query: string, prefixOnly: boolean): boolean {
    const lowerValue = value.toLowerCase();
    const lowerQuery = query.toLowerCase();
    if (prefixOnly) {
      return lowerValue.startsWith(lowerQuery);
    }
    return lowerValue.includes(lowerQuery);
  }

  /** 获取文件内容（保持原有功能） */
  async getFileContent(path: string): Promise<string | null> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      return await this.app.vault.read(file);
    }
    return null;
  }
}
