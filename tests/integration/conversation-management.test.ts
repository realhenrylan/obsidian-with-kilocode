// tests/integration/conversation-management.test.ts

import { ConversationService } from '../../src/features/chat/services/ConversationService';
import type { Message } from '../../src/core/types';

// 使用 mock App（与现有测试一致）
const mockApp = {
  vault: {
    adapter: {
      exists: jest.fn().mockResolvedValue(false),
      mkdir: jest.fn().mockResolvedValue(undefined),
      read: jest.fn().mockResolvedValue('[]'),
      write: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue({ files: [] }),
    },
    getRoot: () => ({ path: '/vault' }),
  },
} as any;

describe('Conversation Management Integration', () => {
  let service: ConversationService;

  beforeEach(async () => {
    jest.clearAllMocks();
    service = new ConversationService(mockApp, '/vault');
    await service.initialize();
  });

  test('完整流程：创建 → 对话 → fork → 对话 → rewind', async () => {
    // 1. 创建会话
    const conv = await service.createConversation();

    // 2. 添加消息
    await service.addMessage(conv.id, { id: 'msg-1', role: 'user', content: 'Help me', timestamp: 1000 });
    await service.addMessage(conv.id, { id: 'msg-2', role: 'assistant', content: 'Sure', timestamp: 2000 });
    await service.addMessage(conv.id, { id: 'msg-3', role: 'user', content: 'Refactor X', timestamp: 3000 });
    await service.addMessage(conv.id, { id: 'msg-4', role: 'assistant', content: 'Done', timestamp: 4000 });

    // 3. Fork 从 msg-2
    const forked = await service.forkConversation(conv.id, 'msg-2');
    expect(forked.messages).toHaveLength(2);
    expect(forked.forkedFrom).toBe(conv.id);

    // 4. 在 fork 中继续对话
    await service.addMessage(forked.id, { id: 'msg-5', role: 'user', content: 'Try Y', timestamp: 5000 });
    await service.addMessage(forked.id, { id: 'msg-6', role: 'assistant', content: 'OK', timestamp: 6000 });

    const updatedFork = await service.getConversation(forked.id);
    expect(updatedFork!.messages).toHaveLength(4);

    // 5. Rewind fork 到第一条消息（msg-5 的新 ID）
    // fork 的消息有新 ID，需要找到它
    const forkMsg5 = updatedFork!.messages.find(m => m.content === 'Try Y');
    expect(forkMsg5).toBeDefined();

    const removed = await service.rewindToMessage(forked.id, forkMsg5!.id);
    expect(removed).toHaveLength(1);
    expect(removed[0].content).toBe('OK');

    // 6. 验证源会话不受影响
    const sourceConv = await service.getConversation(conv.id);
    expect(sourceConv!.messages).toHaveLength(4);
  });

  test('完整流程：创建 → 对话 → compact → 继续对话', async () => {
    const conv = await service.createConversation();

    // 添加 8 条消息
    for (let i = 1; i <= 8; i++) {
      await service.addMessage(conv.id, {
        id: `msg-${i}`,
        role: i % 2 === 1 ? 'user' : 'assistant',
        content: `Message ${i}`,
        timestamp: i * 1000,
      });
    }

    // compact，保留最近 3 条
    await service.compactConversation(conv.id, 'Summary of conversation', 3);

    const compacted = await service.getConversation(conv.id);
    expect(compacted!.isCompacted).toBe(true);
    expect(compacted!.messages).toHaveLength(4); // 1 compacted + 3 recent
    expect(compacted!.messages[0].role).toBe('system');

    // 继续对话
    await service.addMessage(compacted!.id, {
      id: 'msg-9', role: 'user', content: 'Continue', timestamp: 9000,
    });

    const final = await service.getConversation(compacted!.id);
    expect(final!.messages).toHaveLength(5);
  });

  test('完整流程：创建 → 对话 → resume（模拟重新加载）', async () => {
    const conv = await service.createConversation();
    await service.addMessage(conv.id, { id: 'msg-1', role: 'user', content: 'Hello', timestamp: 1000 });
    await service.addMessage(conv.id, { id: 'msg-2', role: 'assistant', content: 'Hi', timestamp: 2000 });

    // resumeConversation 应该能加载已有的消息
    const resumed = await service.resumeConversation(conv.id);
    expect(resumed.messages).toHaveLength(2);
    expect(resumed.messages[0].content).toBe('Hello');
    expect(resumed.messages[1].content).toBe('Hi');
  });

  test('fork 后源会话 compact 不影响 fork 会话', async () => {
    const conv = await service.createConversation();
    for (let i = 1; i <= 6; i++) {
      await service.addMessage(conv.id, {
        id: `msg-${i}`,
        role: i % 2 === 1 ? 'user' : 'assistant',
        content: `Message ${i}`,
        timestamp: i * 1000,
      });
    }

    // Fork 从 msg-2
    const forked = await service.forkConversation(conv.id, 'msg-2');
    expect(forked.messages).toHaveLength(2);

    // 压缩源会话
    await service.compactConversation(conv.id, 'Summary', 3);

    const compactedSource = await service.getConversation(conv.id);
    expect(compactedSource!.isCompacted).toBe(true);
    expect(compactedSource!.messages).toHaveLength(4); // 1 compacted + 3 recent

    // Fork 会话不受影响
    const forkCheck = await service.getConversation(forked.id);
    expect(forkCheck!.isCompacted).toBeUndefined();
    expect(forkCheck!.messages).toHaveLength(2);
  });
});
