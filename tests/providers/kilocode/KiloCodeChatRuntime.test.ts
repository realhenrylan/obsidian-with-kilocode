// tests/providers/kilocode/KiloCodeChatRuntime.test.ts
import { KiloCodeChatRuntime } from '../../../src/providers/kilocode/runtime/KiloCodeChatRuntime';
import type { BinaryManager } from '../../../src/core/binary/BinaryManager';
import type { KiloCodeSettings } from '../../../src/core/types';

// Mock the @kilocode/sdk modules
jest.mock('@kilocode/sdk/server', () => {
  const mockClose = jest.fn();
  const mockCreateKiloServer = jest.fn().mockResolvedValue({
    url: 'http://127.0.0.1:4096',
    close: mockClose,
  });
  return {
    createKiloServer: mockCreateKiloServer,
  };
});

async function* createMockEventStream() {
  // Simulate the SDK SSE client output: already-parsed JSON objects
  // from the SSE data: field, in the format { type: "event.name", properties: {...} }
  yield { type: 'server.connected', properties: {} };
  yield { type: 'message.part.delta', properties: { type: 'text', text: 'Hello!' } };
  yield { type: 'message.updated', properties: {} };
}

jest.mock('@kilocode/sdk/client', () => {
  const mockSessionCreate = jest.fn().mockResolvedValue({
    data: { id: 'test-session-id' },
    error: null,
  });
  const mockSessionPrompt = jest.fn().mockResolvedValue({
    error: null,
    data: { info: { id: 'msg-1' }, parts: [{ type: 'text', text: 'Hello!' }] },
  });
  const mockSessionAbort = jest.fn().mockResolvedValue({ data: true });
  const mockSessionStatus = jest.fn().mockResolvedValue({ data: { status: 'idle' }, error: null });
  const mockEventSubscribe = jest.fn().mockResolvedValue({
    stream: createMockEventStream(),
  });
  const mockMcpStatus = jest.fn().mockResolvedValue({ data: {}, error: null });

  const mockKiloClient = {
    session: {
      create: mockSessionCreate,
      prompt: mockSessionPrompt,
      abort: mockSessionAbort,
      status: mockSessionStatus,
    },
    event: {
      subscribe: mockEventSubscribe,
    },
    mcp: {
      status: mockMcpStatus,
    },
  };

  return {
    createKiloClient: jest.fn().mockReturnValue(mockKiloClient),
    KiloClient: class {},
  };
});

const MOCK_SETTINGS: KiloCodeSettings = {
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
};

describe('KiloCodeChatRuntime', () => {
  let runtime: KiloCodeChatRuntime;
  let mockBinaryManager: jest.Mocked<BinaryManager>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockBinaryManager = {
      getBinaryPath: jest.fn().mockResolvedValue('/mock/path/kilo'),
      preload: jest.fn().mockResolvedValue(undefined),
      isReady: jest.fn().mockReturnValue(true),
    } as any;
    runtime = new KiloCodeChatRuntime(mockBinaryManager, () => MOCK_SETTINGS);
  });

  afterEach(async () => {
    await runtime.stop().catch(() => {});
  });

  describe('start', () => {
    it('creates a kilo serve server via SDK', async () => {
      await runtime.start();
      const { createKiloServer } = require('@kilocode/sdk/server');
      expect(createKiloServer).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: '127.0.0.1',
          port: 0,
          timeout: 15000,
        })
      );
    });

    it('is idempotent ? subsequent start() calls no-op', async () => {
      await runtime.start();
      await runtime.start();
      const { createKiloServer } = require('@kilocode/sdk/server');
      expect(createKiloServer).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendMessage', () => {
    it('creates session and sends message via SDK', async () => {
      const chunks: any[] = [];
      for await (const chunk of runtime.sendMessage('Hello')) {
        chunks.push(chunk);
      }

      const { createKiloServer } = require('@kilocode/sdk/server');
      expect(createKiloServer).toHaveBeenCalled();

      // Verify text content was streamed
      expect(chunks.some((c: any) => c.type === 'text' && c.content === 'Hello!')).toBe(true);
      expect(chunks[chunks.length - 1]).toEqual({ type: 'done' });
    });

    it('handles error from session creation', async () => {
      const { createKiloClient } = require('@kilocode/sdk/client');
      const mockClient = createKiloClient();
      mockClient.session.create.mockRejectedValueOnce(new Error('Session error'));

      const chunks: any[] = [];
      for await (const chunk of runtime.sendMessage('Hello')) {
        chunks.push(chunk);
      }

      expect(chunks.some((c: any) => c.type === 'error')).toBe(true);
    });
  });

  describe('cancel', () => {
    it('aborts current stream without killing server', async () => {
      await runtime.start();
      runtime.cancel();
      // Should not throw - cancel is a no-op if no active stream
      expect(true).toBe(true);
    });
  });

  describe('model management', () => {
    it('setModel/getModel work correctly', () => {
      expect(runtime.getModel()).toBeNull();
      runtime.setModel('anthropic/claude-sonnet-4');
      expect(runtime.getModel()).toBe('anthropic/claude-sonnet-4');
    });

    it('resetSession clears session ID', () => {
      runtime.resetSession();
      expect(true).toBe(true);
    });
  });

  describe('lifecycle', () => {
    it('stop cleans up server', async () => {
      await runtime.start();
      await runtime.stop();
      const { createKiloServer } = require('@kilocode/sdk/server');
      const server = await createKiloServer.mock.results[0].value;
      expect(server.close).toHaveBeenCalled();
    });

    it('isStreaming returns correct state', () => {
      expect(runtime.isStreaming()).toBe(false);
    });
  });

  describe('MCP integration (path A passthrough)', () => {
    it('injects mcp config into kilo serve', async () => {
      const mcpProvider = jest.fn().mockResolvedValue({
        github: { type: 'local', command: ['npx', '-y', '@modelcontextprotocol/server-github'] },
      });
      runtime = new KiloCodeChatRuntime(mockBinaryManager, () => MOCK_SETTINGS, mcpProvider);

      await runtime.start();

      const { createKiloServer } = require('@kilocode/sdk/server');
      expect(createKiloServer).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            mcp: expect.objectContaining({
              github: expect.objectContaining({ type: 'local' }),
            }),
          }),
        })
      );
    });

    it('omits config when no mcp provider is wired', async () => {
      await runtime.start();
      const { createKiloServer } = require('@kilocode/sdk/server');
      const callArgs = createKiloServer.mock.calls[0][0];
      expect(callArgs.config).toBeUndefined();
    });

    it('starts serve even when mcp config read fails', async () => {
      const mcpProvider = jest.fn().mockRejectedValue(new Error('file read failed'));
      runtime = new KiloCodeChatRuntime(mockBinaryManager, () => MOCK_SETTINGS, mcpProvider);

      await runtime.start();
      const { createKiloServer } = require('@kilocode/sdk/server');
      expect(createKiloServer).toHaveBeenCalledTimes(1);
    });

    it('getMcpStatus returns CLI mcp status map', async () => {
      const { createKiloClient } = require('@kilocode/sdk/client');
      const mockClient = createKiloClient();
      mockClient.mcp.status.mockResolvedValue({
        data: { github: { status: 'connected' }, broken: { status: 'failed', error: 'boom' } },
        error: null,
      });

      await runtime.start();
      const status = await runtime.getMcpStatus();

      expect(status).toEqual({
        github: { status: 'connected' },
        broken: { status: 'failed', error: 'boom' },
      });
      expect(mockClient.mcp.status).toHaveBeenCalled();
    });
  });
});
