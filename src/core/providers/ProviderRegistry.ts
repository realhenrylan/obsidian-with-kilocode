// src/core/providers/ProviderRegistry.ts

import type { ProviderId, ProviderRegistration } from './types';

/**
 * Provider 注册表
 * 管理所有 AI Provider 的注册和获取
 */
export class ProviderRegistry {
  private static providers = new Map<ProviderId, ProviderRegistration>();

  /** 注册 Provider */
  static register(provider: ProviderRegistration): void {
    ProviderRegistry.providers.set(provider.id, provider);
  }

  /** 获取 Provider */
  static get(id: ProviderId): ProviderRegistration | undefined {
    return ProviderRegistry.providers.get(id);
  }

  /** 获取所有已注册的 Provider */
  static getAll(): ProviderRegistration[] {
    return Array.from(ProviderRegistry.providers.values());
  }

  /** 检查 Provider 是否已注册 */
  static has(id: ProviderId): boolean {
    return ProviderRegistry.providers.has(id);
  }

  /** 获取默认 Provider */
  static getDefault(): ProviderRegistration {
    const provider = ProviderRegistry.providers.get('kilocode');
    if (!provider) {
      throw new Error('Default provider "kilocode" not registered');
    }
    return provider;
  }
}
