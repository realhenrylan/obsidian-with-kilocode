import * as fs from 'fs';
import * as path from 'path';
import { invalidateSkillsCache } from './SkillLoader';

export interface SkillWatcher {
  dispose(): void;
}

export function createSkillWatcher(vaultPath: string): SkillWatcher {
  const skillsDir = path.join(vaultPath, '.kilo', 'skills');

  let watcher: fs.FSWatcher | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const invalidateAfterDebounce = (): void => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      invalidateSkillsCache();
    }, 300);
  };

  try {
    if (!fs.existsSync(skillsDir)) {
      fs.mkdirSync(skillsDir, { recursive: true });
    }

    watcher = fs.watch(skillsDir, { recursive: true }, (eventType, filename) => {
      if (!filename) {
        invalidateAfterDebounce();
        return;
      }

      const filenameStr = filename.toString();
      if (filenameStr.endsWith('SKILL.md') || filenameStr.endsWith('/') || filenameStr.endsWith('\\')) {
        invalidateAfterDebounce();
        return;
      }

      invalidateAfterDebounce();
    });
  } catch (err) {
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
