import { KiloCodeChatRuntime } from '../../../src/providers/kilocode/runtime/KiloCodeChatRuntime';
import type { SkillMeta } from '../../../src/providers/kilocode/runtime/SkillLoader';

// ── Mock SkillLoader ───────────────────────────────────────────────────────────

// 模拟 loadSkills 返回受控数据，避免真实文件 IO
const mockSkills: SkillMeta[] = [
  {
    name: 'kilocode-core',
    description: 'Core KiloCode skills for Obsidian',
    content: '## Core Rules\n\n- Always use [[wikilink]] for internal links\n- Never modify .obsidian/ config',
    path: '/mock/.kilo/skills/kilocode-core/SKILL.md',
  },
  {
    name: 'obsidian-search',
    description: 'Use when searching across vault notes',
    content: '## Search Functions\n\n- dv.pages() - query all pages',
    path: '/mock/.kilo/skills/obsidian-search/SKILL.md',
  },
  {
    name: 'vault-management',
    description: 'Use when organizing vault structure',
    content: '## Vault Operations\n\n- move file\n- rename file',
    path: '/mock/.kilo/skills/vault-management/SKILL.md',
  },
];

jest.mock('../../../src/providers/kilocode/runtime/SkillLoader', () => ({
  loadSkills: jest.fn(),
  invalidateSkillsCache: jest.fn(),
}));

import { loadSkills } from '../../../src/providers/kilocode/runtime/SkillLoader';

// ── Other mocks ────────────────────────────────────────────────────────────────

jest.mock('child_process', () => ({
  spawn: jest.fn(),
  execFile: jest.fn(),
}));

jest.mock('http', () => {
  const realHttp = jest.requireActual('http');
  return { request: jest.fn(), Agent: realHttp.Agent };
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('T1.3 Skills Integration in KiloCodeChatRuntime', () => {
  let runtime: KiloCodeChatRuntime;

  beforeEach(() => {
    jest.clearAllMocks();
    runtime = new KiloCodeChatRuntime({} as any, () => ({} as any));
  });

  describe('buildSkillsContext()', () => {
    test('injects [SYSTEM CONTEXT — Obsidian KiloCode Core] prefix when core skill exists', async () => {
      (loadSkills as jest.Mock).mockResolvedValue(mockSkills);

      const context = await (runtime as any).buildSkillsContext('/mock/vault');
      expect(context).toContain('[SYSTEM CONTEXT — Obsidian KiloCode Core]');
      expect(context).toContain('[[wikilink]]');
    });

    test('injects [AVAILABLE SPECIALIST SKILLS] section and lists skills without full body', async () => {
      (loadSkills as jest.Mock).mockResolvedValue(mockSkills);

      const context = await (runtime as any).buildSkillsContext('/mock/vault');
      expect(context).toContain('[AVAILABLE SPECIALIST SKILLS]');
      // 列出 specialist skill 名称
      expect(context).toContain('obsidian-search');
      expect(context).toContain('vault-management');
      // 包含 description
      expect(context).toContain('Use when searching across vault notes');
      // 包含使用提示
      expect(context).toContain('Use the `skill` tool to load any of these when needed');
    });

    test('does NOT inject full specialist skill body — only catalog listing', async () => {
      (loadSkills as jest.Mock).mockResolvedValue(mockSkills);

      const context = await (runtime as any).buildSkillsContext('/mock/vault');
      // specialist skill 的正文不应出现在上下文中
      expect(context).not.toContain('dv.pages()');
      expect(context).not.toContain('move file');
      expect(context).not.toContain('rename file');
      // 但 core skill 的正文应该出现
      expect(context).toContain('[[wikilink]]');
    });

    test('returns null when vaultPath is not provided', async () => {
      const context = await (runtime as any).buildSkillsContext();
      expect(context).toBeNull();
      expect(loadSkills).not.toHaveBeenCalled();
    });

    test('returns question protocol even when no skills are loaded', async () => {
      (loadSkills as jest.Mock).mockResolvedValue([]);

      const context = await (runtime as any).buildSkillsContext('/mock/vault');
      // 即使没有技能文件，协议也应注入
      expect(context).not.toBeNull();
      expect(context).toContain('## Question Protocol');
    });
  });
});
