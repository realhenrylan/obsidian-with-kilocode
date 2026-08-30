// tests/helpers/factory.ts
// 测试工厂：构造 mock app / plugin / runtime，供各测试文件复用。
// 与 tests/__mocks__/obsidian.ts 的区别：这里是 jsdom 测试内使用的工厂函数，
// 通过 jest.mock('obsidian') 本地替换模块后再构造真实组件。

import { DEFAULT_SETTINGS } from '../../src/app/settings/defaultSettings';
import type { KiloCodeSettings } from '../../src/core/types';
import type { ChatRuntime } from '../../src/core/providers/types';

/** 构造 mock Obsidian App（vault.adapter 全部 jest.fn） */
export function createMockApp(overrides: Record<string, unknown> = {}) {
  const adapter = {
    exists: jest.fn().mockResolvedValue(false),
    mkdir: jest.fn().mockResolvedValue(undefined),
    read: jest.fn().mockResolvedValue('[]'),
    write: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    list: jest.fn().mockResolvedValue({ files: [] }),
  };
  return {
    vault: {
      adapter,
      getRoot: () => ({ path: '/vault' }),
    },
    workspace: {
      getActiveViewOfType: jest.fn().mockReturnValue(null),
    },
    ...overrides,
  } as any;
}

/** 构造 mock 插件对象（settings 默认值 + 常用方法 jest.fn） */
export function createMockPlugin(settingsOverrides: Partial<KiloCodeSettings> = {}) {
  return {
    settings: { ...DEFAULT_SETTINGS, ...settingsOverrides },
    app: createMockApp(),
    saveSettings: jest.fn(),
    addCommand: jest.fn(),
    // runtime 生命周期相关（KiloCodeView warmup / getOrCreateRuntime 依赖）
    binaryManager: { isReady: jest.fn(() => false), preload: jest.fn() },
    addKilocodeRuntime: jest.fn(),
    warmupRuntimeRef: null,
  } as any;
}

/** 构造 mock ChatRuntime（sendMessage 默认返回空流） */
export function createMockRuntime(overrides: Partial<ChatRuntime> = {}): ChatRuntime {
  return {
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    cancel: jest.fn(),
    resetSession: jest.fn(),
    sendMessage: jest.fn().mockImplementation(async function* () {}),
    sendApproval: jest.fn(),
    setModel: jest.fn(),
    getModel: jest.fn(),
    ...overrides,
  } as any;
}
