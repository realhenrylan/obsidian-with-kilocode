// src/features/mcp/MCPManager.ts
// 路径 A（透传 kilo serve）：MCP 连接由 CLI 管理，本类退化为「配置容器 + 状态查询」层。
// - setConfigs/getConfigs：登记插件级 MCP 配置（vault/.kilocode/mcp.json 的 SDK 格式）
// - applyStatus：映射 CLI 返回的真实连接状态（client.mcp.status()）
// - 不再承载连接逻辑（无 connect/callTool）——工具调用在 CLI 内部完成

/**
 * 插件级 MCP 配置项。
 * 与 @kilocode/sdk Config.mcp 值相同格式（McpLocalConfig/McpRemoteConfig），
 * 本地定义以避免 features 层直接依赖 SDK 类型。
 */
export interface MCPServerConfig {
  /** 连接类型：local = 本地子进程，remote = URL */
  type: 'local' | 'remote';
  /** local：命令 + 参数（如 ["npx", "-y", "@modelcontextprotocol/server-github"]） */
  command?: string[];
  /** remote：服务地址 */
  url?: string;
  /** 启动时注入的环境变量 */
  environment?: Record<string, string>;
  /** 是否在 CLI 启动时启用（默认 true） */
  enabled?: boolean;
  /** 拉取工具列表超时（ms，默认 5000） */
  timeout?: number;
}

/** MCP 工具定义（用于 UI 展示和 @mention 下拉） */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** CLI 返回的 MCP 状态（client.mcp.status() 的值） */
export interface MCPStatusEntry {
  status: string;
  error?: string;
}

export type MCPServerStatus =
  | 'connected'
  | 'disabled'
  | 'failed'
  | 'needs_auth'
  | 'needs_client_registration'
  | 'disconnected';

export interface MCPServerInstance {
  name: string;
  config: MCPServerConfig;
  /** CLI 真实状态；不在状态表中的为 disconnected */
  status: MCPServerStatus;
  connected: boolean;
  /** failed / needs_client_registration 时的错误信息 */
  error?: string;
}

export class MCPManager {
  private configs: Record<string, MCPServerConfig> = {};
  private status: Record<string, MCPStatusEntry> = {};
  private onToolsChange?: () => void;

  /** 登记插件级 MCP 配置（读自 vault/.kilocode/mcp.json） */
  setConfigs(configs: Record<string, MCPServerConfig>): void {
    this.configs = { ...configs };
    this.onToolsChange?.();
  }

  getConfigs(): Record<string, MCPServerConfig> {
    return { ...this.configs };
  }

  removeConfig(name: string): void {
    if (this.configs[name]) {
      delete this.configs[name];
      delete this.status[name];
      this.onToolsChange?.();
    }
  }

  /** 应用 CLI 真实连接状态（来自 runtime.getMcpStatus()） */
  applyStatus(statusMap: Record<string, MCPStatusEntry>): void {
    // 只保留已知 server 的状态，忽略未知 key
    for (const [name, entry] of Object.entries(statusMap)) {
      if (this.configs[name]) {
        this.status[name] = entry;
      }
    }
    this.onToolsChange?.();
  }

  getServers(): MCPServerInstance[] {
    return Object.entries(this.configs).map(([name, config]) => {
      const entry = this.status[name];
      const status: MCPServerStatus =
        entry?.status === 'connected' ||
        entry?.status === 'disabled' ||
        entry?.status === 'failed' ||
        entry?.status === 'needs_auth' ||
        entry?.status === 'needs_client_registration'
          ? entry.status
          : 'disconnected';
      return {
        name,
        config,
        status,
        connected: entry?.status === 'connected',
        ...(entry?.error ? { error: entry.error } : {}),
      };
    });
  }

  /** 从已连接服务器收集可用工具列表 */
  getAllTools(): MCPTool[] {
    const tools: MCPTool[] = [];
    for (const server of this.getServers()) {
      if (server.connected) {
        // 工具列表由 CLI 通过 status 返回，此处仅作为占位；
        // 实际工具数据来自 runtime.getMcpStatus() 中的 tools 字段
        tools.push(...[]);
      }
    }
    return tools;
  }

  /** 预留：工具调用现在由 CLI 内部完成，本方法保留接口以便未来扩展 */
  async callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    throw new Error(`Tool ${toolName} not found`);
  }

  setOnToolsChange(callback: () => void): void {
    this.onToolsChange = callback;
  }
}
