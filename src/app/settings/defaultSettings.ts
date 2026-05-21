// src/app/settings/defaultSettings.ts

import type { KiloCodeSettings } from '../../core/types';

export const DEFAULT_SETTINGS: KiloCodeSettings = {
  enabled: true,
  cliPath: '',
  model: 'kilo-1',
  apiKey: '',
  maxTabs: 3,
  chatViewPlacement: 'right-sidebar',
  locale: 'en',
  environmentVariables: {},
  autoStart: false,
  defaultModel: 'claude-sonnet-4-20250514',
  temperature: 0.7,
  autoSave: true,
  theme: 'auto',
  fontSize: 14,
  compactKeepRecent: 5,
  permissionMode: 'normal',
  mirrorUrl: '',
};
