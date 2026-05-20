// src/main.ts

import { Plugin } from 'obsidian';
import { VIEW_TYPE_KILOCODE } from './core/types';
import type { KiloCodeSettings } from './core/types';
import { KiloCodeView } from './features/chat/KiloCodeView';
import { DEFAULT_SETTINGS } from './app/settings/defaultSettings';
import { ProviderRegistry } from './core/providers/ProviderRegistry';
import { kilocodeProviderRegistration } from './providers/kilocode/registration';
import { KiloCodeSettingTab } from './features/settings/SettingsTab';

export default class KiloCodePlugin extends Plugin {
  settings: KiloCodeSettings = DEFAULT_SETTINGS;

  async onload() {
    await this.loadSettings();

    // 注册 Provider
    ProviderRegistry.register(kilocodeProviderRegistration);

    // 注册视图
    this.registerView(
      VIEW_TYPE_KILOCODE,
      (leaf) => new KiloCodeView(leaf, this)
    );

    // 添加功能区图标
    this.addRibbonIcon('bot', 'Open KiloCode', () => {
      this.activateView();
    });

    // 添加命令
    this.addCommand({
      id: 'open-view',
      name: 'Open chat view',
      callback: () => {
        this.activateView();
      },
    });

    // 添加设置面板
    this.addSettingTab(new KiloCodeSettingTab(this.app, this));
  }

  onunload() {
    // 清理资源
  }

  async loadSettings() {
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(await this.loadData()),
    };
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_KILOCODE)[0];

    if (!leaf) {
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        leaf = rightLeaf;
        await leaf.setViewState({
          type: VIEW_TYPE_KILOCODE,
          active: true,
        });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }
}
