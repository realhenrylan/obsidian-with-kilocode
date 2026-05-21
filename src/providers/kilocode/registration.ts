import type { ProviderRegistration } from '../../core/providers/types';
import { KILOCODE_CAPABILITIES } from './capabilities';
import { KiloCodeChatRuntime } from './runtime/KiloCodeChatRuntime';
import { getKiloCodeSettings } from './settings';
import type { BinaryManager } from '../../core/binary/BinaryManager';

/**
 * 创建 kilocode Provider 注册信息。
 * 接收 BinaryManager 引用，传递给 Runtime 用于懒解析 CLI 路径。
 */
export function createKilocodeRegistration(binaryManager: BinaryManager): ProviderRegistration {
  return {
    id: 'kilocode',
    displayName: 'KiloCode',
    capabilities: KILOCODE_CAPABILITIES,
    createRuntime: () => {
      const settings = getKiloCodeSettings({});
      return new KiloCodeChatRuntime(binaryManager, settings);
    },
  };
}
