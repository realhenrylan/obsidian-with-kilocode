/**
 * MentionService 单元测试
 *
 * 覆盖场景：
 * - 空 query → 返回全部（上限内）
 * - 前缀匹配优先 / 子串回退
 * - 递归文件夹搜索
 * - MCP Server / Subagent 搜索
 * - 每类型上限 10 条 / 总上限 20 条
 * - getFileContent
 */

import { MentionService } from '../../../src/features/mention/MentionService';
import type { MentionItem } from '../../../src/features/mention/MentionService';
// TFolder 从 obsidian mock 获取，用于构建测试 fixture
import { TFolder, TFile } from 'obsidian';

/** 创建测试用的 App mock */
function createMockApp(
  files: Array<{ name: string; path: string }>,
  folders: Array<{ name: string; path: string; parentPath?: string }>
): any {
  // 构建文件夹树
  const root = new TFolder('', '/');

  // 先按 path 索引所有文件夹
  const folderMap = new Map<string, TFolder>();
  folderMap.set('/', root);

  for (const f of folders) {
    const folder = new TFolder(f.name, f.path);
    folderMap.set(f.path, folder);
  }

  // 建立文件夹父子关系
  for (const f of folders) {
    const folder = folderMap.get(f.path)!;
    const parentPath = f.parentPath || '/';
    const parent = folderMap.get(parentPath);
    if (parent) {
      parent.children.push(folder);
    }
  }

  // 把文件放入对应父文件夹
  for (const file of files) {
    const tfile = new TFile(file.name, file.path);
    const parentPath = file.path.includes('/')
      ? file.path.substring(0, file.path.lastIndexOf('/'))
      : '/';
    // also add to root or appropriate parent folder's children
    const parent = folderMap.get(parentPath === '' ? '/' : parentPath) || root;
    parent.children.push(tfile);
  }

  return {
    vault: {
      getMarkdownFiles: jest.fn(() => files.map(f => new TFile(f.name, f.path))),
      getRoot: jest.fn(() => root),
      getAbstractFileByPath: jest.fn((path: string) => {
        for (const f of files) {
          if (f.path === path) return new TFile(f.name, f.path);
        }
        return null;
      }),
      read: jest.fn(() => Promise.resolve('file content')),
    },
  };
}

describe('MentionService', () => {
  describe('search() - basic', () => {
    const mockApp = createMockApp(
      [
        { name: 'README.md', path: 'README.md' },
        { name: 'GettingStarted.md', path: 'docs/GettingStarted.md' },
        { name: 'Architecture.md', path: 'docs/Architecture.md' },
        { name: 'Notes.md', path: 'Notes.md' },
      ],
      [
        { name: 'docs', path: 'docs' },
      ]
    );

    const service = new MentionService(mockApp as any);

    test('empty query returns all items (capped at 20)', async () => {
      const results = await service.search('');
      // 4 files + 1 folder = 5 items
      expect(results.length).toBe(5);
      expect(results.some(r => r.type === 'file')).toBe(true);
      expect(results.some(r => r.type === 'folder')).toBe(true);
    });

    test('prefix matching returns matching files first', async () => {
      const results = await service.search('read');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('README');
      expect(results[0].path).toBe('README.md');
    });

    test('prefix matching case insensitive', async () => {
      const results = await service.search('Read');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('README');
    });

    test('no prefix match falls back to substring', async () => {
      // "ting" 不是任何文件名的前缀，但 "GettingStarted" 包含 "ting"
      const results = await service.search('ting');
      expect(results.length).toBe(1);
      // "GettingStarted" contains "ting"
      expect(results[0].name).toBe('GettingStarted');
    });

    test('query with no matches returns empty array', async () => {
      const results = await service.search('zzzzzzzz');
      expect(results.length).toBe(0);
    });
  });

  describe('search() - recursive folders', () => {
    const mockApp = createMockApp(
      [
        { name: 'rootFile.md', path: 'rootFile.md' },
        { name: 'deepFile.md', path: 'sub/deep/deepFile.md' },
      ],
      [
        { name: 'sub', path: 'sub' },
        { name: 'deep', path: 'sub/deep', parentPath: 'sub' },
        { name: 'emptyFolder', path: 'sub/empty', parentPath: 'sub' },
      ]
    );

    const service = new MentionService(mockApp as any);

    test('finds nested folders recursively', async () => {
      const results = await service.search('deep');
      // Should match: deepFile.md (file), deep (folder)
      const folder = results.find(r => r.type === 'folder');
      const file = results.find(r => r.type === 'file');

      expect(folder).toBeDefined();
      expect(folder!.name).toBe('deep');
      expect(folder!.path).toBe('sub/deep');

      expect(file).toBeDefined();
      expect(file!.name).toBe('deepFile');
    });

    test('finds root-level folders', async () => {
      const results = await service.search('sub');
      expect(results.some(r => r.type === 'folder' && r.name === 'sub')).toBe(true);
    });
  });

  describe('search() - MCP servers and subagents', () => {
    const mockApp = createMockApp(
      [{ name: 'readme.md', path: 'readme.md' }],
      []
    );
    const service = new MentionService(mockApp as any);

    const mcpServers = [
      { id: 'server-1', name: 'Database Server', description: 'PostgreSQL queries' },
      { id: 'server-2', name: 'Web Search', description: 'Search the web' },
    ];

    const subagents = [
      { id: 'agent-1', name: 'Code Reviewer', description: 'Reviews code changes' },
      { id: 'agent-2', name: 'Test Runner', description: 'Runs test suites' },
    ];

    test('searches MCP servers with prefix match', async () => {
      const results = await service.search('database', { mcpServers, subagents });
      const mcp = results.filter(r => r.type === 'mcp-server');
      expect(mcp.length).toBe(1);
      expect(mcp[0].name).toBe('Database Server');
    });

    test('searches subagents with substring fallback', async () => {
      const results = await service.search('runner', { mcpServers, subagents });
      const agent = results.find(r => r.type === 'subagent');
      expect(agent).toBeDefined();
      expect(agent!.name).toBe('Test Runner');
    });

    test('searches across all types simultaneously', async () => {
      const results = await service.search('re', { mcpServers, subagents });
      // File: readme, Servers: (none, "Database Server" and "Web Search" don't start with "re"),
      // Agents: Code Reviewer (starts with "re"? No but contains "reviewer")
      // Actually "Code Reviewer" starts with "Code", not "re". "re" is only in "reviewer" (substring).
      // So prefix match has: nothing. Then substring: "Code Reviewer" contains "re", "Database Server" contains "re" ("Datab**a**se" no wait...)
      // "Database" contains no "re". Actually: D-a-t-a-b-a-s-e has no "re". 
      // "Readme" starts with "re" → prefix match! So service.search('re') will do prefix first.
      const file = results.find(r => r.type === 'file');
      expect(file).toBeDefined();
      expect(file!.name).toBe('readme');
    });

    test('when no context provided, only vault items returned', async () => {
      const results = await service.search('');
      expect(results.every(r => r.type === 'file' || r.type === 'folder')).toBe(true);
      expect(results.some(r => r.type === 'mcp-server')).toBe(false);
      expect(results.some(r => r.type === 'subagent')).toBe(false);
    });
  });

  describe('search() - limits', () => {
    // 15 files all starting with "a" to test per-type limit
    const manyFiles = Array.from({ length: 15 }, (_, i) => ({
      name: `alpha${i}.md`,
      path: `alpha${i}.md`,
    }));

    const mockApp = createMockApp(manyFiles, []);
    const service = new MentionService(mockApp as any);

    test('per-type limit is 10', async () => {
      const results = await service.search('alpha');
      // All match prefix "alpha", but capped at 10 per type
      const files = results.filter(r => r.type === 'file');
      expect(files.length).toBeLessThanOrEqual(10);
    });

    test('total limit is 20', async () => {
      // Create more files across types
      const manyFolders = Array.from({ length: 12 }, (_, i) => ({
        name: `beta${i}`,
        path: `beta${i}`,
      }));
      const bigApp = createMockApp(
        Array.from({ length: 15 }, (_, i) => ({ name: `alpha${i}.md`, path: `alpha${i}.md` })),
        manyFolders
      );
      const bigService = new MentionService(bigApp as any);
      const results = await bigService.search('');
      expect(results.length).toBeLessThanOrEqual(20);
    });
  });

  describe('getFileContent()', () => {
    const mockApp = createMockApp(
      [{ name: 'test.md', path: 'test.md' }],
      []
    );
    const service = new MentionService(mockApp as any);

    test('reads existing file content', async () => {
      const content = await service.getFileContent('test.md');
      expect(content).toBe('file content');
    });

    test('returns null for non-existent file', async () => {
      const content = await service.getFileContent('nonexistent.md');
      expect(content).toBeNull();
    });
  });
});
