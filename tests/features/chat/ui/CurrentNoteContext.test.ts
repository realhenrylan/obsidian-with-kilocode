// tests/features/chat/ui/CurrentNoteContext.test.ts

// Mock Obsidian modules — TFile 必须是同一个类引用才能通过 instanceof 检查
const mockTFile = class TFile {};
jest.mock('obsidian', () => ({
  MarkdownView: class MarkdownView {},
  TFile: mockTFile,
}));

import { CurrentNoteContext } from '../../../../src/features/chat/ui/CurrentNoteContext';

function createMockApp(activeFile: { path: string } | null = null) {
  const mockRead = jest.fn().mockResolvedValue('note content');
  const mockFile = activeFile ? new mockTFile() : null;
  return {
    workspace: {
      getActiveViewOfType: jest.fn().mockReturnValue(
        activeFile ? { file: activeFile } : null,
      ),
    },
    vault: {
      getAbstractFileByPath: jest.fn().mockReturnValue(mockFile),
      read: mockRead,
    },
  } as any;
}

describe('CurrentNoteContext', () => {
  describe('toggle', () => {
    test('切换 included 状态', () => {
      const app = createMockApp({ path: 'note.md' });
      const ctx = new CurrentNoteContext(app);

      expect(ctx.isIncluded()).toBe(false);

      ctx.toggle();
      expect(ctx.isIncluded()).toBe(true);
      expect(ctx.getNotePath()).toBe('note.md');

      ctx.toggle();
      expect(ctx.isIncluded()).toBe(false);
      expect(ctx.getNotePath()).toBeNull();
    });

    test('无活跃笔记时 notePath 为 null', () => {
      const app = createMockApp(null);
      const ctx = new CurrentNoteContext(app);

      ctx.toggle();
      expect(ctx.isIncluded()).toBe(true);
      expect(ctx.getNotePath()).toBeNull();
    });
  });

  describe('getNoteContent', () => {
    test('未 included 时返回 null', async () => {
      const app = createMockApp();
      const ctx = new CurrentNoteContext(app);

      const content = await ctx.getNoteContent();
      expect(content).toBeNull();
    });

    test('included 且有笔记时返回内容', async () => {
      const app = createMockApp({ path: 'note.md' });
      app.vault.read = jest.fn().mockResolvedValue('# Hello');
      const ctx = new CurrentNoteContext(app);

      ctx.toggle();
      const content = await ctx.getNoteContent();
      expect(content).toBe('# Hello');
    });

    test('文件不存在时返回 null', async () => {
      const app = createMockApp({ path: 'missing.md' });
      app.vault.getAbstractFileByPath = jest.fn().mockReturnValue(null);
      const ctx = new CurrentNoteContext(app);

      ctx.toggle();
      const content = await ctx.getNoteContent();
      expect(content).toBeNull();
    });
  });

  describe('refresh', () => {
    test('refresh 更新活跃笔记路径', () => {
      const app = createMockApp({ path: 'old.md' });
      const ctx = new CurrentNoteContext(app);

      ctx.toggle();
      expect(ctx.getNotePath()).toBe('old.md');

      // 模拟切换到新笔记
      app.workspace.getActiveViewOfType = jest.fn().mockReturnValue({
        file: { path: 'new.md' },
      });
      ctx.refresh();
      expect(ctx.getNotePath()).toBe('new.md');
    });

    test('未 included 时 refresh 不做任何事', () => {
      const app = createMockApp({ path: 'note.md' });
      const ctx = new CurrentNoteContext(app);

      ctx.refresh();
      expect(ctx.getNotePath()).toBeNull();
    });
  });
});
