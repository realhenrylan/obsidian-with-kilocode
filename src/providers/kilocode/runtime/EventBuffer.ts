// src/providers/kilocode/runtime/EventBuffer.ts
//
// 事件缓冲器：在 sendMessage() 流式消费过程中逐块记录每个 StreamChunk，
// 支持标签切换后从指定序号恢复渲染。500 事件滚动窗口，旧事件自动丢弃。
//
// 为什么需要 EventBuffer 而不是只用 View 层的 TabStreamingState：
// - View 层的 TabStreamingState 只在 KiloCodeView 中维护，切换标签后如果
//   对应标签的 streaming state 已被清理（流完成），无法恢复
// - EventBuffer 在 Runtime 层，跨标签共享，流完成后数据仍保留直到 stop()
// - 与 TabStreamingState 互补：TabStreamingState 用于"流进行中切换"的即时恢复，
//   EventBuffer 用于"流完成后回到该标签"的事件回溯

import type { StreamChunk } from '../../../core/providers/types';

/** 带序号的事件条目 */
export interface StoredChunk {
  seq: number;
  chunk: StreamChunk;
}

/**
 * 事件缓冲器 — 滚动窗口环形缓冲。
 *
 * 设计原则：
 * - seq（序号）单调递增，不会因窗口滚动而重置
 * - 使用 startIndex 避免频繁 shift() 导致 O(n²) 性能退化
 * - 二分查找 getSince，适合高频查询场景
 */
export class EventBuffer {
  /** 内部存储，始终按 seq 升序排列 */
  private events: StoredChunk[] = [];
  /** 下一个单调递增序号 */
  private _nextSeq = 0;
  /** 有效数据的起始索引（滚动窗口丢弃旧数据时增长） */
  private startIndex = 0;

  /** 滚动窗口上限。为什么 500：一条典型回复产生 50-200 个 SSE chunk，500 ≈ 2-10 条回复 */
  static readonly MAX_EVENTS = 500;

  /**
   * 追加一个流式块到缓冲区。
   * @returns 分配的序号，可用于后续 getSince/replay
   */
  append(chunk: StreamChunk): number {
    const seq = this._nextSeq++;
    this.events.push({ seq, chunk });

    // 滚动窗口：超出上限时丢弃最旧的事件
    // 惰性清理：只在超过上限时丢弃一个，避免每次 append 都 shift
    if (this.events.length - this.startIndex > EventBuffer.MAX_EVENTS) {
      this.startIndex++;
    }

    // 定期回收：当 startIndex 增长较大时裁剪数组，避免内存泄漏
    if (this.startIndex >= EventBuffer.MAX_EVENTS) {
      this.events = this.events.slice(this.startIndex);
      this.startIndex = 0;
    }

    return seq;
  }

  /**
   * 返回给定序号之后的所有事件（包含该序号本身之后）。
   * 使用二分查找定位起始位置。
   */
  getSince(seq: number): StoredChunk[] {
    if (this.length === 0) return [];

    const slice = this.events.slice(this.startIndex);
    // 二分查找：找到第一个 seq > 给定值的索引
    let lo = 0;
    let hi = slice.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (slice[mid].seq <= seq) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return slice.slice(lo);
  }

  /**
   * 返回给定序号之后的 StreamChunk 数组（不含序号）。
   * 与 getSince 等价，但返回纯 chunk 数组，便于 View 层直接渲染。
   *
   * @param seq 起始序号（不包含此序号本身）
   * @param seq 传入 -1 返回全部事件（因为最小 seq 为 0）
   */
  replay(seq: number): StreamChunk[] {
    // 传入负数时从开头播放
    const actualSeq = seq < 0 ? -1 : seq;
    return this.getSince(actualSeq).map((s) => s.chunk);
  }

  /** 清空所有事件 */
  clear(): void {
    this.events = [];
    this.startIndex = 0;
    this._nextSeq = 0;
  }

  /** 当前有效事件数 */
  get length(): number {
    return this.events.length - this.startIndex;
  }

  /** 下一个待分配的序号（调试/测试用） */
  get nextSeq(): number {
    return this._nextSeq;
  }

  /** 最后一个事件的序号，无事件时返回 -1 */
  get lastSeq(): number {
    if (this.length === 0) return -1;
    return this.events[this.events.length - 1].seq;
  }
}
