// src/features/settings/SettingsTab.ts

import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import type { SettingDefinitionItem, SettingDefinitionGroup, SettingDefinitionRender } from 'obsidian';
import type KiloCodePlugin from '../../main';
import { readCliConfig, getCliConfigPath, cliHasApiKey } from '../../core/cliConfigReader';
import { t, setLocale, type Locale } from '../../i18n';

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

    containerEl.createEl('h2', { text: t('settings.title') });

    // === CLI 配置状态 ===
    containerEl.createEl('h3', { text: t('settings.cliConfigFile') });
    const cliConfig = readCliConfig();
    const configPath = getCliConfigPath();
    const hasApiKey = cliHasApiKey();
    new Setting(containerEl)
      .setName(t('settings.cliConfigFile'))
      .setDesc(t('settings.cliConfigFileDesc', { path: configPath }))
      .addButton(btn => btn
        .setButtonText(t('settings.reloadCliConfig'))
        .onClick(() => {
          const updated = readCliConfig();
          if (updated.defaultModel) {
            this.plugin.settings.defaultModel = updated.defaultModel;
          }
          // ⚠️ 不复制 apiKey——API key 只保留在 CLI 配置文件中，
          //    由 CLI 子进程自己读取，避免 vault 云同步泄露
          void this.plugin.saveSettings();
          this.display();
          new Notice(t('settings.cliConfigReloaded'));
        }));

    if (cliConfig.defaultModel) {
      containerEl.createDiv({
        cls: 'kilo-setting-note',
        text: t('settings.cliDefaultModel', { model: cliConfig.defaultModel }) + (hasApiKey ? t('settings.cliApiKeyConfigured') : ''),
      });
    } else {
      containerEl.createDiv({
        cls: 'kilo-setting-note',
        text: t('settings.noCliConfig'),
      });
    }

    // API Configuration 区域下方的安全提示
    containerEl.createDiv({
      cls: 'kilo-setting-warning',
      text: t('settings.apiKeyWarning'),
    });

    // === API 配置 ===
    containerEl.createEl('h3', { text: t('settings.apiKey') });

    new Setting(containerEl)
      .setName(t('settings.apiKey'))
      .setDesc(t('settings.apiKeyDesc'))
      .addText(text => {
        text.inputEl.type = 'password';
        text.inputEl.setCssStyles({ width: '100%' });
        text
          .setPlaceholder('sk-...')
          .setValue(this.plugin.settings.apiKey)
          .onChange(async (value) => {
            this.plugin.settings.apiKey = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t('settings.baseUrl'))
      .setDesc(t('settings.baseUrlDesc'))
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
    containerEl.createEl('h3', { text: t('settings.general') });

    new Setting(containerEl)
      .setName(t('settings.language'))
      .setDesc(t('settings.languageDesc'))
      .addDropdown(dropdown => dropdown
        .addOption('en', 'English')
        .addOption('zh', '中文')
        .addOption('ja', '日本語')
        .addOption('ko', '한국어')
        .setValue(this.plugin.settings.locale)
        .onChange(async (value: string) => {
          this.plugin.settings.locale = value as Locale;
          setLocale(value as Locale);
          await this.plugin.saveSettings();
          new Notice(t('settings.languageChanged'));
        }));

    new Setting(containerEl)
      .setName(t('settings.cliPath'))
      .setDesc(t('settings.cliPathDesc'))
      .addText(text => text
        .setPlaceholder('kilo')
        .setValue(this.plugin.settings.cliPath)
        .onChange(async (value) => {
          this.plugin.settings.cliPath = value;
          await this.plugin.saveSettings();
        }))
      .addButton(btn => btn
        .setButtonText(t('settings.detect'))
        .setTooltip('Auto-detect KiloCode CLI on your system')
        .onClick(async () => {
          btn.setDisabled(true);
          btn.setButtonText(t('settings.detect') + '...');
          try {
            const result = await this.plugin.binaryManager.autoDetect();
            if (result) {
              this.plugin.settings.cliPath = result.path;
              await this.plugin.saveSettings();
              new Notice(t('settings.detected', { path: result.path, method: result.method }));
              this.display();
            } else {
              new Notice(t('settings.notFound'));
            }
          } catch (err) {
            new Notice(t('settings.detectionFailed', { error: err instanceof Error ? err.message : String(err) }));
          } finally {
            btn.setDisabled(false);
            btn.setButtonText('Detect');
          }
        }));

    new Setting(containerEl)
      .setName(t('settings.mirrorUrl'))
      .setDesc(t('settings.mirrorUrlDesc'))
      .addText(text => text
        .setPlaceholder('https://registry.npmjs.org')
        .setValue(this.plugin.settings.mirrorUrl)
        .onChange(async (value) => {
          this.plugin.settings.mirrorUrl = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t('settings.autoStart'))
      .setDesc(t('settings.autoStartDesc'))
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
    containerEl.createEl('h3', { text: t('settings.chat') });

    new Setting(containerEl)
      .setName(t('settings.maxTabs'))
      .setDesc(t('settings.maxTabsDesc'))
      .addSlider(slider => slider
        .setLimits(1, 10, 1)
        .setValue(this.plugin.settings.maxTabs)
        .onChange(async (value) => {
          this.plugin.settings.maxTabs = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t('settings.autoSave'))
      .setDesc(t('settings.autoSaveDesc'))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoSave)
        .onChange(async (value) => {
          this.plugin.settings.autoSave = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName(t('settings.compactKeepRecent'))
      .setDesc(t('settings.compactKeepRecentDesc'))
      .addSlider(slider => slider
        .setLimits(1, 20, 1)
        .setValue(this.plugin.settings.compactKeepRecent)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.compactKeepRecent = value;
          await this.plugin.saveSettings();
        }));

    // === 模型设置 ===
    containerEl.createEl('h3', { text: t('settings.model') });

    new Setting(containerEl)
      .setName(t('settings.defaultModel'))
      .setDesc(t('settings.defaultModelDesc'))
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
      .setName(t('settings.temperature'))
      .setDesc(t('settings.temperatureDesc'))
      .addSlider(slider => slider
        .setLimits(0, 1, 0.1)
        .setValue(this.plugin.settings.temperature)
        .onChange(async (value) => {
          this.plugin.settings.temperature = value;
          await this.plugin.saveSettings();
        }));

    // === 外观设置 ===
    containerEl.createEl('h3', { text: t('settings.appearance') });

    new Setting(containerEl)
      .setName(t('settings.theme'))
      .setDesc(t('settings.themeDesc'))
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
      .setName(t('settings.fontSize'))
      .setDesc(t('settings.fontSizeDesc'))
      .addSlider(slider => slider
        .setLimits(12, 20, 1)
        .setValue(this.plugin.settings.fontSize)
        .onChange(async (value) => {
          this.plugin.settings.fontSize = value;
          await this.plugin.saveSettings();
        }));

    // === 安全设置 ===
    containerEl.createEl('h3', { text: t('settings.permissionMode') });

    new Setting(containerEl)
      .setName(t('settings.permissionMode'))
      .setDesc(t('settings.permissionModeDesc'))
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

  /**
   * Provides setting definitions for Obsidian 1.13.0+ declarative settings API.
   * Supersedes the deprecated display() method.
   */
  getSettingDefinitions(): SettingDefinitionItem[] {
    const cliConfig = readCliConfig();
    const configPath = getCliConfigPath();
    const hasApiKey = cliHasApiKey();
    const vaultConfigDir = this.app.vault.configDir;

    const result: SettingDefinitionItem[] = [];

    // ── CLI Configuration ──
    const cliGroup: SettingDefinitionGroup = {
      type: 'group',
      heading: 'CLI Configuration',
      items: [],
    };

    // CLI Config File — button to reload
    cliGroup.items!.push({
      name: 'CLI Config File',
      desc: `Path: ${configPath}`,
      render: (setting) => {
        setting.addButton(btn => btn
          .setButtonText('Reload CLI Config')
          .onClick(() => {
            const updated = readCliConfig();
            if (updated.defaultModel) {
              this.plugin.settings.defaultModel = updated.defaultModel;
            }
            void this.plugin.saveSettings();
            this.update();
            new Notice('CLI config reloaded and applied');
          }));
      },
    } as SettingDefinitionRender);

    // CLI status note
    if (cliConfig.defaultModel) {
      cliGroup.items!.push({
        name: `CLI default model: ${cliConfig.defaultModel}${hasApiKey ? ' | API key: configured in CLI config' : ''}`,
        render: () => {},
      } as SettingDefinitionRender);
    } else {
      cliGroup.items!.push({
        name: 'No CLI config file found',
        desc: 'Configure model and API key below or set up kilo CLI.',
        render: () => {},
      } as SettingDefinitionRender);
    }

    // API key warning
    cliGroup.items!.push({
      name: '⚠️ Security Notice',
      desc: `API key stored in ${vaultConfigDir}/plugins/kilocode/data.json may be exposed if vault is synced. Prefer configuring API key in kilo CLI config instead.`,
      render: () => {},
    } as SettingDefinitionRender);

    result.push(cliGroup);

    // ── API Configuration ──
    const apiGroup: SettingDefinitionGroup = {
      type: 'group',
      heading: 'API Configuration',
      items: [
        {
          name: 'API Key',
          desc: 'Your AI provider API key (e.g. Anthropic, OpenAI)',
          render: (setting) => {
            setting.addText(text => {
              text.inputEl.type = 'password';
              text.inputEl.setCssStyles({ width: '100%' });
              text
                .setPlaceholder('sk-...')
                .setValue(this.plugin.settings.apiKey)
                .onChange(async (value) => {
                  this.plugin.settings.apiKey = value;
                  await this.plugin.saveSettings();
                });
            });
          },
        } as SettingDefinitionRender,
        {
          name: 'Base URL',
          desc: 'API base URL. Leave empty for default provider endpoint.',
          render: (setting) => {
            setting.addText(text => text
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
          },
        } as SettingDefinitionRender,
      ],
    };
    result.push(apiGroup);

    // ── Basic ──
    const basicGroup: SettingDefinitionGroup = {
      type: 'group',
      heading: 'Basic',
      items: [
        {
          name: 'KiloCode CLI Path',
          desc: 'Path to KiloCode CLI executable. Leave empty for auto-detection.',
          render: (setting) => {
            setting.addText(text => text
              .setPlaceholder('kilo')
              .setValue(this.plugin.settings.cliPath)
              .onChange(async (value) => {
                this.plugin.settings.cliPath = value;
                await this.plugin.saveSettings();
              }));
            setting.addButton(btn => btn
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
                    this.update();
                  } else {
                    new Notice('KiloCode CLI not found on your system. Download will be attempted automatically.');
                  }
                } catch (err) {
                  new Notice('Detection failed: ' + (err instanceof Error ? err.message : String(err)));
                } finally {
                  btn.setDisabled(false);
                  btn.setButtonText('Detect');
                }
              }));
          },
        } as SettingDefinitionRender,
        {
          name: 'Auto Start',
          desc: 'Automatically start KiloCode CLI when opening a vault',
          render: (setting) => {
            setting.addToggle(toggle => toggle
              .setValue(this.plugin.settings.autoStart)
              .onChange(async (value) => {
                this.plugin.settings.autoStart = value;
                await this.plugin.saveSettings();
              }));
          },
        } as SettingDefinitionRender,
        {
          name: 'Idle Timeout (seconds)',
          desc: 'Auto-stop KiloCode CLI after inactivity. Set to 0 to keep running. Default: 600s (10 min).',
          render: (setting) => {
            setting.addSlider(slider => slider
              .setLimits(0, 600, 10)
              .setValue(this.plugin.settings.idleTimeoutSeconds)
              .onChange(async (value) => {
                this.plugin.settings.idleTimeoutSeconds = value;
                await this.plugin.saveSettings();
              }));
          },
        } as SettingDefinitionRender,
        {
          name: 'Auto Review',
          desc: 'After each AI response, automatically review modified files for issues.',
          render: (setting) => {
            setting.addToggle(toggle => toggle
              .setValue(this.plugin.settings.autoReview)
              .onChange(async (value) => {
                this.plugin.settings.autoReview = value;
                await this.plugin.saveSettings();
              }));
          },
        } as SettingDefinitionRender,
      ],
    };
    result.push(basicGroup);

    // ── Chat ──
    const chatGroup: SettingDefinitionGroup = {
      type: 'group',
      heading: 'Chat',
      items: [
        {
          name: 'Maximum Tabs',
          desc: 'Maximum number of chat tabs (1-10)',
          render: (setting) => {
            setting.addSlider(slider => slider
              .setLimits(1, 10, 1)
              .setValue(this.plugin.settings.maxTabs)
              .onChange(async (value) => {
                this.plugin.settings.maxTabs = value;
                await this.plugin.saveSettings();
              }));
          },
        } as SettingDefinitionRender,
        {
          name: 'Auto Save',
          desc: 'Automatically save conversation history',
          render: (setting) => {
            setting.addToggle(toggle => toggle
              .setValue(this.plugin.settings.autoSave)
              .onChange(async (value) => {
                this.plugin.settings.autoSave = value;
                await this.plugin.saveSettings();
              }));
          },
        } as SettingDefinitionRender,
      ],
    };
    result.push(chatGroup);

    // ── Model ──
    const modelGroup: SettingDefinitionGroup = {
      type: 'group',
      heading: 'Model',
      items: [
        {
          name: 'Default Model',
          desc: 'AI model override. Leave as "Use CLI default" to respect CLI model config.',
          render: (setting) => {
            setting.addDropdown(dropdown => dropdown
              .addOption('', 'Use CLI default')
              .addOption('claude-sonnet-4-20250514', 'Claude Sonnet 4')
              .addOption('claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet')
              .addOption('gpt-4o', 'GPT-4o')
              .setValue(this.plugin.settings.defaultModel)
              .onChange(async (value) => {
                this.plugin.settings.defaultModel = value;
                await this.plugin.saveSettings();
              }));
          },
        } as SettingDefinitionRender,
        {
          name: 'Temperature',
          desc: 'Model temperature (0-1)',
          render: (setting) => {
            setting.addSlider(slider => slider
              .setLimits(0, 1, 0.1)
              .setValue(this.plugin.settings.temperature)
              .onChange(async (value) => {
                this.plugin.settings.temperature = value;
                await this.plugin.saveSettings();
              }));
          },
        } as SettingDefinitionRender,
      ],
    };
    result.push(modelGroup);

    // ── Appearance ──
    const appearanceGroup: SettingDefinitionGroup = {
      type: 'group',
      heading: 'Appearance',
      items: [
        {
          name: 'Theme',
          desc: 'Color theme for KiloCode',
          render: (setting) => {
            setting.addDropdown(dropdown => dropdown
              .addOption('auto', 'Auto')
              .addOption('light', 'Light')
              .addOption('dark', 'Dark')
              .setValue(this.plugin.settings.theme)
              .onChange(async (value: string) => {
                this.plugin.settings.theme = value as 'auto' | 'light' | 'dark';
                await this.plugin.saveSettings();
              }));
          },
        } as SettingDefinitionRender,
        {
          name: 'Font Size',
          desc: 'Font size for chat messages',
          render: (setting) => {
            setting.addSlider(slider => slider
              .setLimits(12, 20, 1)
              .setValue(this.plugin.settings.fontSize)
              .onChange(async (value) => {
                this.plugin.settings.fontSize = value;
                await this.plugin.saveSettings();
              }));
          },
        } as SettingDefinitionRender,
      ],
    };
    result.push(appearanceGroup);

    // ── Security ──
    const securityGroup: SettingDefinitionGroup = {
      type: 'group',
      heading: 'Security',
      items: [
        {
          name: 'Permission Mode',
          desc: 'Control how AI tool calls are approved',
          render: (setting) => {
            setting.addDropdown(dropdown => dropdown
              .addOption('normal', 'Normal — approve write operations')
              .addOption('yolo', 'Yolo — auto-approve all operations')
              .addOption('plan', 'Plan — read-only, deny all writes')
              .setValue(this.plugin.settings.permissionMode)
              .onChange(async (value: string) => {
                this.plugin.settings.permissionMode = value as 'yolo' | 'normal' | 'plan';
                await this.plugin.saveSettings();
              }));
          },
        } as SettingDefinitionRender,
      ],
    };
    result.push(securityGroup);

    return result;
  }
}
