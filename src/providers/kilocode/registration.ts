import type { ProviderRegistration } from '../../core/providers/types';
import type { KiloCodeSettings } from '../../core/types';
import { KILOCODE_CAPABILITIES } from './capabilities';
import { KiloCodeChatRuntime, type McpConfigProvider } from './runtime/KiloCodeChatRuntime';
import type { BinaryManager } from '../../core/binary/BinaryManager';

/**
 * 创建 kilocode Provider 注册信息。
 * 接收 BinaryManager 引用和 settings getter，传递给 Runtime 用于懒解析 CLI 路径和注入 API Key。
 * mcpConfigProvider：读取插件级 MCP 配置（vault/.kilocode/mcp.json）透传给 kilo serve。
 */
export function createKilocodeRegistration(
  binaryManager: BinaryManager,
  getSettings: () => KiloCodeSettings,
  mcpConfigProvider?: McpConfigProvider,
): ProviderRegistration {
  return {
    id: 'kilocode',
    displayName: 'KiloCode',
    capabilities: KILOCODE_CAPABILITIES,
    createRuntime: () => {
      return new KiloCodeChatRuntime(binaryManager, getSettings, mcpConfigProvider);
    },
  };
}
