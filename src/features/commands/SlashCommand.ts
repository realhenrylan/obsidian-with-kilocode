/**
 * 斜杠命令定义
 */
export interface SlashCommand {
  id: string;
  name: string;
  description: string;
  icon: string;
  handler: (args: string) => Promise<void>;
}

/**
 * 内置斜杠命令注册表
 */
export class CommandRegistry {
  private commands: Map<string, SlashCommand> = new Map();

  /** 注册命令 */
  register(command: SlashCommand): void {
    this.commands.set(command.id, command);
  }

  /** 获取命令 */
  get(id: string): SlashCommand | undefined {
    return this.commands.get(id);
  }

  /** 获取所有命令 */
  getAll(): SlashCommand[] {
    return Array.from(this.commands.values());
  }

  /** 搜索命令 */
  search(query: string): SlashCommand[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(cmd =>
      cmd.name.toLowerCase().includes(lowerQuery) ||
      cmd.description.toLowerCase().includes(lowerQuery)
    );
  }
}

/** 创建默认命令注册表 */
export function createDefaultCommandRegistry(): CommandRegistry {
  const registry = new CommandRegistry();

  registry.register({
    id: 'compact',
    name: '/compact',
    description: 'Compact conversation history',
    icon: '📦',
    handler: async () => {
      // TODO: 实现压缩逻辑
    },
  });

  registry.register({
    id: 'clear',
    name: '/clear',
    description: 'Clear current conversation',
    icon: '🗑️',
    handler: async () => {
      // TODO: 实现清空逻辑
    },
  });

  registry.register({
    id: 'model',
    name: '/model',
    description: 'Switch AI model',
    icon: '🤖',
    handler: async () => {
      // TODO: 实现模型切换
    },
  });

  registry.register({
    id: 'mode',
    name: '/mode',
    description: 'Switch mode (plan/code/ask)',
    icon: '🔄',
    handler: async () => {
      // TODO: 实现模式切换
    },
  });

  return registry;
}
