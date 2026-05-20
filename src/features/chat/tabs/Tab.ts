export interface TabState {
  id: string;
  conversationId: string | null;
  isStreaming: boolean;
  draftMessage: string;
}

export class Tab {
  id: string;
  state: TabState;

  constructor(id: string) {
    this.id = id;
    this.state = {
      id,
      conversationId: null,
      isStreaming: false,
      draftMessage: '',
    };
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
}
