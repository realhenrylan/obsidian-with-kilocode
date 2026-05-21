// src/features/chat/rendering/MessageRenderer.ts

import type { Message, ToolCallInfo } from '../../../core/types';
import { App, Component, MarkdownRenderer } from 'obsidian';
import { VirtualScroller } from '../../../shared/VirtualScroller';

/**
 * 消息渲染器
 * 支持流式增量渲染 + thinking block 折叠显示
 */
export class MessageRenderer {
  private container: HTMLElement;
  private app: App;
  private component: Component;
  private virtualScroller: VirtualScroller | null = null;
  // 流式渲染追踪
  private currentAssistantEl: HTMLElement | null = null;
  private currentTextEl: HTMLElement | null = null;
  private currentThinkingEl: HTMLElement | null = null;
  private currentTextContent: string = '';

  constructor(container: HTMLElement, app: App, component: Component) {
    this.container = container;
    this.app = app;
    this.component = component;
  }

  // ============================================
  // 流式渲染（增量）
  // ============================================

  /** 创建空的助手消息容器（流式开始时调用） */
  addAssistantMessage(): HTMLElement {
    const messageEl = this.container.createDiv({
      cls: 'kilo-message kilo-message-assistant',
      attr: { 'data-role': 'assistant' },
    });
    const contentEl = messageEl.createDiv({ cls: 'kilo-message-content' });
    this.currentAssistantEl = messageEl;
    this.currentTextEl = contentEl;
    this.currentTextContent = '';
    this.scrollToBottom();
    return messageEl;
  }

  /** 增量追加文本到当前消息（onText 回调） */
  appendText(text: string): void {
    if (!this.currentTextEl) return;
    this.currentTextContent += text;
    // 流式阶段用 textContent 直接显示，避免高频 Markdown 渲染
    let streamingSpan = this.currentTextEl.querySelector('.kilo-streaming-text') as HTMLElement | null;
    if (!streamingSpan) {
      streamingSpan = this.currentTextEl.createSpan({ cls: 'kilo-streaming-text' });
    }
    streamingSpan.textContent = this.currentTextContent;
    this.scrollToBottom();
  }

  /** 追加或创建 thinking block（onThinking 回调） */
  appendThinking(text: string): void {
    if (!this.currentTextEl) return;

    if (!this.currentThinkingEl) {
      // 创建折叠的 thinking 块
      this.currentThinkingEl = this.currentTextEl.createEl('details', {
        cls: 'kilo-thinking-block kilo-thinking-expanded',
      });
      const summary = this.currentThinkingEl.createEl('summary', {
        cls: 'kilo-thinking-summary',
      });
      summary.createSpan({ cls: 'kilo-thinking-label', text: 'Thinking...' });
      this.currentThinkingEl.createDiv({ cls: 'kilo-thinking-content' });
      // thinking 块插入到文本之前
      if (this.currentTextEl.firstChild) {
        this.currentTextEl.insertBefore(this.currentThinkingEl, this.currentTextEl.firstChild);
      }
    }

    const thinkingContent = this.currentThinkingEl.querySelector('.kilo-thinking-content');
    if (thinkingContent) {
      thinkingContent.appendText(text);
    }
    this.scrollToBottom();
  }

  /** 流完成后做最终 Markdown 渲染 */
  finalizeMessage(): void {
    if (!this.currentAssistantEl || !this.currentTextEl) return;

    // 移除临时 streaming-text span
    const streamingSpan = this.currentTextEl.querySelector('.kilo-streaming-text');
    if (streamingSpan) streamingSpan.remove();

    // 用 MarkdownRenderer 渲染最终文本内容
    if (this.currentTextContent) {
      const textEl = this.currentTextEl.createDiv({ cls: 'kilo-message-text' });
      void MarkdownRenderer.renderMarkdown(
        this.currentTextContent,
        textEl,
        '',
        this.component,
      );
    }

    // 添加操作按钮
    this.addMessageActions(this.currentAssistantEl);

    // 清空流式引用
    this.currentAssistantEl = null;
    this.currentTextEl = null;
    this.currentThinkingEl = null;
    this.currentTextContent = '';
  }

  // ============================================
  // 批量渲染（会话恢复时使用）
  // ============================================

  /** 渲染消息列表 */
  renderMessages(messages: Message[]): void {
    this.container.empty();

    if (messages.length > 50) {
      this.virtualScroller = new VirtualScroller(
        this.container,
        { itemHeight: 100, overscan: 5 },
        (message, index) => this.renderMessage(message)
      );
      this.virtualScroller.setItems(messages);
    } else {
      for (const message of messages) {
        this.renderMessage(message);
      }
      this.scrollToBottom();
    }
  }

  /** 渲染单条消息 */
  renderMessage(message: Message): HTMLElement {
    const messageEl = this.container.createDiv({
      cls: `kilo-message kilo-message-${message.role}`,
      attr: { 'data-message-id': message.id },
    });

    // 头部
    const headerEl = messageEl.createDiv({ cls: 'kilo-message-header' });
    headerEl.createSpan({
      cls: 'kilo-message-role',
      text: message.role === 'user' ? 'You' : message.role === 'system' ? 'System' : 'KiloCode',
    });
    headerEl.createSpan({
      cls: 'kilo-message-time',
      text: new Date(message.timestamp).toLocaleTimeString(),
    });

    // 内容
    const contentEl = messageEl.createDiv({ cls: 'kilo-message-content' });

    if (message.role === 'assistant') {
      // 渲染 thinking block（如有）
      if (message.thinking) {
        const thinkingEl = contentEl.createEl('details', {
          cls: 'kilo-thinking-block kilo-thinking-collapsed',
        });
        const summary = thinkingEl.createEl('summary', {
          cls: 'kilo-thinking-summary',
        });
        summary.createSpan({
          cls: 'kilo-thinking-label',
          text: `Thinking (${message.thinking.length} chars)`,
        });
        thinkingEl.createDiv({
          cls: 'kilo-thinking-content',
          text: message.thinking,
        });
      }

      // 渲染文本内容
      if (message.content) {
        const textEl = contentEl.createDiv({ cls: 'kilo-message-text' });
        void MarkdownRenderer.renderMarkdown(
          message.content,
          textEl,
          '',
          this.component,
        );
      }
    } else {
      contentEl.createSpan({ text: message.content });
    }

    // 工具调用
    if (message.toolCalls && message.toolCalls.length > 0) {
      const toolsEl = messageEl.createDiv({ cls: 'kilo-tools' });
      for (const toolCall of message.toolCalls) {
        this.renderToolCall(toolsEl, toolCall);
      }
    }

    // 操作按钮
    this.addMessageActions(messageEl);

    return messageEl;
  }

  // ============================================
  // 通用工具方法
  // ============================================

  /** 为消息添加操作按钮 */
  private addMessageActions(messageEl: HTMLElement): void {
    const messageId = messageEl.getAttribute('data-message-id');
    if (!messageId) return;

    const actionsEl = messageEl.createDiv({ cls: 'kilo-message-actions' });

    const rewindBtn = actionsEl.createEl('button', {
      cls: 'kilo-action-btn',
      text: '⏪',
      title: 'Rewind to here',
    });
    (rewindBtn as HTMLElement).dataset.action = 'rewind';
    (rewindBtn as HTMLElement).dataset.messageId = messageId;

    const forkBtn = actionsEl.createEl('button', {
      cls: 'kilo-action-btn',
      text: '🍴',
      title: 'Fork from here',
    });
    (forkBtn as HTMLElement).dataset.action = 'fork';
    (forkBtn as HTMLElement).dataset.messageId = messageId;

    const copyBtn = actionsEl.createEl('button', {
      cls: 'kilo-action-btn',
      text: '📋',
      title: 'Copy',
    });
    (copyBtn as HTMLElement).dataset.action = 'copy';
    (copyBtn as HTMLElement).dataset.messageId = messageId;
  }

  /** 渲染工具调用 */
  private renderToolCall(container: HTMLElement, toolCall: ToolCallInfo): void {
    const toolEl = container.createDiv({
      cls: `kilo-tool kilo-tool-${toolCall.status}`,
    });

    const headerEl = toolEl.createDiv({ cls: 'kilo-tool-header' });
    headerEl.createSpan({
      cls: 'kilo-tool-icon',
      text: this.getToolIcon(toolCall.name),
    });
    headerEl.createSpan({
      cls: 'kilo-tool-name',
      text: this.getToolDisplayName(toolCall.name),
    });
    headerEl.createSpan({
      cls: 'kilo-tool-status',
      text: this.getStatusText(toolCall.status),
    });

    const contentEl = toolEl.createDiv({ cls: 'kilo-tool-content' });
    if (toolCall.result) {
      const pre = contentEl.createEl('pre');
      pre.createEl('code', { text: toolCall.result });
    }

    headerEl.addEventListener('click', () => {
      contentEl.classList.toggle('kilo-tool-expanded');
    });
  }

  private getToolIcon(toolName: string): string {
    const icons: Record<string, string> = {
      read_file: '📄',
      write_file: '✏️',
      search: '🔍',
      bash: '💻',
      edit_file: '📝',
    };
    return icons[toolName] || '🔧';
  }

  private getToolDisplayName(toolName: string): string {
    const names: Record<string, string> = {
      read_file: 'Read File',
      write_file: 'Write File',
      search: 'Search',
      bash: 'Bash',
      edit_file: 'Edit File',
    };
    return names[toolName] || toolName;
  }

  private getStatusText(status: string): string {
    const texts: Record<string, string> = {
      pending: '⏳ Pending',
      running: '🔄 Running',
      completed: '✅ Done',
      error: '❌ Error',
    };
    return texts[status] || status;
  }

  scrollToBottom(): void {
    this.container.scrollTop = this.container.scrollHeight;
  }
}
