// src/providers/kilocode/settings.ts

import type { KiloCodeSettings } from '../../core/types';

export const DEFAULT_KILOCODE_SETTINGS: KiloCodeSettings = {
  enabled: true,
  cliPath: '',
  model: 'kilo-1',
  apiKey: '',
  maxTabs: 3,
  chatViewPlacement: 'right-sidebar',
  locale: 'en',
  environmentVariables: {},
};

export function getKiloCodeSettings(settings: Record<string, unknown>): KiloCodeSettings {
  return {
    ...DEFAULT_KILOCODE_SETTINGS,
    ...(settings.kilocode as Partial<KiloCodeSettings> || {}),
  };
}
