// src/shared/ErrorNotice.ts

import { Notice } from 'obsidian';

export type ErrorLevel = 'info' | 'warning' | 'error' | 'fatal';

/**
 * 错误通知
 * 增强的错误提示组件
 */
export class ErrorNotice {
  private message: string;
  private level: ErrorLevel;
  private duration: number;

  constructor(message: string, level: ErrorLevel = 'error', duration: number = 5000) {
    this.message = message;
    this.level = level;
    this.duration = duration;
  }

  /** 显示通知 */
  show(): void {
    const icon = this.getIcon();
    const fullMessage = `${icon} ${this.message}`;
    new Notice(fullMessage, this.duration);
  }

  /** 获取图标 */
  private getIcon(): string {
    const icons: Record<ErrorLevel, string> = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
      fatal: '💀',
    };
    return icons[this.level];
  }

  /** 创建重试通知 */
  static withRetry(message: string, onRetry: () => void): ErrorNotice {
    const notice = new ErrorNotice(`${message}\n\nClick to retry`, 'error', 10000);
    notice.show();
    return notice;
  }
}

/**
 * CLI 错误处理
 */
export class CLIErrorHandler {
  /** 处理 CLI 未找到错误 */
  static handleCLINotFound(): void {
    new ErrorNotice(
      'KiloCode CLI not found. Please install it with: npm install -g @kilocode/cli',
      'fatal',
      10000
    ).show();
  }

  /** 处理 CLI 启动失败 */
  static handleCLIStartFailed(error: string): void {
    new ErrorNotice(
      `Failed to start KiloCode CLI: ${error}`,
      'error',
      8000
    ).show();
  }

  /** 处理网络错误 */
  static handleNetworkError(): void {
    new ErrorNotice(
      'Network error. Please check your connection.',
      'warning',
      5000
    ).show();
  }

  /** 处理工具调用失败 */
  static handleToolError(toolName: string, error: string): void {
    new ErrorNotice(
      `Tool "${toolName}" failed: ${error}`,
      'warning',
      5000
    ).show();
  }
}
