// src/features/commands/SlashCommand.ts
// 斜杠命令定义与内置命令注册表
// Phase 3 §5.2：handler 依赖通过 createDefaultCommandRegistry(deps) 注入，
// 由调用方（KiloCodeView）在构造时传入真实控制器。

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
 * 内置命令依赖（由视图注入）
 */
export interface SlashCommandDeps {
  conversationController: {
    compact(keepRecent?: number): Promise<void>;
    deleteCurrent(): Promise<void>;
    createNew(): void;
  };
  settings: { compactKeepRecent: number };
  modelSwitcher: { open(): Promise<void> };
  planModeController: { cycleMode(): void };
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

/** 空实现兜底：未注入依赖时 handler 不执行任何操作 */
const noop = async (): Promise<void> => {};

/** 创建默认命令注册表（deps 未提供时 handler 为空实现） */
export function createDefaultCommandRegistry(deps?: Partial<SlashCommandDeps>): CommandRegistry {
  const registry = new CommandRegistry();

  registry.register({
    id: 'compact',
    name: '/compact',
    description: 'Compact conversation history',
    icon: '📦',
    handler: deps?.conversationController
      ? async () => {
          await deps!.conversationController!.compact(deps?.settings?.compactKeepRecent ?? 5);
        }
      : noop,
  });

  registry.register({
    id: 'clear',
    name: '/clear',
    description: 'Clear current conversation',
    icon: '🗑️',
    handler: deps?.conversationController
      ? async () => {
          await deps!.conversationController!.deleteCurrent();
          deps!.conversationController!.createNew();
        }
      : noop,
  });

  registry.register({
    id: 'model',
    name: '/model <name>',
    description: 'Switch AI model',
    icon: '🤖',
    handler: deps?.modelSwitcher
      ? async () => {
          await deps!.modelSwitcher!.open();
        }
      : async () => {
          new Notice('Model switcher not available in this context.');
        },
  });

  registry.register({
    id: 'mode',
    name: '/mode <plan|code|ask>',
    description: 'Switch mode (plan/code/ask)',
    icon: '🔄',
    handler: deps?.planModeController
      ? async () => {
          deps!.planModeController!.cycleMode();
        }
      : async (args: string) => {
          const mode = args.trim().toLowerCase();
          if (!['plan', 'code', 'ask'].includes(mode)) {
            new Notice('Usage: /mode plan | /mode code | /mode ask');
            return;
          }
          return `/mode ${mode}`;
        },
  });

  // Remote-only commands (skills listing / activation)
  registry.register({
    id: 'skills',
    name: '/skills',
    description: 'List available skills',
    icon: '🎓',
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
    icon: '🎓',
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
