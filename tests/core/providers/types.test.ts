import type { StreamChunk, StreamChunkType } from '../../../src/core/providers/types';

describe('StreamChunk types', () => {
  test('StreamChunkType 包含所有必需类型', () => {
    const types: StreamChunkType[] = [
      'text', 'tool_use', 'tool_result', 'error', 'done', 'approval_required',
    ];
    expect(types).toHaveLength(6);
  });

  test('text chunk 结构正确', () => {
    const chunk: StreamChunk = { type: 'text', content: 'hello' };
    expect(chunk.type).toBe('text');
    expect(chunk.content).toBe('hello');
  });

  test('tool_use chunk 结构正确', () => {
    const chunk: StreamChunk = {
      type: 'tool_use',
      toolCall: {
        id: 'tc-1',
        name: 'read_file',
        input: { path: '/test' },
        status: 'pending',
      },
    };
    expect(chunk.type).toBe('tool_use');
    expect(chunk.toolCall!.name).toBe('read_file');
  });

  test('error chunk 结构正确', () => {
    const chunk: StreamChunk = { type: 'error', error: 'something broke' };
    expect(chunk.type).toBe('error');
    expect(chunk.error).toBe('something broke');
  });

  test('approval_required chunk 结构正确', () => {
    const chunk: StreamChunk = {
      type: 'approval_required',
      approvalRequest: {
        toolName: 'write_file',
        input: { path: '/test', content: 'data' },
        description: 'Write to /test',
      },
    };
    expect(chunk.type).toBe('approval_required');
    expect(chunk.approvalRequest!.toolName).toBe('write_file');
  });
});

describe('ChatRuntime interface', () => {
  test('sendMessage 返回 AsyncGenerator', async () => {
    const mockRuntime: import('../../src/core/providers/types').ChatRuntime = {
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      sendMessage: jest.fn().mockImplementation(async function* () {
        yield { type: 'text', content: 'hello' };
        yield { type: 'done' };
      }),
      cancel: jest.fn(),
      resetSession: jest.fn(),
      isStreaming: jest.fn().mockReturnValue(false),
    };

    const generator = mockRuntime.sendMessage('test');
    const chunks: import('../../src/core/providers/types').StreamChunk[] = [];
    for await (const chunk of generator) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(2);
    expect(chunks[0].type).toBe('text');
    expect(chunks[1].type).toBe('done');
  });

  test('ChatRuntime 包含 sendApproval 可选方法', () => {
    const mockRuntime: import('../../src/core/providers/types').ChatRuntime = {
      start: jest.fn(),
      stop: jest.fn(),
      sendMessage: jest.fn(),
      cancel: jest.fn(),
      resetSession: jest.fn(),
      isStreaming: jest.fn(),
      sendApproval: jest.fn(),
    };
    expect(mockRuntime.sendApproval).toBeDefined();
  });
});
