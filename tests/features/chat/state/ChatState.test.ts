// tests/features/chat/state/ChatState.test.ts
import { ChatState } from '../../../../src/features/chat/state/ChatState';

describe('ChatState', () => {
  let state: ChatState;

  beforeEach(() => {
    state = new ChatState();
  });

  // ============================================
  // 初始状态
  // ============================================

  describe('initial state', () => {
    it('should have default values', () => {
      expect(state.isStreaming).toBe(false);
      expect(state.streamGeneration).toBe(0);
      expect(state.cancelRequested).toBe(false);
      expect(state.currentConversationId).toBeNull();
      expect(state.currentTextContent).toBe('');
      expect(state.currentThinkingContent).toBe('');
      expect(state.hasPendingConversationSave).toBe(false);
      expect(state.toolCalls.size).toBe(0);
    });
  });

  // ============================================
  // 流式状态管理
  // ============================================

  describe('streaming state', () => {
    it('should set streaming state', () => {
      state.setStreaming(true);
      expect(state.isStreaming).toBe(true);
    });

    it('should reset streaming state', () => {
      state.setStreaming(true);
      state.setStreaming(false);
      expect(state.isStreaming).toBe(false);
    });

    it('should bump stream generation', () => {
      const gen1 = state.bumpStreamGeneration();
      const gen2 = state.bumpStreamGeneration();
      expect(gen1).toBe(1);
      expect(gen2).toBe(2);
      expect(state.streamGeneration).toBe(2);
    });

    it('should set cancel requested', () => {
      state.requestCancel();
      expect(state.cancelRequested).toBe(true);
    });

    it('should reset cancel requested', () => {
      state.requestCancel();
      state.resetCancel();
      expect(state.cancelRequested).toBe(false);
    });
  });

  // ============================================
  // 流式内容缓冲
  // ============================================

  describe('streaming content buffer', () => {
    it('should append text content', () => {
      state.appendText('Hello');
      state.appendText(' World');
      expect(state.currentTextContent).toBe('Hello World');
    });

    it('should append thinking content', () => {
      state.appendThinking('Let me think...');
      state.appendThinking(' Done.');
      expect(state.currentThinkingContent).toBe('Let me think... Done.');
    });

    it('should reset streaming buffer', () => {
      state.appendText('text');
      state.appendThinking('thinking');
      state.resetStreamingBuffer();
      expect(state.currentTextContent).toBe('');
      expect(state.currentThinkingContent).toBe('');
      expect(state.toolCalls.size).toBe(0);
    });

    it('should track tool calls', () => {
      const toolCall = {
        id: 'tc-1',
        name: 'read_file',
        input: { path: '/test' },
        status: 'running' as const,
      };
      state.addToolCall(toolCall);
      expect(state.toolCalls.get('tc-1')).toEqual(toolCall);
    });

    it('should update tool call status', () => {
      state.addToolCall({
        id: 'tc-1',
        name: 'read_file',
        input: { path: '/test' },
        status: 'running' as const,
      });
      state.updateToolCallStatus('tc-1', 'completed', 'file content');
      const tc = state.toolCalls.get('tc-1');
      expect(tc?.status).toBe('completed');
      expect(tc?.result).toBe('file content');
    });
  });

  // ============================================
  // 会话状态
  // ============================================

  describe('conversation state', () => {
    it('should set conversation id', () => {
      state.setConversationId('conv-123');
      expect(state.currentConversationId).toBe('conv-123');
    });

    it('should clear conversation id', () => {
      state.setConversationId('conv-123');
      state.setConversationId(null);
      expect(state.currentConversationId).toBeNull();
    });

    it('should track pending save', () => {
      state.markPendingSave(true);
      expect(state.hasPendingConversationSave).toBe(true);
      state.markPendingSave(false);
      expect(state.hasPendingConversationSave).toBe(false);
    });
  });

  // ============================================
  // 回调通知
  // ============================================

  describe('callbacks', () => {
    it('should notify on streaming change', () => {
      const callback = jest.fn();
      state.on('streamingChange', callback);
      state.setStreaming(true);
      expect(callback).toHaveBeenCalledWith(true);
    });

    it('should notify on cancel request', () => {
      const callback = jest.fn();
      state.on('cancelRequested', callback);
      state.requestCancel();
      expect(callback).toHaveBeenCalled();
    });

    it('should allow unregistering callbacks', () => {
      const callback = jest.fn();
      const unregister = state.on('streamingChange', callback);
      unregister();
      state.setStreaming(true);
      expect(callback).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // 完整重置
  // ============================================

  describe('full reset', () => {
    it('should reset all state to defaults', () => {
      state.setStreaming(true);
      state.setConversationId('conv-123');
      state.appendText('text');
      state.appendThinking('thinking');
      state.requestCancel();
      state.markPendingSave(true);

      state.reset();

      expect(state.isStreaming).toBe(false);
      expect(state.currentConversationId).toBeNull();
      expect(state.currentTextContent).toBe('');
      expect(state.currentThinkingContent).toBe('');
      expect(state.cancelRequested).toBe(false);
      expect(state.hasPendingConversationSave).toBe(false);
      expect(state.streamGeneration).toBe(0);
    });
  });
});
