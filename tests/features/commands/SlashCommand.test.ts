// tests/features/commands/SlashCommand.test.ts
// SlashCommand handler 行为测试（Phase 1 安全网 + @phase3 Red 测试）：
// - 元数据（注册/搜索）现在即可通过
// - handler 行为当前为 TODO（空实现），按 Phase 3 §5.2 期望行为断言 → Red
//   Phase 3 实现依赖注入（conversationController / modelSwitcher / planModeController）后转 Green

import { createDefaultCommandRegistry, CommandRegistry } from '../../../src/features/commands/SlashCommand';

describe('createDefaultCommandRegistry 元数据', () => {
  let registry: CommandRegistry;

  beforeEach(() => {
    registry = createDefaultCommandRegistry();
  });

  test('注册 4 个内置命令', () => {
    const ids = registry.getAll().map(c => c.id);
    expect(ids).toEqual(expect.arrayContaining(['compact', 'clear', 'model', 'mode']));
    expect(registry.getAll()).toHaveLength(4);
  });

  test('命令元数据完整（名称/描述/图标）', () => {
    for (const cmd of registry.getAll()) {
      expect(cmd.name).toMatch(/^\//);
      expect(cmd.description.length).toBeGreaterThan(0);
      expect(cmd.icon.length).toBeGreaterThan(0);
      expect(typeof cmd.handler).toBe('function');
    }
  });

  test('search 按名称/描述过滤', () => {
    const results = registry.search('compact');
    expect(results.map(c => c.id)).toContain('compact');
    expect(registry.search('model')).toHaveLength(1);
  });
});

// ─── @phase3 handler 行为（当前 TODO → Red，Phase 3 实现后转 Green） ───

describe('handler 行为（@phase3 驱动）', () => {
  test('/compact handler 调用 conversationController.compact(keepRecent)', async () => {
    const conversationController = { compact: jest.fn() };
    // Phase 3 §5.2：createDefaultCommandRegistry 接受依赖注入
    const registry = (createDefaultCommandRegistry as any)({
      conversationController,
      settings: { compactKeepRecent: 5 },
    }) as CommandRegistry;

    await registry.get('compact')!.handler('');

    expect(conversationController.compact).toHaveBeenCalledWith(5);
  });

  test('/clear handler 删除当前会话并新建', async () => {
    const conversationController = { deleteCurrent: jest.fn(), createNew: jest.fn() };
    const registry = (createDefaultCommandRegistry as any)({ conversationController }) as CommandRegistry;

    await registry.get('clear')!.handler('');

    expect(conversationController.deleteCurrent).toHaveBeenCalled();
    expect(conversationController.createNew).toHaveBeenCalled();
  });

  test('/model handler 打开模型选择 Modal', async () => {
    const modelSwitcher = { open: jest.fn() };
    const registry = (createDefaultCommandRegistry as any)({ modelSwitcher }) as CommandRegistry;

    await registry.get('model')!.handler('');

    expect(modelSwitcher.open).toHaveBeenCalled();
  });

  test('/mode handler 循环 planModeController', async () => {
    const planModeController = { cycleMode: jest.fn() };
    const registry = (createDefaultCommandRegistry as any)({ planModeController }) as CommandRegistry;

    await registry.get('mode')!.handler('');

    expect(planModeController.cycleMode).toHaveBeenCalled();
  });
});
