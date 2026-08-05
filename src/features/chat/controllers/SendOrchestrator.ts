// src/features/chat/controllers/SendOrchestrator.ts
// 发送编排器：拆解 KiloCodeView.handleSend 的四段流程
//   段1 prepareSend    — 会话懒创建 / 消息前缀 / 图片 / 当前笔记
//   段2 acquireRuntime — runtime 启动 / approval 配置
//   段3 consumeStream  — 流式消费（跨 Tab 缓冲 + 渲染回调）
//   段4 finalize       — 落库 / 清图片 / 清状态
// 依赖通过 deps 回调注入（由 View 提供），本类不直接依赖 DOM。

import type { ChatRuntime } from '../../../core/providers/types';
import type { Message, ToolCallInfo } from '../../../core/types';
import type { Tab } from '../tabs/Tab';
import type { TabManager } from '../tabs/TabManager';
import type { StreamController } from './StreamController';
import type { InputController } from './InputController';
import type { ConversationController } from './ConversationController';
import type { PlanModeController } from '../PlanModeController';
import type { ApprovalManager } from '../../../core/security/ApprovalManager';
import type { ApprovalRequest, ApprovalDecision } from '../../../core/security/ApprovalManager';
import type { PermissionMode } from '../../../core/security/PermissionMode';

/** 跨 Tab 缓冲的流式状态（用于切换 Tab 后恢复渲染） */
export interface TabStreamingState {
  content: string;
  thinking: string;
  toolCalls: Map<string, ToolCallInfo>;
}

/** View 注入的依赖与渲染回调 */
export interface SendOrchestratorDeps {
  tabManager: TabManager;
  streamController: StreamController;
  inputController: InputController;
  conversationController: ConversationController;
  planModeController: PlanModeController;
  approvalManager: ApprovalManager;
  getPermissionMode: () => PermissionMode;
  getVaultPath: () => string;

  // 发送者 Tab 标记（防跨 Tab 渲染污染）
  setSenderTabId: (tabId: string | null) => void;
  isSenderTabActive: () => boolean;
  isSwitchingTab: () => boolean;

  // 渲染回调（由 View 实现）
  renderUserMessage: (content: string) => void;
  addAssistantMessage: () => void;
  appendText: (text: string) => void;
  appendThinking: (text: string) => void;
  renderToolCall: (toolCall: ToolCallInfo) => void;
  updateToolCallResult: (toolCallId: string, result: string) => void;
  finalizeMessage: () => void;

  // UI 状态
  updateTabBar: () => void;
  updateButtonStates: () => void;
  notice: (message: string) => void;

  // 上下文
  isNoteIncluded: () => boolean;
  getNoteContent: () => Promise<string | undefined>;
  getCurrentNotePath: () => string | undefined;
  clearImages: () => void;

  // 跨 Tab 流式缓冲
  getStreamingState: (tabId: string) => TabStreamingState | undefined;
  setStreamingState: (tabId: string, state: TabStreamingState) => void;
  deleteStreamingState: (tabId: string) => void;

  // runtime 获取（View 负责 ProviderRegistry 查找与 start）
  getOrCreateRuntime: () => Promise<ChatRuntime | null>;
}

/** 发送预备产物（段1 输出） */
interface SendPreparation {
  content: string;
  currentNote: string | undefined;
}

export class SendOrchestrator {
  constructor(private deps: SendOrchestratorDeps) {}

  /** 发送消息主流程：空内容 / 无 Tab / 流式中均静默返回 */
  async send(content: string): Promise<void> {
    if (!content.trim()) return;

    const activeTab = this.deps.tabManager.getActiveTab();
    if (!activeTab) return;
    if (activeTab.state.isStreaming) return;

    // 记录发送者 Tab ID（在 try 外定义，供 catch/finally 使用）
    const tabId = activeTab.id;

    try {
      // 0. 递增流式代数（冲突保护）+ 记录发送者 Tab ID
      const generation = activeTab.bumpStreamGeneration();
      this.deps.setSenderTabId(tabId);
      this.deps.setStreamingState(tabId, { content: '', thinking: '', toolCalls: new Map() });

      // 段1: 会话 / 消息 / 图片 / 当前笔记
      const prep = await this.prepareSend(content, activeTab);

      // 段2: runtime 启动 + approval 配置
      const runtime = await this.acquireRuntime();
      if (!runtime) {
        this.deps.notice('KiloCode CLI not available');
        return;
      }

      // 段3: 流式消费
      const assistantMessage = await this.consumeStream(runtime, prep, activeTab, generation);

      // 段4: 落库 + 清图片
      await this.finalize(assistantMessage, tabId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.deps.notice(`Failed to send message: ${message}`);
      console.error('[KiloCodeView] handleSend error:', error);
      this.resetStreamingState(activeTab, tabId);
    } finally {
      // 确保流式状态一定被重置（无论成功、异常、或 cancel）
      if (activeTab.state.isStreaming) {
        activeTab.setStreaming(false);
      }
      this.deps.deleteStreamingState(tabId);
      this.deps.setSenderTabId(null);
      this.deps.updateButtonStates();
    }
  }

  // ─── 段1: 会话 / 消息构建 ──────────────────────────────

  private async prepareSend(content: string, activeTab: Tab): Promise<SendPreparation> {
    const { conversationController, planModeController } = this.deps;

    // 1. 确保会话存在（懒创建）
    const conversationId = await conversationController.ensureConversation();
    if (!activeTab.state.conversationId) {
      activeTab.setConversation(conversationId);
      this.deps.updateTabBar();
    }

    // 2. 构建用户消息（模式前缀 + 当前笔记上下文）
    const messageWithPrefix = planModeController.getMessageWithPrefix(content);
    let currentNote: string | undefined;
    if (this.deps.isNoteIncluded()) {
      const noteContent = await this.deps.getNoteContent();
      if (noteContent) currentNote = noteContent;
    }

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: messageWithPrefix,
      timestamp: Date.now(),
    };
    await conversationController.addMessage(userMessage);

    // 3. 立即在 UI 上显示用户消息
    this.deps.renderUserMessage(content);

    return { content, currentNote };
  }

  // ─── 段2: runtime 获取与 approval 配置 ─────────────────

  private async acquireRuntime(): Promise<ChatRuntime | null> {
    this.deps.approvalManager.setPermissionMode(this.deps.getPermissionMode());
    return this.deps.getOrCreateRuntime();
  }

  // ─── 段3: 流式消费 ─────────────────────────────────────

  private async consumeStream(
    runtime: ChatRuntime,
    prep: SendPreparation,
    activeTab: Tab,
    generation: number,
  ): Promise<Message> {
    const { streamController } = this.deps;
    const tabId = activeTab.id;

    const generator = runtime.sendMessage(prep.content, {
      vaultPath: this.deps.getVaultPath(),
      currentNote: prep.currentNote || this.deps.getCurrentNotePath(),
    });

    // 进入流式状态
    activeTab.setStreaming(true);
    this.deps.updateButtonStates();

    // 创建空的助手消息容器（流式渲染目标，仅当发送者 Tab 活跃时创建）
    if (this.deps.isSenderTabActive()) {
      this.deps.addAssistantMessage();
    }

    // 设置审批决定回调
    streamController.setApprovalDecisionCallback((toolName, decision) => {
      this.deps.inputController.getRuntime()?.sendApproval?.(toolName, decision as 'allow' | 'deny');
    });

    return streamController.consumeStream(
      generator,
      {
        onText: (text) => {
          // 始终缓冲到 Tab 状态（跨 Tab 切换时恢复用）
          const state = this.deps.getStreamingState(tabId);
          if (state) state.content += text;
          // 仅在活跃且不在切换中时增量渲染
          if (!this.deps.isSwitchingTab() && this.deps.isSenderTabActive()) {
            this.deps.appendText(text);
          }
        },
        onThinking: (text) => {
          const state = this.deps.getStreamingState(tabId);
          if (state) state.thinking += text;
          if (!this.deps.isSwitchingTab() && this.deps.isSenderTabActive()) {
            this.deps.appendThinking(text);
          }
        },
        onToolCall: (toolCall) => {
          const state = this.deps.getStreamingState(tabId);
          if (state) state.toolCalls.set(toolCall.id, toolCall);
          if (!this.deps.isSwitchingTab() && this.deps.isSenderTabActive()) {
            this.deps.renderToolCall(toolCall);
          }
        },
        onToolResult: (id, result) => {
          const state = this.deps.getStreamingState(tabId);
          if (state) {
            const tc = state.toolCalls.get(id);
            if (tc) tc.status = 'completed';
          }
          if (!this.deps.isSwitchingTab() && this.deps.isSenderTabActive()) {
            this.deps.updateToolCallResult(id, result);
          }
        },
        onError: (error) => this.deps.notice(`Error: ${error}`),
        onComplete: () => {
          activeTab.setStreaming(false);
          this.deps.updateButtonStates();
        },
        onApprovalRequired: async (request: ApprovalRequest): Promise<ApprovalDecision> => {
          return this.deps.approvalManager.requestApproval(request);
        },
      },
      generation, // 传入 generation 进行冲突保护
    );
  }

  // ─── 段4: 落库与清理 ───────────────────────────────────

  private async finalize(assistantMessage: Message, tabId: string): Promise<void> {
    // 确保 streaming 状态被重置
    const activeTab = this.deps.tabManager.getActiveTab();
    if (activeTab) {
      activeTab.setStreaming(false);
      this.deps.updateButtonStates();
    }
    this.deps.deleteStreamingState(tabId);

    // 流完成后做最终 Markdown 渲染（仅当发送者 Tab 仍活跃时）
    if (this.deps.isSenderTabActive()) {
      this.deps.finalizeMessage();
    }

    // 保存助手消息到会话
    await this.deps.conversationController.addMessage(assistantMessage);

    // 清除图片
    this.deps.clearImages();
  }

  /** 发送者 Tab 失效时同步重置（catch 路径） */
  private resetStreamingState(activeTab: Tab, tabId: string): void {
    activeTab.setStreaming(false);
    this.deps.deleteStreamingState(tabId);
    this.deps.updateButtonStates();
  }
}
