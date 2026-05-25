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
  /**
   * 所有活跃的 ChatRuntime 集合（T3.2 多 Runtime 支持）。
   * 由 KiloCodeView 在创建每个标签的 runtime 时注册，
   * onunload() 用其停止所有 kilo serve 进程兜底。
   */
  private kilocodeRuntimes: Set<ChatRuntime> = new Set();

  /**
   * 预热的 runtime 引用（autoStart=true 时在插件加载后台创建）。
   * 公开只读，供 KiloCodeView.getOrCreateRuntime() 认领。
   * 认领后此字段置为 null，后续生命周期由 View 管理。
   */
  warmupRuntimeRef: ChatRuntime | null = null;

  /** 预热定时器，onunload 时清理 */
  private warmupTimer: ReturnType<typeof setTimeout> | null = null;

  /** 技能文件热重载监听器，onunload 时清理 */
  private skillWatcher: SkillWatcher | null = null;

  /** 注册 runtime 到插件生命周期管理 */
  addKilocodeRuntime(runtime: ChatRuntime): void {
    this.kilocodeRuntimes.add(runtime);
  }

  /**
   * 后台预热 CLI 进程（fire-and-forget）。
   * 延迟 1 秒后执行，确保不阻塞插件初始化流程。
   * 仅在 autoStart=true 时执行，避免未使用插件时浪费资源。
   */
  private scheduleWarmup(): void {
    if (!this.settings.autoStart) return;

    // 延迟 1 秒，让插件初始化先完成（注册视图、命令、设置面板等）
    this.warmupTimer = setTimeout(() => {
      this.warmupTimer = null;
      this.doWarmup();
    }, 1000);
  }

  /**
   * 实际预热逻辑：创建 runtime 并启动 CLI 进程。
   * 静默处理所有异常，预热失败不影响用户体验（View 打开时 handleSend 会重试）。
   */
  private async doWarmup(): Promise<void> {
    try {
      const registration = ProviderRegistry.get('kilocode');
      if (!registration) return;

      const runtime = registration.createRuntime();
      await runtime.start();
      this.warmupRuntimeRef = runtime;
    } catch (err) {
      // 预热失败静默处理：View 打开后的 handleSend() 中会正常创建 runtime 并报错
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
        // 显示可用技能，用户通过 Notice 查看
        new Notice(`Available skills: ${names.join(', ')}\nUse the "Install skill: <name>" command`, 8000);
      },
    });

    // 为每个编目技能添加单独的安装命令
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
    // 监听 .kilo/skills/ 目录的变更，自动使技能缓存失效，
    // 让用户编辑 SKILL.md 后立即生效，无需重启 Obsidian
    this.skillWatcher = createSkillWatcher(vaultPath);
  }

  onunload() {
    // 兜底清理：KiloCodeView.onClose() 可能因 Obsidian 强制关闭未能执行，
    // 此处停止所有已注册的 runtime 以杀死 kilo serve 子进程
    for (const rt of this.kilocodeRuntimes) {
      rt.stop().catch(() => {});
    }
    this.kilocodeRuntimes.clear();

    // 取消未执行的预热定时器
    if (this.warmupTimer) {
      clearTimeout(this.warmupTimer);
      this.warmupTimer = null;
    }

    // 停止未被 View 认领的预热 runtime
    if (this.warmupRuntimeRef) {
      this.warmupRuntimeRef.stop();
      this.warmupRuntimeRef = null;
    }

    // 停止技能文件监听器
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
