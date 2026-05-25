// src/app/settings/defaultSettings.ts

import type { KiloCodeSettings } from '../../core/types';

export const DEFAULT_SETTINGS: KiloCodeSettings = {
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
