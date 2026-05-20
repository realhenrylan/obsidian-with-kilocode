// src/features/chat/rendering/MessageRenderer.ts

import type { Message, ToolCallInfo } from '../../../core/types';
import { App, Component, MarkdownRenderer } from 'obsidian';
import { VirtualScroller } from '../../../shared/VirtualScroller';

/**
 * 消息渲染器
 * 将消息渲染为 HTML
 */
export class MessageRenderer {
  private container: HTMLElement;
  private app: App;
  private virtualScroller: VirtualScroller | null = null;

  constructor(container: HTMLElement, app: App) {
    this.container = container;
    this.app = app;
  }

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

    // 操作按钮（通过 data-action 委托，由 KiloCodeView 处理事件）
    const actionsEl = messageEl.createDiv({ cls: 'kilo-message-actions' });

    const rewindBtn = actionsEl.createEl('button', {
      cls: 'kilo-action-btn',
      text: '⏪',
      title: 'Rewind to here',
    });
    (rewindBtn as HTMLElement).dataset.action = 'rewind';
    (rewindBtn as HTMLElement).dataset.messageId = message.id;

    const forkBtn = actionsEl.createEl('button', {
      cls: 'kilo-action-btn',
      text: '🍴',
      title: 'Fork from here',
    });
    (forkBtn as HTMLElement).dataset.action = 'fork';
    (forkBtn as HTMLElement).dataset.messageId = message.id;

    const copyBtn = actionsEl.createEl('button', {
      cls: 'kilo-action-btn',
      text: '📋',
      title: 'Copy',
    });
    (copyBtn as HTMLElement).dataset.action = 'copy';
    (copyBtn as HTMLElement).dataset.messageId = message.id;

    // 内容
    const contentEl = messageEl.createDiv({ cls: 'kilo-message-content' });

    if (message.role === 'assistant') {
      MarkdownRenderer.renderMarkdown(
        message.content,
        contentEl,
        '',
        // Obsidian API 期望 Component，但传 app 在运行时可正常工作
        this.app as unknown as Component
      );
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

    return messageEl;
  }

  /** 渲染工具调用 */
  private renderToolCall(container: HTMLElement, toolCall: ToolCallInfo): void {
    const toolEl = container.createDiv({
      cls: `kilo-tool kilo-tool-${toolCall.status}`,
    });

    // 工具头部
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

    // 工具内容（默认折叠）
    const contentEl = toolEl.createDiv({
      cls: 'kilo-tool-content',
    });

    if (toolCall.result) {
      const pre = contentEl.createEl('pre');
      pre.createEl('code', { text: toolCall.result });
    }

    // 点击展开/折叠
    headerEl.addEventListener('click', () => {
      contentEl.classList.toggle('kilo-tool-expanded');
    });
  }

  /** 获取工具图标 */
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

  /** 获取工具显示名称 */
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

  /** 获取状态文本 */
  private getStatusText(status: string): string {
    const texts: Record<string, string> = {
      pending: '⏳ Pending',
      running: '🔄 Running',
      completed: '✅ Done',
      error: '❌ Error',
    };
    return texts[status] || status;
  }

  /** 滚动到底部 */
  scrollToBottom(): void {
    this.container.scrollTop = this.container.scrollHeight;
  }

  /** 追加文本到当前消息 */
  appendText(text: string): void {
    const lastMessage = this.container.lastElementChild;
    if (lastMessage) {
      const contentEl = lastMessage.querySelector('.kilo-message-content');
      if (contentEl) {
        contentEl.createSpan({ text });
        this.scrollToBottom();
      }
    }
  }
}
