import { StreamController, StreamCallbacks } from '../../../../src/features/chat/controllers/StreamController';
import type { StreamChunk, Message, ToolCallInfo } from '../../../../src/core/providers/types';

async function* mockGenerator(chunks: StreamChunk[]): AsyncGenerator<StreamChunk> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

describe('StreamController', () => {
  let controller: StreamController;

  beforeEach(() => {
    controller = new StreamController();
  });

  describe('consumeStream — text', () => {
    test('累积文本内容并调用 onText 回调', async () => {
      const onText = jest.fn();
      const onComplete = jest.fn();

      const generator = mockGenerator([
        { type: 'text', content: 'Hello ' },
        { type: 'text', content: 'World' },
        { type: 'done' },
      ]);

      const message = await controller.consumeStream(generator, { onText, onComplete });

      expect(onText).toHaveBeenCalledTimes(2);
      expect(onText).toHaveBeenNthCalledWith(1, 'Hello ');
      expect(onText).toHaveBeenNthCalledWith(2, 'World');
      expect(message.content).toBe('Hello World');
      expect(message.role).toBe('assistant');
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  describe('consumeStream — tool_use + tool_result', () => {
    test('处理工具调用和结果', async () => {
      const onToolCall = jest.fn();
      const onToolResult = jest.fn();

      const toolCall: ToolCallInfo = {
        id: 'tc-1', name: 'read_file', input: { path: '/test' }, status: 'pending',
      };
      const toolResult: ToolCallInfo = {
        id: 'tc-1', name: 'read_file', input: { path: '/test' }, status: 'completed', result: 'content',
      };

      const generator = mockGenerator([
        { type: 'tool_use', toolCall },
        { type: 'tool_result', toolCall: toolResult },
        { type: 'done' },
      ]);

      const message = await controller.consumeStream(generator, { onToolCall, onToolResult });

      expect(onToolCall).toHaveBeenCalledWith(toolCall);
      expect(onToolResult).toHaveBeenCalledWith('tc-1', 'content');
      expect(message.toolCalls).toHaveLength(1);
      expect(message.toolCalls![0].status).toBe('completed');
    });
  });

  describe('consumeStream — error', () => {
    test('调用 onError 回调', async () => {
      const onError = jest.fn();

      const generator = mockGenerator([
        { type: 'error', error: 'CLI crashed' },
      ]);

      const message = await controller.consumeStream(generator, { onError });

      expect(onError).toHaveBeenCalledWith('CLI crashed');
      expect(message.content).toBe('');
    });
  });

  describe('cancel', () => {
    test('中断 consumeStream 循环', async () => {
      const onText = jest.fn();

      async function* slowGenerator(): AsyncGenerator<StreamChunk> {
        yield { type: 'text', content: 'part1' };
        await new Promise(resolve => setTimeout(resolve, 100));
        yield { type: 'text', content: 'part2' };
        yield { type: 'done' };
      }

      const promise = controller.consumeStream(slowGenerator(), { onText });

      await new Promise(resolve => setTimeout(resolve, 10));
      expect(onText).toHaveBeenCalledWith('part1');

      controller.cancel();

      const message = await promise;
      expect(message.content).toBe('part1');
      expect(onText).not.toHaveBeenCalledWith('part2');
    });
  });

  describe('consumeStream — 空流', () => {
    test('空 generator 返回空消息', async () => {
      async function* emptyGenerator(): AsyncGenerator<StreamChunk> {}

      const message = await controller.consumeStream(emptyGenerator(), {});

      expect(message.content).toBe('');
      expect(message.role).toBe('assistant');
    });
  });

  describe('consumeStream — 混合消息', () => {
    test('正确处理 text + tool_use + text + done 序列', async () => {
      const onText = jest.fn();
      const onToolCall = jest.fn();

      const toolCall: ToolCallInfo = {
        id: 'tc-1', name: 'bash', input: { command: 'ls' }, status: 'pending',
      };

      const generator = mockGenerator([
        { type: 'text', content: 'I will run a command.\n' },
        { type: 'tool_use', toolCall },
        { type: 'text', content: 'Command completed.\n' },
        { type: 'done' },
      ]);

      const message = await controller.consumeStream(generator, { onText, onToolCall });

      expect(message.content).toBe('I will run a command.\nCommand completed.\n');
      expect(message.toolCalls).toHaveLength(1);
      expect(onText).toHaveBeenCalledTimes(2);
    });
  });

  describe('consumeStream — approval_required', () => {
    test('approval_required chunk 不中断流、不改变消息内容', async () => {
      const onText = jest.fn();

      const generator = mockGenerator([
        { type: 'text', content: 'Before approval.\n' },
        {
          type: 'approval_required',
          approvalRequest: {
            toolName: 'write_file',
            input: { path: '/test', content: 'data' },
            description: 'Write to /test',
          },
        },
        { type: 'text', content: 'After approval.\n' },
        { type: 'done' },
      ]);

      const message = await controller.consumeStream(generator, { onText });

      // approval_required 被跳过，不影响文本累积
      expect(message.content).toBe('Before approval.\nAfter approval.\n');
      expect(onText).toHaveBeenCalledTimes(2);
    });
  });

  describe('consumeStream — generator 抛异常', () => {
    test('generator 抛出错误时调用 onError', async () => {
      const onError = jest.fn();

      async function* throwingGenerator(): AsyncGenerator<StreamChunk> {
        yield { type: 'text', content: 'Before error.\n' };
        throw new Error('Generator exploded');
      }

      const message = await controller.consumeStream(throwingGenerator(), { onError });

      expect(onError).toHaveBeenCalledWith('Generator exploded');
      // 错误前累积的内容仍然保留
      expect(message.content).toBe('Before error.\n');
    });

    test('generator 抛非 Error 对象时调用 onError', async () => {
      const onError = jest.fn();

      async function* throwingGenerator(): AsyncGenerator<StreamChunk> {
        yield { type: 'text', content: 'Start.\n' };
        throw 'string error'; // eslint-disable-line no-throw-literal
      }

      const message = await controller.consumeStream(throwingGenerator(), { onError });

      expect(onError).toHaveBeenCalledWith('string error');
      expect(message.content).toBe('Start.\n');
    });
  });
});
