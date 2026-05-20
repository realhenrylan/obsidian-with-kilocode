import { MCPManager } from '../../../src/features/mcp/MCPManager';

describe('MCPManager', () => {
  let manager: MCPManager;

  beforeEach(() => {
    manager = new MCPManager();
  });

  test('should initialize with empty servers', () => {
    expect(manager.getServers()).toHaveLength(0);
  });

  test('should add server', async () => {
    const config = {
      id: 'test-server',
      name: 'Test Server',
      command: 'test-command',
      args: [],
    };

    await manager.addServer(config);
    const servers = manager.getServers();
    expect(servers).toHaveLength(1);
    expect(servers[0].config.id).toBe('test-server');
  });

  test('should remove server', async () => {
    const config = {
      id: 'test-server',
      name: 'Test Server',
      command: 'test-command',
      args: [],
    };

    await manager.addServer(config);
    manager.removeServer('test-server');
    expect(manager.getServers()).toHaveLength(0);
  });

  test('should get all tools', () => {
    const tools = manager.getAllTools();
    expect(tools).toHaveLength(0);
  });
});
