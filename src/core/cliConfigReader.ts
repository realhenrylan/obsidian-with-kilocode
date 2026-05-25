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
 * 优先级（按文件名优先级）：
 *   1. Windows: %APPDATA%/kilo/kilo.jsonc
 *   2. Windows: %APPDATA%/kilo/kilo.json
 *   3. Windows: %APPDATA%/kilo/config.json
 *   4. Unix: $HOME/.config/kilo/kilo.jsonc
 *   5. Unix: $HOME/.config/kilo/kilo.json
 *   6. Unix: $HOME/.config/kilo/config.json
 *
 * KiloCode CLI 实际使用 kilo.jsonc（JSON with Comments）作为配置文件名。
 */
export function getCliConfigPath(): string {
  const candidates: string[] = [];

  // Windows 优先 %APPDATA%
  if (process.platform === 'win32' && process.env.APPDATA) {
    const appDataDir = path.join(process.env.APPDATA, 'kilo');
    candidates.push(
      path.join(appDataDir, 'kilo.jsonc'),
      path.join(appDataDir, 'kilo.json'),
      path.join(appDataDir, 'config.json'),
    );
  }

  // ~/.config/kilo/
  const configDir = path.join(os.homedir(), '.config', 'kilo');
  candidates.push(
    path.join(configDir, 'kilo.jsonc'),
    path.join(configDir, 'kilo.json'),
    path.join(configDir, 'config.json'),
  );

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  // 都不存在时返回最后一个作为默认路径
  return candidates[candidates.length - 1];
}

/**
 * 尝试以 JSON 和 JSONC（去除注释）两种方式解析配置文本。
 */
function parseConfigText(raw: string): CliConfig | null {
  // 先试标准 JSON
  try {
    return JSON.parse(raw) as CliConfig;
  } catch {
    // 不是标准 JSON，尝试去除注释后解析（JSONC 支持）
  }

  // 简单去注释 + 去尾部逗号后解析（覆盖 JSONC 语法）
  try {
    // 注意：不能直接用 \/\/.*$ 匹配所有 //，因为 URL（如 https://）中包含 //
    // 只匹配前面有空格的 // 注释，或行首的 //
    const cleaned = raw
      .replace(/[ \t]\/\/[^\n]*$/gm, '')              // 去掉 // 注释（前面有空格/tab）
      .replace(/^\/\/[^\n]*$/gm, '')                   // 去掉行首的 // 注释
      .replace(/\/\*[\s\S]*?\*\//g, '')                // 去掉 /* */ 注释
      .replace(/,(\s*[}\]])/g, '$1');                  // 去掉尾部逗号
    return JSON.parse(cleaned) as CliConfig;
  } catch {
    return null;
  }
}

/**
 * 读取 kilo CLI 配置文件。
 * 支持 kilo.jsonc（JSON with Comments）和标准 .json 格式。
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
    const config = parseConfigText(raw);

    if (!config) {
      console.warn('[KiloCode] Failed to parse CLI config:', configPath);
      return {};
    }

    // 将 JSONC 中的 model 字段映射到 defaultModel
    // kilo.jsonc 使用 model 字段，插件使用 defaultModel
    if (!config.defaultModel && (config as any).model) {
      config.defaultModel = (config as any).model;
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
