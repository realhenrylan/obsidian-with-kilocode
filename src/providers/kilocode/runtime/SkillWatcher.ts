// src/providers/kilocode/runtime/SkillWatcher.ts
//
// 技能文件热重载监听器。
// 使用 Node.js 内置 fs.watch 监控 .kilo/skills/ 目录的变更，
// 自动调用 invalidateSkillsCache() 使技能缓存失效，使新内容在下次 sendMessage 时生效。
//
// 为什么不用 chokidar：
// - 约束要求"不能引入新的原生依赖"
// - fs.watch(recursive: true) 在 Node 19+ (Electron 捆绑版本) 上跨平台可用
// - 300ms 防抖消除同一写入触发的多次 change 事件

import * as fs from 'fs';
import * as path from 'path';
import { invalidateSkillsCache } from './SkillLoader';

export interface SkillWatcher {
  /** 停止监听并释放资源 */
  dispose(): void;
}

/**
 * 创建技能文件监听器。
 * 监听 .kilo/skills/ 目录的递归变更，300ms 防抖后调用 invalidateSkillsCache()。
 *
 * @param vaultPath - Obsidian vault 根路径
 * @returns SkillWatcher 实例（含 dispose 方法）
 */
export function createSkillWatcher(vaultPath: string): SkillWatcher {
  const skillsDir = path.join(vaultPath, '.kilo', 'skills');

  let watcher: fs.FSWatcher | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * 防抖后的缓存失效回调。
   * 文件系统事件可能因同一写入触发多次（change → change → 稳定），
   * 300ms 防抖确保只触发一次失效。
   */
  const invalidateAfterDebounce = (): void => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      invalidateSkillsCache();
    }, 300);
  };

  try {
    // 确保目标目录存在（否则 fs.watch 可能在部分平台报错）
    if (!fs.existsSync(skillsDir)) {
      fs.mkdirSync(skillsDir, { recursive: true });
    }

    watcher = fs.watch(skillsDir, { recursive: true }, (eventType, filename) => {
      // filename 在某些平台（macOS）上可能为 null
      if (!filename) {
        invalidateAfterDebounce();
        return;
      }

      const filenameStr = filename.toString();
      // 只关心 SKILL.md 文件和目录结构变化
      if (filenameStr.endsWith('SKILL.md') || filenameStr.endsWith('/') || filenameStr.endsWith('\\')) {
        invalidateAfterDebounce();
        return;
      }

      // 新目录创建也可能触发变更，统一防抖
      invalidateAfterDebounce();
    });
  } catch (err) {
    // fs.watch 可能因权限、路径不存在等原因失败
    // 静默失败：技能热重载是增强功能而非核心功能
    console.warn('[SkillWatcher] Failed to start watcher:', (err instanceof Error) ? err.message : String(err));
  }

  return {
    dispose: (): void => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (watcher) {
        watcher.close();
        watcher = null;
      }
    },
  };
}
