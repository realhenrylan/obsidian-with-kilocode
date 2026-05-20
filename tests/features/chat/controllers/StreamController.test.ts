import { StreamController, StreamCallbacks } from '../../../../src/features/chat/controllers/StreamController';
import type { StreamMessage, ToolCallInfo } from '../../../../src/core/types';

describe('StreamController', () => {
  let controller: StreamController;

  beforeEach(() => {
    controller = new StreamController();
  });

  describe('startStream', () => {
    test('creates message skeleton and sets streaming', () => {
      controller.startStream();
      expect(controller.isCurrentlyStreaming()).toBe(true);
      const msg = controller.getCurrentMessage();
      expect(msg).not.toBeNull();
      expect(msg!.role).toBe('assistant');
      expect(msg!.content).toBe('');
      expect(msg!.toolCalls).toEqual([]);
      expect(msg!.id).toMatch(/^msg-/);
    });
  });

  describe('handleMessage - text', () => {
    test('accumulates content and calls onText', () => {
      const onText = jest.fn();
      controller.setCallbacks({ onText });
      controller.startStream();

      controller.handleMessage({ type: 'text', content: 'Hello' });
      controller.handleMessage({ type: 'text', content: ' World' });

      expect(onText).toHaveBeenCalledTimes(2);
      expect(onText).toHaveBeenNthCalledWith(1, 'Hello');
      expect(onText).toHaveBeenNthCalledWith(2, ' World');
      expect(controller.getCurrentMessage()!.content).toBe('Hello World');
    });

    test('handles text message with missing content', () => {
      const onText = jest.fn();
      controller.setCallbacks({ onText });
      controller.startStream();

      controller.handleMessage({ type: 'text' });
      expect(onText).toHaveBeenCalledWith('');
    });
  });

  describe('handleMessage - tool_use', () => {
    test('adds to toolCalls and calls onToolCall', () => {
      const onToolCall = jest.fn();
      controller.setCallbacks({ onToolCall });
      controller.startStream();

      const toolCall: ToolCallInfo = {
        id: 'tc-1',
        name: 'read_file',
        input: { path: '/test' },
        status: 'pending',
      };

      controller.handleMessage({ type: 'tool_use', toolCall });

      expect(onToolCall).toHaveBeenCalledWith(toolCall);
      expect(controller.getCurrentMessage()!.toolCalls).toHaveLength(1);
      expect(controller.getCurrentMessage()!.toolCalls![0]).toBe(toolCall);
    });

    test('calls onError if toolCall missing', () => {
      const onError = jest.fn();
      controller.setCallbacks({ onError });
      controller.startStream();

      controller.handleMessage({ type: 'tool_use' });

      expect(onError).toHaveBeenCalledWith('Invalid tool_use message: missing toolCall');
      expect(controller.isCurrentlyStreaming()).toBe(false);
    });
  });

  describe('handleMessage - tool_result', () => {
    test('updates existing tool call and calls onToolResult', () => {
      const onToolResult = jest.fn();
      controller.setCallbacks({ onToolResult });
      controller.startStream();

      const toolCall: ToolCallInfo = {
        id: 'tc-1',
        name: 'read_file',
        input: { path: '/test' },
        status: 'pending',
      };
      controller.handleMessage({ type: 'tool_use', toolCall });

      const resultToolCall: ToolCallInfo = {
        id: 'tc-1',
        name: 'read_file',
        input: { path: '/test' },
        status: 'completed',
        result: 'file contents',
      };
      controller.handleMessage({ type: 'tool_result', toolCall: resultToolCall });

      expect(onToolResult).toHaveBeenCalledWith('tc-1', 'file contents');
      const msgToolCalls = controller.getCurrentMessage()!.toolCalls!;
      expect(msgToolCalls[0].status).toBe('completed');
      expect(msgToolCalls[0].result).toBe('file contents');
    });

    test('calls onError if toolCall missing', () => {
      const onError = jest.fn();
      controller.setCallbacks({ onError });
      controller.startStream();

      controller.handleMessage({ type: 'tool_result' });

      expect(onError).toHaveBeenCalledWith('Invalid tool_result message: missing toolCall');
    });
  });

  describe('handleMessage - error', () => {
    test('sets streaming false and calls onError', () => {
      const onError = jest.fn();
      controller.setCallbacks({ onError });
      controller.startStream();

      controller.handleMessage({ type: 'error', error: 'something broke' });

      expect(controller.isCurrentlyStreaming()).toBe(false);
      expect(onError).toHaveBeenCalledWith('something broke');
    });

    test('uses default error message when error field missing', () => {
      const onError = jest.fn();
      controller.setCallbacks({ onError });
      controller.startStream();

      controller.handleMessage({ type: 'error' });
      expect(onError).toHaveBeenCalledWith('Unknown error');
    });
  });

  describe('handleMessage - done', () => {
    test('sets streaming false and calls onComplete', () => {
      const onComplete = jest.fn();
      controller.setCallbacks({ onComplete });
      controller.startStream();

      controller.handleMessage({ type: 'done' });

      expect(controller.isCurrentlyStreaming()).toBe(false);
      expect(onComplete).toHaveBeenCalled();
    });
  });

  describe('handleMessage - null/invalid', () => {
    test('calls onError for null message', () => {
      const onError = jest.fn();
      controller.setCallbacks({ onError });

      controller.handleMessage(null as unknown as StreamMessage);
      expect(onError).toHaveBeenCalledWith('Invalid message: missing or invalid type');
    });

    test('calls onError for message with invalid type', () => {
      const onError = jest.fn();
      controller.setCallbacks({ onError });

      controller.handleMessage({ type: 123 } as unknown as StreamMessage);
      expect(onError).toHaveBeenCalledWith('Invalid message: missing or invalid type');
    });
  });

  describe('getCurrentMessage', () => {
    test('returns null before startStream', () => {
      expect(controller.getCurrentMessage()).toBeNull();
    });

    test('returns message after startStream', () => {
      controller.startStream();
      expect(controller.getCurrentMessage()).not.toBeNull();
    });
  });

  describe('isCurrentlyStreaming', () => {
    test('returns false initially', () => {
      expect(controller.isCurrentlyStreaming()).toBe(false);
    });

    test('returns true after startStream', () => {
      controller.startStream();
      expect(controller.isCurrentlyStreaming()).toBe(true);
    });
  });

  describe('cancel', () => {
    test('sets streaming to false', () => {
      controller.startStream();
      expect(controller.isCurrentlyStreaming()).toBe(true);
      controller.cancel();
      expect(controller.isCurrentlyStreaming()).toBe(false);
    });
  });

  describe('setCallbacks', () => {
    test('replaces callbacks', () => {
      const onText1 = jest.fn();
      const onText2 = jest.fn();
      controller.setCallbacks({ onText: onText1 });
      controller.setCallbacks({ onText: onText2 });
      controller.startStream();
      controller.handleMessage({ type: 'text', content: 'hi' });
      expect(onText1).not.toHaveBeenCalled();
      expect(onText2).toHaveBeenCalledWith('hi');
    });
  });

  test('multiple text messages accumulate correctly', () => {
    controller.startStream();
    controller.handleMessage({ type: 'text', content: 'a' });
    controller.handleMessage({ type: 'text', content: 'b' });
    controller.handleMessage({ type: 'text', content: 'c' });
    expect(controller.getCurrentMessage()!.content).toBe('abc');
  });
});
