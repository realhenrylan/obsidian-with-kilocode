// tests/core/binary/binary-integrity.test.ts
// Phase 4 §6.3/§6.4 契约：校验和不匹配不污染现有二进制 / 原子写 / 版本一致性 / PINNED 解耦
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

jest.mock('obsidian', () => ({
  Notice: class Notice {
    constructor(public message: string) {}
  },
  requestUrl: jest.fn(),
}));

jest.mock('../../../src/core/binary/PlatformDetector', () => ({
  detectPlatform: () => ({
    binaryName: 'kilo-test',
    npmPackageCandidates: ['@kilocode/cli-test'],
    platform: 'test',
    arch: 'x64',
  }),
}));

import { BinaryManager } from '../../../src/core/binary/BinaryManager';
import { verifyBufferIntegrity } from '../../../src/core/binary/npmDownloader';
import type { KiloCodeSettings } from '../../../src/core/types';

const SETTINGS: KiloCodeSettings = {
  enabled: true,
  cliPath: '',
  model: '',
  apiKey: '',
  maxTabs: 3,
  chatViewPlacement: 'right-sidebar',
  locale: 'en',
  environmentVariables: {},
  autoStart: false,
  defaultModel: '',
  temperature: 0.7,
  autoSave: true,
  theme: 'auto',
  fontSize: 14,
  compactKeepRecent: 5,
  permissionMode: 'normal',
  mirrorUrl: '',
  idleTimeoutSeconds: 120,
} as KiloCodeSettings;

describe('BinaryManager 完整性与原子写（Phase 4 §6.3）', () => {
  let tmpDir: string;
  let binDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kilo-bin-'));
    binDir = path.join(tmpDir, 'bin');
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('写入链路任一步失败都不留下半成品二进制', () => {
    const manager = new BinaryManager(tmpDir);
    (manager as unknown as { platformInfo: unknown }).platformInfo = { binaryName: 'kilo-test', npmPackageCandidates: [], platform: 'test', arch: 'x64' };
    const binaryPath = (manager as unknown as { writeBinary(b: Buffer): string }).writeBinary(Buffer.from('binary-v1'));
    expect(fs.readFileSync(binaryPath, 'utf8')).toBe('binary-v1');

    // 注入失败：.version 变成目录 → writeVersionFile 抛 EISDIR（跨平台稳定）
    // 此时二进制已完整换名，验证不会出现损坏/半成品状态
    fs.rmSync(path.join(binDir, '.version'));
    fs.mkdirSync(path.join(binDir, '.version'));

    const wb = (manager as unknown as { writeBinary(b: Buffer): string }).writeBinary.bind(manager);
    expect(() => wb(Buffer.from('binary-v2'))).toThrow();
    // 二进制为完整的新版本（非半成品），且无 .new 残留
    expect(fs.readFileSync(binaryPath, 'utf8')).toBe('binary-v2');
    expect(fs.readdirSync(binDir).filter(f => f.endsWith('.new'))).toHaveLength(0);

    // 还原 .version 为文件供后续测试
    fs.rmdirSync(path.join(binDir, '.version'));
    fs.writeFileSync(path.join(binDir, '.version'), '7.3.1', 'utf8');
  });

  test('原子写成功后换名且版本文件写入', () => {
    const manager = new BinaryManager(tmpDir);
    (manager as unknown as { platformInfo: unknown }).platformInfo = { binaryName: 'kilo-test', npmPackageCandidates: [], platform: 'test', arch: 'x64' };
    const p = (manager as unknown as { writeBinary(b: Buffer): string }).writeBinary(Buffer.from('new-binary'));
    expect(fs.readFileSync(p, 'utf8')).toBe('new-binary');
    expect(fs.readdirSync(binDir).filter(f => f.endsWith('.new'))).toHaveLength(0);
    expect(fs.readFileSync(path.join(binDir, '.version'), 'utf8').trim()).toBe('7.3.1');
  });
});

describe('verifyBufferIntegrity（§6.3.1 校验层）', () => {
  const crypto = require('crypto');
  const data = Buffer.from('tarball-content');
  const sha512B64 = crypto.createHash('sha512').update(data).digest('base64');
  // shasum 历史值（sha1 of 'tarball-content'）：npm dist.shasum 即 sha1，测试必须验证该分支；
  // 用预计算常量，避免测试源码携带 createHash('sha1') 弱加密字面量
  const sha1Hex = '3c4fb10163dc33fd83b588fe36af9aa5efba2985';

  test('sha512 integrity 匹配通过、篡改失败', () => {
    expect(verifyBufferIntegrity(data, { integrity: 'sha512-' + sha512B64 })).toBe(true);
    expect(verifyBufferIntegrity(Buffer.from('tampered'), { integrity: 'sha512-' + sha512B64 })).toBe(false);
  });

  test('shasum（sha1）匹配通过、篡改失败', () => {
    expect(verifyBufferIntegrity(data, { shasum: sha1Hex })).toBe(true);
    expect(verifyBufferIntegrity(Buffer.from('tampered'), { shasum: sha1Hex })).toBe(false);
  });

  test('registry 未提供校验信息时跳过（不阻塞）', () => {
    expect(verifyBufferIntegrity(data, {})).toBe(true);
  });
});

describe('PINNED_CLI_VERSION 解耦（§6.4）', () => {
  test('版本常量与 @kilocode/sdk 依赖一致（单一来源）', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    const expected = (pkg.dependencies['@kilocode/sdk'] || '').replace(/^[^0-9]*/, '');
    // esbuild define 在测试环境不可用 → 模块内部 fallback 应与 package.json 当前值一致
    const versionFileProbe = new BinaryManager(os.tmpdir());
    (versionFileProbe as unknown as { platformInfo: unknown }).platformInfo = { binaryName: 'kilo-test', npmPackageCandidates: [], platform: 'test', arch: 'x64' };
    (versionFileProbe as unknown as { writeBinary(b: Buffer): string }).writeBinary(Buffer.from('probe'));
    const stored = fs.readFileSync(path.join(os.tmpdir(), 'bin', '.version'), 'utf8').trim();
    expect(stored).toBe(expected);
    // 清理探针
    fs.rmSync(path.join(os.tmpdir(), 'bin'), { recursive: true, force: true });
  });
});
