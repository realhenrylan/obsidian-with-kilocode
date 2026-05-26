// src/features/settings/SettingsTab.ts

import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type KiloCodePlugin from '../../main';
import { readCliConfig, getCliConfigPath, cliHasApiKey } from '../../core/cliConfigReader';

/**
 * KiloCode 设置面板
 */
export class KiloCodeSettingTab extends PluginSettingTab {
  plugin: KiloCodePlugin;

  constructor(app: App, plugin: KiloCodePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('kilo-settings');

    containerEl.createEl('h2', { text: 'KiloCode Settings' });

    // === CLI 配置状态 ===
    containerEl.createEl('h3', { text: 'CLI Configuration' });
    const cliConfig = readCliConfig();
    const configPath = getCliConfigPath();
    const hasApiKey = cliHasApiKey();
    new Setting(containerEl)
      .setName('CLI Config File')
      .setDesc(`Path: ${configPath}`)
      .addButton(btn => btn
        .setButtonText('Reload CLI Config')
        .onClick(() => {
          const updated = readCliConfig();
          if (updated.defaultModel) {
            this.plugin.settings.defaultModel = updated.defaultModel;
          }
          // ⚠️ 不复制 apiKey——API key 只保留在 CLI 配置文件中，
          //    由 CLI 子进程自己读取，避免 vault 云同步泄露
          this.plugin.saveSettings();
          this.display();
          new Notice('CLI config reloaded and applied');
        }));

    if (cliConfig.defaultModel) {
      containerEl.createDiv({
        cls: 'kilo-setting-note',
        text: `CLI default model: ${cliConfig.defaultModel}${hasApiKey ? ' | API key: configured in CLI config' : ''}`,
      });
    } else {
      containerEl.createDiv({
        cls: 'kilo-setting-note',
        text: 'No CLI config file found. Configure model and API key below or set up kilo CLI.',
      });
    }

    // API Configuration 区域下方的安全提示
    containerEl.createDiv({
      cls: 'kilo-setting-warning',
      text: '⚠️ If you enter an API key below, it will be stored in the vault plugin data file (.obsidian/plugins/kilocode/data.json) and may be exposed if the vault is synced to cloud or Git. Prefer configuring the API key in kilo CLI config (~/.config/kilo/config.json) instead.',
    });

    // === API 配置 ===
    containerEl.createEl('h3', { text: 'API Configuration' });

    new Setting(containerEl)
      .setName('API Key')
      .setDesc('Your AI provider API key (e.g. Anthropic, OpenAI)')
      .addText(text => {
        text.inputEl.type = 'password';
        text.inputEl.style.width = '100%';
        text
          .setPlaceholder('sk-...')
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Base URL')
      .setDesc('API base URL. Leave empty for default provider endpoint.')
      .addText(text => text
        .setPlaceholder('https://api.anthropic.com')
        .setValue(this.plugin.settings.environmentVariables?.['KILO_BASE_URL'] || '')
        .onChange(async (value) => {
          if (!this.plugin.settings.environmentVariables) {
            this.plugin.settings.environmentVariables = {};
          }
          if (value) {
            this.plugin.settings.environmentVariables['KILO_BASE_URL'] = value;
          } else {
            delete this.plugin.settings.environmentVariables['KILO_BASE_URL'];
          }
          await this.plugin.saveSettings();
        }));

    // === 常规设置 ===
    containerEl.createEl('h3', { text: 'General' });

    new Setting(containerEl)
      .setName('KiloCode CLI Path')
      .setDesc('Path to KiloCode CLI executable. Leave empty for auto-detection.')
      .addText(text => text
        .setPlaceholder('kilo')
        .setValue(this.plugin.settings.cliPath)
        .onChange(async (value) => {
          this.plugin.settings.cliPath = value;
          await this.plugin.saveSettings();
        }))
      .addButton(btn => btn
        .setButtonText('Detect')
        .setTooltip('Auto-detect KiloCode CLI on your system')
        .onClick(async () => {
          btn.setDisabled(true);
          btn.setButtonText('Detecting...');
          try {
            const result = await this.plugin.binaryManager.autoDetect();
            if (result) {
              this.plugin.settings.cliPath = result.path;
              await this.plugin.saveSettings();
              new Notice('KiloCode CLI detected: ' + result.path + ' (' + result.method + ')');
              this.display();
            } else {
              new Notice('KiloCode CLI not found on your system. Download will be attempted automatically.');
            }
          } catch (err) {
            new Notice('Detection failed: ' + err.message);
          } finally {
            btn.setDisabled(false);
            btn.setButtonText('Detect');
          }
        }));

    new Setting(containerEl)
      .setName('Download Mirror URL')
      .setDesc('Custom mirror URL for downloading CLI binary. Leave empty to use npm registry.')
      .addText(text => text
        .setPlaceholder('https://registry.npmjs.org')
        .setValue(this.plugin.settings.mirrorUrl)
        .onChange(async (value) => {
          this.plugin.settings.mirrorUrl = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Auto Start')
      .setDesc('Automatically start KiloCode CLI when opening a vault')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoStart)
        .onChange(async (value) => {
          this.plugin.settings.autoStart = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Idle Timeout (seconds)')
      .setDesc('Auto-stop KiloCode CLI after this many seconds of inactivity. Set to 0 to keep the process running (not recommended \u2014 wastes tokens). Default: 600s (10 minutes).')
      .addSlider(slider => slider
        .setLimits(0, 600, 10)
        .setValue(this.plugin.settings.idleTimeoutSeconds)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.idleTimeoutSeconds = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Auto Review')
      .setDesc('After each AI response, automatically review modified files for potential issues. Uses a separate CLI process.')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoReview)
        .onChange(async (value) => {
          this.plugin.settings.autoReview = value;
          await this.plugin.saveSettings();
        }));

    // === 聊天设置 ===
    containerEl.createEl('h3', { text: 'Chat' });

    new Setting(containerEl)
      .setName('Maximum Tabs')
      .setDesc('Maximum number of chat tabs (1-10)')
      .addSlider(slider => slider
        .setLimits(1, 10, 1)
        .setValue(this.plugin.settings.maxTabs)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.maxTabs = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Auto Save')
      .setDesc('Automatically save conversation history')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoSave)
        .onChange(async (value) => {
          this.plugin.settings.autoSave = value;
          await this.plugin.saveSettings();
        }));

    // === 模型设置 ===
    containerEl.createEl('h3', { text: 'Model' });

    new Setting(containerEl)
      .setName('Default Model')
      .setDesc('AI model override. Leave as "Use CLI default" to respect the CLI\'s own model configuration.')
      .addDropdown(dropdown => dropdown
        .addOption('', 'Use CLI default')
        .addOption('claude-sonnet-4-20250514', 'Claude Sonnet 4')
        .addOption('claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet')
        .addOption('gpt-4o', 'GPT-4o')
        .setValue(this.plugin.settings.defaultModel)
        .onChange(async (value) => {
          this.plugin.settings.defaultModel = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Temperature')
      .setDesc('Model temperature (0-1)')
      .addSlider(slider => slider
        .setLimits(0, 1, 0.1)
        .setValue(this.plugin.settings.temperature)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.temperature = value;
          await this.plugin.saveSettings();
        }));

    // === 外观设置 ===
    containerEl.createEl('h3', { text: 'Appearance' });

    new Setting(containerEl)
      .setName('Theme')
      .setDesc('Color theme for KiloCode')
      .addDropdown(dropdown => dropdown
        .addOption('auto', 'Auto')
        .addOption('light', 'Light')
        .addOption('dark', 'Dark')
        .setValue(this.plugin.settings.theme)
        .onChange(async (value: string) => {
          this.plugin.settings.theme = value as 'auto' | 'light' | 'dark';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Font Size')
      .setDesc('Font size for chat messages')
      .addSlider(slider => slider
        .setLimits(12, 20, 1)
        .setValue(this.plugin.settings.fontSize)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.fontSize = value;
          await this.plugin.saveSettings();
        }));

    // === 安全设置 ===
    containerEl.createEl('h3', { text: 'Security' });

    new Setting(containerEl)
      .setName('Permission Mode')
      .setDesc('Control how AI tool calls are approved')
      .addDropdown(dropdown => dropdown
        .addOption('normal', 'Normal — approve write operations')
        .addOption('yolo', 'Yolo — auto-approve all operations')
        .addOption('plan', 'Plan — read-only, deny all writes')
        .setValue(this.plugin.settings.permissionMode)
        .onChange(async (value: string) => {
          this.plugin.settings.permissionMode = value as 'yolo' | 'normal' | 'plan';
          await this.plugin.saveSettings();
        }));
  }
}
