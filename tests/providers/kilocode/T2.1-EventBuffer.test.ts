// T2.1 EventBuffer 单元测试
//
// 覆盖范围：
// - EventBuffer 核心操作（append/getSince/replay/clear）
// - 滚动窗口 (MAX_EVENTS = 500)
// - 性能基准（1000 次 append < 50ms）
// - Runtime 集成（sendMessage 中 append、getEventBuffer 引用、stop clear）
// - KiloCodeView 集成（标签切换 replay）

import { EventBuffer } from '../../../src/providers/kilocode/runtime/EventBuffer';
import type { StreamChunk } from '../../../src/core/providers/types';

// ================================================================
// 工厂函数：创建测试用的 StreamChunk
// ================================================================

function textChunk(content: string): StreamChunk {
  return { type: 'text', content };
}

function thinkingChunk(content: string): StreamChunk {
  return { type: 'thinking', content };
}

function doneChunk(): StreamChunk {
  return { type: 'done' };
}

// ================================================================
// 单元测试：EventBuffer 核心操作
// ================================================================

describe('T2.1 EventBuffer', () => {
  describe('core operations', () => {
    let buffer: EventBuffer;

    beforeEach(() => {
      buffer = new EventBuffer();
    });

    test('append and getSince return correct events after a seq threshold', () => {
      buffer.append(textChunk('hello'));
      buffer.append(thinkingChunk('thinking...'));
      buffer.append(textChunk('world'));

      // getSince(0): seq > 0 → events 1 and 2
      const since0 = buffer.getSince(0);
      expect(since0).toHaveLength(2);
      expect(since0[0].seq).toBe(1);
      expect(since0[0].chunk).toEqual(thinkingChunk('thinking...'));
      expect(since0[1].seq).toBe(2);
      expect(since0[1].chunk).toEqual(textChunk('world'));

      // getSince(1): seq > 1 → event 2 only
      const since1 = buffer.getSince(1);
      expect(since1).toHaveLength(1);
      expect(since1[0].seq).toBe(2);

      // getSince(2): seq > 2 → no events
      const since2 = buffer.getSince(2);
      expect(since2).toHaveLength(0);
    });

    test('getSince with seq beyond last returns empty array', () => {
      buffer.append(textChunk('only'));
      // seq=0 is the only event, so getSince(0) returns nothing (seq > 0)
      expect(buffer.getSince(0)).toHaveLength(0);
      // getSince(999) also returns nothing
      expect(buffer.getSince(999)).toHaveLength(0);
    });

    test('replay returns correct StreamChunk array with preserved type/content', () => {
      buffer.append(textChunk('hello'));
      buffer.append(thinkingChunk('thinking...'));
      buffer.append(textChunk('world'));
      buffer.append(doneChunk());

      // replay from seq=-1 (beginning) returns all chunks
      const all = buffer.replay(-1);
      expect(all).toHaveLength(4);
      expect(all[0]).toEqual(textChunk('hello'));
      expect(all[1]).toEqual(thinkingChunk('thinking...'));
      expect(all[2]).toEqual(textChunk('world'));
      expect(all[3]).toEqual(doneChunk());

      // replay from seq=1 returns chunks from seq 2 onward
      const after1 = buffer.replay(1);
      expect(after1).toHaveLength(2);
      expect(after1[0]).toEqual(textChunk('world'));
      expect(after1[1]).toEqual(doneChunk());
    });

    test('clear empties all events', () => {
      buffer.append(textChunk('hello'));
      buffer.append(textChunk('world'));
      expect(buffer.length).toBe(2);

      buffer.clear();

      expect(buffer.length).toBe(0);
      expect(buffer.replay(-1)).toHaveLength(0);
      expect(buffer.getSince(0)).toHaveLength(0);
      expect(buffer.nextSeq).toBe(0);
    });

    test('empty buffer returns empty arrays for all read methods', () => {
      expect(buffer.length).toBe(0);
      expect(buffer.replay(-1)).toHaveLength(0);
      expect(buffer.replay(0)).toHaveLength(0);
      expect(buffer.getSince(0)).toHaveLength(0);
      expect(buffer.lastSeq).toBe(-1);
    });
  });

  // ================================================================
  // 滚动窗口 (MAX_EVENTS = 500)
  // ================================================================

  describe('rolling window (500 limit)', () => {
    test('does not drop at exactly 500', () => {
      const buffer = new EventBuffer();
      for (let i = 0; i < 500; i++) {
        buffer.append(textChunk(`chunk-${i}`));
      }
      expect(buffer.length).toBe(500);

      // 验证序号 0-499 都在
      const all = buffer.replay(-1);
      expect(all).toHaveLength(500);
      expect(all[0]).toEqual(textChunk('chunk-0'));
      expect(all[499]).toEqual(textChunk('chunk-499'));
    });

    test('drops oldest events when exceeding 500', () => {
      const buffer = new EventBuffer();

      // 追加 501 个事件
      for (let i = 0; i < 501; i++) {
        buffer.append(textChunk(`chunk-${i}`));
      }

      // length 应该为 500
      expect(buffer.length).toBe(500);

      // seq(0) 的事件应该被丢弃
      // replay(-1) 应该从 seq=1 开始
      const all = buffer.replay(-1);
      expect(all).toHaveLength(500);
      expect(all[0]).toEqual(textChunk('chunk-1')); // seq=1
      expect(all[499]).toEqual(textChunk('chunk-500')); // seq=500 (0-based 所以是 501st)
    });

    test('maintains correct seq after periodic trimming', () => {
      const buffer = new EventBuffer();

      // 追加 2000 个事件，触发多次裁剪（每 500 个裁剪一次）
      for (let i = 0; i < 2000; i++) {
        buffer.append(textChunk(`chunk-${i}`));
      }

      // 应该始终保留 500 个
      expect(buffer.length).toBe(500);

      // 最旧的应该是 seq=1500（因为 2000 - 500 = 1500）
      const all = buffer.replay(-1);
      expect(all[0]).toEqual(textChunk('chunk-1500'));

      // getSince 应该也能正确工作
      const since1800 = buffer.replay(1800);
      // seq > 1800: 1801..1999 = 199 events
      expect(since1800).toHaveLength(199);
      expect(since1800[0]).toEqual(textChunk('chunk-1801'));
    });
  });

  // ================================================================
  // 性能基准
  // ================================================================

  describe('performance', () => {
    test('1000 sequential appends completes in under 50ms', () => {
      const buffer = new EventBuffer();
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        buffer.append(textChunk(`chunk-${i}`));
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(50);
    });
  });

  // ================================================================
  // Runtime 集成测试
  // ================================================================

  describe('Runtime integration', () => {
    test('sendMessage() appends each chunk to eventBuffer', async () => {
      // 模拟 sendMessage 会逐个 yield chunk
      const buffer = new EventBuffer();
      const spy = jest.spyOn(buffer, 'append');

      const chunks = [
        textChunk('hello'),
        thinkingChunk('thinking...'),
        textChunk('world'),
        doneChunk(),
      ];

      // 模拟 for-await 循环中的 append 行为
      for (const chunk of chunks) {
        buffer.append(chunk);
      }

      expect(spy).toHaveBeenCalledTimes(4);
      expect(spy).toHaveBeenNthCalledWith(1, chunks[0]);
      expect(spy).toHaveBeenNthCalledWith(2, chunks[1]);
      expect(spy).toHaveBeenNthCalledWith(3, chunks[2]);
      expect(spy).toHaveBeenNthCalledWith(4, chunks[3]);

      spy.mockRestore();
    });

    test('getEventBuffer() returns reference to internal buffer', () => {
      const buffer = new EventBuffer();

      // 模拟 Runtime 暴露 getEventBuffer
      const getEventBuffer = () => buffer;

      const ref = getEventBuffer();
      expect(ref).toBe(buffer);

      // 通过引用追加应该影响原 buffer
      ref.append(textChunk('via-ref'));
      expect(buffer.length).toBe(1);
    });

    test('stop() clears the buffer', () => {
      const buffer = new EventBuffer();

      buffer.append(textChunk('hello'));
      buffer.append(textChunk('world'));
      expect(buffer.length).toBe(2);

      // 模拟 stop() 中的清理行为
      buffer.clear();

      expect(buffer.length).toBe(0);
      expect(buffer.replay(-1)).toHaveLength(0);
    });
  });

  // ================================================================
  // KiloCodeView 集成测试
  // ================================================================

  describe('KiloCodeView integration (tab switch)', () => {
    test('on tab switch, calls runtime.getEventBuffer().replay()', () => {
      const buffer = new EventBuffer();
      const replaySpy = jest.spyOn(buffer, 'replay');

      buffer.append(textChunk('hello'));
      buffer.append(thinkingChunk('thinking...'));

      // 模拟标签切换时调用 replay
      const tabId = 'tab-1';
      const lastKnownSeq = -1; // 从头开始播放
      const chunkForTabSwitch = {
        tabId,
        replayedChunks: buffer.replay(lastKnownSeq),
      };

      expect(replaySpy).toHaveBeenCalledWith(-1);
      expect(chunkForTabSwitch.replayedChunks).toHaveLength(2);
      expect(chunkForTabSwitch.replayedChunks[0]).toEqual(textChunk('hello'));

      replaySpy.mockRestore();
    });

    test('replayed chunks are rendered through onText/onThinking/onToolCall', () => {
      const buffer = new EventBuffer();
      buffer.append(textChunk('hello '));
      buffer.append(textChunk('world'));
      buffer.append(thinkingChunk('thinking...'));
      buffer.append(textChunk('!'));
      buffer.append(doneChunk());

      // 模拟渲染回调
      const onText = jest.fn();
      const onThinking = jest.fn();

      // replay from beginning
      const chunks = buffer.replay(-1);

      // 模拟渲染循环
      for (const chunk of chunks) {
        switch (chunk.type) {
          case 'text':
            onText(chunk.content);
            break;
          case 'thinking':
            onThinking(chunk.content);
            break;
          case 'done':
            // done signal — 不需要渲染
            break;
        }
      }

      // onText 应该被调用 3 次（hello , world, !）
      expect(onText).toHaveBeenCalledTimes(3);
      expect(onText).toHaveBeenNthCalledWith(1, 'hello ');
      expect(onText).toHaveBeenNthCalledWith(2, 'world');
      expect(onText).toHaveBeenNthCalledWith(3, '!');

      // onThinking 应该被调用 1 次
      expect(onThinking).toHaveBeenCalledTimes(1);
      expect(onThinking).toHaveBeenCalledWith('thinking...');
    });
  });
});
