/**
 * SkillLoader - 技能加载模块
 *
 * 从 .kilo/skills/<name>/SKILL.md 目录结构加载技能文件。
 * 每个技能是一个独立的 Markdown 文件，包含 YAML frontmatter。
 * 参考 OpenCode Provider 的 SKILLS_TTL_MS 模式实现 30 秒缓存 TTL。
 *
 * 为什么不用 gray-matter：
 * - 零额外 npm 依赖（纯文本解析 frontmatter）
 * - 需求简单：只需 name + description 两个字段和正文
 * - 减少 esbuild 打包体积
 */

import * as fs from 'fs';
import * as path from 'path';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SkillMeta {
  /** frontmatter 中的 name 字段 */
  name: string;
  /** frontmatter 中的 description 字段（"Use when..." 句式） */
  description: string;
  /** 剥离 frontmatter 后的正文内容 */
  content: string;
  /** 技能文件在磁盘上的路径 */
  path: string;
}

// ── Cache ──────────────────────────────────────────────────────────────────────

const SKILLS_TTL_MS = 30_000; // 30 秒缓存 TTL

interface CacheEntry {
  skills: SkillMeta[];
  /** 缓存创建时间戳 */
  timestamp: number;
}

/** 缓存 key = vaultPath */
const skillsCache = new Map<string, CacheEntry>();

// ── Frontmatter 解析（零依赖） ──────────────────────────────────────────────────

interface ParsedFrontmatter {
  /** 解析出的属性键值对 */
  attrs: Record<string, string>;
  /** 剥离 frontmatter 后的正文 */
  body: string;
}

/*
 * 从 Markdown 文件内容中解析 YAML frontmatter。
 * 只提取字符串类型的属性（name, description 等），忽略复杂类型。
 *
 * frontmatter 格式：
 *   ---
 *   name: xxx
 *   description: yyy
 *   ---
 *   正文内容...
 */
function parseFrontmatter(content: string): ParsedFrontmatter {
  const trimmed = content.trimStart();
  const attrs: Record<string, string> = {};

  // 必须以 `---` 开头
  if (!trimmed.startsWith('---')) {
    return { attrs, body: content };
  }

  // 找到 closing `---`
  const secondDelim = trimmed.indexOf('\n---', 3);
  if (secondDelim === -1) {
    return { attrs, body: content };
  }

  const frontmatterText = trimmed.slice(3, secondDelim).trim();
  const body = trimmed.slice(secondDelim + 4).trimStart();

  // 解析 key: value 行（只处理简单字符串类型）
  for (const line of frontmatterText.split(/\r?\n/)) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    if (!key) continue;

    let value = line.slice(colonIdx + 1).trim();
    // 去掉引号（单引号或双引号）
    if ((value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1);
    }

    attrs[key] = value;
  }

  return { attrs, body };
}

// ── 目录扫描 ────────────────────────────────────────────────────────────────────

/*
 * 扫描 .kilo/skills/<name>/SKILL.md 目录结构，加载所有合法技能。
 *
 * 目录结构要求：
 *   .kilo/skills/
 *     +-- skill-name-1/
 *     |   +-- SKILL.md
 *     +-- skill-name-2/
 *         +-- SKILL.md
 */
async function scanSkillFiles(skillsDir: string): Promise<string[]> {
  try {
    const entries = await fs.promises.readdir(skillsDir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
      try {
        const stat = await fs.promises.stat(skillFile);
        if (stat.isFile()) {
          files.push(skillFile);
        }
      } catch {
        // SKILL.md 不存在，跳过该目录
        continue;
      }
    }

    return files;
  } catch {
    // skillsDir 不存在
    return [];
  }
}

// ── 主 API ──────────────────────────────────────────────────────────────────────

/**
 * 从 vault 路径加载所有技能。
 *
 * 缓存策略：30 秒 TTL。同一 vaultPath 在 30 秒内重复调用返回缓存结果。
 * 调用 `invalidateSkillsCache()` 可立即刷新缓存。
 *
 * @param vaultPath - Obsidian vault 根路径
 * @returns 技能元数据数组（空数组 = 无技能）
 */
export async function loadSkills(vaultPath: string): Promise<SkillMeta[]> {
  // 检查缓存
  const cached = skillsCache.get(vaultPath);
  if (cached && Date.now() - cached.timestamp < SKILLS_TTL_MS) {
    return cached.skills;
  }

  const skillsDir = path.join(vaultPath, '.kilo', 'skills');
  const skillFiles = await scanSkillFiles(skillsDir);
  const skills: SkillMeta[] = [];

  for (const filePath of skillFiles) {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const { attrs, body } = parseFrontmatter(content);

      const name = attrs.name?.trim();
      const description = attrs.description?.trim();

      // 缺少 name 或 description 的跳过
      if (!name || !description) continue;

      skills.push({
        name,
        description,
        content: body.trim(),
        path: filePath,
      });
    } catch {
      // 单个文件读取出错，跳过（不阻塞其他技能）
      continue;
    }
  }

  // 更新缓存
  skillsCache.set(vaultPath, {
    skills,
    timestamp: Date.now(),
  });

  return skills;
}

/**
 * 使所有 vault 路径的技能缓存立即失效。
 * 用于技能文件热重载后强制刷新。
 */
export function invalidateSkillsCache(): void {
  skillsCache.clear();
}
