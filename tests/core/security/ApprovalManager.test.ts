// tests/core/security/ApprovalManager.test.ts
import { ApprovalManager } from '../../../src/core/security/ApprovalManager';
import type { ApprovalRequest, ApprovalDecision } from '../../../src/core/security/ApprovalManager';

describe('ApprovalManager', () => {
  let manager: ApprovalManager;

  beforeEach(() => {
    manager = new ApprovalManager();
  });

  describe('requestApproval — yolo 模式', () => {
    test('yolo 模式下所有工具自动通过', async () => {
      manager.setPermissionMode('yolo');

      const decision = await manager.requestApproval({
        id: 'a-1',
        toolName: 'write_file',
        input: { path: '/test', content: 'data' },
        description: 'Write file',
      });

      expect(decision).toBe('allow');
    });
  });

  describe('requestApproval — plan 模式', () => {
    test('plan 模式下写入工具自动拒绝', async () => {
      manager.setPermissionMode('plan');

      const decision = await manager.requestApproval({
        id: 'a-1',
        toolName: 'write_file',
        input: { path: '/test' },
        description: 'Write file',
      });

      expect(decision).toBe('deny');
    });

    test('plan 模式下读取工具自动通过', async () => {
      manager.setPermissionMode('plan');

      const decision = await manager.requestApproval({
        id: 'a-1',
        toolName: 'read_file',
        input: { path: '/test' },
        description: 'Read file',
      });

      expect(decision).toBe('allow');
    });
  });

  describe('requestApproval — normal 模式', () => {
    test('normal 模式下读取工具自动通过', async () => {
      manager.setPermissionMode('normal');

      const decision = await manager.requestApproval({
        id: 'a-1',
        toolName: 'read_file',
        input: { path: '/test' },
        description: 'Read file',
      });

      expect(decision).toBe('allow');
    });

    test('normal 模式下写入工具需要审批', async () => {
      manager.setPermissionMode('normal');

      // 模拟审批对话框的回调
      let resolveApproval: (decision: ApprovalDecision) => void;
      manager.setApprovalHandler(async () => {
        return new Promise<ApprovalDecision>((resolve) => {
          resolveApproval = resolve;
        });
      });

      const decisionPromise = manager.requestApproval({
        id: 'a-1',
        toolName: 'write_file',
        input: { path: '/test' },
        description: 'Write file',
      });

      // 模拟用户点击 Allow
      resolveApproval!('allow');

      const decision = await decisionPromise;
      expect(decision).toBe('allow');
    });
  });

  describe('always-allow', () => {
    test('allow-always 后同工具自动通过', async () => {
      manager.setPermissionMode('normal');

      let resolveApproval: (decision: ApprovalDecision) => void;
      manager.setApprovalHandler(async () => {
        return new Promise<ApprovalDecision>((resolve) => {
          resolveApproval = resolve;
        });
      });

      // 第一次审批，用户选择 allow-always
      const firstPromise = manager.requestApproval({
        id: 'a-1',
        toolName: 'write_file',
        input: { path: '/test' },
        description: 'Write file',
      });
      resolveApproval!('allow-always');
      expect(await firstPromise).toBe('allow-always');

      // 第二次同工具，自动通过
      const secondDecision = await manager.requestApproval({
        id: 'a-2',
        toolName: 'write_file',
        input: { path: '/other' },
        description: 'Write other file',
      });
      expect(secondDecision).toBe('allow');
    });

    test('resetAlwaysAllow 清除列表', async () => {
      manager.setPermissionMode('normal');

      let resolveApproval: (decision: ApprovalDecision) => void;
      manager.setApprovalHandler(async () => {
        return new Promise<ApprovalDecision>((resolve) => {
          resolveApproval = resolve;
        });
      });

      // allow-always
      const p = manager.requestApproval({
        id: 'a-1', toolName: 'write_file', input: {}, description: '',
      });
      resolveApproval!('allow-always');
      await p;

      // 重置
      manager.resetAlwaysAllow();

      // 再次需要审批
      let resolveApproval2: (decision: ApprovalDecision) => void;
      manager.setApprovalHandler(async () => {
        return new Promise<ApprovalDecision>((resolve) => {
          resolveApproval2 = resolve;
        });
      });

      const p2 = manager.requestApproval({
        id: 'a-2', toolName: 'write_file', input: {}, description: '',
      });
      resolveApproval2!('deny');
      expect(await p2).toBe('deny');
    });
  });

  describe('cancelAll', () => {
    test('取消所有待审批请求', async () => {
      manager.setPermissionMode('normal');
      manager.setApprovalHandler(async () => new Promise(() => {})); // 永不 resolve

      const p1 = manager.requestApproval({
        id: 'a-1', toolName: 'write_file', input: {}, description: '',
      });
      const p2 = manager.requestApproval({
        id: 'a-2', toolName: 'bash', input: {}, description: '',
      });

      manager.cancelAll();

      expect(await p1).toBe('cancel');
      expect(await p2).toBe('cancel');
    });
  });
});
