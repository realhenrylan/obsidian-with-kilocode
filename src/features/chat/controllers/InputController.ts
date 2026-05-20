// src/features/chat/controllers/InputController.ts
import type { ChatRuntime } from '../../../core/providers/types';

/**
 * 输入控制器
 * 管理 ChatRuntime 的生命周期引用，提供 cancel 能力
 * 流式消费逻辑已移至 StreamController
 */
export class InputController {
  private runtime: ChatRuntime | null = null;

  /** 设置运行时实例 */
  setRuntime(runtime: ChatRuntime): void {
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
