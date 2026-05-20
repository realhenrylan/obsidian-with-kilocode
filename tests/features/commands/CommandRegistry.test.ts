import { CommandRegistry, createDefaultCommandRegistry } from '../../../src/features/commands/SlashCommand';
import type { SlashCommand } from '../../../src/features/commands/SlashCommand';

function createMockCommand(overrides: Partial<SlashCommand> = {}): SlashCommand {
  return {
    id: 'test',
    name: '/test',
    description: 'Test command',
    icon: '🧪',
    handler: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('CommandRegistry', () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = new CommandRegistry();
  });

  test('register adds a command', () => {
    const cmd = createMockCommand();
    registry.register(cmd);
    expect(registry.get('test')).toBe(cmd);
  });

  test('get returns command by id', () => {
    const cmd = createMockCommand({ id: 'mycmd' });
    registry.register(cmd);
    expect(registry.get('mycmd')).toBe(cmd);
  });

  test('get returns undefined for unknown id', () => {
    expect(registry.get('nonexistent')).toBeUndefined();
  });

  test('getAll returns all registered commands', () => {
    const cmd1 = createMockCommand({ id: 'a' });
    const cmd2 = createMockCommand({ id: 'b' });
    registry.register(cmd1);
    registry.register(cmd2);
    const all = registry.getAll();
    expect(all).toHaveLength(2);
    expect(all).toContain(cmd1);
    expect(all).toContain(cmd2);
  });

  test('getAll returns empty array when no commands', () => {
    expect(registry.getAll()).toEqual([]);
  });

  describe('search', () => {
    beforeEach(() => {
      registry.register(createMockCommand({ id: 'compact', name: '/compact', description: 'Compact conversation history' }));
      registry.register(createMockCommand({ id: 'clear', name: '/clear', description: 'Clear current conversation' }));
      registry.register(createMockCommand({ id: 'model', name: '/model', description: 'Switch AI model' }));
    });

    test('filters by name', () => {
      const results = registry.search('compact');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('compact');
    });

    test('filters by description', () => {
      const results = registry.search('Switch');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('model');
    });

    test('search is case-insensitive', () => {
      const results = registry.search('COMPACT');
      expect(results).toHaveLength(1);
    });

    test('returns empty for no match', () => {
      const results = registry.search('nonexistent');
      expect(results).toHaveLength(0);
    });
  });
});

describe('createDefaultCommandRegistry', () => {
  test('returns registry with 4 commands', () => {
    const registry = createDefaultCommandRegistry();
    expect(registry.getAll()).toHaveLength(4);
  });

  test('contains compact command', () => {
    const registry = createDefaultCommandRegistry();
    const cmd = registry.get('compact');
    expect(cmd).toBeDefined();
    expect(cmd!.name).toBe('/compact');
    expect(cmd!.description).toBe('Compact conversation history');
  });

  test('contains clear command', () => {
    const registry = createDefaultCommandRegistry();
    const cmd = registry.get('clear');
    expect(cmd).toBeDefined();
    expect(cmd!.name).toBe('/clear');
  });

  test('contains model command', () => {
    const registry = createDefaultCommandRegistry();
    const cmd = registry.get('model');
    expect(cmd).toBeDefined();
    expect(cmd!.name).toBe('/model');
  });

  test('contains mode command', () => {
    const registry = createDefaultCommandRegistry();
    const cmd = registry.get('mode');
    expect(cmd).toBeDefined();
    expect(cmd!.name).toBe('/mode');
    expect(cmd!.description).toBe('Switch mode (plan/code/ask)');
  });

  test('all commands have handlers', () => {
    const registry = createDefaultCommandRegistry();
    for (const cmd of registry.getAll()) {
      expect(typeof cmd.handler).toBe('function');
    }
  });
});
