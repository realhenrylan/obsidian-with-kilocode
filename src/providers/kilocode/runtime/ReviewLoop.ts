import type { ChatRuntime, MessageContext } from '../../../core/providers/types';
import type { Message } from '../../../core/types';

export type ReviewVerdict = 'LGTM' | string;

export interface RunReviewOptions {
  userRequest: string;
  editedFiles: string[];
  vaultPath: string;
  createRuntime: () => ChatRuntime;
}

const FILE_WRITE_TOOLS = new Set(['write_file', 'edit_file', 'write', 'edit']);

export function extractEditedFiles(message: Message): string[] {
  const files = new Set<string>();

  for (const tc of message.toolCalls ?? []) {
    if (FILE_WRITE_TOOLS.has(tc.name)) {
      const filePath = (tc.input?.file_path ?? tc.input?.path ?? '') as string;
      if (filePath && typeof filePath === 'string') {
        files.add(filePath);
      }
    }
  }

  return Array.from(files);
}

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

export function parseReviewResponse(responseText: string): ReviewVerdict {
  const trimmed = responseText.trim();

  if (/^LGTM\b/i.test(trimmed)) {
    return 'LGTM';
  }

  const issueLines: string[] = [];
  for (const line of trimmed.split('\n')) {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('- ')) {
      issueLines.push(trimmedLine);
    }
  }

  if (issueLines.length > 0) {
    return issueLines.join('\n');
  }

  return trimmed.length > 500 ? trimmed.slice(0, 500) + '...' : trimmed;
}

export async function runReview(options: RunReviewOptions): Promise<ReviewVerdict> {
  const { userRequest, editedFiles, vaultPath, createRuntime } = options;

  const reviewPrompt = buildReviewPrompt(userRequest, editedFiles);

  const reviewRuntime = createRuntime();

  try {
    await reviewRuntime.start();

    const context: MessageContext = {
      vaultPath,
      currentNote: '',
    };

    let responseContent = '';

    const reviewMessage = `[SYSTEM: You are in READ-ONLY review mode. Do not make any changes.]\n\n${reviewPrompt}`;

    const generator = reviewRuntime.sendMessage(reviewMessage, context);
    if (generator) {
      try {
        for await (const chunk of generator) {
          if (chunk.type === 'text' && chunk.content) {
            responseContent += chunk.content;
          }
        }
      } catch (err) {
        responseContent = `Review error: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    return parseReviewResponse(responseContent);
  } finally {
    try {
      await reviewRuntime.stop();
    } catch {
    }
  }
}
