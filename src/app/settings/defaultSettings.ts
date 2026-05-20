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
};
