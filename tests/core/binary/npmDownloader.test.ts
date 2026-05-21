import { buildTarballUrl, extractBinaryFromTarball } from '../../../src/core/binary/npmDownloader';

describe('npmDownloader', () => {
  describe('buildTarballUrl', () => {
    it('should build correct npm tarball URL', () => {
      const url = buildTarballUrl('@kilocode/cli-windows-x64', '7.3.1');
      expect(url).toBe('https://registry.npmjs.org/@kilocode/cli-windows-x64/-/cli-windows-x64-7.3.1.tgz');
    });

    it('should support custom registry URL', () => {
      const url = buildTarballUrl('@kilocode/cli-darwin-arm64', '7.3.1', 'https://mirror.example.com');
      expect(url).toBe('https://mirror.example.com/@kilocode/cli-darwin-arm64/-/cli-darwin-arm64-7.3.1.tgz');
    });

    it('should strip scope from tarball filename', () => {
      const url = buildTarballUrl('@kilocode/cli-linux-x64', '1.0.0');
      expect(url).toContain('/cli-linux-x64-1.0.0.tgz');
      expect(url).not.toContain('/@kilocode/cli-linux-x64-1.0.0.tgz');
    });
  });

  describe('extractBinaryFromTarball', () => {
    it('should extract a file from a valid tar buffer', () => {
      const content = Buffer.from('fake-binary-content');
      const header = Buffer.alloc(512);
      header.write('package/bin/kilo', 0, 'utf8');
      const sizeOctal = content.length.toString(8).padStart(11, '0') + '\0';
      header.write(sizeOctal, 124, 'utf8');
      header.write('0', 156, 'utf8');
      header.fill(32, 148, 156);
      let checksum = 0;
      for (let i = 0; i < 512; i++) checksum += header[i];
      header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 'utf8');

      const paddedSize = Math.ceil(content.length / 512) * 512;
      const paddedContent = Buffer.alloc(paddedSize);
      content.copy(paddedContent);
      const endBlocks = Buffer.alloc(1024);

      const tarBuffer = Buffer.concat([header, paddedContent, endBlocks]);
      const result = extractBinaryFromTarball(tarBuffer, 'package/bin/kilo');
      expect(result).not.toBeNull();
      expect(result!.toString()).toBe('fake-binary-content');
    });

    it('should return null when target file not found', () => {
      const content = Buffer.from('other-content');
      const header = Buffer.alloc(512);
      header.write('package/bin/other', 0, 'utf8');
      const sizeOctal = content.length.toString(8).padStart(11, '0') + '\0';
      header.write(sizeOctal, 124, 'utf8');
      header.write('0', 156, 'utf8');
      header.fill(32, 148, 156);
      let checksum = 0;
      for (let i = 0; i < 512; i++) checksum += header[i];
      header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 'utf8');

      const paddedSize = Math.ceil(content.length / 512) * 512;
      const paddedContent = Buffer.alloc(paddedSize);
      content.copy(paddedContent);
      const endBlocks = Buffer.alloc(1024);

      const tarBuffer = Buffer.concat([header, paddedContent, endBlocks]);
      const result = extractBinaryFromTarball(tarBuffer, 'package/bin/kilo');
      expect(result).toBeNull();
    });
  });
});
