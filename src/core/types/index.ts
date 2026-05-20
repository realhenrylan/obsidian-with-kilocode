// src/core/types/index.ts

/** Provider 唯一标识 */
export type ProviderId = 'kilocode';

/** 会话元数据 */
export interface ConversationMeta {
  id: string;
  providerId: ProviderId;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastResponseAt?: number;
  messageCount: number;
  preview: string;
}

/** 完整会话 */
export interface Conversation extends ConversationMeta {
  messages: Message[];
  sessionId?: string | null;
  providerState?: Record<string, unknown>;
}

/** 消息角色 */
export type MessageRole = 'user' | 'assistant' | 'system';

/** 消息 */
export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  images?: ImageAttachment[];
  toolCalls?: ToolCallInfo[];
}

/** 图片附件 */
export interface ImageAttachment {
  data: string;
  mimeType: string;
  name?: string;
}

/** 工具调用信息 */
export interface ToolCallInfo {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'error';
  result?: string;
  error?: string;
  startTime?: number;
  endTime?: number;
}

/** 流式消息类型 */
export type StreamMessageType = 'text' | 'tool_use' | 'tool_result' | 'error' | 'done';

/** 流式消息 */
export interface StreamMessage {
  type: StreamMessageType;
  content?: string;
  toolCall?: ToolCallInfo;
  error?: string;
}

/** 插件设置 */
export interface KiloCodeSettings {
  enabled: boolean;
  cliPath: string;
  model: string;
  apiKey: string;
  maxTabs: number;
  chatViewPlacement: 'left-sidebar' | 'right-sidebar' | 'main-tab';
  locale: string;
  environmentVariables: Record<string, string>;
  autoStart: boolean;
  defaultModel: string;
  temperature: number;
  autoSave: boolean;
  theme: 'auto' | 'light' | 'dark';
  fontSize: number;
}

/** 视图类型常量 */
export const VIEW_TYPE_KILOCODE = 'kilocode-chat';
