// src/providers/kilocode/settings.ts

import type { KiloCodeSettings } from '../../core/types';

export const DEFAULT_KILOCODE_SETTINGS: KiloCodeSettings = {
  enabled: true,
  cliPath: '',
  model: '',
  apiKey: '',
  maxTabs: 3,
  chatViewPlacement: 'right-sidebar',
  locale: 'en',
  environmentVariables: {},
  autoStart: false,
  defaultModel: '',
  temperature: 0.7,
  autoSave: true,
  theme: 'auto',
  fontSize: 14,
  compactKeepRecent: 5,
  permissionMode: 'normal',
  mirrorUrl: '',
  idleTimeoutSeconds: 600,
  autoReview: false,
};

export function getKiloCodeSettings(settings: Record<string, unknown>): KiloCodeSettings {
  return {
    ...DEFAULT_KILOCODE_SETTINGS,
    ...(settings.kilocode as Partial<KiloCodeSettings> || {}),
  };
}
