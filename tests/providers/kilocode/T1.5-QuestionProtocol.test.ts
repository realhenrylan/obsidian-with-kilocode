import { KiloCodeChatRuntime } from '../../../src/providers/kilocode/runtime/KiloCodeChatRuntime';
import type { SkillMeta } from '../../../src/providers/kilocode/runtime/SkillLoader';

// ── Mocks ──────────────────────────────────────────────────────────────────────

jest.mock('../../../src/providers/kilocode/runtime/SkillLoader', () => ({
  loadSkills: jest.fn(),
  invalidateSkillsCache: jest.fn(),
}));

import { loadSkills } from '../../../src/providers/kilocode/runtime/SkillLoader';

jest.mock('child_process', () => ({
  spawn: jest.fn(),
  execFile: jest.fn(),
}));
jest.mock('http', () => {
  const realHttp = jest.requireActual('http');
  return { request: jest.fn(), Agent: realHttp.Agent };
});

const mockCoreSkill: SkillMeta[] = [
  {
    name: 'kilocode-core',
    description: 'Core KiloCode skills for Obsidian',
    content: '## Core Rules\n\nBe helpful.',
    path: '/mock/.kilo/skills/kilocode-core/SKILL.md',
  },
];

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('T1.5 Question Protocol Injection', () => {
  let runtime: KiloCodeChatRuntime;

  beforeEach(() => {
    jest.clearAllMocks();
    runtime = new KiloCodeChatRuntime({} as any, () => ({} as any));
  });

  test('injects "## Question Protocol" into buildSkillsContext() output', async () => {
    (loadSkills as jest.Mock).mockResolvedValue(mockCoreSkill);

    const context = await (runtime as any).buildSkillsContext('/mock/vault');
    expect(context).toContain('## Question Protocol');
    expect(context).toContain('[SYSTEM CONTEXT — Obsidian KiloCode Core]');
  });

  test('protocol content contains "Decide for me" and "Explore options" keywords', async () => {
    (loadSkills as jest.Mock).mockResolvedValue(mockCoreSkill);

    const context = await (runtime as any).buildSkillsContext('/mock/vault');
    expect(context).toContain('Decide for me');
    expect(context).toContain('Explore options');
  });

  test('protocol appears after core skill content, before user message in final payload', async () => {
    // 验证在 buildSkillsContext 输出中，协议位于 core skill 之后
    (loadSkills as jest.Mock).mockResolvedValue(mockCoreSkill);

    const context = await (runtime as any).buildSkillsContext('/mock/vault');
    const coreSkillIndex = context.indexOf('[SYSTEM CONTEXT — Obsidian KiloCode Core]');
    const protocolIndex = context.indexOf('## Question Protocol');

    // 两者都必须存在
    expect(coreSkillIndex).not.toBe(-1);
    expect(protocolIndex).not.toBe(-1);
    // 协议在 core skill 之后
    expect(protocolIndex).toBeGreaterThan(coreSkillIndex);
  });
});
