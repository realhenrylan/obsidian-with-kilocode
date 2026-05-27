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
  forkedFrom?: string;        // fork 来源会话 ID
  forkedAtMessageId?: string; // fork 时的消息 ID
  isCompacted?: boolean;      // 是否已压缩
}

/** 消息角色 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * 内容块类型
 * 将一条消息分解为多个有序块：thinking → text → tool_use → text → ...
 * 与 thinking / toolCalls 字段并存，提供有序渲染能力
 */
export type ContentBlockType = 'text' | 'thinking' | 'tool_use';

export interface ContentBlock {
  type: ContentBlockType;
  content: string;
  toolId?: string;  // type === 'tool_use' 时关联 ToolCallInfo.id
}

/** 消息 */
export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  images?: ImageAttachment[];
  toolCalls?: ToolCallInfo[];
  thinking?: string;
  /** 有序内容块（可选，向后兼容）。渲染时优先使用此字段 */
  contentBlocks?: ContentBlock[];
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
  /** compact 保留最近消息数 */
  compactKeepRecent: number;
  /** 权限模式：yolo（全自动）/ normal（逐次审批）/ plan（只读） */
  permissionMode: 'yolo' | 'normal' | 'plan';
  /** 下载镜像源基础 URL。空字符串表示使用 npm 官方源。 */
  mirrorUrl: string;
  /**
   * 空闲超时秒数。
   * kilo serve 在无消息活动 N 秒后自动停止，下次发消息自动重启。
   * 设为 0 表示禁用超时（进程持续运行）。默认 120 秒。
   */
  idleTimeoutSeconds: number;
  /**
   * 自动审查：AI 回复完成后自动对修改的文件进行审查。
   * 使用独立的 kilo serve 进程进行只读审查，发现问题时弹出 Notice。
   */
  autoReview: boolean;
  /** 自定义指令文本，用户通过 # 按钮编辑，持久化保存 */
  customInstructions: string;
}

/** 视图类型常量 */
export const VIEW_TYPE_KILOCODE = 'kilocode-chat';
