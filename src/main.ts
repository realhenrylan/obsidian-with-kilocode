// src/main.ts

import { Plugin, FileSystemAdapter, Notice } from 'obsidian';
import * as path from 'path';
import { VIEW_TYPE_KILOCODE } from './core/types';
import type { KiloCodeSettings } from './core/types';
import type { ChatRuntime } from './core/providers/types';
import { KiloCodeView } from './features/chat/KiloCodeView';
import { DEFAULT_SETTINGS } from './app/settings/defaultSettings';
import { ProviderRegistry } from './core/providers/ProviderRegistry';
import { createKilocodeRegistration } from './providers/kilocode/registration';
import { BinaryManager } from './core/binary/BinaryManager';
import { KiloCodeSettingTab } from './features/settings/SettingsTab';
import { readCliConfig, mergeCliConfigIntoSettings } from './core/cliConfigReader';
import { createSkillWatcher, type SkillWatcher } from './providers/kilocode/runtime/SkillWatcher';
import { listCatalog, installSkill } from './providers/kilocode/runtime/SkillCatalog';

export default class KiloCodePlugin extends Plugin {
  settings: KiloCodeSettings = DEFAULT_SETTINGS;
  binaryManager!: BinaryManager;
  private kilocodeRuntimes: Set<ChatRuntime> = new Set();
  warmupRuntimeRef: ChatRuntime | null = null;
  private warmupTimer: ReturnType<typeof setTimeout> | null = null;
  private skillWatcher: SkillWatcher | null = null;
  private exitHandlerRegistered = false;

  private registerExitHandler(): void {
    if (this.exitHandlerRegistered) return;
    this.exitHandlerRegistered = true;
    const runtimes = this.kilocodeRuntimes;
    const getWarmup = () => this.warmupRuntimeRef;
    process.on('exit', () => {
      for (const rt of runtimes) {
        rt.killSync?.();
      }
      const warmup = getWarmup();
      if (warmup) {
        warmup.killSync?.();
      }
    });
  }

  addKilocodeRuntime(runtime: ChatRuntime): void {
    this.kilocodeRuntimes.add(runtime);
  }

  private scheduleWarmup(): void {
    if (!this.settings.autoStart) return;

    this.warmupTimer = setTimeout(() => {
      this.warmupTimer = null;
      this.doWarmup();
    }, 1000);
  }

  private async doWarmup(): Promise<void> {
    try {
      const registration = ProviderRegistry.get('kilocode');
      if (!registration) return;

      const runtime = registration.createRuntime();
      await runtime.start();
      this.warmupRuntimeRef = runtime;
    } catch (err) {
      console.warn('[KiloCode] Early warmup failed (will retry when view opens):', err);
    }
  }

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

    this.addCommand({
      id: 'list-skills',
      name: 'List available skills',
      callback: () => {
        const catalog = listCatalog();
        const skillList = catalog.map(s => `- ${s.name}: ${s.summary}`).join('\n');
        new Notice(`Available skills:\n${skillList}`, 8000);
      },
    });

    this.addCommand({
      id: 'install-skill',
      name: 'Install skill...',
      callback: () => {
        const catalog = listCatalog();
        const names = catalog.map(s => s.name);
        const adapter = this.app.vault.adapter;
        const vaultPath = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : '';
        if (!vaultPath) {
          new Notice('Cannot determine vault path');
          return;
        }
        new Notice(`Available skills: ${names.join(', ')}\nUse the "Install skill: <name>" command`, 8000);
      },
    });

    const catalog = listCatalog();
    for (const skill of catalog) {
      this.addCommand({
        id: `install-skill-${skill.name}`,
        name: `Install skill: ${skill.name}`,
        callback: () => {
          const adapter = this.app.vault.adapter;
          const vaultPath = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : '';
          if (!vaultPath) {
            new Notice('Cannot determine vault path');
            return;
          }
          const result = installSkill(vaultPath, skill.name);
          new Notice(result.message, 6000);
        },
      });
    }

    // 添加设置面板
    this.addSettingTab(new KiloCodeSettingTab(this.app, this));

    // 后台预热 CLI（autoStart=true 时有效）
    this.scheduleWarmup();

    // 启动技能文件热重载监听器
    this.skillWatcher = createSkillWatcher(vaultPath);

    // 注册同步退出清理，防止 Obsidian 关闭后子进程残留
    this.registerExitHandler();
  }

  onunload() {
    for (const rt of this.kilocodeRuntimes) {
      rt.killSync?.();
    }
    this.kilocodeRuntimes.clear();

    if (this.warmupTimer) {
      clearTimeout(this.warmupTimer);
      this.warmupTimer = null;
    }

    if (this.warmupRuntimeRef) {
      this.warmupRuntimeRef.killSync?.();
      this.warmupRuntimeRef = null;
    }

    if (this.skillWatcher) {
      this.skillWatcher.dispose();
      this.skillWatcher = null;
    }
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
