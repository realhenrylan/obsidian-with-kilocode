// src/core/providers/types.ts

import type { ProviderId, StreamMessage } from '../types';
export type { ProviderId, StreamMessage } from '../types';

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

/** ChatRuntime 接口 */
export interface ChatRuntime {
  /** 启动运行时 */
  start(): Promise<void>;
  /** 停止运行时 */
  stop(): Promise<void>;
  /** 发送消息 */
  sendMessage(content: string, context?: MessageContext): Promise<void>;
  /** 取消当前请求 */
  cancel(): void;
  /** 重置会话 */
  resetSession(): void;
  /** 是否正在流式响应 */
  isStreaming(): boolean;
  /** 设置消息回调 */
  onMessage(callback: (message: StreamMessage) => void): void;
  /** 设置错误回调 */
  onError(callback: (error: Error) => void): void;
  /** 设置完成回调 */
  onComplete(callback: () => void): void;
}

/** 消息上下文 */
export interface MessageContext {
  vaultPath?: string;
  currentNote?: string;
  externalContexts?: string[];
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
  | 'tool_use'
  | 'tool_result'
  | 'error'
  | 'done'
  | 'approval_required';

/** 流式响应块 */
export interface StreamChunk {
  type: StreamChunkType;
  content?: string;
  toolCall?: import('../types').ToolCallInfo;
  error?: string;
  approvalRequest?: {
    toolName: string;
    input: Record<string, unknown>;
    description: string;
  };
}
