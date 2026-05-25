// src/features/chat/tabs/Tab.ts
import type { ChatRuntime } from '../../../core/providers/types';

export interface TabState {
  id: string;
  conversationId: string | null;
  isStreaming: boolean;
  draftMessage: string;
  isForked?: boolean;
  forkSourceId?: string;
  scrollPosition?: number;
  streamGeneration: number;
}

export class Tab {
  readonly state: TabState;
  runtime: ChatRuntime | null = null;

  constructor(id: string) {
    this.state = {
      id,
      conversationId: null,
      isStreaming: false,
      draftMessage: '',
      streamGeneration: 0,
    };
  }

  get id(): string {
    return this.state.id;
  }

  setConversation(conversationId: string): void {
    this.state.conversationId = conversationId;
  }

  setStreaming(streaming: boolean): void {
    this.state.isStreaming = streaming;
  }

  setDraftMessage(message: string): void {
    this.state.draftMessage = message;
  }

  /** 递增流式代数，返回递增后的值 */
  bumpStreamGeneration(): number {
    this.state.streamGeneration += 1;
    return this.state.streamGeneration;
  }

  /** 从持久化状态恢复内部数据 */
  restoreFromState(saved: TabState): void {
    this.state.conversationId = saved.conversationId;
    this.state.isStreaming = saved.isStreaming;
    this.state.draftMessage = saved.draftMessage;
    this.state.streamGeneration = saved.streamGeneration ?? 0;
  }

  /** 清理标签 runtime */
  async disposeRuntime(): Promise<void> {
    if (this.runtime) {
      try {
        await this.runtime.stop();
      } catch {
        // 静默处理
      }
      this.runtime = null;
    }
  }
}
