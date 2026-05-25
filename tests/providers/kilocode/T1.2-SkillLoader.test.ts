import { loadSkills, invalidateSkillsCache, SkillMeta } from '../../../src/providers/kilocode/runtime/SkillLoader';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * 创建临时 vault 目录结构，返回 vaultPath。
 * 每个测试用例使用独立的临时目录，避免测试间相互影响。
 */
async function createTempVault(): Promise<string> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'skill-loader-test-'));
  return tmpDir;
}

/**
 * 在 vaultPath 下创建技能文件
 */
async function createSkillFile(
  vaultPath: string,
  skillName: string,
  frontmatter: Record<string, string>,
  body: string,
): Promise<string> {
  const skillDir = path.join(vaultPath, '.kilo', 'skills', skillName);
  await fs.promises.mkdir(skillDir, { recursive: true });

  const frontmatterLines = ['---'];
  for (const [key, value] of Object.entries(frontmatter)) {
    frontmatterLines.push(`${key}: ${value}`);
  }
  frontmatterLines.push('---');

  const content = frontmatterLines.join('\n') + '\n\n' + body;
  const skillPath = path.join(skillDir, 'SKILL.md');
  await fs.promises.writeFile(skillPath, content, 'utf-8');
  return skillPath;
}

/**
 * 删除临时 vault 目录
 */
async function cleanupVault(vaultPath: string): Promise<void> {
  await fs.promises.rm(vaultPath, { recursive: true, force: true });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('T1.2 SkillLoader', () => {
  let vaultPath: string;

  beforeEach(() => {
    // 清除缓存，避免测试间污染
    invalidateSkillsCache();
  });

  describe('loadSkills()', () => {
    test('loads skills from .kilo/skills/*/SKILL.md with correct frontmatter', async () => {
      vaultPath = await createTempVault();
      try {
        await createSkillFile(vaultPath, 'kilocode-core', {
          name: 'kilocode-core',
          description: 'Core KiloCode skills for Obsidian',
        }, '## Principles\n\n- Use wikilinks: [[Note]]\n- Anti-patterns\n');

        const skills = await loadSkills(vaultPath);

        expect(skills).toHaveLength(1);
        expect(skills[0].name).toBe('kilocode-core');
        expect(skills[0].description).toBe('Core KiloCode skills for Obsidian');
        expect(skills[0].content).toContain('## Principles');
        expect(skills[0].content).toContain('[[Note]]');
        // 使用 path 确保跨平台（Windows 用反斜杠）
        expect(skills[0].path).toContain(path.join('.kilo', 'skills', 'kilocode-core', 'SKILL.md'));
      } finally {
        await cleanupVault(vaultPath);
      }
    });

    test('returns empty array when .kilo/skills/ does not exist', async () => {
      vaultPath = await createTempVault();
      try {
        // 不创建 .kilo/skills/ 目录
        const skills = await loadSkills(vaultPath);
        expect(skills).toEqual([]);
      } finally {
        await cleanupVault(vaultPath);
      }
    });

    test('includes skill content when SKILL.md has no frontmatter delimiters', async () => {
      vaultPath = await createTempVault();
      try {
        // 直接将文件写入 skills 目录（无 frontmatter 分隔符）
        const skillDir = path.join(vaultPath, '.kilo', 'skills', 'no-frontmatter');
        await fs.promises.mkdir(skillDir, { recursive: true });
        const rawContent = 'Just raw content without any frontmatter.';
        await fs.promises.writeFile(path.join(skillDir, 'SKILL.md'), rawContent, 'utf-8');

        const skills = await loadSkills(vaultPath);
        // 没有 frontmatter → name/description 为空 → 跳过该技能
        expect(skills).toHaveLength(0);
      } finally {
        await cleanupVault(vaultPath);
      }
    });

    test('returns empty frontmatter when only opening --- without closing delimiter', async () => {
      vaultPath = await createTempVault();
      try {
        const skillDir = path.join(vaultPath, '.kilo', 'skills', 'open-only');
        await fs.promises.mkdir(skillDir, { recursive: true });
        // 有 opening --- 但没有 closing ---
        const content = '---\nname: test\nthis should not parse correctly\n';
        await fs.promises.writeFile(path.join(skillDir, 'SKILL.md'), content, 'utf-8');

        const skills = await loadSkills(vaultPath);
        // 没有完整 frontmatter → name/description 为空 → 跳过
        expect(skills).toHaveLength(0);
      } finally {
        await cleanupVault(vaultPath);
      }
    });

    test('parses frontmatter with quoted values', async () => {
      vaultPath = await createTempVault();
      try {
        // 包含引号的值（单引号和双引号）
        const skillDir = path.join(vaultPath, '.kilo', 'skills', 'quoted');
        await fs.promises.mkdir(skillDir, { recursive: true });
        const content = [
          '---',
          "name: 'quoted-name'",
          'description: "A skill with quotes"',
          '---',
          'Body content here',
        ].join('\n');
        await fs.promises.writeFile(path.join(skillDir, 'SKILL.md'), content, 'utf-8');

        const skills = await loadSkills(vaultPath);
        expect(skills).toHaveLength(1);
        expect(skills[0].name).toBe('quoted-name');
        expect(skills[0].description).toBe('A skill with quotes');
      } finally {
        await cleanupVault(vaultPath);
      }
    });

    test('skips skills missing name or description in frontmatter', async () => {
      vaultPath = await createTempVault();
      try {
        // 创建一个只有 description 没有 name 的技能
        await createSkillFile(vaultPath, 'no-name', {
          description: 'This skill has no name',
        }, 'Some content');

        // 创建一个只有 name 没有 description 的技能
        await createSkillFile(vaultPath, 'no-desc', {
          name: 'no-desc-skill',
        }, 'Some content');

        // 创建一个完整合法的技能
        await createSkillFile(vaultPath, 'valid-skill', {
          name: 'valid-skill',
          description: 'This is a valid skill',
        }, 'Valid content');

        const skills = await loadSkills(vaultPath);
        expect(skills).toHaveLength(1);
        expect(skills[0].name).toBe('valid-skill');
      } finally {
        await cleanupVault(vaultPath);
      }
    });

    test('returns cached result within 30s TTL', async () => {
      vaultPath = await createTempVault();
      try {
        // 首次加载
        await createSkillFile(vaultPath, 'test-skill', {
          name: 'test-skill',
          description: 'Original description',
        }, 'Original content');

        let skills = await loadSkills(vaultPath);
        expect(skills).toHaveLength(1);
        expect(skills[0].description).toBe('Original description');

        // 修改技能文件
        await createSkillFile(vaultPath, 'test-skill', {
          name: 'test-skill',
          description: 'Modified description',
        }, 'Modified content');

        // 立即再次调用（30 秒内），应返回缓存中的旧内容
        skills = await loadSkills(vaultPath);
        expect(skills).toHaveLength(1);
        expect(skills[0].description).toBe('Original description');
        expect(skills[0].content).toContain('Original content');
      } finally {
        await cleanupVault(vaultPath);
      }
    });

    test('returns fresh result after invalidateSkillsCache()', async () => {
      vaultPath = await createTempVault();
      try {
        // 首次加载
        await createSkillFile(vaultPath, 'test-skill', {
          name: 'test-skill',
          description: 'Original description',
        }, 'Original content');

        let skills = await loadSkills(vaultPath);
        expect(skills).toHaveLength(1);
        expect(skills[0].description).toBe('Original description');

        // 修改技能文件
        await createSkillFile(vaultPath, 'test-skill', {
          name: 'test-skill',
          description: 'Modified description',
        }, 'Modified content');

        // 使缓存失效
        invalidateSkillsCache();

        // 再次加载，应获取新内容
        skills = await loadSkills(vaultPath);
        expect(skills).toHaveLength(1);
        expect(skills[0].description).toBe('Modified description');
        expect(skills[0].content).toContain('Modified content');
      } finally {
        await cleanupVault(vaultPath);
      }
    });
  });
});
