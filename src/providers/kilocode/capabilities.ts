// src/providers/kilocode/capabilities.ts

import type { ProviderCapabilities } from '../../core/providers/types';

export const KILOCODE_CAPABILITIES: ProviderCapabilities = {
  supportsPersistentRuntime: true,
  supportsNativeHistory: true,
  supportsPlanMode: true,
  supportsRewind: true,
  supportsFork: true,
  supportsImageAttachments: true,
  supportsMcpTools: true,
  reasoningControl: 'effort',
};
