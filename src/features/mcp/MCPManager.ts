export interface MCPServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

export interface MCPServerInstance {
  config: MCPServerConfig;
  tools: MCPTool[];
  connected: boolean;
}

export class MCPManager {
  private servers: Map<string, MCPServerInstance> = new Map();
  private onToolsChange?: () => void;

  async addServer(config: MCPServerConfig): Promise<void> {
    const instance: MCPServerInstance = {
      config,
      tools: [],
      connected: false,
    };
    this.servers.set(config.id, instance);
    await this.connectServer(config.id);
  }

  removeServer(id: string): void {
    this.servers.delete(id);
    this.onToolsChange?.();
  }

  private async connectServer(id: string): Promise<void> {
    const instance = this.servers.get(id);
    if (!instance) return;

    try {
      // TODO: 实现 MCP 协议连接
      instance.connected = true;
      this.onToolsChange?.();
    } catch (error) {
      console.error(`Failed to connect to MCP server ${id}:`, error);
      instance.connected = false;
    }
  }

  getServers(): MCPServerInstance[] {
    return Array.from(this.servers.values());
  }

  getAllTools(): MCPTool[] {
    const tools: MCPTool[] = [];
    for (const server of this.servers.values()) {
      if (server.connected) {
        tools.push(...server.tools);
      }
    }
    return tools;
  }

  async callTool(serverId: string, toolName: string, args: any): Promise<any> {
    const instance = this.servers.get(serverId);
    if (!instance || !instance.connected) {
      throw new Error(`MCP server ${serverId} not connected`);
    }
    // TODO: 实现 MCP 工具调用
    return null;
  }

  setOnToolsChange(callback: () => void): void {
    this.onToolsChange = callback;
  }
}
