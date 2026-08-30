// tests/features/chat/services/conversation-retry.test.ts
// Phase 4 §6.2 数据可靠性契约：schema 版本化 / v1 兼容 / 损坏降级 / 失败重试 / 懒加载标记
import { ConversationService } from '../../../../src/features/chat/services/ConversationService';
import type { Message } from '../../../../src/core/types';

function makeMsg(id: string, role: Message['role'], content = 'hi'): Message {
  return { id, role, content, timestamp: Date.now() };
}

function makeAdapter(existing: Record<string, string> = {}, failWrites: string[] = []) {
  const files: Record<string, string> = { ...existing };
  return {
    // 目录存在判定：任一文件位于该目录下即视为目录存在
    exists: jest.fn(async (p: string) => p in files || Object.keys(files).some(f => f.startsWith(p + '/'))),
    read: jest.fn(async (p: string) => files[p]),
    write: jest.fn(async (p: string, data: string) => {
      if (failWrites.some(f => p.includes(f))) throw new Error('disk full');
      files[p] = data;
    }),
    remove: jest.fn(async (p: string) => { delete files[p]; }),
    mkdir: jest.fn(async () => {}),
    list: jest.fn(async () => ({ files: Object.keys(files) })),
    __files: files,
  };
}

function makeService(adapter: ReturnType<typeof makeAdapter>) {
  const app = { vault: { adapter } } as unknown as import('obsidian').App;
  return new ConversationService(app, '/vault');
}

describe('ConversationService 数据可靠性（Phase 4 §6.2）', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('saveMessages 写入 v2 包裹结构（携带 schemaVersion）', async () => {
    const adapter = makeAdapter();
    const service = makeService(adapter);
    const conv = await service.createConversation();
    await service.addMessage(conv.id, makeMsg('m1', 'user'));

    await service.flush();

    const raw = adapter.__files['/vault/.kilocode/sessions/' + conv.id + '.messages.json'];
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw);
    expect(parsed.schemaVersion).toBe(2);
    expect(Array.isArray(parsed.messages)).toBe(true);
    expect(parsed.messages).toHaveLength(1);
  });

  test('loadMessages 兼容 v1 裸数组格式', async () => {
    const convId = 'conv-1700000000000-abc1234';
    const adapter = makeAdapter({
      ['/vault/.kilocode/sessions/' + convId + '.json']: JSON.stringify({
        id: convId, providerId: 'kilocode', title: 'legacy', createdAt: 1, updatedAt: 1,
        messageCount: 1, preview: 'p',
      }),
      ['/vault/.kilocode/sessions/' + convId + '.messages.json']: JSON.stringify([
        makeMsg('m1', 'user', 'legacy message'),
      ]),
    });
    const service = makeService(adapter);
    await service.initialize();

    const conv = await service.getConversation(convId);
    expect(conv!.messages).toHaveLength(1);
    expect(conv!.messages[0].content).toBe('legacy message');
  });

  test('结构损坏的消息文件降级为空数组且保留原文件', async () => {
    const convId = 'conv-1700000000000-xyz5678';
    const msgPath = '/vault/.kilocode/sessions/' + convId + '.messages.json';
    const broken = JSON.stringify([{ nope: true }]);
    const adapter = makeAdapter({
      ['/vault/.kilocode/sessions/' + convId + '.json']: JSON.stringify({
        id: convId, providerId: 'kilocode', title: 'corrupt', createdAt: 1, updatedAt: 1,
        messageCount: 1, preview: 'p',
      }),
      [msgPath]: broken,
    });
    const service = makeService(adapter);
    await service.initialize();

    const conv = await service.getConversation(convId);
    expect(conv!.messages).toHaveLength(0);
    // 原文件保留，不因读取失败被破坏
    expect(adapter.__files[msgPath]).toBe(broken);
  });

  test('写入失败后 5s 自动重试，成功后恢复', async () => {
    const adapter = makeAdapter({}, ['.messages.json']);
    const service = makeService(adapter);
    const conv = await service.createConversation();
    await service.addMessage(conv.id, makeMsg('m1', 'user'));

    await service.flush();
    // 首次写失败，文件不存在
    expect(adapter.__files['/vault/.kilocode/sessions/' + conv.id + '.messages.json']).toBeUndefined();

    // 解除故障并快进 5s 触发重试
    adapter.write.mockImplementation(async (p: string, data: string) => { adapter.__files[p] = data; });
    await jest.advanceTimersByTimeAsync(5000);

    expect(adapter.__files['/vault/.kilocode/sessions/' + conv.id + '.messages.json']).toBeDefined();
  });

  test('空会话重复 getConversation 不再触发空 IO', async () => {
    const adapter = makeAdapter();
    const service = makeService(adapter);
    const conv = await service.createConversation();

    const readBefore = adapter.read.mock.calls.length;
    await service.getConversation(conv.id);
    await service.getConversation(conv.id);
    await service.getConversation(conv.id);

    expect(adapter.read.mock.calls.length).toBe(readBefore);
  });
});
