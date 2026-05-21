import { KiloCodeChatRuntime } from '../../../src/providers/kilocode/runtime/KiloCodeChatRuntime';
import type { StreamChunk } from '../../../src/core/providers/types';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

// ── Mocks ──────────────────────────────────────────────────────────────────────

jest.mock('child_process', () => ({
  spawn: jest.fn(),
  execFile: jest.fn(),
}));

// 记录 http.request 调用
const requestCalls: Array<{ options: any; body: string }> = [];

// 响应注册表：每个测试用例按需注册 (method, pathPattern) → response
const responseRegistry: Array<{
  method: string;
  pathPattern: RegExp;
  status: number;
  headers: Record<string, string>;
  body: string;
}> = [];

// http 模块 mock
jest.mock('http', () => {
  const { EventEmitter } = require('events');
  const { PassThrough } = require('stream');

  function request(options: any, callback: Function) {
    const req = new EventEmitter();
    let body = '';

    (req as any).write = jest.fn((data: string) => { body += data; });
    (req as any).end = jest.fn(() => {
      requestCalls.push({ options, body });

      const matched = responseRegistry.find(
        (r) =>
          r.method === (options.method || 'GET') &&
          r.pathPattern.test(options.path),
      );

      const response = matched ?? {
        status: 404,
        headers: { 'content-type': 'text/plain' },
        body: 'not found',
      };

      const res = new PassThrough();
      (res as any).statusCode = response.status;
      (res as any).headers = response.headers;

      callback(res);

      process.nextTick(() => {
        res.end(response.body);
      });
    });
    (req as any).destroy = jest.fn();

    return req;
  }

  return { request };
});

import { spawn } from 'child_process';

// ── Helpers ────────────────────────────────────────────────────────────────────

const mockBinaryManager = {
  getBinaryPath: jest.fn().mockResolvedValue('/mock/path/kilo'),
  isReady: jest.fn().mockReturnValue(true),
  preload: jest.fn().mockResolvedValue(undefined),
} as unknown as import('../../../src/core/binary/BinaryManager').BinaryManager;

const mockSettings = {
  cliPath: '',
  defaultModel: 'claude-sonnet-4-20250514',
  model: 'kilo-1',
  apiKey: '',
  environmentVariables: {},
  permissionMode: 'normal',
} as any;

function createMockProcess() {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const proc = Object.assign(new EventEmitter(), {
    stdout,
    stderr,
    stdin: null,
    killed: false,
    kill: jest.fn(function (this: { killed: boolean }) {
      this.killed = true;
      return true;
    }),
  });
  return { proc, stdout, stderr };
}

function registerJsonResponse(method: string, pathPattern: RegExp, body: unknown, status = 200) {
  responseRegistry.push({
    method,
    pathPattern,
    status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function registerTextResponse(method: string, pathPattern: RegExp, body: string, status = 200) {
  responseRegistry.push({
    method,
    pathPattern,
    status,
    headers: { 'content-type': 'text/plain' },
    body,
  });
}

function registerDefaultHttpResponses() {
  registerJsonResponse('GET', /^\/session$/, [], 200);
  registerJsonResponse('POST', /^\/session$/, { id: 'ses_test' }, 200);
  registerJsonResponse('GET', /^\/provider$/, {
    all: [{ id: 'helicone', models: { 'claude-sonnet-4-20250514': {} } }],
  }, 200);
  registerJsonResponse('POST', /^\/session\/ses_test\/message$/, {
    info: { id: 'msg_assistant', role: 'assistant' },
    parts: [{ type: 'text', text: 'Hello from Kilo' }],
  }, 200);
}

async function startRuntime(runtime: KiloCodeChatRuntime, stdout: PassThrough) {
  const startPromise = runtime.start();
  stdout.write('kilo server listening on http://127.0.0.1:43210\n');
  await startPromise;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('KiloCodeChatRuntime', () => {
  let runtime: KiloCodeChatRuntime;
  let mockProc: ReturnType<typeof createMockProcess>;

  beforeEach(() => {
    jest.clearAllMocks();
    responseRegistry.length = 0;
    requestCalls.length = 0;
    mockProc = createMockProcess();
    (spawn as jest.Mock).mockReturnValue(mockProc.proc);
    registerDefaultHttpResponses();
    runtime = new KiloCodeChatRuntime(mockBinaryManager, mockSettings);
  });

  afterEach(async () => {
    await runtime.stop();
  });

  describe('start - kilo serve HTTP server', () => {
    test('spawns kilo serve with a random port request', async () => {
      await startRuntime(runtime, mockProc.stdout);

      expect(mockBinaryManager.getBinaryPath).toHaveBeenCalledWith(mockSettings);
      expect(spawn).toHaveBeenCalledWith('/mock/path/kilo',
        ['serve', '--port', '0'],
        expect.objectContaining({
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      );
    });

    test('sets KILO_SERVER_PASSWORD and uses Basic Auth for HTTP calls', async () => {
      await startRuntime(runtime, mockProc.stdout);

      const spawnOptions = (spawn as jest.Mock).mock.calls[0][2];
      const password = spawnOptions.env.KILO_SERVER_PASSWORD;
      expect(password).toEqual(expect.any(String));
      expect(password.length).toBeGreaterThan(20);

      const expectedAuth = `Basic ${Buffer.from(`kilo:${password}`).toString('base64')}`;
      expect(requestCalls.length).toBeGreaterThan(0);
      expect(requestCalls[0].options.headers['Authorization']).toBe(expectedAuth);
    });

    test('injects configured API environment variables', async () => {
      const settingsWithApi = {
        ...mockSettings,
        apiKey: 'sk-test',
        environmentVariables: { KILO_BASE_URL: 'https://example.test/v1' },
      } as any;
      const rt = new KiloCodeChatRuntime(mockBinaryManager, settingsWithApi);

      const startPromise = rt.start();
      mockProc.stdout.write('kilo server listening on http://127.0.0.1:43210\n');
      await startPromise;

      const spawnOptions = (spawn as jest.Mock).mock.calls[0][2];
      expect(spawnOptions.env.KILO_API_KEY).toBe('sk-test');
      expect(spawnOptions.env.KILO_BASE_URL).toBe('https://example.test/v1');

      await rt.stop();
    });
  });

  describe('sendMessage - HTTP message endpoint', () => {
    test('posts text parts to the session message endpoint', async () => {
      await startRuntime(runtime, mockProc.stdout);

      const chunks: StreamChunk[] = [];
      for await (const chunk of runtime.sendMessage('hello')) {
        chunks.push(chunk);
      }

      const messageCall = requestCalls.find(
        (c) => c.options.method === 'POST' && /^\/session\/.+\/message$/.test(c.options.path),
      );
      expect(messageCall).toBeTruthy();

      const payload = JSON.parse(messageCall!.body);
      expect(payload).toEqual(expect.objectContaining({
        agent: 'code',
        modelID: 'claude-sonnet-4-20250514',
        parts: [{ type: 'text', text: 'hello' }],
      }));
      // 没有显式 provider 时，不发送 providerID
      expect(payload.providerID).toBeUndefined();
      expect(payload.model).toBeUndefined();
      expect(payload.messageID).toEqual(expect.stringMatching(/^msg_/));
    });

    test('yields text chunks and a done chunk from JSON responses', async () => {
      await startRuntime(runtime, mockProc.stdout);

      const chunks: StreamChunk[] = [];
      for await (const chunk of runtime.sendMessage('hello')) {
        chunks.push(chunk);
      }

      expect(chunks).toContainEqual({ type: 'text', content: 'Hello from Kilo' });
      expect(chunks[chunks.length - 1]).toEqual({ type: 'done' });
    });

    test('yields an error chunk for non-OK HTTP responses', async () => {
      responseRegistry.length = 0;
      registerJsonResponse('GET', /^\/session$/, [], 200);
      registerJsonResponse('POST', /^\/session$/, { id: 'ses_test' }, 200);
      registerJsonResponse('GET', /^\/provider$/, { all: [] }, 200);
      registerTextResponse('POST', /^\/session\/.+\/message$/, 'bad payload', 400);

      await startRuntime(runtime, mockProc.stdout);

      const chunks: StreamChunk[] = [];
      for await (const chunk of runtime.sendMessage('hello')) {
        chunks.push(chunk);
      }

      expect(chunks[0]).toEqual({
        type: 'error',
        error: 'KiloCode HTTP API returned 400: bad payload',
      });
      expect(chunks[chunks.length - 1]).toEqual({ type: 'done' });
    });
  });

  describe('cancel', () => {
    test('kills the server process', async () => {
      await startRuntime(runtime, mockProc.stdout);

      runtime.cancel();

      expect(mockProc.proc.kill).toHaveBeenCalled();
      expect(runtime.isStreaming()).toBe(false);
    });
  });

  describe('extractThinkingAndText', () => {
    function callExtract(value: unknown): { thinking: string[]; text: string[] } {
      return (runtime as any).extractThinkingAndText(value);
    }

    test('区分 thinking 和 text 类型的 parts', () => {
      const input = {
        parts: [
          { type: 'thinking', text: '让我想想...' },
          { type: 'text', text: '回答内容' },
        ],
      };
      const result = callExtract(input);
      expect(result.thinking).toEqual(['让我想想...']);
      expect(result.text).toEqual(['回答内容']);
    });

    test('处理没有 type 字段的 parts（降级为 text）', () => {
      const input = {
        parts: [
          { text: '纯文本内容' },
        ],
      };
      const result = callExtract(input);
      expect(result.thinking).toEqual([]);
      expect(result.text).toEqual(['纯文本内容']);
    });

    test('处理嵌套 parts 结构', () => {
      const input = {
        parts: [
          {
            type: 'thinking',
            parts: [{ type: 'thinking', text: '深层推理' }],
          },
          { type: 'text', text: '最终回答' },
        ],
      };
      const result = callExtract(input);
      expect(result.thinking).toEqual(['深层推理']);
      expect(result.text).toEqual(['最终回答']);
    });

    test('处理纯文本响应（无 parts）', () => {
      const input = '简单文本响应';
      const result = callExtract(input);
      expect(result.thinking).toEqual([]);
      expect(result.text).toEqual(['简单文本响应']);
    });

    test('处理空结构', () => {
      const result = callExtract(null);
      expect(result.thinking).toEqual([]);
      expect(result.text).toEqual([]);
    });

    test('处理只有 thinking 没有 text 的响应', () => {
      const input = {
        parts: [
          { type: 'thinking', text: '全部都在思考' },
        ],
      };
      const result = callExtract(input);
      expect(result.thinking).toEqual(['全部都在思考']);
      expect(result.text).toEqual([]);
    });

    test('多个 thinking 和 text parts', () => {
      const input = {
        parts: [
          { type: 'thinking', text: '第一段推理' },
          { type: 'thinking', text: '第二段推理' },
          { type: 'text', text: '第一段回答' },
          { type: 'text', text: '第二段回答' },
        ],
      };
      const result = callExtract(input);
      expect(result.thinking).toEqual(['第一段推理', '第二段推理']);
      expect(result.text).toEqual(['第一段回答', '第二段回答']);
    });
  });

  describe('sendMessage with thinking parts', () => {
    test('thinking 和 text 分离 yield', async () => {
      responseRegistry.length = 0;
      registerJsonResponse('GET', /^\/session$/, [], 200);
      registerJsonResponse('POST', /^\/session$/, { id: 'ses_test' }, 200);
      registerJsonResponse('GET', /^\/provider$/, { all: [] }, 200);
      registerJsonResponse('POST', /^\/session\/ses_test\/message$/, {
        info: { id: 'msg_assistant', role: 'assistant' },
        parts: [
          { type: 'thinking', text: '让我分析一下...' },
          { type: 'text', text: '这是回答' },
        ],
      }, 200);

      await startRuntime(runtime, mockProc.stdout);

      const chunks: StreamChunk[] = [];
      for await (const chunk of runtime.sendMessage('hello')) {
        chunks.push(chunk);
      }

      expect(chunks).toContainEqual({ type: 'thinking', content: '让我分析一下...' });
      expect(chunks).toContainEqual({ type: 'text', content: '这是回答' });
      expect(chunks[chunks.length - 1]).toEqual({ type: 'done' });
    });
  });
});
