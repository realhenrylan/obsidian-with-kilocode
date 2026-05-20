// src/features/settings/SettingsTab.ts

import { App, PluginSettingTab, Setting } from 'obsidian';
import type KiloCodePlugin from '../../main';

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

    // === 常规设置 ===
    containerEl.createEl('h3', { text: 'General' });

    new Setting(containerEl)
      .setName('KiloCode CLI Path')
      .setDesc('Path to KiloCode CLI executable')
      .addText(text => text
        .setPlaceholder('kilo')
        .setValue(this.plugin.settings.cliPath)
        .onChange(async (value) => {
          this.plugin.settings.cliPath = value;
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
      .setDesc('Default AI model to use')
      .addDropdown(dropdown => dropdown
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
