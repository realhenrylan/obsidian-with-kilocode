// src/core/security/PermissionMode.ts

/** 工具执行权限模式 */
export type PermissionMode = 'yolo' | 'normal' | 'plan';

/** 需要审批的写入类工具 */
export const WRITE_TOOLS = new Set([
  'write_file', 'edit_file', 'delete_file', 'bash', 'execute_command',
]);

/** 读取类工具（不需要审批） */
export const READ_TOOLS = new Set([
  'read_file', 'search', 'list_files', 'grep',
]);

/** 检查工具是否为写入类 */
export function isWriteTool(toolName: string): boolean {
  return WRITE_TOOLS.has(toolName);
}

/** 检查工具是否为读取类 */
export function isReadTool(toolName: string): boolean {
  return READ_TOOLS.has(toolName);
}
