import { Notice } from 'obsidian';
import { listCatalog } from '../../providers/kilocode/runtime/SkillCatalog';

/**
 * 斜杠命令定义
 */
export interface SlashCommand {
  id: string;
  name: string;
  description: string;
  icon: string;
  handler: (args: string) => Promise<string | void>;
}

/**
 * 内置斜杠命令注册表
 */
export class CommandRegistry {
  private commands: Map<string, SlashCommand> = new Map();

  register(command: SlashCommand): void {
    this.commands.set(command.id, command);
  }

  get(id: string): SlashCommand | undefined {
    return this.commands.get(id);
  }

  getAll(): SlashCommand[] {
    return Array.from(this.commands.values());
  }

  search(query: string): SlashCommand[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(cmd =>
      cmd.name.toLowerCase().includes(lowerQuery) ||
      cmd.description.toLowerCase().includes(lowerQuery)
    );
  }
}

export function createDefaultCommandRegistry(): CommandRegistry {
  const registry = new CommandRegistry();

  registry.register({
    id: 'compact',
    name: '/compact',
    description: 'Compact conversation history',
    icon: '\uD83D\uDCE6',
    handler: async () => {
      return 'Please compact the conversation history, keeping only the key context.';
    },
  });

  registry.register({
    id: 'clear',
    name: '/clear',
    description: 'Clear current conversation',
    icon: '\uD83D\uDDD1\uFE0F',
    handler: async () => {
      return '/clear';
    },
  });

  registry.register({
    id: 'model',
    name: '/model <name>',
    description: 'Switch AI model (e.g. /model claude-sonnet-4)',
    icon: '\uD83E\uDD16',
    handler: async (args: string) => {
      if (!args.trim()) {
        new Notice('Usage: /model <model-id> (e.g. /model claude-sonnet-4)');
        return;
      }
      return `/model ${args.trim()}`;
    },
  });

  registry.register({
    id: 'mode',
    name: '/mode <plan|code|ask>',
    description: 'Switch mode (plan/code/ask)',
    icon: '\uD83D\uDD04',
    handler: async (args: string) => {
      const mode = args.trim().toLowerCase();
      if (!['plan', 'code', 'ask'].includes(mode)) {
        new Notice('Usage: /mode plan | /mode code | /mode ask');
        return;
      }
      return `/mode ${mode}`;
    },
  });

  registry.register({
    id: 'skills',
    name: '/skills',
    description: 'List available skills',
    icon: '\uD83C\uDF93',
    handler: async () => {
      const catalog = listCatalog();
      const skillList = catalog.map(s => `- ${s.name}: ${s.summary}`).join('\n');
      new Notice(`Available skills:\n${skillList}`, 8000);
      return 'List available skills';
    },
  });

  registry.register({
    id: 'skill',
    name: '/skill <name>',
    description: 'Load a skill into context (e.g. /skill frontmatter)',
    icon: '\uD83C\uDF93',
    handler: async (args: string) => {
      const name = args.trim();
      if (!name) {
        const catalog = listCatalog();
        const list = catalog.map(s => s.name).join(', ');
        new Notice(`Usage: /skill <name>. Available: ${list}`, 6000);
        return;
      }
      const catalog = listCatalog();
      const skill = catalog.find(s => s.name === name);
      if (!skill) {
        new Notice(`Unknown skill: "${name}". Use /skills to list available.`);
        return;
      }
      return `[Activate skill: ${name}]\n${skill.description}\n\nFollow the instructions of this skill carefully.`;
    },
  });

  return registry;
}
