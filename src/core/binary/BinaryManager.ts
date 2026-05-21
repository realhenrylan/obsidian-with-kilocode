import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { Notice } from 'obsidian';
import type { KiloCodeSettings } from '../types';
import { detectPlatform, type PlatformInfo } from './PlatformDetector';
import { downloadBinary } from './npmDownloader';

const PINNED_CLI_VERSION = '7.3.1';

export class BinaryManager {
  private pluginDir: string;
  private binDir: string;
  private cachedPath: string | null = null;
  private platformInfo: PlatformInfo | null = null;
  private loadingPromise: Promise<string> | null = null;

  constructor(pluginDir: string) {
    this.pluginDir = pluginDir;
    this.binDir = path.join(pluginDir, 'bin');
  }

  async preload(settings: KiloCodeSettings): Promise<void> {
    try {
      await this.getBinaryPath(settings);
    } catch (err) {
      console.error('[KiloCode] Binary preload failed:', err);
    }
  }

  async getBinaryPath(settings: KiloCodeSettings): Promise<string> {
    if (settings.cliPath && settings.cliPath.trim()) {
      return settings.cliPath.trim();
    }

    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    if (this.cachedPath) {
      return this.cachedPath;
    }

    const pathBinary = await this.findInPath();
    if (pathBinary) {
      this.cachedPath = pathBinary;
      return pathBinary;
    }

    const localBinary = this.findInBinDir();
    if (localBinary) {
      this.cachedPath = localBinary;
      return localBinary;
    }

    this.loadingPromise = this.downloadAndCache(settings);
    try {
      return await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  isReady(): boolean {
    return this.cachedPath !== null;
  }

  private async findInPath(): Promise<string | null> {
    try {
      const { spawn } = require('child_process');
      return new Promise((resolve) => {
        const proc = spawn('kilo', ['--version'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 5000,
        });
        proc.on('error', () => resolve(null));
        proc.on('exit', (code: number) => {
          resolve(code === 0 ? 'kilo' : null);
        });
      });
    } catch {
      return null;
    }
  }

  private findInBinDir(): string | null {
    const binaryPath = path.join(this.binDir, this.getBinaryName());
    if (!fs.existsSync(binaryPath)) return null;

    const storedVersion = this.readVersionFile();
    if (storedVersion !== PINNED_CLI_VERSION) return null;

    return binaryPath;
  }

  private async downloadAndCache(settings: KiloCodeSettings): Promise<string> {
    if (!this.platformInfo) {
      this.platformInfo = detectPlatform();
    }

    new Notice('⏳ Initializing KiloCode AI core components, please wait...', 0);

    let lastError: Error | null = null;
    const sources = this.buildDownloadSources(settings);

    for (const source of sources) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const { binaryBuffer } = await downloadBinary(
            source.packageName,
            PINNED_CLI_VERSION,
            this.platformInfo.binaryName,
            source.registry
          );

          const binaryPath = this.writeBinary(binaryBuffer);
          new Notice('✅ KiloCode initialized successfully! Ready to code.', 5000);
          this.cachedPath = binaryPath;
          return binaryPath;
        } catch (err) {
          lastError = err as Error;
          console.warn(`[KiloCode] Download attempt ${attempt + 1} failed for ${source.packageName}:`, err);
        }
      }
    }

    new Notice('❌ KiloCode core component download failed. Please configure CLI path in settings.', 10000);
    throw lastError || new Error('All download sources failed');
  }

  private buildDownloadSources(settings: KiloCodeSettings): Array<{ packageName: string; registry?: string }> {
    if (!this.platformInfo) return [];

    const sources: Array<{ packageName: string; registry?: string }> = [];

    for (const packageName of this.platformInfo.npmPackageCandidates) {
      sources.push({ packageName });
      if (settings.mirrorUrl) {
        sources.push({ packageName, registry: settings.mirrorUrl });
      }
    }

    return sources;
  }

  private writeBinary(binaryBuffer: Buffer): string {
    if (!this.platformInfo) throw new Error('Platform not detected');
    if (!fs.existsSync(this.binDir)) fs.mkdirSync(this.binDir, { recursive: true });

    const binaryPath = path.join(this.binDir, this.platformInfo.binaryName);

    if (fs.existsSync(binaryPath)) fs.unlinkSync(binaryPath);

    fs.writeFileSync(binaryPath, binaryBuffer);

    if (process.platform !== 'win32') {
      fs.chmodSync(binaryPath, 0o755);
    }

    this.handleMacOSQuarantine(binaryPath);
    this.writeVersionFile(PINNED_CLI_VERSION);

    return binaryPath;
  }

  private readVersionFile(): string | null {
    const versionPath = path.join(this.binDir, '.version');
    try {
      return fs.readFileSync(versionPath, 'utf8').trim();
    } catch {
      return null;
    }
  }

  private writeVersionFile(version: string): void {
    if (!fs.existsSync(this.binDir)) fs.mkdirSync(this.binDir, { recursive: true });
    fs.writeFileSync(path.join(this.binDir, '.version'), version, 'utf8');
  }

  private handleMacOSQuarantine(binaryPath: string): void {
    if (process.platform !== 'darwin') return;
    try {
      execSync(`xattr -d com.apple.quarantine "${binaryPath}"`, { timeout: 3000 });
    } catch {
      // 静默失败
    }
  }

  private getBinaryName(): string {
    return process.platform === 'win32' ? 'kilo.exe' : 'kilo';
  }
}
