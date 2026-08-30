// src/features/chat/rendering/MessageRenderer.ts

import type { Message, ToolCallInfo } from '../../../core/types';
import { App, Component, MarkdownRenderer } from 'obsidian';
import { t } from '../../../i18n';
import { VirtualScroller } from '../../../shared/VirtualScroller';

/**
 * 消息渲染器
 * 支持流式增量渲染 + thinking block 折叠显示
 */
export class MessageRenderer {
  private container: HTMLElement;
  private app: App;
  private component: Component;
  // 流式渲染追踪
  private currentAssistantEl: HTMLElement | null = null;
  private currentTextEl: HTMLElement | null = null;
  private currentThinkingEl: HTMLElement | null = null;
  private currentTextContent: string = '';
  // scrollToBottom 节流：使用 requestAnimationFrame 避免高频 DOM 回流
  private scrollRafId: number | null = null;

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
    let streamingSpan: HTMLElement | null = this.currentTextEl.querySelector('.kilo-streaming-text');
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
      summary.createSpan({ cls: 'kilo-thinking-label', text: t('chat.thinking') });
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

  /**
   * 流完成后做最终 Markdown 渲染。
   * 使用 requestAnimationFrame 延迟渲染，避免阻塞 UI 线程。
   */
  finalizeMessage(): void {
    if (!this.currentAssistantEl || !this.currentTextEl) return;

    // 捕获引用（defer 回调需要）
    const assistantEl = this.currentAssistantEl;
    const textEl = this.currentTextEl;
    const textContent = this.currentTextContent;

    // 移除临时 streaming-text span
    const streamingSpan = textEl.querySelector('.kilo-streaming-text');
    if (streamingSpan) streamingSpan.remove();

    // 清空流式引用（释放内存，defer 回调使用捕获的局部变量）
    this.currentAssistantEl = null;
    this.currentTextEl = null;
    this.currentThinkingEl = null;
    this.currentTextContent = '';

    // 延迟到下一帧渲染 Markdown，让 UI 先更新流式完成状态
    window.requestAnimationFrame(() => {
      if (textContent) {
        const markdownEl = textEl.createDiv({ cls: 'kilo-message-text' });
        void MarkdownRenderer.render(
          this.app,
          textContent,
          markdownEl,
          '',
          this.component,
        );
        // 代码块后处理：语言标签 + 复制按钮
        this.enhanceCodeBlocks(markdownEl);
      }

      // 添加操作按钮
      this.addMessageActions(assistantEl);
    });
  }

  // ============================================
  // 批量渲染（会话恢复时使用）
  // ============================================

  /** 渲染消息列表 */
  renderMessages(messages: Message[]): void {
    this.container.empty();

    if (messages.length > 50) {
      const scroller = new VirtualScroller<Message>(
        this.container,
        { itemHeight: 100, overscan: 5 },
        (message: Message) => this.renderMessage(message)
      );
      scroller.setItems(messages);
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
      text: message.role === 'user' ? t('chat.roleYou') : message.role === 'system' ? t('chat.roleSystem') : t('chat.roleKiloCode'),
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
          text: t('chat.thinkingChars', { count: String(message.thinking.length) }),
        });
        thinkingEl.createDiv({
          cls: 'kilo-thinking-content',
          text: message.thinking,
        });
      }

      // 渲染文本内容
      if (message.content) {
        const textEl = contentEl.createDiv({ cls: 'kilo-message-text' });
        void MarkdownRenderer.render(
          this.app,
          message.content,
          textEl,
          '',
          this.component,
        );
        // 代码块后处理：语言标签 + 复制按钮
        this.enhanceCodeBlocks(textEl);
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

  /**
   * 代码块后处理：为 <pre> 元素添加语言标签和复制按钮
   * Obsidian MarkdownRenderer 生成的代码块结构：`<pre><code class="language-xxx">...</code></pre>`
   */
  private enhanceCodeBlocks(container: HTMLElement): void {
    const pres = container.querySelectorAll('pre');
    for (const pre of pres) {
      // 跳过已处理的代码块
      if (pre.parentElement?.classList.contains('kilo-code-wrapper')) continue;

      const codeEl = pre.querySelector('code');
      // 提取语言标识（从 class="language-xxx" 中解析）
      const langClass = codeEl?.className.match(/language-(\w+)/)?.[1] ?? '';
      const codeText = codeEl?.textContent ?? '';

      // 包裹到 .kilo-code-wrapper
      const wrapper = activeDocument.createElement('div');
      wrapper.className = 'kilo-code-wrapper';
      pre.parentNode?.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);

      // 头部栏：语言标签 + 复制按钮
      const header = activeDocument.createElement('div');
      header.className = 'kilo-code-header';

      const langLabel = activeDocument.createElement('span');
      langLabel.className = 'kilo-code-lang';
      langLabel.textContent = langClass || 'code';
      header.appendChild(langLabel);

      const copyBtn = activeDocument.createElement('button');
      copyBtn.className = 'kilo-code-copy';
      copyBtn.textContent = t('common.copy');
      copyBtn.addEventListener('click', () => {
        void navigator.clipboard.writeText(codeText).then(() => {
          copyBtn.textContent = t('chat.copied');
          setTimeout(() => { copyBtn.textContent = t('common.copy'); }, 2000);
        });
      });
      header.appendChild(copyBtn);

      wrapper.insertBefore(header, pre);
    }
  }

  /** 为消息添加操作按钮 */
  private addMessageActions(messageEl: HTMLElement): void {
    const messageId = messageEl.getAttribute('data-message-id');
    if (!messageId) return;

    const actionsEl = messageEl.createDiv({ cls: 'kilo-message-actions' });

    const rewindBtn = actionsEl.createEl('button', {
      cls: 'kilo-action-btn',
      text: '⏪',
      title: t('chat.actionRewind'),
    });
    (rewindBtn as HTMLElement).dataset.action = 'rewind';
    (rewindBtn as HTMLElement).dataset.messageId = messageId;

    const forkBtn = actionsEl.createEl('button', {
      cls: 'kilo-action-btn',
      text: '🍴',
      title: t('chat.actionFork'),
    });
    (forkBtn as HTMLElement).dataset.action = 'fork';
    (forkBtn as HTMLElement).dataset.messageId = messageId;

    const copyBtn = actionsEl.createEl('button', {
      cls: 'kilo-action-btn',
      text: '📋',
      title: t('chat.actionCopy'),
    });
    (copyBtn as HTMLElement).dataset.action = 'copy';
    (copyBtn as HTMLElement).dataset.messageId = messageId;
  }

  /** 渲染工具调用 */
  private renderToolCall(container: HTMLElement, toolCall: ToolCallInfo): void {
    const toolEl = container.createDiv({
      cls: `kilo-tool kilo-tool-${toolCall.status}`,
    });
    // 供 appendToolResult 定位更新
    toolEl.setAttribute('data-tool-id', toolCall.id);

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
      read_file: t('tools.readFile'),
      write_file: t('tools.writeFile'),
      search: t('tools.search'),
      bash: t('tools.bash'),
      edit_file: t('tools.editFile'),
    };
    return names[toolName] || toolName;
  }

  private getStatusText(status: string): string {
    const texts: Record<string, string> = {
      pending: t('tools.pending'),
      running: t('tools.running'),
      completed: t('tools.completed'),
      error: t('tools.error'),
    };
    return texts[status] || status;
  }

  // ============================================
  // 统一渲染入口（用户消息 / 工具调用）
  // ============================================

  /** 渲染用户消息（header + Markdown，与助手一致；无操作按钮） */
  appendUserMessage(content: string): HTMLElement {
    const messageEl = this.container.createDiv({
      cls: 'kilo-message kilo-message-user',
      attr: { 'data-role': 'user' },
    });
    const headerEl = messageEl.createDiv({ cls: 'kilo-message-header' });
    headerEl.createSpan({ cls: 'kilo-message-role', text: 'You' });
    headerEl.createSpan({
      cls: 'kilo-message-time',
      text: new Date().toLocaleTimeString(),
    });
    const contentEl = messageEl.createDiv({ cls: 'kilo-message-content' });
    if (content) {
      const textEl = contentEl.createDiv({ cls: 'kilo-message-text' });
      void MarkdownRenderer.render(this.app, content, textEl, '', this.component);
      this.enhanceCodeBlocks(textEl);
    }
    this.scrollToBottom();
    return messageEl;
  }

  /** 渲染工具调用卡片（流式阶段，追加到最后一条消息容器） */
  renderToolCallStreaming(toolCall: ToolCallInfo): void {
    let lastMessage = this.container.querySelector('.kilo-message:last-child') as HTMLElement | null;
    if (!lastMessage) {
      // 没有消息元素时创建助手消息容器
      lastMessage = this.container.createDiv({ cls: 'kilo-message kilo-message-assistant' });
      lastMessage.createDiv({ cls: 'kilo-message-content' });
    }
    let toolsEl = lastMessage.querySelector('.kilo-tools') as HTMLElement | null;
    if (!toolsEl) toolsEl = lastMessage.createDiv({ cls: 'kilo-tools' });
    this.renderToolCall(toolsEl, toolCall);
  }

  /** 更新工具调用结果状态（暴力定位 data-tool-id 更新） */
  appendToolResult(toolCallId: string, _result: string): void {
    const toolEl = this.container.querySelector(`[data-tool-id="${toolCallId}"]`);
    if (toolEl) {
      const statusEl = toolEl.querySelector('.kilo-tool-status');
      if (statusEl) statusEl.textContent = this.getStatusText('completed');
    }
  }

  /**
   * 节流滚动到底部：使用 requestAnimationFrame 合并同一帧内的多次调用，
   * 避免高频 SSE chunk 导致的 layout thrashing
   */
  scrollToBottom(): void {
    if (this.scrollRafId !== null) return;
    this.scrollRafId = window.requestAnimationFrame(() => {
      this.scrollRafId = null;
      this.container.scrollTop = this.container.scrollHeight;
    });
  }
}
