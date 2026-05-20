export interface TabState {
  id: string;
  conversationId: string | null;
  isStreaming: boolean;
  draftMessage: string;
}

export class Tab {
  readonly state: TabState;

  constructor(id: string) {
    this.state = {
      id,
      conversationId: null,
      isStreaming: false,
      draftMessage: '',
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

  /** 从持久化状态恢复内部数据 */
  restoreFromState(saved: TabState): void {
    this.state.conversationId = saved.conversationId;
    this.state.isStreaming = saved.isStreaming;
    this.state.draftMessage = saved.draftMessage;
  }
}
