import { KiloCodeChatRuntime } from '../../../src/providers/kilocode/runtime/KiloCodeChatRuntime';
import type { StreamChunk } from '../../../src/core/providers/types';

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

const mockBinaryManager = {
  getBinaryPath: jest.fn().mockResolvedValue('/mock/path/kilo'),
  isReady: jest.fn().mockReturnValue(true),
  preload: jest.fn().mockResolvedValue(undefined),
} as unknown as import('../../../src/core/binary/BinaryManager').BinaryManager;

const mockSettings = { cliPath: '', mirrorUrl: '' } as any;

function createMockProcess() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const proc = Object.assign(new EventEmitter(), {
    stdin,
    stdout,
    stderr,
    kill: jest.fn(),
  });
  return { proc, stdin, stdout, stderr };
}

describe('KiloCodeChatRuntime', () => {
  let runtime: KiloCodeChatRuntime;
  let mockProc: ReturnType<typeof createMockProcess>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProc = createMockProcess();
    (spawn as jest.Mock).mockReturnValue(mockProc.proc);
    runtime = new KiloCodeChatRuntime(mockBinaryManager, mockSettings);
  });

  afterEach(() => {
    runtime.stop();
  });

  describe('start', () => {
    test('spawns kilo CLI with --mode json-rpc', async () => {
      await runtime.start();
      expect(spawn).toHaveBeenCalledWith('/mock/path/kilo', ['--mode', 'json-rpc'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    });
  });

  describe('sendMessage — AsyncGenerator', () => {
    test('yields text chunks from stdout', async () => {
      await runtime.start();
      const generator = runtime.sendMessage('hello');

      setTimeout(() => {
        mockProc.stdout.write(JSON.stringify({ type: 'text', content: 'Hi ' }) + '\n');
        mockProc.stdout.write(JSON.stringify({ type: 'text', content: 'there' }) + '\n');
        mockProc.stdout.write(JSON.stringify({ type: 'done' }) + '\n');
      }, 10);

      const chunks: StreamChunk[] = [];
      for await (const chunk of generator) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toEqual({ type: 'text', content: 'Hi ' });
      expect(chunks[1]).toEqual({ type: 'text', content: 'there' });
      expect(chunks[2]).toEqual({ type: 'done' });
    });

    test('yields tool_use chunks', async () => {
      await runtime.start();
      const generator = runtime.sendMessage('read file');

      setTimeout(() => {
        mockProc.stdout.write(JSON.stringify({
          type: 'tool_use',
          toolCall: { id: 'tc-1', name: 'read_file', input: { path: '/test' }, status: 'pending' },
        }) + '\n');
        mockProc.stdout.write(JSON.stringify({ type: 'done' }) + '\n');
      }, 10);

      const chunks: StreamChunk[] = [];
      for await (const chunk of generator) {
        chunks.push(chunk);
      }

      expect(chunks[0].type).toBe('tool_use');
      expect(chunks[0].toolCall!.name).toBe('read_file');
    });

    test('yields error chunk on CLI error', async () => {
      await runtime.start();
      const generator = runtime.sendMessage('fail');

      setTimeout(() => {
        mockProc.stdout.write(JSON.stringify({ type: 'error', error: 'CLI crashed' }) + '\n');
      }, 10);

      const chunks: StreamChunk[] = [];
      for await (const chunk of generator) {
        chunks.push(chunk);
      }

      expect(chunks[0].type).toBe('error');
      expect(chunks[0].error).toBe('CLI crashed');
    });

    test('handles partial lines across chunks', async () => {
      await runtime.start();
      const generator = runtime.sendMessage('test');

      setTimeout(() => {
        mockProc.stdout.write('{"type":"text","content":"hel');
        mockProc.stdout.write('lo"}\n');
        mockProc.stdout.write(JSON.stringify({ type: 'done' }) + '\n');
      }, 10);

      const chunks: StreamChunk[] = [];
      for await (const chunk of generator) {
        chunks.push(chunk);
      }

      expect(chunks[0]).toEqual({ type: 'text', content: 'hello' });
    });
  });

  describe('cancel', () => {
    test('中断 AsyncGenerator 消费', async () => {
      await runtime.start();
      const generator = runtime.sendMessage('long task');

      setTimeout(() => {
        mockProc.stdout.write(JSON.stringify({ type: 'text', content: 'part1' }) + '\n');
      }, 10);

      const first = await generator.next();
      expect(first.value.type).toBe('text');

      runtime.cancel();

      const result = await generator.next();
      expect(result.done).toBe(true);
    });
  });

  describe('sendApproval', () => {
    test('通过 stdin 发送 JSON-RPC 审批消息', async () => {
      await runtime.start();
      const writeSpy = jest.spyOn(mockProc.stdin, 'write');

      runtime.sendApproval?.('write_file', 'allow');

      expect(writeSpy).toHaveBeenCalled();
      const written = JSON.parse(writeSpy.mock.calls[0][0] as string);
      expect(written.method).toBe('approval');
      expect(written.params.toolName).toBe('write_file');
      expect(written.params.decision).toBe('allow');
    });
  });
});
