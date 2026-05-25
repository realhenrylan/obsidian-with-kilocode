// T3.1 ReviewLoop 单元测试
//
// 覆盖范围：
// - 审查 Prompt 构建（用户请求、文件列表、READ-ONLY 约束）
// - 审查结果解析（LGTM、问题列表）
// - Runtime 隔离性（独立实例、stop 清理）
// - 编辑文件提取

import { buildReviewPrompt, parseReviewResponse, runReview, extractEditedFiles } from '../../../src/providers/kilocode/runtime/ReviewLoop';
import type { ChatRuntime } from '../../../src/core/providers/types';
import type { Message } from '../../../src/core/types';

// ── Mocks ──────────────────────────────────────────────────────────────────────

/**
 * 创建一个模拟的 AsyncGenerator，产出给定的 chunks。
 */
async function* mockGenerator(chunks: Array<{ type: string; content?: string }>): AsyncGenerator<any> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

function createMockRuntime(startFn?: () => Promise<void>): ChatRuntime {
  return {
    start: startFn ?? jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    sendMessage: jest.fn().mockImplementation(() => mockGenerator([
      { type: 'text', content: 'LGTM' },
      { type: 'done' },
    ])),
    cancel: jest.fn(),
    resetSession: jest.fn(),
    isStreaming: jest.fn().mockReturnValue(false),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('T3.1 ReviewLoop', () => {
  // ================================================================
  // 编辑文件提取
  // ================================================================

  describe('extractEditedFiles', () => {
    test('extracts file paths from write_file and edit_file tool calls', () => {
      const message: Message = {
        id: 'msg-1',
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls: [
          { id: 'tc-1', name: 'write_file', input: { file_path: '/path/to/file1.ts' }, status: 'completed' },
          { id: 'tc-2', name: 'edit_file', input: { file_path: '/path/to/file2.ts' }, status: 'completed' },
          { id: 'tc-3', name: 'read_file', input: { file_path: '/path/to/file3.ts' }, status: 'completed' },
        ],
      };

      const files = extractEditedFiles(message);
      expect(files).toEqual(['/path/to/file1.ts', '/path/to/file2.ts']);
    });

    test('deduplicates file paths', () => {
      const message: Message = {
        id: 'msg-2',
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        toolCalls: [
          { id: 'tc-1', name: 'write_file', input: { file_path: 'src/main.ts' }, status: 'completed' },
          { id: 'tc-2', name: 'edit_file', input: { file_path: 'src/main.ts' }, status: 'completed' },
        ],
      };

      const files = extractEditedFiles(message);
      expect(files).toEqual(['src/main.ts']);
    });

    test('returns empty array when no tool calls', () => {
      const message: Message = {
        id: 'msg-3',
        role: 'assistant',
        content: 'Just a text response',
        timestamp: Date.now(),
      };

      expect(extractEditedFiles(message)).toEqual([]);
    });

    test('returns empty array when toolCalls is undefined', () => {
      const message: Message = {
        id: 'msg-4',
        role: 'assistant',
        content: 'No tools used',
        timestamp: Date.now(),
      };

      expect(extractEditedFiles(message)).toEqual([]);
    });
  });

  // ================================================================
  // 审查 Prompt 构建
  // ================================================================

  describe('buildReviewPrompt', () => {
    test('includes original user request text', () => {
      const prompt = buildReviewPrompt('Add error handling to the login function', ['src/login.ts']);
      expect(prompt).toContain('Add error handling to the login function');
      expect(prompt).toContain('## Original User Request');
    });

    test('includes list of edited files', () => {
      const files = ['src/login.ts', 'src/utils/errors.ts', 'tests/login.test.ts'];
      const prompt = buildReviewPrompt('Fix the login bug', files);

      for (const file of files) {
        expect(prompt).toContain(`- ${file}`);
      }
      expect(prompt).toContain('## Files Modified');
    });

    test('includes READ-ONLY constraint', () => {
      const prompt = buildReviewPrompt('Refactor the auth module', ['src/auth.ts']);
      expect(prompt).toContain('READ-ONLY');
      expect(prompt).toContain('Do NOT make any changes');
    });

    test('handles empty edited files array', () => {
      const prompt = buildReviewPrompt('Review this', []);
      expect(prompt).toContain('(no files were modified)');
    });
  });

  // ================================================================
  // 审查结果解析
  // ================================================================

  describe('parseReviewResponse', () => {
    test('returns "LGTM" when reviewer approves (exact match)', () => {
      expect(parseReviewResponse('LGTM')).toBe('LGTM');
    });

    test('returns "LGTM" when reviewer approves (with line breaks)', () => {
      expect(parseReviewResponse('\nLGTM\n')).toBe('LGTM');
    });

    test('returns "LGTM" when reviewer approves (lowercase)', () => {
      expect(parseReviewResponse('lgtm')).toBe('LGTM');
    });

    test('returns issue list when reviewer finds problems', () => {
      const response = [
        'I found a few issues:',
        '- The error message is not user-friendly',
        '- Missing input validation for edge cases',
        '- The function is too long, consider refactoring',
      ].join('\n');

      const result = parseReviewResponse(response);
      expect(result).toBe(
        '- The error message is not user-friendly\n' +
        '- Missing input validation for edge cases\n' +
        '- The function is too long, consider refactoring',
      );
    });

    test('returns response summary for non-LGTM without structured issues', () => {
      const response = 'The code looks okay but could use some improvements.';
      const result = parseReviewResponse(response);
      expect(result).toBe(response);
    });
  });

  // ================================================================
  // Runtime 隔离性
  // ================================================================

  describe('runReview isolation', () => {
    test('creates a separate ChatRuntime instance for review — not the main runtime', async () => {
      const createRuntime = jest.fn().mockReturnValue(createMockRuntime());

      await runReview({
        userRequest: 'Test request',
        editedFiles: ['src/test.ts'],
        vaultPath: '/tmp/vault',
        createRuntime,
      });

      expect(createRuntime).toHaveBeenCalledTimes(1);
    });

    test('calls stop() on the review runtime after completion', async () => {
      // createMockRuntime 默认的 sendMessage 已返回 LGTM
      const mockRuntime = createMockRuntime();
      const createRuntime = jest.fn().mockReturnValue(mockRuntime);

      await runReview({
        userRequest: 'Test request',
        editedFiles: ['src/test.ts'],
        vaultPath: '/tmp/vault',
        createRuntime,
      });

      expect(mockRuntime.start).toHaveBeenCalledTimes(1);
      expect(mockRuntime.stop).toHaveBeenCalledTimes(1);
    });

    test('calls stop() even when review stream fails', async () => {
      const mockRuntime = createMockRuntime();
      // Generator that throws during iteration
      async function* throwingGenerator() {
        yield { type: 'text', content: 'Starting review...' };
        throw new Error('Stream interrupted');
      }
      mockRuntime.sendMessage = jest.fn().mockImplementation(() => throwingGenerator());

      const createRuntime = jest.fn().mockReturnValue(mockRuntime);

      const result = await runReview({
        userRequest: 'Test request',
        editedFiles: ['src/test.ts'],
        vaultPath: '/tmp/vault',
        createRuntime,
      });

      // Even with stream failure, stop should still be called
      expect(mockRuntime.stop).toHaveBeenCalledTimes(1);
      // Result should contain the error
      expect(result).toContain('Review error');
    });
  });

  // ================================================================
  // 端到端流程
  // ================================================================

  describe('end-to-end review flow', () => {
    test('returns LGTM when review passes', async () => {
      const mockRuntime = createMockRuntime();
      mockRuntime.sendMessage = jest.fn().mockImplementation(() => {
        return mockGenerator([
          { type: 'text', content: 'LGTM' },
          { type: 'done' },
        ]);
      });

      const result = await runReview({
        userRequest: 'Add a simple function',
        editedFiles: ['src/utils.ts'],
        vaultPath: '/tmp/vault',
        createRuntime: () => mockRuntime,
      });

      expect(result).toBe('LGTM');
    });

    test('returns issue list when review finds problems', async () => {
      const mockRuntime = createMockRuntime();
      mockRuntime.sendMessage = jest.fn().mockImplementation(() => {
        return mockGenerator([
          { type: 'text', content: 'Issues found:\n- Missing null check\n- Unused import' },
          { type: 'done' },
        ]);
      });

      const result = await runReview({
        userRequest: 'Add error handling',
        editedFiles: ['src/main.ts'],
        vaultPath: '/tmp/vault',
        createRuntime: () => mockRuntime,
      });

      expect(result).toContain('- Missing null check');
      expect(result).toContain('- Unused import');
    });
  });
});
