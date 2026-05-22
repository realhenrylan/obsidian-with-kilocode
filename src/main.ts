// src/main.ts

import { Plugin, FileSystemAdapter } from 'obsidian';
import * as path from 'path';
import { VIEW_TYPE_KILOCODE } from './core/types';
import type { KiloCodeSettings } from './core/types';
import { KiloCodeView } from './features/chat/KiloCodeView';
import { DEFAULT_SETTINGS } from './app/settings/defaultSettings';
import { ProviderRegistry } from './core/providers/ProviderRegistry';
import { createKilocodeRegistration } from './providers/kilocode/registration';
import { BinaryManager } from './core/binary/BinaryManager';
import { KiloCodeSettingTab } from './features/settings/SettingsTab';
import { readCliConfig, mergeCliConfigIntoSettings } from './core/cliConfigReader';

export default class KiloCodePlugin extends Plugin {
  settings: KiloCodeSettings = DEFAULT_SETTINGS;
  binaryManager!: BinaryManager;

  async onload() {
    await this.loadSettings();

    // 读取本机 kilo CLI 配置文件，自动填充模型（不复制 API key）
    // 插件设置中已有的值优先，CLI 配置作为 fallback
    const cliConfig = readCliConfig();
    mergeCliConfigIntoSettings(this.settings, cliConfig);
    if (cliConfig.defaultModel) {
      console.log('[KiloCode] Using CLI default model:', cliConfig.defaultModel);
    }

    // 创建 BinaryManager 并后台预加载二进制
    // manifest.dir 是相对路径，需要转为绝对路径以确保 fs 和 spawn 正常工作
    const adapter = this.app.vault.adapter;
    const vaultPath = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : '';
    const pluginDir = path.join(vaultPath, this.manifest.dir ?? '');
    this.binaryManager = new BinaryManager(pluginDir);
    this.binaryManager.preload(this.settings).catch(err => {
      console.error('[KiloCode] Binary preload failed:', err);
    });

    // 注册 Provider（传入 settings getter，确保 runtime 拿到最新的用户配置）
    ProviderRegistry.register(createKilocodeRegistration(this.binaryManager, () => this.settings));

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
    // 清理资源：flush 由 KiloCodeView.onClose() 处理
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
