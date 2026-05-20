// src/core/security/ApprovalManager.ts
import type { PermissionMode } from './PermissionMode';
import { isWriteTool, isReadTool } from './PermissionMode';

export type ApprovalDecision = 'allow' | 'allow-always' | 'deny' | 'cancel';

export interface ApprovalRequest {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  description: string;
  timestamp?: number;
}

export type ApprovalHandler = (request: ApprovalRequest) => Promise<ApprovalDecision>;

/**
 * 审批管理器
 * 管理工具调用的审批流程，支持三种权限模式和 always-allow 列表
 */
export class ApprovalManager {
  private pendingRequests = new Map<string, {
    request: ApprovalRequest;
    resolve: (decision: ApprovalDecision) => void;
  }>();
  private alwaysAllowTools = new Set<string>();
  private permissionMode: PermissionMode = 'normal';
  private approvalHandler: ApprovalHandler | null = null;

  setPermissionMode(mode: PermissionMode): void {
    this.permissionMode = mode;
  }

  getPermissionMode(): PermissionMode {
    return this.permissionMode;
  }

  /** 设置审批对话框处理器（由 UI 层注入） */
  setApprovalHandler(handler: ApprovalHandler | null): void {
    this.approvalHandler = handler;
  }

  /** 请求审批，返回用户的决定 */
  async requestApproval(request: ApprovalRequest): Promise<ApprovalDecision> {
    // yolo 模式：自动通过
    if (this.permissionMode === 'yolo') {
      return 'allow';
    }

    // plan 模式：写入工具自动拒绝，读取工具自动通过
    if (this.permissionMode === 'plan') {
      return isWriteTool(request.toolName) ? 'deny' : 'allow';
    }

    // normal 模式：
    // 读取工具自动通过
    if (isReadTool(request.toolName)) {
      return 'allow';
    }

    // always-allow 检查
    if (this.alwaysAllowTools.has(request.toolName)) {
      return 'allow';
    }

    // 写入工具需要审批
    if (isWriteTool(request.toolName)) {
      return this.requestUserApproval(request);
    }

    // 未知工具默认需要审批
    return this.requestUserApproval(request);
  }

  /** 取消所有待审批请求 */
  cancelAll(): void {
    for (const [, pending] of this.pendingRequests) {
      pending.resolve('cancel');
    }
    this.pendingRequests.clear();
  }

  /** 清除 always-allow 列表 */
  resetAlwaysAllow(): void {
    this.alwaysAllowTools.clear();
  }

  /** 获取 always-allow 工具列表（用于持久化） */
  getAlwaysAllowTools(): string[] {
    return Array.from(this.alwaysAllowTools);
  }

  /** 恢复 always-allow 工具列表 */
  setAlwaysAllowTools(tools: string[]): void {
    this.alwaysAllowTools = new Set(tools);
  }

  private async requestUserApproval(request: ApprovalRequest): Promise<ApprovalDecision> {
    if (!this.approvalHandler) {
      // 没有审批处理器时默认拒绝
      return 'deny';
    }

    // 创建一个可控的 Promise，cancelAll 可以提前 resolve
    return new Promise<ApprovalDecision>((resolve) => {
      this.pendingRequests.set(request.id, { request, resolve });

      this.approvalHandler!(request).then((decision) => {
        // 用户已做出决定，从 pending 中移除
        this.pendingRequests.delete(request.id);

        if (decision === 'allow-always') {
          this.alwaysAllowTools.add(request.toolName);
        }

        resolve(decision);
      });
    });
  }
}
