// src/providers/kilocode/runtime/ReviewLoop.ts
//
// 验证器子代理（Review Loop）：
// AI 助手 完成回复后，以独立 KiloCodeChatRuntime 实例对修改的文件进行审查。
// 审查在只读模式下运行，完成后立即销毁临时 runtime，不影响主会话。
//
// 为什么使用独立进程而非同一 session：
// - 无法在同一 session 中维护"主 Agent"和"审查 Agent"的独立上下文
// - 独立进程确保审查结果不受主任务上下文污染
// - 审查完成即销毁，不占用 idle timeout 资源

import type { ChatRuntime, MessageContext } from '../../../core/providers/types';
import type { Message } from '../../../core/types';

// ── Types ──────────────────────────────────────────────────────────────────────

export type ReviewVerdict = 'LGTM' | string;
// 'LGTM' 表示无问题；其他字符串表示问题描述

export interface RunReviewOptions {
  userRequest: string;
  editedFiles: string[];
  vaultPath: string;
  /** 用于创建独立的审查 Runtime 实例 */
  createRuntime: () => ChatRuntime;
}

// ── 编辑文件提取 ──────────────────────────────────────────────────────────────

/** 写文件工具名称列表 */
const FILE_WRITE_TOOLS = new Set(['write_file', 'edit_file', 'write', 'edit']);

/**
 * 从助手消息的工具调用中提取被修改的文件路径。
 *
 * @param message 助手消息（含 toolCalls）
 * @returns 文件路径数组（去重）
 */
export function extractEditedFiles(message: Message): string[] {
  const files = new Set<string>();

  for (const tc of message.toolCalls ?? []) {
    if (FILE_WRITE_TOOLS.has(tc.name)) {
      // toolCall.input 可能包含 file_path 或 path 字段
      const filePath = (tc.input?.file_path ?? tc.input?.path ?? '') as string;
      if (filePath && typeof filePath === 'string') {
        files.add(filePath);
      }
    }
  }

  return Array.from(files);
}

// ── 审查 Prompt 构建 ──────────────────────────────────────────────────────────

/**
 * 构建审查 Prompt 文本。
 *
 * @param userRequest 用户的原始请求
 * @param editedFiles 被修改的文件路径列表
 * @returns 审查 Prompt 字符串
 */
export function buildReviewPrompt(userRequest: string, editedFiles: string[]): string {
  const parts: string[] = [
    'You are a code reviewer for an AI assistant that makes changes to a user\'s codebase.',
    'Review the following changes for quality, correctness, completeness, and adherence to best practices.',
    '',
    '## Original User Request',
    userRequest,
    '',
    '## Files Modified',
  ];

  if (editedFiles.length === 0) {
    parts.push('(no files were modified)');
  } else {
    for (const file of editedFiles) {
      parts.push(`- ${file}`);
    }
  }

  parts.push(
    '',
    '## Review Checklist',
    '- Verify the changes correctly address the original request',
    '- Check for potential bugs, security vulnerabilities, or regressions',
    '- Ensure appropriate error handling for edge cases',
    '- Verify the changes are consistent with the existing codebase style',
    '',
    '## Constraints',
    '- **READ-ONLY**: Do NOT make any changes. Only provide review comments.',
    '- If everything looks good, respond with exactly: LGTM',
    '- If you find issues, list each issue on a new line starting with "- "',
    '- Be specific about the problem and suggest how to fix it',
    '',
    '## Your Review',
  );

  return parts.join('\n');
}

// ── 审查结果解析 ──────────────────────────────────────────────────────────────

/**
 * 解析审查回复，提取审查结论。
 *
 * @param responseText AI 审查者返回的完整文本
 * @returns 'LGTM' 或问题描述文本
 */
export function parseReviewResponse(responseText: string): ReviewVerdict {
  const trimmed = responseText.trim();

  // 如果回复以 "LGTM" 开头（或仅包含 LGTM），视为通过
  if (/^LGTM\b/i.test(trimmed)) {
    return 'LGTM';
  }

  // 提取所有以 "- " 开头的问题行
  const issueLines: string[] = [];
  for (const line of trimmed.split('\n')) {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('- ')) {
      issueLines.push(trimmedLine);
    }
  }

  // 如果存在结构化问题列表，返回它们
  if (issueLines.length > 0) {
    return issueLines.join('\n');
  }

  // 非 LGTM 也无结构化列表，返回完整回复摘要
  // 只取前 500 字符防止 Notice 过长
  return trimmed.length > 500 ? trimmed.slice(0, 500) + '...' : trimmed;
}

// ── 审查执行 ──────────────────────────────────────────────────────────────────

/**
 * 对修改的文件执行审查。
 *
 * 创建一个独立的 ChatRuntime 实例（独立的 kilo serve 子进程），
 * 发送审查 Prompt，解析回复，完成后停止审查进程。
 *
 * @returns 'LGTM'（通过）或问题描述文本
 */
export async function runReview(options: RunReviewOptions): Promise<ReviewVerdict> {
  const { userRequest, editedFiles, vaultPath, createRuntime } = options;

  // 构建审查 Prompt
  const reviewPrompt = buildReviewPrompt(userRequest, editedFiles);

  // 创建独立的审查 Runtime（隔离：不共享主进程）
  const reviewRuntime = createRuntime();

  try {
    // 启动审查 Runtime
    await reviewRuntime.start();

    // 发送审查消息并收集回复
    const context: MessageContext = {
      vaultPath,
      currentNote: '',
    };

    let responseContent = '';

    // 使用审查模式（plan 模式确保只读）
    const reviewMessage = `[SYSTEM: You are in READ-ONLY review mode. Do not make any changes.]\n\n${reviewPrompt}`;

    const generator = reviewRuntime.sendMessage(reviewMessage, context);
    if (generator) {
      try {
        for await (const chunk of generator) {
          if (chunk.type === 'text' && chunk.content) {
            responseContent += chunk.content;
          }
          // 忽略 thinking 和其他非文本 chunk
        }
      } catch (err) {
        // 审查 stream 失败，记录错误但不阻止主流程
        responseContent = `Review error: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    // 解析审查结果
    return parseReviewResponse(responseContent);
  } finally {
    // 无论审查成功或失败，确保清理审查进程
    try {
      await reviewRuntime.stop();
    } catch {
      // 静默处理 stop 失败
    }
  }
}
