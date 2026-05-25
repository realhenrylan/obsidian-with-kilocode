import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawn } from 'child_process';
import { Notice } from 'obsidian';
import type { KiloCodeSettings } from '../types';
import { detectPlatform, type PlatformInfo } from './PlatformDetector';
import { downloadBinary } from './npmDownloader';

const PINNED_CLI_VERSION = '7.3.1';

export interface DetectionResult {
  path: string;
  method: string;
}

export class BinaryManager {
  private pluginDir: string;
  private binDir: string;
  private cachedPath: string | null = null;
  private cachedMethod: string = '';
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
    // Phase 0: Manual path in settings takes priority
    if (settings.cliPath && settings.cliPath.trim()) {
      const manualPath = settings.cliPath.trim();
      if (fs.existsSync(manualPath)) {
        console.log('[KiloCode] Using manual cliPath:', manualPath);
        this.cachedPath = manualPath;
        this.cachedMethod = 'manual-settings';
        return manualPath;
      }
    }

    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    if (this.cachedPath) {
      return this.cachedPath;
    }

    // Phase 1: Try existing repo-owned binary
    const localBinary = this.findInBinDir();
    if (localBinary) {
      this.cachedPath = localBinary;
      this.cachedMethod = 'plugin-bin-dir';
      return localBinary;
    }

    // Phase 2: Try finding from system PATH (with shell support for .cmd on Windows)
    const pathBinary = await this.findInPath();
    if (pathBinary) {
      this.cachedPath = pathBinary;
      this.cachedMethod = 'system-path';
      return pathBinary;
    }

    // Phase 3: Scan known global npm install locations
    const globalBinary = this.findInGlobalPaths();
    if (globalBinary) {
      this.cachedPath = globalBinary;
      this.cachedMethod = 'global-npm';
      return globalBinary;
    }

    // Phase 4: Download from npm registry
    this.loadingPromise = this.downloadAndCache(settings);
    try {
      const downloadedPath = await this.loadingPromise;
      this.cachedMethod = 'downloaded';
      return downloadedPath;
    } finally {
      this.loadingPromise = null;
    }
  }

  isReady(): boolean {
    return this.cachedPath !== null;
  }

  getDetectionMethod(): string {
    return this.cachedMethod;
  }

  /**
   * Auto-detect the kilo binary without triggering a download.
   * Can be called from the settings UI for a 'Detect' button.
   */
  async autoDetect(): Promise<DetectionResult | null> {
    const localBinary = this.findInBinDir();
    if (localBinary) return { path: localBinary, method: 'plugin-bin-dir' };
    const pathBinary = await this.findInPath();
    if (pathBinary) return { path: pathBinary, method: 'system-path' };
    const globalBinary = this.findInGlobalPaths();
    if (globalBinary) return { path: globalBinary, method: 'global-npm' };
    return null;
  }

  /**
   * Strategy 1: Find kilo in system PATH.
   * On Windows, uses shell:true for .cmd wrapper support.
   */
  private async findInPath(): Promise<string | null> {
    try {
      const found = await this.spawnWithShell();
      if (found) return found;
    } catch { }

    if (process.platform === 'win32') {
      try {
        const whereResult = this.findWithWhere();
        if (whereResult) return whereResult;
      } catch { }
    }
    return null;
  }

  private async spawnWithShell(): Promise<string | null> {
    return new Promise((resolve) => {
      const isWin = process.platform === 'win32';
      const proc = spawn(isWin ? 'kilo.cmd' : 'kilo', ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 8000,
        shell: isWin ? true : false,
      });
      proc.on('error', () => resolve(null));
      proc.on('exit', (code) => {
        if (code !== 0) { resolve(null); return; }
        console.debug('[KiloCode] spawnWithShell: kilo --version succeeded');
        if (isWin) {
          const wherePath = this.findWithWhere();
          if (wherePath) { resolve(wherePath); return; }
        }
        resolve('kilo');
      });
    });
  }

  private findWithWhere(): string | null {
    try {
      let result;
      try {
        result = execSync('where.exe kilo 2>nul', { encoding: 'utf8', timeout: 5000, windowsHide: true }).trim();
      } catch {
        result = execSync(
          'powershell -NoProfile -NonInteractive -Command "(Get-Command kilo).Source"',
          { encoding: 'utf8', timeout: 5000, windowsHide: true }
        ).trim();
      }
      const lines = result.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (line && fs.existsSync(line)) {
          console.debug('[KiloCode] findWithWhere: found', line);
          return line;
        }
      }
    } catch { }
    return null;
  }

  /**
   * Strategy 2: Check known global npm install locations.
   */
  private findInGlobalPaths(): string | null {
    const appData = process.env.APPDATA;
    const localAppData = process.env.LOCALAPPDATA;
    const userProfile = process.env.USERPROFILE;
    const home = process.env.HOME;

    const candidates = [];
    if (appData) {
      candidates.push(path.join(appData, 'npm', 'kilo.cmd'));
      candidates.push(path.join(appData, 'npm', 'kilo'));
    }
    if (localAppData) {
      candidates.push(path.join(localAppData, 'kilocode', 'kilo.exe'));
    }
    if (userProfile) {
      candidates.push(path.join(userProfile, 'scoop', 'shims', 'kilo.exe'));
    }
    if (home) {
      candidates.push(path.join(home, '.npm-global', 'kilo'));
      candidates.push(path.join(home, '.npm-global', 'kilo.cmd'));
    }

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          console.debug('[KiloCode] findInGlobalPaths: found', candidate);
          return candidate;
        }
      } catch { }
    }

    // Deep scan: find kilocode native binary under npm global
    try {
      const globalRoot = execSync('npm root -g', { encoding: 'utf8', timeout: 10000, windowsHide: true }).trim();
      if (globalRoot) {
        const found = this.searchNpmGlobalDir(globalRoot);
        if (found) return found;
      }
    } catch { }

    if (appData) {
      const found = this.searchNpmGlobalDir(path.join(appData, 'npm', 'node_modules'));
      if (found) return found;
    }

    return null;
  }

  private searchNpmGlobalDir(globalRoot: string): string | null {
    const cliDir = path.join(globalRoot, '@kilocode', 'cli');
    if (!fs.existsSync(cliDir)) return null;

    // Check node_modules/@kilocode/cli/node_modules/cli-windows-x64/bin/kilo.exe
    const nmDir = path.join(cliDir, 'node_modules');
    if (fs.existsSync(nmDir)) {
      try {
        const entries = fs.readdirSync(nmDir);
        for (const entry of entries) {
          const candidate = path.join(nmDir, entry, 'bin', 'kilo.exe');
          if (fs.existsSync(candidate)) {
            console.debug('[KiloCode] searchNpmGlobalDir: found at', candidate);
            return candidate;
          }
        }
      } catch { }
    }

    const directBin = path.join(cliDir, 'bin', 'kilo.exe');
    if (fs.existsSync(directBin)) {
      console.debug('[KiloCode] searchNpmGlobalDir: found at', directBin);
      return directBin;
    }

    return null;
  }

  private findInBinDir(): string | null {
    const binaryPath = path.join(this.binDir, this.getBinaryName());
    if (!fs.existsSync(binaryPath)) return null;
    const storedVersion = this.readVersionFile();
    if (storedVersion !== PINNED_CLI_VERSION) return null;
    return binaryPath;
  }

  private async downloadAndCache(settings: KiloCodeSettings): Promise<string> {
    if (!this.platformInfo) this.platformInfo = detectPlatform();
    new Notice('Initializing KiloCode AI core components, please wait...', 0);

    let lastError = null;
    const sources = this.buildDownloadSources(settings);

    for (const source of sources) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const { binaryBuffer } = await downloadBinary(
            source.packageName, PINNED_CLI_VERSION,
            this.platformInfo.binaryName, source.registry
          );
          const binaryPath = this.writeBinary(binaryBuffer);
          new Notice('KiloCode initialized successfully! Ready to code.', 5000);
          this.cachedPath = binaryPath;
          return binaryPath;
        } catch (err) {
          lastError = err;
          console.warn('[KiloCode] Download attempt ' + (attempt + 1) + ' failed for ' + source.packageName + ':', err);
        }
      }
    }

    new Notice('KiloCode core component download failed. Please configure CLI path in settings.', 10000);
    throw lastError || new Error('All download sources failed');
  }

  private buildDownloadSources(settings: KiloCodeSettings): Array<{ packageName: string; registry?: string }> {
    if (!this.platformInfo) return [];
    const sources = [];
    for (const packageName of this.platformInfo.npmPackageCandidates) {
      sources.push({ packageName });
      if (settings.mirrorUrl) sources.push({ packageName, registry: settings.mirrorUrl });
    }
    return sources;
  }

  private writeBinary(binaryBuffer: Buffer): string {
    if (!this.platformInfo) throw new Error('Platform not detected');
    if (!fs.existsSync(this.binDir)) fs.mkdirSync(this.binDir, { recursive: true });
    const binaryPath = path.join(this.binDir, this.platformInfo.binaryName);
    if (fs.existsSync(binaryPath)) fs.unlinkSync(binaryPath);
    fs.writeFileSync(binaryPath, binaryBuffer);
    if (process.platform !== 'win32') fs.chmodSync(binaryPath, 0o755);
    this.handleMacOSQuarantine(binaryPath);
    this.writeVersionFile(PINNED_CLI_VERSION);
    return binaryPath;
  }

  private readVersionFile(): string | null {
    const versionPath = path.join(this.binDir, '.version');
    try { return fs.readFileSync(versionPath, 'utf8').trim(); } catch { return null; }
  }

  private writeVersionFile(version: string): void {
    if (!fs.existsSync(this.binDir)) fs.mkdirSync(this.binDir, { recursive: true });
    fs.writeFileSync(path.join(this.binDir, '.version'), version, 'utf8');
  }

  private handleMacOSQuarantine(binaryPath: string): void {
    if (process.platform !== 'darwin') return;
    try {
      execSync('xattr -d com.apple.quarantine "' + binaryPath + '"', { timeout: 3000 });
    } catch { }
  }

  private getBinaryName(): string {
    return process.platform === 'win32' ? 'kilo.exe' : 'kilo';
  }
}

