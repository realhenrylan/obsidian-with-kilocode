// T3.3 技能编目系统 — 单元测试
//
// 覆盖范围：
// - 编目列表返回预定义技能
// - 安装技能创建 SKILL.md 文件
// - 已存在技能跳过安装

import * as fs from 'fs';
import * as path from 'path';
import { listCatalog, installSkill, isSkillInstalled } from '../../../src/providers/kilocode/runtime/SkillCatalog';

// ── Helpers ─────────────────────────────────────────────────────────────────────

function createTempVault(): string {
  const tmpDir = path.join(__dirname, '..', '..', '..', 'temp-test-vault-' + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

function removeTempVault(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Windows 可能因文件锁定失败，忽略
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('T3.3 SkillCatalog', () => {
  // ================================================================
  // 编目列表
  // ================================================================

  describe('listCatalog', () => {
    test('returns predefined skill list with name and summary', () => {
      const catalog = listCatalog();
      expect(catalog.length).toBeGreaterThanOrEqual(3);
      for (const skill of catalog) {
        expect(skill).toHaveProperty('name');
        expect(skill).toHaveProperty('summary');
        expect(skill).toHaveProperty('description');
        expect(typeof skill.name).toBe('string');
        expect(typeof skill.summary).toBe('string');
        expect(skill.name.length).toBeGreaterThan(0);
      }
    });

    test('includes expected skills', () => {
      const names = listCatalog().map(s => s.name);
      expect(names).toContain('frontmatter');
      expect(names).toContain('vault-org');
      expect(names).toContain('obsidian-search');
    });
  });

  // ================================================================
  // 安装技能
  // ================================================================

  describe('installSkill', () => {
    let vaultPath: string;

    beforeEach(() => {
      vaultPath = createTempVault();
    });

    afterEach(() => {
      removeTempVault(vaultPath);
    });

    test('installs a new skill and creates SKILL.md', () => {
      const result = installSkill(vaultPath, 'frontmatter');
      expect(result.success).toBe(true);
      expect(result.message).toContain('Installed');

      const targetFile = path.join(vaultPath, '.kilo', 'skills', 'frontmatter', 'SKILL.md');
      expect(fs.existsSync(targetFile)).toBe(true);

      const content = fs.readFileSync(targetFile, 'utf-8');
      expect(content).toContain('name: frontmatter');
      expect(content).toContain('frontmatter');
    });

    test('returns error for unknown skill name', () => {
      const result = installSkill(vaultPath, 'nonexistent-skill');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Unknown skill');
    });

    test('skips installation when skill already exists', () => {
      // First install
      const result1 = installSkill(vaultPath, 'frontmatter');
      expect(result1.success).toBe(true);

      // Second install should be skipped
      const result2 = installSkill(vaultPath, 'frontmatter');
      expect(result2.success).toBe(false);
      expect(result2.message).toContain('already installed');
    });
  });

  // ================================================================
  // 检查已安装
  // ================================================================

  describe('isSkillInstalled', () => {
    let vaultPath: string;

    beforeEach(() => {
      vaultPath = createTempVault();
    });

    afterEach(() => {
      removeTempVault(vaultPath);
    });

    test('returns false when skill is not installed', () => {
      expect(isSkillInstalled(vaultPath, 'frontmatter')).toBe(false);
    });

    test('returns true after skill is installed', () => {
      installSkill(vaultPath, 'frontmatter');
      expect(isSkillInstalled(vaultPath, 'frontmatter')).toBe(true);
    });
  });
});
