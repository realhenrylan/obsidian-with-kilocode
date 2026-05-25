// src/features/chat/controllers/InputController.ts
import type { ChatRuntime } from '../../../core/providers/types';

/**
 * 输入控制器
 * 管理 ChatRuntime 的生命周期引用，提供 cancel 能力
 * 流式消费逻辑已移至 StreamController
 *
 * 注：runtime 引用已移至 Tab 类管理（T3.2 多 Runtime 支持）。
 * 此类保留轻量 cancel 转发能力。
 */
export class InputController {
  private runtime: ChatRuntime | null = null;

  /** 是否已有运行时实例 */
  hasRuntime(): boolean {
    return this.runtime !== null;
  }

  /** 设置运行时实例 */
  setRuntime(runtime: ChatRuntime | null): void {
    this.runtime = runtime;
  }

  /** 获取运行时实例 */
  getRuntime(): ChatRuntime | null {
    return this.runtime;
  }

  /** 取消当前流式响应 */
  cancel(): void {
    this.runtime?.cancel();
  }
}
