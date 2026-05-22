// src/core/cliConfigReader.ts
// 读取 kilo CLI 本地配置文件，使插件自动感知 CLI 的模型和 API key 设置，
// 避免用户在插件和 CLI 两处分别配置。

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { KiloCodeSettings } from './types';

/**
 * kilo CLI 配置文件中可能的字段。
 * 格式遵循 Claude Code 惯例：`~/.config/kilo/config.json`
 */
export interface CliConfig {
  /** 默认模型 ID，如 "deepseek-v4-flash" */
  defaultModel?: string;
  /** API Key */
  apiKey?: string;
  /** 自定义 API 基础 URL */
  baseUrl?: string;
  /** 其他未知字段 */
  [key: string]: unknown;
}

/**
 * 获取 kilo CLI 配置文件路径。
 * 优先级：
 *   1. Windows: %APPDATA%/kilo/config.json
 *   2. Unix / fallback: $HOME/.config/kilo/config.json
 */
export function getCliConfigPath(): string {
  // Windows 优先 %APPDATA%
  if (process.platform === 'win32' && process.env.APPDATA) {
    const appDataPath = path.join(process.env.APPDATA, 'kilo', 'config.json');
    if (fs.existsSync(appDataPath)) return appDataPath;
  }

  // 跨平台标准路径：~/.config/kilo/config.json
  const homeDir = os.homedir();
  return path.join(homeDir, '.config', 'kilo', 'config.json');
}

/**
 * 读取 kilo CLI 配置文件。
 * @returns 解析后的 CLI 配置对象，文件不存在或解析失败返回空对象。
 */
export function readCliConfig(): CliConfig {
  const configPath = getCliConfigPath();

  try {
    if (!fs.existsSync(configPath)) {
      console.debug('[KiloCode] CLI config not found at:', configPath);
      return {};
    }

    const raw = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(raw) as CliConfig;

    if (typeof config !== 'object' || config === null) {
      console.warn('[KiloCode] CLI config is not a JSON object:', configPath);
      return {};
    }

    console.debug('[KiloCode] Read CLI config from:', configPath, {
      hasApiKey: !!config.apiKey,
      hasModel: !!config.defaultModel,
    });
    return config;
  } catch (err) {
    console.warn('[KiloCode] Failed to read CLI config from:', configPath, err);
    return {};
  }
}

/**
 * 从 CLI 配置合并到插件设置。
 * 规则：CLI 配置作为 fallback，插件已有值（非空）优先。
 *
 * ⚠️ 安全约束：不复制 apiKey。
 *    API key 只应存在于 CLI 配置文件（~/.config/kilo/config.json）中，
 *    由 CLI 子进程自己读取。插件不应持有、存储或传输 API key，
 *    避免 vault 云同步导致泄露。
 */
export function mergeCliConfigIntoSettings(
  settings: KiloCodeSettings,
  cliConfig: CliConfig,
): KiloCodeSettings {
  // 只有插件中未设置时才使用 CLI 配置的值
  if (!settings.defaultModel && !settings.model && cliConfig.defaultModel) {
    settings.defaultModel = cliConfig.defaultModel;
  }
  // 不复制 apiKey——API key 只应在 CLI 配置文件中，由 CLI 自己读取
  if (cliConfig.baseUrl && !settings.environmentVariables?.['KILO_BASE_URL']) {
    if (!settings.environmentVariables) {
      settings.environmentVariables = {};
    }
    settings.environmentVariables['KILO_BASE_URL'] = cliConfig.baseUrl;
  }

  return settings;
}

/**
 * 检查 CLI 配置文件中是否有 API key（仅用于 UI 显示"已配置"状态，
 * 不暴露 key 本身）。
 */
export function cliHasApiKey(): boolean {
  const config = readCliConfig();
  return !!config.apiKey;
}
