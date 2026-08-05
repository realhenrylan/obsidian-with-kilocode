// tests/features/mcp/MCPManager.test.ts
// 路径 A（透传 kilo serve）：MCPManager 退化为「配置容器 + 状态查询」层，
// 不承载连接逻辑 —— 连接由 CLI 管理，插件只登记配置并映射 CLI 真实状态。
import { MCPManager } from '../../../src/features/mcp/MCPManager';

describe('MCPManager (path A: config container + status query)', () => {
  let manager: MCPManager;

  beforeEach(() => {
    manager = new MCPManager();
  });

  test('initializes with no servers', () => {
    expect(manager.getServers()).toHaveLength(0);
    expect(manager.getConfigs()).toEqual({});
  });

  test('setConfigs registers server configs as disconnected', () => {
    manager.setConfigs({
      github: { type: 'local', command: ['npx', '-y', '@modelcontextprotocol/server-github'] },
    });
    const servers = manager.getServers();
    expect(servers).toHaveLength(1);
    expect(servers[0].name).toBe('github');
    expect(servers[0].connected).toBe(false);
    expect(servers[0].status).toBe('disconnected');
  });

  test('applyStatus reflects real connected state from CLI', () => {
    manager.setConfigs({
      github: { type: 'local', command: ['npx', 'x'] },
      filesystem: { type: 'local', command: ['npx', 'y'] },
    });
    manager.applyStatus({
      github: { status: 'connected' },
      filesystem: { status: 'failed', error: 'command not found' },
    });

    const github = manager.getServers().find(s => s.name === 'github')!;
    expect(github.connected).toBe(true);
    expect(github.status).toBe('connected');
    expect(github.error).toBeUndefined();

    const fs = manager.getServers().find(s => s.name === 'filesystem')!;
    expect(fs.connected).toBe(false);
    expect(fs.status).toBe('failed');
    expect(fs.error).toBe('command not found');
  });

  test('servers absent from status remain disconnected', () => {
    manager.setConfigs({ github: { type: 'local', command: ['npx', 'x'] } });
    manager.applyStatus({});
    expect(manager.getServers()[0].connected).toBe(false);
  });

  test('applyStatus ignores unknown server keys', () => {
    manager.setConfigs({});
    manager.applyStatus({ ghost: { status: 'connected' } });
    expect(manager.getServers()).toHaveLength(0);
  });

  test('disabled status is reported without connecting', () => {
    manager.setConfigs({ github: { type: 'local', command: ['npx', 'x'], enabled: false } });
    manager.applyStatus({ github: { status: 'disabled' } });
    const server = manager.getServers()[0];
    expect(server.status).toBe('disabled');
    expect(server.connected).toBe(false);
  });

  test('removeConfig deletes a server', () => {
    manager.setConfigs({ github: { type: 'local', command: ['npx', 'x'] } });
    manager.removeConfig('github');
    expect(manager.getServers()).toHaveLength(0);
  });

  test('setOnToolsChange notifies on config change', () => {
    const cb = jest.fn();
    manager.setOnToolsChange(cb);
    manager.setConfigs({ github: { type: 'local', command: ['npx', 'x'] } });
    expect(cb).toHaveBeenCalled();
  });

  test('setOnToolsChange notifies on status change', () => {
    const cb = jest.fn();
    manager.setOnToolsChange(cb);
    manager.setConfigs({ github: { type: 'local', command: ['npx', 'x'] } });
    cb.mockClear();
    manager.applyStatus({ github: { status: 'connected' } });
    expect(cb).toHaveBeenCalled();
  });
});
