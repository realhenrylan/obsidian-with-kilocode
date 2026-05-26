import * as fs from 'fs';
import * as path from 'path';

export interface SkillMeta {
  name: string;
  description: string;
  content: string;
  path: string;
}

const SKILLS_TTL_MS = 30_000;

interface CacheEntry {
  skills: SkillMeta[];
  timestamp: number;
}

const skillsCache = new Map<string, CacheEntry>();

interface ParsedFrontmatter {
  attrs: Record<string, string>;
  body: string;
}

function parseFrontmatter(content: string): ParsedFrontmatter {
  const trimmed = content.trimStart();
  const attrs: Record<string, string> = {};

  if (!trimmed.startsWith('---')) {
    return { attrs, body: content };
  }

  const secondDelim = trimmed.indexOf('\n---', 3);
  if (secondDelim === -1) {
    return { attrs, body: content };
  }

  const frontmatterText = trimmed.slice(3, secondDelim).trim();
  const body = trimmed.slice(secondDelim + 4).trimStart();

  for (const line of frontmatterText.split(/\r?\n/)) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    if (!key) continue;

    let value = line.slice(colonIdx + 1).trim();
    if ((value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1);
    }

    attrs[key] = value;
  }

  return { attrs, body };
}

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
        continue;
      }
    }

    return files;
  } catch {
    return [];
  }
}

export async function loadSkills(vaultPath: string): Promise<SkillMeta[]> {
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

      if (!name || !description) continue;

      skills.push({
        name,
        description,
        content: body.trim(),
        path: filePath,
      });
    } catch {
      continue;
    }
  }

  skillsCache.set(vaultPath, {
    skills,
    timestamp: Date.now(),
  });

  return skills;
}

export function invalidateSkillsCache(): void {
  skillsCache.clear();
}
