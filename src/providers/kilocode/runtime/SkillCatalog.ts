import * as fs from 'fs';
import * as path from 'path';

export interface CatalogSkill {
  name: string;
  summary: string;
  description: string;
}

const CATALOG: CatalogSkill[] = [
  {
    name: 'frontmatter',
    summary: 'Expert at managing Obsidian YAML frontmatter — validate, update, and query metadata',
    description: 'Use when reading or modifying frontmatter fields in Obsidian notes',
  },
  {
    name: 'vault-org',
    summary: 'Helps organize vault structure — folder management, note linking, graph analysis',
    description: 'Use when reorganizing notes, managing folder structure, or analyzing vault graph',
  },
  {
    name: 'obsidian-search',
    summary: 'Advanced search across vault notes using tags, links, and content patterns',
    description: 'Use when searching for specific content, finding orphaned notes, or tag analysis',
  },
  {
    name: 'template-engine',
    summary: 'Creates and manages note templates with dynamic variables and frontmatter schemas',
    description: 'Use when creating template notes, daily notes, or standardized note structures',
  },
];

export function listCatalog(): CatalogSkill[] {
  return [...CATALOG];
}

const TEMPLATES: Record<string, string> = {
  frontmatter: `---
name: frontmatter
description: Use when reading or modifying frontmatter fields in Obsidian notes
---

## Core Capability
You are an expert at reading, understanding, and manipulating YAML frontmatter in Obsidian notes.

## Key Behaviors
- Always validate frontmatter syntax before making changes
- Preserve existing fields unless explicitly asked to modify them
- Use proper YAML types (arrays use \`[item1, item2]\` or multiline \`- item\`)
- When unsure about a field's purpose, read the note content for context

## Common Frontmatter Fields
- \`tags\`: Array of strings (e.g. \`[project/alpha, status/active]\`)
- \`aliases\`: Alternative note names for [[wikilink]] resolution
- \`created\` / \`modified\`: Date strings in ISO 8601 format
- \`status\`: \`draft\` / \`review\` / \`final\`
`,
  'vault-org': `---
name: vault-org
description: Use when reorganizing notes, managing folder structure, or analyzing vault graph
---

## Core Capability
You help organize Obsidian vaults — manage folder structures, improve note linking, and analyze connectivity.

## Key Behaviors
- Before reorganizing, read the full vault structure with \`ls\` or \`glob\`
- Never move notes that are referenced by active [[wikilinks]] without updating links
- Suggest folder naming conventions consistent with existing patterns
- Prefer flat hierarchies (max 3 levels deep)

## Anti-patterns
- Do not reorganize without understanding existing link structure
- Do not create empty folders
- Do not rename folders that would break many links
`,
  'obsidian-search': `---
name: obsidian-search
description: Use when searching for specific content, finding orphaned notes, or tag analysis
---

## Core Capability
You perform advanced searches across the Obsidian vault using content patterns, tags, and link analysis.

## Key Behaviors
- Use \`glob\` to find files by path patterns
- Use \`grep\` to search file contents for specific terms
- Combine tag and content search for precise results
- Report the number of matches and a brief sample

## Common Search Patterns
- Find orphaned notes: Notes with no incoming [[wikilinks]]
- Tag analysis: Find all notes with a specific tag
- Content search: Find notes containing specific keywords or patterns
`,
  'template-engine': `---
name: template-engine
description: Use when creating template notes, daily notes, or standardized note structures
---

## Core Capability
You create and manage Obsidian note templates with consistent structure and frontmatter.

## Key Behaviors
- Templates should include YAML frontmatter with appropriate default fields
- Use placeholders like {{title}}, {{date}}, {{tags}} for dynamic content
- Create templates in a \`_templates/\` folder at vault root
- Offer to apply a template when creating new notes of known types

## Template Structure Best Practice
- Always include \`created: {{date}}\` in frontmatter
- Add comments in HTML comments (<!-- comment -->) to guide template users
- Keep templates focused on a single note type
`,
};

export interface InstallResult {
  success: boolean;
  message: string;
}

export function installSkill(vaultPath: string, skillName: string): InstallResult {
  const skill = CATALOG.find(s => s.name === skillName);
  if (!skill) {
    return { success: false, message: `Unknown skill: "${skillName}". Available: ${CATALOG.map(s => s.name).join(', ')}` };
  }

  const template = TEMPLATES[skillName];
  if (!template) {
    return { success: false, message: `No template available for skill: "${skillName}"` };
  }

  const skillsDir = path.join(vaultPath, '.kilo', 'skills', skillName);
  const targetFile = path.join(skillsDir, 'SKILL.md');

  if (fs.existsSync(targetFile)) {
    return { success: false, message: `Skill "${skillName}" is already installed at ${targetFile}` };
  }

  try {
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(targetFile, template, 'utf-8');
    return { success: true, message: `Installed skill: "${skillName}"` };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Failed to install skill "${skillName}": ${reason}` };
  }
}

export function isSkillInstalled(vaultPath: string, skillName: string): boolean {
  const targetFile = path.join(vaultPath, '.kilo', 'skills', skillName, 'SKILL.md');
  return fs.existsSync(targetFile);
}
