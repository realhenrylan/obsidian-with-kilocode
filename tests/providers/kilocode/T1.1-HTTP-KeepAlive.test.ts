import { KiloCodeChatRuntime } from '../../../src/providers/kilocode/runtime/KiloCodeChatRuntime';
import http from 'http';

// ── Mocks ──────────────────────────────────────────────────────────────────────

jest.mock('child_process', () => ({
  spawn: jest.fn(),
  execFile: jest.fn(),
}));

// 保留原始的 http.Agent 引用，用于验证构造函数行为
const OriginalAgent = http.Agent;

// 响应注册表：每个测试用例按需注册 (method, pathPattern) → response
const responseRegistry: Array<{
  method: string;
  pathPattern: RegExp;
  status: number;
  headers: Record<string, string>;
  body: string;
}> = [];

// 部分 mock http：保持 Agent 构造行为可被测试观察
jest.mock('http', () => {
  const actualHttp = jest.requireActual('http');
  return {
    ...actualHttp,
    request: jest.fn((options: any, callback?: Function) => {
      const req = new (require('events').EventEmitter)();
      (req as any).write = jest.fn();
      (req as any).end = jest.fn(() => {
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

        const res = new (require('stream').PassThrough)();
        (res as any).statusCode = response.status;
        (res as any).headers = response.headers;

        if (callback) callback(res);

        process.nextTick(() => {
          res.end(response.body);
        });
      });
      (req as any).destroy = jest.fn();
      return req;
    }),
  };
});

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

// ── Helpers ────────────────────────────────────────────────────────────────────

const mockBinaryManager = {
  getBinaryPath: jest.fn().mockResolvedValue('/mock/path/kilo'),
  isReady: jest.fn().mockReturnValue(true),
  preload: jest.fn().mockResolvedValue(undefined),
} as any;

const mockSettings = {
  cliPath: '',
  defaultModel: '',
  model: '',
  apiKey: '',
  environmentVariables: {},
  permissionMode: 'normal',
  idleTimeoutSeconds: 0,
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

// ── HTTP Response Helpers ──────────────────────────────────────────────────────

function registerJsonResponse(method: string, pathPattern: RegExp, body: unknown, status = 200) {
  responseRegistry.push({
    method,
    pathPattern,
    status,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function registerDefaultHttpResponses() {
  registerJsonResponse('GET', /^\/session$/, [], 200);
  registerJsonResponse('POST', /^\/session$/, { id: 'ses_test' }, 200);
  registerJsonResponse('GET', /^\/provider$/, {
    all: [{ id: 'helicone', models: { 'claude-sonnet-4-20250514': {} } }],
  }, 200);
  registerJsonResponse('POST', /^\/session\/.+\/message$/, {
    info: { id: 'msg_assistant', role: 'assistant' },
    parts: [{ type: 'text', text: 'Hello from Kilo' }],
  }, 200);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('T1.1 HTTP Keep-Alive Connection Pool', () => {
  let runtime: KiloCodeChatRuntime;
  let mockProc: ReturnType<typeof createMockProcess>;

  beforeEach(() => {
    jest.clearAllMocks();
    responseRegistry.length = 0;
    registerDefaultHttpResponses();
    mockProc = createMockProcess();
    (spawn as jest.Mock).mockReturnValue(mockProc.proc);
    runtime = new KiloCodeChatRuntime(mockBinaryManager, () => mockSettings);
  });

  afterEach(async () => {
    await runtime.stop();
  });

  describe('constructor - http.Agent creation', () => {
    test('creates http.Agent with keepAlive=true', () => {
      // 通过反射访问私有 httpAgent 字段验证参数
      const agent = (runtime as any).httpAgent;
      expect(agent).toBeInstanceOf(OriginalAgent);
      expect(agent.keepAlive).toBe(true);
    });

    test('sets keepAliveMsecs=30000 and maxSockets=1', () => {
      const agent = (runtime as any).httpAgent;
      expect(agent.keepAliveMsecs).toBe(30000);
      expect(agent.maxSockets).toBe(1);
    });
  });

  describe('request - agent passthrough', () => {
    test('passes httpAgent to http.request() calls', async () => {
      // 启动 runtime
      const startPromise = runtime.start();
      mockProc.stdout.write('kilo server listening on http://127.0.0.1:43210\n');
      await startPromise;

      // 获取 http.request 的调用参数
      const httpRequestMock = http.request as jest.Mock;
      expect(httpRequestMock).toHaveBeenCalled();

      // 验证每次调用都传入了 agent
      for (const call of httpRequestMock.mock.calls) {
        const options = call[0];
        expect(options.agent).toBe((runtime as any).httpAgent);
      }
    });
  });

  describe('stop - agent cleanup', () => {
    test('calls destroy() on httpAgent on stop()', async () => {
      const agent = (runtime as any).httpAgent;
      const destroySpy = jest.spyOn(agent, 'destroy');

      await runtime.stop();

      expect(destroySpy).toHaveBeenCalledTimes(1);
    });
  });
});
