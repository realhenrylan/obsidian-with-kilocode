import type { MCPManager, MCPTool } from './MCPManager';

export class MCPToolAdapter {
  private mcpManager: MCPManager;

  constructor(mcpManager: MCPManager) {
    this.mcpManager = mcpManager;
  }

  getAvailableTools(): any[] {
    const mcpTools = this.mcpManager.getAllTools();
    return mcpTools.map(tool => this.convertTool(tool));
  }

  private convertTool(mcpTool: MCPTool): any {
    return {
      name: mcpTool.name,
      description: mcpTool.description,
      parameters: mcpTool.inputSchema,
    };
  }

  async callTool(toolName: string, args: any): Promise<any> {
    for (const server of this.mcpManager.getServers()) {
      const tool = server.tools.find(t => t.name === toolName);
      if (tool) {
        return await this.mcpManager.callTool(server.config.id, toolName, args);
      }
    }
    throw new Error(`Tool ${toolName} not found`);
  }
}
