// tests/features/chat/controllers/ConversationController.test.ts

import { ConversationController } from '../../../../src/features/chat/controllers/ConversationController';
import type { ConversationService } from '../../../../src/features/chat/services/ConversationService';
import type { ChatState } from '../../../../src/features/chat/state/ChatState';
import type { Message, Conversation } from '../../../../src/core/types';

// Mock ConversationService
function createMockConversationService(): ConversationService {
  const conversations = new Map<string, Conversation>();
  return {
    createConversation: jest.fn().mockImplementation(async () => {
      const id = `conv-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const conv: Conversation = {
        id,
        providerId: 'kilocode',
        title: 'Test',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 0,
        preview: 'New conversation',
        messages: [],
      };
      conversations.set(id, conv);
      return conv;
    }),
    getConversation: jest.fn().mockImplementation(async (id: string) => {
      return conversations.get(id) || null;
    }),
    addMessage: jest.fn().mockImplementation(async (convId: string, msg: Message) => {
      const conv = conversations.get(convId);
      if (conv) {
        conv.messages.push(msg);
        conv.messageCount = conv.messages.length;
      }
    }),
    forkConversation: jest.fn().mockImplementation(async (sourceId: string, msgId: string) => {
      const source = conversations.get(sourceId);
      if (!source) throw new Error('Source not found');
      const forkIndex = source.messages.findIndex(m => m.id === msgId);
      const forked: Conversation = {
        ...source,
        id: `conv-${Date.now()}-fork`,
        messages: source.messages.slice(0, forkIndex + 1),
        title: `Fork: ${source.title}`,
        forkedFrom: sourceId,
      };
      conversations.set(forked.id, forked);
      return forked;
    }),
    rewindToMessage: jest.fn().mockImplementation(async (convId: string, msgId: string) => {
      const conv = conversations.get(convId);
      if (!conv) throw new Error('Not found');
      const idx = conv.messages.findIndex(m => m.id === msgId);
      const removed = conv.messages.slice(idx + 1);
      conv.messages = conv.messages.slice(0, idx + 1);
      return removed;
    }),
    flush: jest.fn().mockResolvedValue(undefined),
    getConversationList: jest.fn().mockReturnValue([]),
    initialize: jest.fn().mockResolvedValue(undefined),
    resumeConversation: jest.fn(),
    deleteConversation: jest.fn(),
    renameConversation: jest.fn(),
    compactConversation: jest.fn(),
  } as unknown as ConversationService;
}

// Mock ChatState
function createMockChatState(): ChatState {
  return {
    currentConversationId: null,
    setConversationId: jest.fn(),
    isStreaming: false,
    setStreaming: jest.fn(),
    resetStreamingBuffer: jest.fn(),
    markPendingSave: jest.fn(),
  } as unknown as ChatState;
}

// Mock MessageRenderer
function createMockMessageRenderer() {
  return {
    renderMessages: jest.fn(),
    renderMessage: jest.fn(),
    addAssistantMessage: jest.fn(),
    appendText: jest.fn(),
    appendThinking: jest.fn(),
    finalizeMessage: jest.fn(),
  };
}

describe('ConversationController', () => {
  let controller: ConversationController;
  let mockService: ConversationService;
  let mockState: ChatState;
  let mockRenderer: ReturnType<typeof createMockMessageRenderer>;

  beforeEach(() => {
    mockService = createMockConversationService();
    mockState = createMockChatState();
    mockRenderer = createMockMessageRenderer();
    controller = new ConversationController(mockService, mockState);
  });

  // ============================================
  // createNew — 重置到空白状态
  // ============================================

  describe('createNew', () => {
    it('should reset state to blank', () => {
      controller.createNew();
      expect(mockState.setConversationId).toHaveBeenCalledWith(null);
      expect(mockState.resetStreamingBuffer).toHaveBeenCalled();
    });

    it('should clear messages container via callback', () => {
      const onClear = jest.fn();
      controller.onClearMessages(onClear);
      controller.createNew();
      expect(onClear).toHaveBeenCalled();
    });
  });

  // ============================================
  // switchTo — 切换会话（save → reset → load → render）
  // ============================================

  describe('switchTo', () => {
    it('should save current conversation before switching', async () => {
      // 设置当前会话
      (mockState as any).currentConversationId = 'conv-old';
      mockState.isStreaming = false;

      const conv: Conversation = {
        id: 'conv-new',
        providerId: 'kilocode',
        title: 'New',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 1,
        preview: 'test',
        messages: [{ id: 'msg-1', role: 'user', content: 'hi', timestamp: Date.now() }],
      };
      (mockService.getConversation as jest.Mock).mockResolvedValue(conv);

      await controller.switchTo('conv-new');

      // 验证流程: save → reset → load → setConversationId
      expect(mockService.flush).toHaveBeenCalled();
      expect(mockState.setConversationId).toHaveBeenCalledWith('conv-new');
    });

    it('should load and render messages after switching', async () => {
      const messages: Message[] = [
        { id: 'msg-1', role: 'user', content: 'hello', timestamp: Date.now() },
        { id: 'msg-2', role: 'assistant', content: 'hi there', timestamp: Date.now() },
      ];
      const conv: Conversation = {
        id: 'conv-1',
        providerId: 'kilocode',
        title: 'Test',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 2,
        preview: 'hello',
        messages,
      };
      (mockService.getConversation as jest.Mock).mockResolvedValue(conv);

      const onRender = jest.fn();
      controller.onRenderMessages(onRender);

      await controller.switchTo('conv-1');

      expect(onRender).toHaveBeenCalledWith(messages);
    });

    it('should handle missing conversation gracefully', async () => {
      (mockService.getConversation as jest.Mock).mockResolvedValue(null);

      // 不应抛出异常
      await controller.switchTo('conv-nonexistent');
      expect(mockState.setConversationId).not.toHaveBeenCalledWith('conv-nonexistent');
    });
  });

  // ============================================
  // ensureConversation — 懒创建
  // ============================================

  describe('ensureConversation', () => {
    it('should return existing conversation id if already set', async () => {
      (mockState as any).currentConversationId = 'conv-existing';

      const result = await controller.ensureConversation();
      expect(result).toBe('conv-existing');
      expect(mockService.createConversation).not.toHaveBeenCalled();
    });

    it('should create new conversation if none exists', async () => {
      (mockState as any).currentConversationId = null;
      const newConv: Conversation = {
        id: 'conv-new',
        providerId: 'kilocode',
        title: 'New',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 0,
        preview: 'New conversation',
        messages: [],
      };
      (mockService.createConversation as jest.Mock).mockResolvedValue(newConv);

      const result = await controller.ensureConversation();

      expect(result).toBe('conv-new');
      expect(mockState.setConversationId).toHaveBeenCalledWith('conv-new');
    });
  });

  // ============================================
  // save — 懒创建 + 保存
  // ============================================

  describe('save', () => {
    it('should flush pending writes', async () => {
      await controller.save();
      expect(mockService.flush).toHaveBeenCalled();
    });
  });

  // ============================================
  // rewind — 回退到指定消息
  // ============================================

  describe('rewind', () => {
    it('should rewind and return removed messages', async () => {
      (mockState as any).currentConversationId = 'conv-1';
      const remainingMessages: Message[] = [
        { id: 'msg-1', role: 'user', content: 'hello', timestamp: Date.now() },
        { id: 'msg-2', role: 'assistant', content: 'hi', timestamp: Date.now() },
      ];
      const removed: Message[] = [
        { id: 'msg-3', role: 'assistant', content: 'removed', timestamp: Date.now() },
      ];
      (mockService.rewindToMessage as jest.Mock).mockResolvedValue(removed);
      // restoreConversation 调用 getConversation，返回 rewind 后的会话
      (mockService.getConversation as jest.Mock).mockResolvedValue({
        id: 'conv-1',
        providerId: 'kilocode',
        title: 'Test',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 2,
        preview: 'hello',
        messages: remainingMessages,
      });

      const onRender = jest.fn();
      controller.onRenderMessages(onRender);

      const result = await controller.rewind('msg-2');

      expect(result).toEqual(removed);
      expect(mockService.rewindToMessage).toHaveBeenCalledWith('conv-1', 'msg-2');
      expect(onRender).toHaveBeenCalledWith(remainingMessages);
    });

    it('should throw if no current conversation', async () => {
      (mockState as any).currentConversationId = null;
      await expect(controller.rewind('msg-1')).rejects.toThrow('No active conversation');
    });
  });

  // ============================================
  // fork — 从指定消息处创建分支
  // ============================================

  describe('fork', () => {
    it('should fork conversation and return new conversation', async () => {
      (mockState as any).currentConversationId = 'conv-1';
      const forked: Conversation = {
        id: 'conv-forked',
        providerId: 'kilocode',
        title: 'Fork: Test',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 1,
        preview: 'forked',
        messages: [],
        forkedFrom: 'conv-1',
      };
      (mockService.forkConversation as jest.Mock).mockResolvedValue(forked);

      const result = await controller.fork('msg-1');

      expect(result.id).toBe('conv-forked');
      expect(mockService.forkConversation).toHaveBeenCalledWith('conv-1', 'msg-1');
    });

    it('should throw if no current conversation', async () => {
      (mockState as any).currentConversationId = null;
      await expect(controller.fork('msg-1')).rejects.toThrow('No active conversation');
    });
  });
});
