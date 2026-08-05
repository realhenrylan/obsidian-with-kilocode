// src/features/inline-edit/runInlineEdit.ts
// §5.4 Inline Edit 真实实现：
// plan 模式调 CLI（只读，不写文件）→ 收集 AI 建议 → diff 预览 → Accept 写入 vault / Reject 取消
import type { App, TFile, Vault } from 'obsidian';
import type { ChatRuntime } from '../../core/providers/types';
import { InlineEditModal } from './InlineEditModal';
import { t } from '../../i18n';

export interface InlineEditDeps {
  app: App;
  vault: Vault;
  getRuntime: () => ChatRuntime | null;
  getActiveFile: () => TFile | null;
  notice: (message: string) => void;
}

/** 构造只读 plan 提示词：要求 AI 只返回替换文本，绝不写文件 */
export function buildInlineEditPrompt(filePath: string, selectedText: string, instruction: string): string {
  return [
    'You are editing text in an Obsidian note. Do a text transformation only.',
    '',
    `File: ${filePath}`,
    '',
    'Selected text:',
    '```',
    selectedText,
    '```',
    '',
    `Instruction: ${instruction}`,
    '',
    'Return ONLY the complete replacement text for the selected text — no explanations, no markdown code fences. DO NOT write any files.',
  ].join('\n');
}

/**
 * 执行内联编辑：收集 AI 建议 → diff 预览 → 用户决定
 * 失败路径（无笔记 / runtime 未就绪 / AI 报错 / 空结果）只提示，不打开 diff
 */
export async function runInlineEdit(deps: InlineEditDeps, selectedText: string, instruction: string): Promise<void> {
  const file = deps.getActiveFile();
  if (!file) {
    deps.notice(t('editor.noActiveFile'));
    return;
  }
  const runtime = deps.getRuntime();
  if (!runtime) {
    deps.notice(t('editor.noRuntime'));
    return;
  }

  // plan 语义：只收集 AI 返回的文本，不做任何写入
  let newText = '';
  let failed: string | null = null;
  try {
    for await (const chunk of runtime.sendMessage(buildInlineEditPrompt(file.path, selectedText, instruction))) {
      if (chunk.type === 'text') {
        newText += chunk.content;
      } else if (chunk.type === 'error') {
        failed = chunk.error ?? 'unknown error';
      } else if (chunk.type === 'done') {
        break;
      }
    }
  } catch (err: any) {
    failed = err?.message || String(err);
  }

  if (failed) {
    deps.notice(t('editor.failed', { error: failed }));
    return;
  }
  if (!newText.trim()) {
    deps.notice(t('editor.noChanges'));
    return;
  }

  // diff 预览：Accept 写入 / Reject 取消
  const modal = new InlineEditModal(deps.app, selectedText, () => {}, true);
  modal.onAccept(async (text) => {
    await deps.vault.modify(file, text);
    deps.notice(t('editor.applied'));
  });
  modal.open();
  modal.attachDiff(selectedText, newText.trimEnd());
}
