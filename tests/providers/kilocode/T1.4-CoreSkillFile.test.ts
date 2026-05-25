import * as fs from 'fs';
import * as path from 'path';

// ── Constants ──────────────────────────────────────────────────────────────────

const CORE_SKILL_PATH = path.resolve(__dirname, '..', '..', '..', '.kilo', 'skills', 'kilocode-core', 'SKILL.md');

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('T1.4 Core Skill File', () => {
  test('exists at .kilo/skills/kilocode-core/SKILL.md and is readable', () => {
    expect(fs.existsSync(CORE_SKILL_PATH)).toBe(true);

    const stat = fs.statSync(CORE_SKILL_PATH);
    expect(stat.isFile()).toBe(true);
    expect(stat.size).toBeGreaterThan(0);
  });

  test('has valid frontmatter with name: kilocode-core and non-empty description', () => {
    const content = fs.readFileSync(CORE_SKILL_PATH, 'utf-8');

    // 解析 frontmatter
    const trimmed = content.trimStart();
    expect(trimmed.startsWith('---')).toBe(true);

    const secondDelim = trimmed.indexOf('\n---', 3);
    expect(secondDelim).not.toBe(-1);

    const frontmatterText = trimmed.slice(3, secondDelim).trim();

    // 验证 name 字段
    expect(frontmatterText).toContain('name: kilocode-core');

    // 验证 description 字段存在且非空
    const descMatch = frontmatterText.match(/^description:\s*(.+)$/m);
    expect(descMatch).not.toBeNull();
    expect(descMatch![1].trim().length).toBeGreaterThan(0);

    // 验证正文超过 200 字
    const body = trimmed.slice(secondDelim + 4).trimStart();
    expect(body.length).toBeGreaterThan(200);
  });

  test('body contains Anti-patterns section, Obsidian section, and [[wikilink]] keyword', () => {
    const content = fs.readFileSync(CORE_SKILL_PATH, 'utf-8');

    // 剥离 frontmatter 得到正文
    const trimmed = content.trimStart();
    const secondDelim = trimmed.indexOf('\n---', 3);
    const body = secondDelim !== -1
      ? trimmed.slice(secondDelim + 4).trimStart()
      : trimmed;

    expect(body).toContain('Anti-patterns');
    expect(body).toContain('Obsidian');
    expect(body).toContain('[[wikilink]]');
  });
});
