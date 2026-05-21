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

      expect(message.content).toBe('Before approval.\nAfter approval.\n');
      expect(onText).toHaveBeenCalledTimes(2);
    });

    test('onApprovalRequired 回调被调用并传入正确参数', async () => {
      const onApprovalRequired = jest.fn().mockResolvedValue('allow');

      const generator = mockGenerator([
        {
          type: 'approval_required',
          approvalRequest: {
            toolName: 'bash',
            input: { command: 'rm -rf /tmp/test' },
            description: 'Execute bash command',
          },
        },
        { type: 'done' },
      ]);

      await controller.consumeStream(generator, { onApprovalRequired });

      expect(onApprovalRequired).toHaveBeenCalledTimes(1);
      expect(onApprovalRequired).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'bash',
          input: { command: 'rm -rf /tmp/test' },
          description: 'Execute bash command',
        }),
      );
    });

    test('cancel 决定中断流', async () => {
      const onText = jest.fn();
      const onApprovalRequired = jest.fn().mockResolvedValue('cancel');

      async function* generatorWithApproval(): AsyncGenerator<StreamChunk> {
        yield { type: 'text', content: 'Before.\n' };
        yield {
          type: 'approval_required',
          approvalRequest: {
            toolName: 'write_file',
            input: { path: '/test' },
            description: 'Write file',
          },
        };
        yield { type: 'text', content: 'After.\n' };
        yield { type: 'done' };
      }

      const message = await controller.consumeStream(generatorWithApproval(), {
        onText,
        onApprovalRequired,
      });

      expect(onApprovalRequired).toHaveBeenCalledTimes(1);
      expect(message.content).toBe('Before.\n');
    });

    test('setApprovalDecisionCallback 被调用', async () => {
      const decisionCallback = jest.fn();
      controller.setApprovalDecisionCallback(decisionCallback);

      const onApprovalRequired = jest.fn().mockResolvedValue('allow');

      const generator = mockGenerator([
        {
          type: 'approval_required',
          approvalRequest: {
            toolName: 'write_file',
            input: { path: '/test' },
            description: 'Write file',
          },
        },
        { type: 'done' },
      ]);

      await controller.consumeStream(generator, { onApprovalRequired });

      expect(decisionCallback).toHaveBeenCalledWith('write_file', 'allow');
    });

    test('无 onApprovalRequired 回调时 approval_required 被忽略', async () => {
      const onText = jest.fn();

      const generator = mockGenerator([
        { type: 'text', content: 'Hello.\n' },
        {
          type: 'approval_required',
          approvalRequest: {
            toolName: 'write_file',
            input: {},
            description: '',
          },
        },
        { type: 'text', content: 'World.\n' },
        { type: 'done' },
      ]);

      const message = await controller.consumeStream(generator, { onText });

      expect(message.content).toBe('Hello.\nWorld.\n');
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

  describe('consumeStream — thinking 文本处理', () => {
    test('thinking chunk 累积到 message.thinking 并调用 onThinking 回调', async () => {
      const onThinking = jest.fn();
      const onText = jest.fn();

      const generator = mockGenerator([
        { type: 'thinking', content: '让我分析一下...' },
        { type: 'thinking', content: '\n需要考虑...' },
        { type: 'text', content: '最终回答' },
        { type: 'done' },
      ]);

      const message = await controller.consumeStream(generator, { onThinking, onText });

      expect(message.thinking).toBe('让我分析一下...\n需要考虑...');
      expect(message.content).toBe('最终回答');
      expect(onThinking).toHaveBeenCalledTimes(2);
      expect(onThinking).toHaveBeenNthCalledWith(1, '让我分析一下...');
      expect(onThinking).toHaveBeenNthCalledWith(2, '\n需要考虑...');
      expect(onText).toHaveBeenCalledTimes(1);
      expect(onText).toHaveBeenCalledWith('最终回答');
    });

    test('没有 thinking 时 thinking 字段应为空字符串', async () => {
      const generator = mockGenerator([
        { type: 'text', content: '直接回答' },
        { type: 'done' },
      ]);

      const message = await controller.consumeStream(generator, {});

      expect(message.thinking).toBe('');
      expect(message.content).toBe('直接回答');
    });
  });

  describe('consumeStream — streamGeneration 冲突保护', () => {
    test('generation=0 时不启用保护，正常处理所有 chunk', async () => {
      const generator = mockGenerator([
        { type: 'text', content: '正常内容' },
        { type: 'done' },
      ]);

      const message = await controller.consumeStream(generator, {}, 0);

      expect(message.content).toBe('正常内容');
    });

    test('generation 匹配时正常处理 chunk', async () => {
      const generator = mockGenerator([
        { type: 'text', content: '正常内容' },
        { type: 'done' },
      ]);

      const message = await controller.consumeStream(generator, {}, 1);

      expect(message.content).toBe('正常内容');
    });

    test('代数不匹配时旧流被截断', async () => {
      const onTextOld = jest.fn();
      const onTextNew = jest.fn();

      // 模拟并发场景：旧流有延迟，新流在旧流完成前启动
      async function* slowOldStream(): AsyncGenerator<StreamChunk> {
        yield { type: 'text', content: 'old-start' };
        // 等待足够长，让新流的 consumeStream 调用覆盖 currentGeneration
        await new Promise(resolve => setTimeout(resolve, 50));
        yield { type: 'text', content: 'old-end' };
        yield { type: 'done' };
      }

      async function* newStream(): AsyncGenerator<StreamChunk> {
        yield { type: 'text', content: 'new' };
        yield { type: 'done' };
      }

      // 启动旧流（generation=1），但不等待完成
      const oldPromise = controller.consumeStream(slowOldStream(), { onText: onTextOld }, 1);

      // 等旧流第一个 chunk 处理完
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(onTextOld).toHaveBeenCalledWith('old-start');

      // 启动新流（generation=2），覆盖 currentGeneration
      const newMessage = await controller.consumeStream(newStream(), { onText: onTextNew }, 2);
      expect(newMessage.content).toBe('new');
      expect(onTextNew).toHaveBeenCalledWith('new');

      // 旧流继续执行，但因 currentGeneration 已变为 2，generation=1 不匹配
      const oldMessage = await oldPromise;
      expect(oldMessage.content).toBe('old-start');
      // old-end 应被跳过
      expect(onTextOld).not.toHaveBeenCalledWith('old-end');
    });
  });
});
