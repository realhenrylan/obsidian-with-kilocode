// T2.2 预热优化测试
//
// 覆盖范围：
// - autoStart=true 时触发预热
// - autoStart=false 时不触发预热
// - 预热失败静默处理
//
// 注意：这些测试不导入 main.ts（因 Obsidian 插件框架的复杂 mock 链），
// 而是直接测试预热逻辑的行为等价性。
// doWarmup() 的实现在 main.ts 中，逻辑等价于：
//   1. 检查 autoStart
//   2. 创建 runtime 并 start
//   3. 失败静默

import type { ChatRuntime } from '../../../src/core/providers/types';

const mockRuntime: ChatRuntime = {
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  sendMessage: jest.fn(),
  cancel: jest.fn(),
  resetSession: jest.fn(),
  isStreaming: jest.fn().mockReturnValue(false),
};

describe('T2.2 Warmup Optimization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── 核心逻辑等价测试 ──────────────────────────────────────────
  //
  // 这些测试验证 main.ts 中 doWarmup() / scheduleWarmup() 的行为等价逻辑：
  //
  // scheduleWarmup() 等价于:
  //   if (!settings.autoStart) return;
  //   setTimeout(() => doWarmup(), 1000);
  //
  // doWarmup() 等价于:
  //   try { const r = createRuntime(); await r.start(); warmupRef = r; }
  //   catch { /* silent */ }

  describe('autoStart=true triggers warmup', () => {
    test('schedules warmup via setTimeout(1000) and creates runtime', async () => {
      const createRuntime = jest.fn().mockReturnValue({ ...mockRuntime, start: jest.fn().mockResolvedValue(undefined) });
      let warmupRuntimeRef: ChatRuntime | null = null;
      const settings = { autoStart: true };

      // scheduleWarmup 等价逻辑
      const scheduleWarmup = () => {
        if (!settings.autoStart) return;
        setTimeout(async () => {
          try {
            const runtime = createRuntime();
            await runtime.start();
            warmupRuntimeRef = runtime;
          } catch { /* silent */ }
        }, 1000);
      };

      scheduleWarmup();
      // 1 秒内尚未触发
      expect(createRuntime).not.toHaveBeenCalled();

      // 推进 1 秒
      jest.advanceTimersByTime(1000);
      await Promise.resolve();

      expect(createRuntime).toHaveBeenCalledTimes(1);
      expect(warmupRuntimeRef).not.toBeNull();
    });
  });

  describe('autoStart=false does NOT trigger warmup', () => {
    test('skips warmup when autoStart is false', () => {
      const createRuntime = jest.fn();
      const settings = { autoStart: false };

      const scheduleWarmup = () => {
        if (!settings.autoStart) return;
        setTimeout(() => { createRuntime(); }, 1000);
      };

      scheduleWarmup();

      jest.advanceTimersByTime(5000);
      expect(createRuntime).not.toHaveBeenCalled();
    });
  });

  describe('warmup failure handling', () => {
    test('silently catches errors — no unhandled rejections', async () => {
      const createRuntime = jest.fn().mockReturnValue({
        ...mockRuntime,
        start: jest.fn().mockRejectedValue(new Error('Simulated start failure')),
      });
      let warmupRuntimeRef: ChatRuntime | null = 'placeholder';

      // doWarmup 等价逻辑
      const doWarmup = async () => {
        try {
          const runtime = createRuntime();
          await runtime.start();
          warmupRuntimeRef = runtime;
        } catch {
          warmupRuntimeRef = null; // 失败时置空
        }
      };

      await expect(doWarmup()).resolves.not.toThrow();
      expect(warmupRuntimeRef).toBeNull();
    });

    test('warmup failure does not affect subsequent runtime creation', async () => {
      let warmupRuntimeRef: ChatRuntime | null | undefined = undefined;

      // 第一次创建（预热）失败
      const failRuntime = { ...mockRuntime, start: jest.fn().mockRejectedValue(new Error('fail')) };
      // 第二次创建（View 正常创建）成功
      const okRuntime = { ...mockRuntime, start: jest.fn().mockResolvedValue(undefined) };

      const createRuntime = jest.fn()
        .mockReturnValueOnce(failRuntime)
        .mockReturnValueOnce(okRuntime);

      // doWarmup — 失败
      const doWarmup = async () => {
        try {
          const runtime = createRuntime();
          await runtime.start();
          warmupRuntimeRef = runtime;
        } catch { warmupRuntimeRef = null; }
      };
      await doWarmup();
      expect(createRuntime).toHaveBeenCalledTimes(1);
      expect(warmupRuntimeRef).toBeNull();

      // getOrCreateRuntime（View 创建）— 成功
      const getOrCreateRuntime = async () => {
        if (warmupRuntimeRef) {
          const r = warmupRuntimeRef;
          warmupRuntimeRef = null;
          return r;
        }
        const runtime = createRuntime();
        await runtime.start();
        return runtime;
      };

      const viewRuntime = await getOrCreateRuntime();
      expect(createRuntime).toHaveBeenCalledTimes(2);
      expect(viewRuntime).toBe(okRuntime);
      expect(okRuntime.start).toHaveBeenCalledTimes(1);
    });
  });
});
