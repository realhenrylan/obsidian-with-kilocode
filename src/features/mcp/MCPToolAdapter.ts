import type { MCPManager, MCPTool } from './MCPManager';

export interface AdapterTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export class MCPToolAdapter {
  private mcpManager: MCPManager;

  constructor(mcpManager: MCPManager) {
    this.mcpManager = mcpManager;
  }

  getAvailableTools(): AdapterTool[] {
    const mcpTools = this.mcpManager.getAllTools();
    return mcpTools.map(tool => this.convertTool(tool));
  }

  private convertTool(mcpTool: MCPTool): AdapterTool {
    return {
      name: mcpTool.name,
      description: mcpTool.description,
      parameters: mcpTool.inputSchema,
    };
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    for (const server of this.mcpManager.getServers()) {
      const tool = server.tools.find(t => t.name === toolName);
      if (tool) {
        return await this.mcpManager.callTool(server.config.id, toolName, args);
      }
    }
    throw new Error(`Tool ${toolName} not found`);
  }
}
