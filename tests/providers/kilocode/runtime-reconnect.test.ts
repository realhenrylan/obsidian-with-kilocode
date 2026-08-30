// tests/providers/kilocode/runtime-reconnect.test.ts
// Phase 4 §6.1 健壮性行为契约：探活重建 / sessionId 失效重试 / PATH 恢复 / prompt 超时
import { KiloCodeChatRuntime } from '../../../src/providers/kilocode/runtime/KiloCodeChatRuntime';
import type { BinaryManager } from '../../../src/core/binary/BinaryManager';
import type { KiloCodeSettings } from '../../../src/core/types';

jest.mock('@kilocode/sdk/server', () => ({
  createKiloServer: jest.fn().mockResolvedValue({
    url: 'http://127.0.0.1:4096',
    close: jest.fn(),
  }),
}));

const mockSessionCreate = jest.fn();
const mockSessionPrompt = jest.fn();

jest.mock('@kilocode/sdk/client', () => ({
  createKiloClient: jest.fn(() => ({
    session: {
      create: mockSessionCreate,
      prompt: mockSessionPrompt,
      abort: jest.fn().mockResolvedValue({ data: true }),
    },
    mcp: { status: jest.fn().mockResolvedValue({ data: {}, error: null }) },
  })),
  KiloClient: class {},
}));

const SETTINGS: KiloCodeSettings = {
  enabled: true,
  cliPath: '/mock/path/kilo',
  model: '',
  apiKey: '',
  maxTabs: 3,
  chatViewPlacement: 'right-sidebar',
  locale: 'en',
  environmentVariables: {},
  autoStart: false,
  defaultModel: '',
  temperature: 0.7,
  autoSave: true,
  theme: 'auto',
  fontSize: 14,
  compactKeepRecent: 5,
  permissionMode: 'normal',
  mirrorUrl: '',
  idleTimeoutSeconds: 120,
} as KiloCodeSettings;

function createRuntime(getSettings: () => KiloCodeSettings = () => SETTINGS): KiloCodeChatRuntime {
  const binaryManager = {
    getBinaryPath: jest.fn().mockResolvedValue('/mock/path/kilo'),
  } as unknown as BinaryManager;
  return new KiloCodeChatRuntime(binaryManager, getSettings);
}

/** 探活默认成功（服务器活着），各用例按需覆盖 */
function mockHealthCheck(runtime: KiloCodeChatRuntime, impl: () => Promise<Response>) {
  (runtime as unknown as { boundFetch: unknown }).boundFetch = jest.fn(impl);
}

async function collect(gen: AsyncGenerator<{ type: string; error?: string }>) {
  const chunks: Array<{ type: string; error?: string }> = [];
  for await (const c of gen) chunks.push(c as { type: string; error?: string });
  return chunks;
}

describe('KiloCodeChatRuntime 健壮性（Phase 4 §6.1）', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSessionCreate.mockReset();
    mockSessionPrompt.mockReset();
    mockSessionCreate.mockResolvedValue({ data: { id: 's-1' }, error: null });
    mockSessionPrompt.mockResolvedValue({
      error: null,
      data: { parts: [{ type: 'text', text: 'ok' }] },
    });
  });

  test('探活失败（进程已死）自动 stop + start 重建', async () => {
    const runtime = createRuntime();
    mockHealthCheck(runtime, () => Promise.reject(new Error('ECONNREFUSED')));

    await runtime.start();
    const { createKiloServer } = require('@kilocode/sdk/server');
    const callsBefore = (createKiloServer as jest.Mock).mock.calls.length;

    await collect(runtime.sendMessage('hello'));

    expect((createKiloServer as jest.Mock).mock.calls.length).toBeGreaterThan(callsBefore);
  });

  test('探活成功时不重建 server', async () => {
    const runtime = createRuntime();
    mockHealthCheck(runtime, () => Promise.resolve(new Response('{}', { status: 200 })));

    await runtime.start();
    const { createKiloServer } = require('@kilocode/sdk/server');
    const callsBefore = (createKiloServer as jest.Mock).mock.calls.length;

    await collect(runtime.sendMessage('hello'));

    expect((createKiloServer as jest.Mock).mock.calls.length).toBe(callsBefore);
  });

  test('sessionId 失效（session not found）自动重建会话并重试一次', async () => {
    const runtime = createRuntime();
    mockHealthCheck(runtime, () => Promise.resolve(new Response('{}', { status: 200 })));

    mockSessionPrompt
      .mockResolvedValueOnce({ error: 'session not found', data: null })
      .mockResolvedValueOnce({ error: null, data: { parts: [{ type: 'text', text: 'retry ok' }] } });

    const chunks = await collect(runtime.sendMessage('hello'));
    const types = chunks.map(c => c.type);

    // create 被调两次（首次 + 失效重建），最终拿到重试后的文本与 done
    expect(mockSessionCreate).toHaveBeenCalledTimes(2);
    expect(types).toContain('text');
    expect(types).toContain('done');
    expect(types).not.toContain('error');
  });

  test('ensureServer 后 process.env.PATH 恢复原值（不累积污染）', async () => {
    const runtime = createRuntime();
    mockHealthCheck(runtime, () => Promise.resolve(new Response('{}', { status: 200 })));
    const prevPath = process.env.PATH;

    await runtime.start();
    await runtime.stop();

    expect(process.env.PATH).toBe(prevPath);
  });

  test('prompt 超时产生 error（含 timeout）并终止流', async () => {
    jest.useFakeTimers();
    try {
      const runtime = createRuntime(() => ({ ...SETTINGS, idleTimeoutSeconds: 30 }));
      mockHealthCheck(runtime, () => Promise.resolve(new Response('{}', { status: 200 })));
      // prompt 永不 resolve，模拟 CLI 卡死
      mockSessionPrompt.mockImplementation(() => new Promise(() => {}));

      const gen = runtime.sendMessage('hello');
      const pending: Array<{ type: string; error?: string }> = [];
      const done = (async () => {
        for await (const c of gen) pending.push(c as { type: string; error?: string });
      })();

      // 快进 31s 触发超时（promptTimeoutMs = max(30, 30) * 1000）
      await jest.advanceTimersByTimeAsync(31_000);
      await done;

      const errChunk = pending.find(c => c.type === 'error');
      expect(errChunk?.error).toContain('timed out');
      expect(pending[pending.length - 1].type).toBe('done');
    } finally {
      jest.useRealTimers();
    }
  });
});
