// T2.3 技能热重载测试
//
// 覆盖范围：
// - 文件修改触发 invalidateSkillsCache
// - 新 SKILL.md 文件添加触发刷新
// - watcher dispose 正确清理
// - 内容更新后 loadSkills 返回新内容

import * as fs from 'fs';
import * as path from 'path';
import os from 'os';

jest.setTimeout(15000);

// Mock invalidateSkillsCache（避免影响其他测试模块的缓存状态）。
// spyInvalidate 用于验证 watcher 触发了失效；
// 同时调用 realInvalidate 确保实际的 SkillLoader 缓存被清理。
const spyInvalidate = jest.fn();
jest.mock('../../../src/providers/kilocode/runtime/SkillLoader', () => {
  const actual = jest.requireActual('../../../src/providers/kilocode/runtime/SkillLoader');
  return {
    ...actual,
    invalidateSkillsCache: () => {
      spyInvalidate();
      actual.invalidateSkillsCache();
    },
  };
});

// ── Helpers ────────────────────────────────────────────────────

/** 创建临时 vault 目录结构 */
function createTempVault(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-watcher-'));
  const skillsDir = path.join(tmpDir, '.kilo', 'skills');
  fs.mkdirSync(skillsDir, { recursive: true });
  return tmpDir;
}

/** 在指定 vault 的 .kilo/skills/ 下创建技能文件 */
function createSkillFile(vaultPath: string, skillName: string, content: string): string {
  const skillDir = path.join(vaultPath, '.kilo', 'skills', skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  const filePath = path.join(skillDir, 'SKILL.md');
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

/**
 * 等待指定毫秒（用于等待 fs.watch 事件传播）
 * fs.watch 的事件传播延迟通常 < 100ms，200ms 足够安全
 */
function wait(ms = 200): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── 导入（必须在 mock 之后） ──────────────────────────────────
const { createSkillWatcher } = require('../../../src/providers/kilocode/runtime/SkillWatcher');

// ── 测试 ────────────────────────────────────────────────────────

describe('T2.3 Skill Hot-Reload', () => {
  let vaultPath: string;

  beforeEach(() => {
    jest.clearAllMocks();
    vaultPath = createTempVault();
  });

  afterEach(() => {
    try { fs.rmSync(vaultPath, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  describe('watcher creation and disposal', () => {
    test('creates watcher when skills directory exists', () => {
      const watcher = createSkillWatcher(vaultPath);
      expect(watcher).toBeDefined();
      expect(typeof watcher.dispose).toBe('function');
      watcher.dispose();
    });

    test('creates watcher when skills directory does NOT exist', () => {
      // 删除 skills 目录，验证 watcher 能自动创建
      const skillsDir = path.join(vaultPath, '.kilo', 'skills');
      fs.rmSync(skillsDir, { recursive: true, force: true });
      expect(fs.existsSync(skillsDir)).toBe(false);

      const watcher = createSkillWatcher(vaultPath);
      expect(watcher).toBeDefined();
      // 验证目录被自动创建
      expect(fs.existsSync(skillsDir)).toBe(true);
      watcher.dispose();
    });

    test('dispose stops the watcher cleanly', () => {
      const watcher = createSkillWatcher(vaultPath);
      expect(() => watcher.dispose()).not.toThrow();
      // 二次 dispose 不应报错
      expect(() => watcher.dispose()).not.toThrow();
    });
  });

  describe('file changes trigger cache invalidation', () => {
    test('modifying SKILL.md triggers invalidateSkillsCache', async () => {
      createSkillFile(vaultPath, 'test-skill',
        '---\nname: test-skill\ndescription: Test skill\n---\nOriginal content'
      );

      const watcher = createSkillWatcher(vaultPath);
      await wait(); // 等待 watcher 初始化

      // 修改技能文件
      const skillFile = path.join(vaultPath, '.kilo', 'skills', 'test-skill', 'SKILL.md');
      fs.writeFileSync(skillFile, '---\nname: test-skill\ndescription: Test skill\n---\nModified content', 'utf-8');

      await wait(500); // 等待 fs.watch 事件 + 300ms 防抖

      expect(spyInvalidate).toHaveBeenCalled();
      watcher.dispose();
    });

    test('adding new SKILL.md file triggers invalidateSkillsCache', async () => {
      const watcher = createSkillWatcher(vaultPath);
      await wait(); // 等待 watcher 初始化

      // 创建新的技能目录和文件
      createSkillFile(vaultPath, 'new-skill',
        '---\nname: new-skill\ndescription: Newly added skill\n---\nBrand new content'
      );

      await wait(500); // 等待 fs.watch 事件 + 300ms 防抖

      expect(spyInvalidate).toHaveBeenCalled();
      watcher.dispose();
    });
  });

  describe('content update flow', () => {
    test('after invalidation, loadSkills returns updated content', async () => {
      const { loadSkills, invalidateSkillsCache } = require('../../../src/providers/kilocode/runtime/SkillLoader');

      // 创建初始技能
      createSkillFile(vaultPath, 'live-skill',
        '---\nname: live-skill\ndescription: Original desc\n---\nOriginal body'
      );

      // 验证初始内容
      let skills = await loadSkills(vaultPath);
      expect(skills).toHaveLength(1);
      expect(skills[0].content).toBe('Original body');

      // 修改技能文件内容
      const skillFile = path.join(vaultPath, '.kilo', 'skills', 'live-skill', 'SKILL.md');
      fs.writeFileSync(skillFile,
        '---\nname: live-skill\ndescription: Updated desc\n---\nUpdated body',
        'utf-8'
      );

      // 手动使缓存失效（模拟 watcher 的行为）
      invalidateSkillsCache();

      // 重新加载技能
      skills = await loadSkills(vaultPath);
      expect(skills).toHaveLength(1);
      expect(skills[0].content).toBe('Updated body');
      expect(skills[0].description).toBe('Updated desc');
    });
  });
});
