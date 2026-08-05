import { BinaryManager } from '../../../src/core/binary/BinaryManager';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('BinaryManager', () => {
  let tmpDir: string;
  let binDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kilo-test-'));
    binDir = path.join(tmpDir, 'bin');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getBinaryPath priority chain', () => {
    it('should return user-configured cliPath when set', async () => {
      // 用真实存在的临时文件，避免依赖系统环境（Windows/CI 上 /custom/kilo 不存在，
      // 会导致跳过 manual 分支并触发真实系统查找）
      const customCli = path.join(tmpDir, 'custom-kilo');
      fs.writeFileSync(customCli, 'fake-binary');
      const manager = new BinaryManager(tmpDir);
      const result = await manager.getBinaryPath({ cliPath: customCli, mirrorUrl: '' } as any);
      expect(result).toBe(customCli);
    });

    it('should return local binary when exists and version matches', async () => {
      fs.mkdirSync(binDir, { recursive: true });
      const binaryName = process.platform === 'win32' ? 'kilo.exe' : 'kilo';
      const binaryPath = path.join(binDir, binaryName);
      fs.writeFileSync(binaryPath, 'fake-binary');
      fs.writeFileSync(path.join(binDir, '.version'), '7.3.1');

      const manager = new BinaryManager(tmpDir);
      const result = manager['findInBinDir']();
      expect(result).toBe(binaryPath);
    });

    it('should return null when bin/ directory is empty', () => {
      const manager = new BinaryManager(tmpDir);
      const result = manager['findInBinDir']();
      expect(result).toBeNull();
    });

    it('should detect version mismatch', () => {
      fs.mkdirSync(binDir, { recursive: true });
      const binaryName = process.platform === 'win32' ? 'kilo.exe' : 'kilo';
      fs.writeFileSync(path.join(binDir, binaryName), 'fake-binary');
      fs.writeFileSync(path.join(binDir, '.version'), '1.0.0');

      const manager = new BinaryManager(tmpDir);
      const version = manager['readVersionFile']();
      expect(version).toBe('1.0.0');
    });
  });

  describe('version file', () => {
    it('should write and read version file', () => {
      const manager = new BinaryManager(tmpDir);
      fs.mkdirSync(binDir, { recursive: true });
      manager['writeVersionFile']('7.3.1');
      const version = manager['readVersionFile']();
      expect(version).toBe('7.3.1');
    });

    it('should return null when version file does not exist', () => {
      const manager = new BinaryManager(tmpDir);
      const version = manager['readVersionFile']();
      expect(version).toBeNull();
    });
  });

  describe('isReady', () => {
    it('should return false initially', () => {
      const manager = new BinaryManager(tmpDir);
      expect(manager.isReady()).toBe(false);
    });
  });
});
