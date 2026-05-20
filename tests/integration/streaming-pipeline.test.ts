import { StreamController } from '../../src/features/chat/controllers/StreamController';
import { InputController } from '../../src/features/chat/controllers/InputController';
import type { ChatRuntime, StreamChunk } from '../../src/core/providers/types';

describe('Streaming Pipeline Integration', () => {
  test('完整对话流程：用户消息 → 流式响应 → 助手消息', async () => {
    async function* mockSendMessage(): AsyncGenerator<StreamChunk> {
      yield { type: 'text', content: 'I\'ll help you. ' };
      yield { type: 'text', content: 'Let me read the file.\n' };
      yield {
        type: 'tool_use',
        toolCall: {
          id: 'tc-1', name: 'read_file', input: { path: '/vault/note.md' }, status: 'pending',
        },
      };
      yield {
        type: 'tool_result',
        toolCall: {
          id: 'tc-1', name: 'read_file', input: { path: '/vault/note.md' },
          status: 'completed', result: '# Hello World',
        },
      };
      yield { type: 'text', content: 'Found the file. Here\'s the content.' };
      yield { type: 'done' };
    }

    const mockRuntime: ChatRuntime = {
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      sendMessage: jest.fn().mockImplementation(mockSendMessage),
      cancel: jest.fn(),
      resetSession: jest.fn(),
      isStreaming: jest.fn().mockReturnValue(false),
    };

    const inputController = new InputController();
    inputController.setRuntime(mockRuntime);

    const streamController = new StreamController();
    const textChunks: string[] = [];
    const toolCalls: string[] = [];

    const runtime = inputController.getRuntime()!;
    const generator = runtime.sendMessage('Read the note');

    const message = await streamController.consumeStream(generator, {
      onText: (text) => textChunks.push(text),
      onToolCall: (tc) => toolCalls.push(tc.name),
    });

    expect(message.role).toBe('assistant');
    expect(message.content).toBe(
      'I\'ll help you. Let me read the file.\nFound the file. Here\'s the content.',
    );
    expect(message.toolCalls).toHaveLength(1);
    expect(message.toolCalls![0].name).toBe('read_file');
    expect(message.toolCalls![0].status).toBe('completed');
    expect(message.toolCalls![0].result).toBe('# Hello World');
    expect(textChunks).toHaveLength(3);
    expect(toolCalls).toEqual(['read_file']);
  });

  test('取消流程：用户取消后停止消费', async () => {
    let yieldCount = 0;

    async function* slowGenerator(): AsyncGenerator<StreamChunk> {
      yield { type: 'text', content: 'part1' };
      yieldCount++;
      await new Promise(r => setTimeout(r, 50));
      yield { type: 'text', content: 'part2' };
      yieldCount++;
      yield { type: 'done' };
    }

    const mockRuntime: ChatRuntime = {
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      sendMessage: jest.fn().mockImplementation(slowGenerator),
      cancel: jest.fn(),
      resetSession: jest.fn(),
      isStreaming: jest.fn().mockReturnValue(false),
    };

    const inputController = new InputController();
    inputController.setRuntime(mockRuntime);

    const streamController = new StreamController();
    const onText = jest.fn();

    const generator = mockRuntime.sendMessage('slow task');
    const promise = streamController.consumeStream(generator, { onText });

    await new Promise(r => setTimeout(r, 10));
    expect(onText).toHaveBeenCalledWith('part1');

    streamController.cancel();

    const message = await promise;
    expect(message.content).toBe('part1');
    expect(yieldCount).toBe(1);
  });

  test('错误流程：CLI 输出 error chunk', async () => {
    async function* errorGenerator(): AsyncGenerator<StreamChunk> {
      yield { type: 'text', content: 'Starting...' };
      yield { type: 'error', error: 'CLI process crashed' };
    }

    const mockRuntime: ChatRuntime = {
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      sendMessage: jest.fn().mockImplementation(errorGenerator),
      cancel: jest.fn(),
      resetSession: jest.fn(),
      isStreaming: jest.fn().mockReturnValue(false),
    };

    const streamController = new StreamController();
    const onError = jest.fn();

    const generator = mockRuntime.sendMessage('test');
    const message = await streamController.consumeStream(generator, { onError });

    expect(onError).toHaveBeenCalledWith('CLI process crashed');
    expect(message.content).toBe('Starting...');
  });
});
