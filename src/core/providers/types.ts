// src/core/providers/types.ts

import type { ProviderId, StreamMessage, ToolCallInfo, Message } from '../types';
export type { ProviderId, StreamMessage, ToolCallInfo, Message } from '../types';

/** Provider 能力定义 */
export interface ProviderCapabilities {
  supportsPersistentRuntime: boolean;
  supportsNativeHistory: boolean;
  supportsPlanMode: boolean;
  supportsRewind: boolean;
  supportsFork: boolean;
  supportsImageAttachments: boolean;
  supportsMcpTools: boolean;
  reasoningControl: 'effort' | 'token-budget' | 'none';
}

/** ChatRuntime 接口 — AsyncGenerator 模式 */
export interface ChatRuntime {
  /** 启动 CLI 进程 */
  start(): Promise<void>;
  /** 停止 CLI 进程 */
  stop(): Promise<void>;
  /** 同步强制终止 CLI 进程（用于 process.on('exit') 兜底清理） */
  killSync?(): void;
  /** 发送消息，返回 AsyncGenerator 消费流式响应 */
  sendMessage(content: string, context?: MessageContext): AsyncGenerator<StreamChunk>;
  /** 取消当前流式响应 */
  cancel(): void;
  /** 重置会话 */
  resetSession(): void;
  /** 是否正在流式响应 */
  isStreaming(): boolean;
  /** 发送审批决定（Phase C 预留） */
  sendApproval?(toolName: string, decision: 'allow' | 'deny'): void;
  /** Set model ID (e.g. anthropic/claude-sonnet-4-20250514) */
  setModel?(modelId: string): void;
  /** Get current model ID */
  getModel?(): string | null;
}

/** 消息上下文 */
export interface MessageContext {
  vaultPath?: string;
  currentNote?: string;
  externalContexts?: string[];
  /** 用户自定义指令，由 # 按钮编辑器设置 */
  customInstructions?: string;
}

/** Provider 注册信息 */
export interface ProviderRegistration {
  id: ProviderId;
  displayName: string;
  capabilities: ProviderCapabilities;
  createRuntime: () => ChatRuntime;
}

/** 流式响应块类型 */
export type StreamChunkType =
  | 'text'
  | 'thinking'
  | 'tool_use'
  | 'tool_result'
  | 'error'
  | 'done'
  | 'approval_required';

/** 流式响应块 */
export interface StreamChunk {
  type: StreamChunkType;
  content?: string;
  toolCall?: ToolCallInfo;
  error?: string;
  approvalRequest?: {
    toolName: string;
    input: Record<string, unknown>;
    description: string;
  };
}
