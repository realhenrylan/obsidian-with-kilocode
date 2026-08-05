/**
 * @jest-environment jsdom
 */

// tests/features/settings/SettingsTab.test.ts
// KiloCodeSettingTab 行为测试（Phase 1 安全网）：
// 1. 每个设置项 onChange → plugin.saveSettings()
// 2. Detect 按钮成功/失败两条路径
// 3. @phase3 缺失设置项失败测试（Red）：locale 选择器 / compactKeepRecent
//    当前 SettingsTab 无这两项，Phase 3（i18n §5.1 / 设置项 §5.5）实现后转 Green

import { KiloCodeSettingTab } from '../../../src/features/settings/SettingsTab';
import { polyfillObsidianDOM } from '../../helpers/obsidianDom';
import { createMockApp } from '../../helpers/factory';

// ─── obsidian mock（hoisted：不引用外部变量，实例通过类静态数组访问） ───

let mockNoticeMessages: string[] = [];

jest.mock('obsidian', () => {
  class TextComponent {
    inputEl: HTMLInputElement;
    private onChangeCb: ((v: string) => void) | null = null;
    constructor() {
      this.inputEl = document.createElement('input');
    }
    setPlaceholder() { return this; }
    setValue() { return this; }
    onChange(cb: (v: string) => void) { this.onChangeCb = cb; return this; }
    /** 测试辅助：触发 onChange */
    triggerChange(v: string) { this.onChangeCb?.(v); }
  }

  class ButtonComponent {
    private onClickCb: (() => void) | null = null;
    setButtonText() { return this; }
    setTooltip() { return this; }
    setDisabled() { return this; }
    onClick(cb: () => void) { this.onClickCb = cb; return this; }
    /** 测试辅助：触发 onClick（async 回调时返回 Promise 供 await） */
    triggerClick() { return this.onClickCb?.(); }
  }

  class DropdownComponent {
    private onChangeCb: ((v: string) => void) | null = null;
    addOption() { return this; }
    setValue() { return this; }
    onChange(cb: (v: string) => void) { this.onChangeCb = cb; return this; }
    /** 测试辅助：触发 onChange */
    triggerChange(v: string) { this.onChangeCb?.(v); }
  }

  class SliderComponent {
    private onChangeCb: ((v: number) => void) | null = null;
    setLimits() { return this; }
    setValue() { return this; }
    setDynamicTooltip() { return this; }
    onChange(cb: (v: number) => void) { this.onChangeCb = cb; return this; }
    /** 测试辅助：触发 onChange */
    triggerChange(v: number) { this.onChangeCb?.(v); }
  }

  class ToggleComponent {
    private onChangeCb: ((v: boolean) => void) | null = null;
    setValue() { return this; }
    onChange(cb: (v: boolean) => void) { this.onChangeCb = cb; return this; }
    /** 测试辅助：触发 onChange */
    triggerChange(v: boolean) { this.onChangeCb?.(v); }
  }

  class Setting {
    static instances: Setting[] = [];
    name = '';
    desc = '';
    components: any[] = [];
    constructor(public containerEl: HTMLElement) {
      Setting.instances.push(this);
    }
    setName(n: string) { this.name = n; return this; }
    setDesc(d: string) { this.desc = d; return this; }
    addText(cb: (c: TextComponent) => void) {
      const c = new TextComponent(); cb(c); this.components.push(c); return this;
    }
    addButton(cb: (c: ButtonComponent) => void) {
      const c = new ButtonComponent(); cb(c); this.components.push(c); return this;
    }
    addDropdown(cb: (c: DropdownComponent) => void) {
      const c = new DropdownComponent(); cb(c); this.components.push(c); return this;
    }
    addSlider(cb: (c: SliderComponent) => void) {
      const c = new SliderComponent(); cb(c); this.components.push(c); return this;
    }
    addToggle(cb: (c: ToggleComponent) => void) {
      const c = new ToggleComponent(); cb(c); this.components.push(c); return this;
    }
  }

  class PluginSettingTab {
    app: any;
    plugin: any;
    containerEl: HTMLElement;
    constructor(app: any, plugin: any) {
      this.app = app;
      this.plugin = plugin;
      this.containerEl = document.createElement('div');
    }
  }

  class Notice {
    message: string;
    constructor(message: string, _timeout?: number) {
      this.message = message;
      mockNoticeMessages.push(message);
    }
  }

  return { Setting, PluginSettingTab, Notice };
});

// ─── 测试辅助 ───

import { Setting } from 'obsidian';

function findSetting(name: string): any {
  return (Setting as any).instances.find((s: any) => s.name === name);
}

function findComponent(setting: any, type: string): any {
  return setting.components.find((c: any) => c.constructor.name === type);
}

// ─── setup ───

describe('KiloCodeSettingTab', () => {
  let tab: KiloCodeSettingTab;
  let plugin: any;

  function createTab(): KiloCodeSettingTab {
    return new KiloCodeSettingTab(createMockApp(), plugin);
  }

  beforeAll(() => {
    polyfillObsidianDOM();
  });

  beforeEach(() => {
    mockNoticeMessages = [];
    (Setting as any).instances = [];
    plugin = {
      settings: {
        apiKey: '',
        cliPath: '',
        mirrorUrl: '',
        autoStart: false,
        maxTabs: 3,
        autoSave: true,
        defaultModel: '',
        temperature: 0.7,
        theme: 'auto',
        fontSize: 14,
        permissionMode: 'normal',
        environmentVariables: {},
        compactKeepRecent: 5,
        locale: 'en',
      },
      app: createMockApp(),
      saveSettings: jest.fn(),
      binaryManager: {
        autoDetect: jest.fn(),
      },
    } as any;
    tab = createTab();
    tab.display();
  });

  // ─── 设置项 onChange → saveSettings ─────────────────────

  describe('设置项 onChange', () => {
    test('API Key onChange 更新设置并保存', () => {
      const setting = findSetting('API Key');
      expect(setting).toBeDefined();
      findComponent(setting, 'TextComponent').triggerChange('sk-test-123');
      expect(plugin.settings.apiKey).toBe('sk-test-123');
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    test('Base URL onChange 写入环境变量并保存', () => {
      const setting = findSetting('Base URL');
      findComponent(setting, 'TextComponent').triggerChange('https://api.example.com');
      expect(plugin.settings.environmentVariables['KILO_BASE_URL']).toBe('https://api.example.com');
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    test('CLI Path onChange 更新设置并保存', () => {
      const setting = findSetting('KiloCode CLI Path');
      findComponent(setting, 'TextComponent').triggerChange('/usr/local/bin/kilo');
      expect(plugin.settings.cliPath).toBe('/usr/local/bin/kilo');
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    test('Mirror URL onChange 更新设置并保存', () => {
      const setting = findSetting('Download Mirror URL');
      findComponent(setting, 'TextComponent').triggerChange('https://mirror.example.com');
      expect(plugin.settings.mirrorUrl).toBe('https://mirror.example.com');
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    test('Auto Start toggle 更新设置并保存', () => {
      const setting = findSetting('Auto Start');
      findComponent(setting, 'ToggleComponent').triggerChange(true);
      expect(plugin.settings.autoStart).toBe(true);
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    test('Maximum Tabs slider 更新设置并保存', () => {
      const setting = findSetting('Maximum Tabs');
      findComponent(setting, 'SliderComponent').triggerChange(5);
      expect(plugin.settings.maxTabs).toBe(5);
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    test('Auto Save toggle 更新设置并保存', () => {
      const setting = findSetting('Auto Save');
      findComponent(setting, 'ToggleComponent').triggerChange(false);
      expect(plugin.settings.autoSave).toBe(false);
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    test('Default Model dropdown 更新设置并保存', () => {
      const setting = findSetting('Default Model');
      findComponent(setting, 'DropdownComponent').triggerChange('gpt-4o');
      expect(plugin.settings.defaultModel).toBe('gpt-4o');
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    test('Temperature slider 更新设置并保存', () => {
      const setting = findSetting('Temperature');
      findComponent(setting, 'SliderComponent').triggerChange(0.3);
      expect(plugin.settings.temperature).toBe(0.3);
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    test('Theme dropdown 更新设置并保存', () => {
      const setting = findSetting('Theme');
      findComponent(setting, 'DropdownComponent').triggerChange('dark');
      expect(plugin.settings.theme).toBe('dark');
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    test('Font Size slider 更新设置并保存', () => {
      const setting = findSetting('Font Size');
      findComponent(setting, 'SliderComponent').triggerChange(16);
      expect(plugin.settings.fontSize).toBe(16);
      expect(plugin.saveSettings).toHaveBeenCalled();
    });

    test('Permission Mode dropdown 更新设置并保存', () => {
      const setting = findSetting('Permission Mode');
      findComponent(setting, 'DropdownComponent').triggerChange('yolo');
      expect(plugin.settings.permissionMode).toBe('yolo');
      expect(plugin.saveSettings).toHaveBeenCalled();
    });
  });

  // ─── Detect 按钮 ───────────────────────────────────────

  describe('Detect 按钮', () => {
    test('检测成功：更新 cliPath 并保存', async () => {
      plugin.binaryManager.autoDetect.mockResolvedValue({
        path: '/detected/kilo',
        method: 'system-path',
      });

      const setting = findSetting('KiloCode CLI Path');
      await findComponent(setting, 'ButtonComponent').triggerClick();

      expect(plugin.settings.cliPath).toBe('/detected/kilo');
      expect(plugin.saveSettings).toHaveBeenCalled();
      expect(mockNoticeMessages.some(m => m.includes('KiloCode CLI detected'))).toBe(true);
    });

    test('检测失败：提示未找到且不改动 cliPath', async () => {
      plugin.binaryManager.autoDetect.mockResolvedValue(null);

      const setting = findSetting('KiloCode CLI Path');
      await findComponent(setting, 'ButtonComponent').triggerClick();

      expect(plugin.settings.cliPath).toBe('');
      expect(mockNoticeMessages.some(m => m.includes('not found'))).toBe(true);
    });

    test('检测异常：提示失败信息', async () => {
      plugin.binaryManager.autoDetect.mockRejectedValue(new Error('boom'));

      const setting = findSetting('KiloCode CLI Path');
      await findComponent(setting, 'ButtonComponent').triggerClick();

      expect(mockNoticeMessages.some(m => m.includes('Detection failed: boom'))).toBe(true);
    });
  });

  // ─── @phase3 缺失设置项（Red 测试，Phase 3 转 Green） ───

  describe('缺失设置项（@phase3 驱动）', () => {
    test('应存在 Language 设置项（locale 选择器）', () => {
      // Phase 3 §5.1 在 General 段加语言下拉；当前不存在 → 本测试失败（Red）
      const setting = findSetting('Language');
      expect(setting).toBeDefined();
      expect(findComponent(setting, 'DropdownComponent')).toBeDefined();
    });

    test('应存在 Compact Keep Recent 设置项', () => {
      // Phase 3 §5.5 在 Chat 段加 slider；当前不存在 → 本测试失败（Red）
      const setting = findSetting('Compact Keep Recent');
      expect(setting).toBeDefined();
      expect(findComponent(setting, 'SliderComponent')).toBeDefined();
    });
  });
});
