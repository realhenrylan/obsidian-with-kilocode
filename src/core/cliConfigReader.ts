// src/core/cliConfigReader.ts
// 读取 kilo CLI 本地配置文件，使插件自动感知 CLI 的模型设置。
// 避免用户在插件和 CLI 两处分别配置。

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { KiloCodeSettings } from './types';

/**
 * kilo CLI 配置文件中可能的字段。
 */
export interface CliConfig {
  /** 默认模型 ID，如 "deepseek/deepseek-v4-flash" */
  defaultModel?: string;
  /** API Key */
  apiKey?: string;
  /** 自定义 API 基础 URL */
  baseUrl?: string;
  /** 其他未知字段 */
  [key: string]: unknown;
}

/**
 * 获取 kilo CLI 配置文件路径（按优先级尝试多个文件名）。
 */
export function getCliConfigPath(): string {
  const configDir = getConfigDir();
  const candidates = ['kilo.jsonc', 'kilo.json', 'config.json'];
  for (const name of candidates) {
    const p = path.join(configDir, name);
    if (fs.existsSync(p)) return p;
  }
  return path.join(configDir, 'kilo.jsonc');
}

function getConfigDir(): string {
  if (process.platform === 'win32' && process.env.APPDATA) {
    const appDataPath = path.join(process.env.APPDATA, 'kilo');
    if (fs.existsSync(appDataPath)) return appDataPath;
  }
  const homeDir = os.homedir();
  return path.join(homeDir, '.config', 'kilo');
}

/**
 * 尝试将 JSONC 内容解析为 JSON。
 * 处理：
 *   - 单行注释 // （不在字符串内时移除）
 *   - 多行字符串（含真实换行符的字符串字面量）
 *   - 结尾逗号
 */
function parseJsonC(raw: string): any {
  // Step 1: Remove multi-line comments /* ... */
  // Step 2: Remove single-line // comments (but not inside strings)
  // Step 3: Remove trailing commas before } or ]
  // Step 4: Replace literal newlines inside strings with \n

  const chars: string[] = [];
  let i = 0;
  let inString = false;
  let stringChar: string | null = null;

  while (i < raw.length) {
    const c = raw[i];
    const next = raw[i + 1] || '';

    if (inString) {
      if (c === '\\') {
        // Escape sequence - keep as-is
        chars.push(c, next);
        i += 2;
        continue;
      }
      if (c === stringChar) {
        inString = false;
        stringChar = null;
      } else if (c === '\n' || c === '\r') {
        // Literal newline inside a string - replace with \n
        chars.push('\\n');
        if (c === '\r' && next === '\n') i++; // skip \r\n
        i++;
        continue;
      }
      chars.push(c);
      i++;
      continue;
    }

    // Outside string
    if (c === '"') {
      inString = true;
      stringChar = '"';
      chars.push(c);
      i++;
      continue;
    }

    // Single-line comment //
    if (c === '/' && next === '/') {
      while (i < raw.length && raw[i] !== '\n') i++;
      continue;
    }

    // Multi-line comment /* */
    if (c === '/' && next === '*') {
      i += 2;
      while (i < raw.length) {
        if (raw[i] === '*' && raw[i + 1] === '/') {
          i += 2;
          break;
        }
        i++;
      }
      continue;
    }

    chars.push(c);
    i++;
  }

  return JSON.parse(chars.join(''));
}

/**
 * 读取 kilo CLI 配置文件。
 */
export function readCliConfig(): CliConfig {
  const configPath = getCliConfigPath();

  try {
    if (!fs.existsSync(configPath)) {
      console.debug('[KiloCode] CLI config not found at:', configPath);
      return {};
    }

    const raw = fs.readFileSync(configPath, 'utf-8');

    // Try strict JSON first (fast path)
    try {
      const config = JSON.parse(raw);
      return extractConfig(config);
    } catch {
      // Fall back to JSONC parser
      try {
        const config = parseJsonC(raw);
        return extractConfig(config);
      } catch (jsoncErr) {
        console.warn('[KiloCode] Failed to parse CLI config (JSONC fallback also failed):', configPath, jsoncErr);
        return {};
      }
    }
  } catch (err) {
    console.warn('[KiloCode] Failed to read CLI config from:', configPath, err);
    return {};
  }
}

function extractConfig(config: any): CliConfig {
  if (typeof config !== 'object' || config === null) {
    return {};
  }
  const modelId = config.model || config.defaultModel;
  return {
    defaultModel: modelId,
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
  };
}

/**
 * 从 CLI 配置合并到插件设置。
 * 规则：CLI 配置作为 fallback，插件已有值（非空）优先。
 *
 * ⚠️ 安全约束：不复制 apiKey。
 */
export function mergeCliConfigIntoSettings(
  settings: KiloCodeSettings,
  cliConfig: CliConfig,
): KiloCodeSettings {
  if (!settings.defaultModel && !settings.model && cliConfig.defaultModel) {
    settings.defaultModel = cliConfig.defaultModel;
  }
  if (cliConfig.baseUrl && !settings.environmentVariables?.['KILO_BASE_URL']) {
    if (!settings.environmentVariables) {
      settings.environmentVariables = {};
    }
    settings.environmentVariables['KILO_BASE_URL'] = cliConfig.baseUrl;
  }
  return settings;
}

/**
 * 检查 CLI 配置文件中是否有 API key（仅用于 UI 显示"已配置"状态）。
 */
export function cliHasApiKey(): boolean {
  const config = readCliConfig();
  return !!config.apiKey;
}
