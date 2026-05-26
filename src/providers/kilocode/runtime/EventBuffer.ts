import type { StreamChunk } from '../../../core/providers/types';

export interface StoredChunk {
  seq: number;
  chunk: StreamChunk;
}

export class EventBuffer {
  private events: StoredChunk[] = [];
  private _nextSeq = 0;
  private startIndex = 0;

  static readonly MAX_EVENTS = 500;

  append(chunk: StreamChunk): number {
    const seq = this._nextSeq++;
    this.events.push({ seq, chunk });

    if (this.events.length - this.startIndex > EventBuffer.MAX_EVENTS) {
      this.startIndex++;
    }

    if (this.startIndex >= EventBuffer.MAX_EVENTS) {
      this.events = this.events.slice(this.startIndex);
      this.startIndex = 0;
    }

    return seq;
  }

  getSince(seq: number): StoredChunk[] {
    if (this.length === 0) return [];

    const slice = this.events.slice(this.startIndex);
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

  replay(seq: number): StreamChunk[] {
    const actualSeq = seq < 0 ? -1 : seq;
    return this.getSince(actualSeq).map((s) => s.chunk);
  }

  clear(): void {
    this.events = [];
    this.startIndex = 0;
    this._nextSeq = 0;
  }

  get length(): number {
    return this.events.length - this.startIndex;
  }

  get nextSeq(): number {
    return this._nextSeq;
  }

  get lastSeq(): number {
    if (this.length === 0) return -1;
    return this.events[this.events.length - 1].seq;
  }
}
