import { detectPlatform, supportsAvx2, isMusl } from '../../../src/core/binary/PlatformDetector';

describe('PlatformDetector', () => {
  describe('detectPlatform', () => {
    it('should return valid platform info on current system', () => {
      const info = detectPlatform();
      expect(['windows', 'darwin', 'linux']).toContain(info.platform);
      expect(['x64', 'arm64']).toContain(info.arch);
      expect(typeof info.binaryName).toBe('string');
      expect(Array.isArray(info.npmPackageCandidates)).toBe(true);
      expect(info.npmPackageCandidates.length).toBeGreaterThan(0);
    });

    it('should have kilo.exe on Windows and kilo on others', () => {
      const info = detectPlatform();
      if (process.platform === 'win32') {
        expect(info.binaryName).toBe('kilo.exe');
      } else {
        expect(info.binaryName).toBe('kilo');
      }
    });

    it('should have candidate packages starting with @kilocode/cli-', () => {
      const info = detectPlatform();
      for (const candidate of info.npmPackageCandidates) {
        expect(candidate).toMatch(/^@kilocode\/cli-/);
      }
    });

    it('should include the base package in candidates', () => {
      const info = detectPlatform();
      const expectedBase = `@kilocode/cli-${info.platform}-${info.arch}`;
      expect(info.npmPackageCandidates).toContain(expectedBase);
    });
  });
});
