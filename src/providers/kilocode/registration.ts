// src/providers/kilocode/registration.ts

import type { ProviderRegistration } from '../../core/providers/types';
import { KILOCODE_CAPABILITIES } from './capabilities';
import { KiloCodeChatRuntime } from './runtime/KiloCodeChatRuntime';
import { getKiloCodeSettings } from './settings';

export const kilocodeProviderRegistration: ProviderRegistration = {
  id: 'kilocode',
  displayName: 'KiloCode',
  capabilities: KILOCODE_CAPABILITIES,
  createRuntime: () => {
    const settings = getKiloCodeSettings({});
    return new KiloCodeChatRuntime(settings.cliPath || 'kilo');
  },
};
