import * as fs from 'fs';
import * as path from 'path';
import { exec, spawn, spawnSync } from 'child_process';
import { promisify } from 'util';
import { Notice } from 'obsidian';
import type { KiloCodeSettings } from '../types';
import { detectPlatform, type PlatformInfo } from './PlatformDetector';
import { downloadBinary, type DownloadProgress } from './npmDownloader';

/** 构建期由 esbuild define 注入（package.json 的 @kilocode/sdk 版本），测试环境未定义走 fallback */
declare const KILOCODE_SDK_VERSION: string | undefined;

/** 单一来源：与 @kilocode/sdk 依赖同版本（§6.4 解耦手动同步） */
const PINNED_CLI_VERSION: string =
  typeof KILOCODE_SDK_VERSION !== 'undefined' ? KILOCODE_SDK_VERSION : '7.3.1';

const execAsync = promisify(exec);

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
    if (pathBinary && await this.isCompatibleVersion(pathBinary)) {
      this.cachedPath = pathBinary;
      this.cachedMethod = 'system-path';
      return pathBinary;
    }

    // Phase 3: Scan known global npm install locations
    const globalBinary = await this.findInGlobalPaths();
    if (globalBinary && await this.isCompatibleVersion(globalBinary)) {
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
    const globalBinary = await this.findInGlobalPaths();
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
    } catch { /* ignore: kilo not in PATH */ }

    if (process.platform === 'win32') {
      try {
        const whereResult = await this.findWithWhere();
        if (whereResult) return whereResult;
      } catch { /* ignore: where.exe failed */ }
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
        void (async () => {
          if (isWin) {
            const wherePath = await this.findWithWhere();
            if (wherePath) { resolve(wherePath); return; }
          }
          resolve('kilo');
        })();
      });
    });
  }

  /** where.exe 查找（异步化，避免 PowerShell 启动阻塞 UI 数秒） */
  private async findWithWhere(): Promise<string | null> {
    let result: string;
    try {
      result = (await execAsync('where.exe kilo 2>nul', { timeout: 5000, windowsHide: true })).stdout.trim();
    } catch {
      try {
        result = (await execAsync(
          'powershell -NoProfile -NonInteractive -Command "(Get-Command kilo).Source"',
          { timeout: 5000, windowsHide: true },
        )).stdout.trim();
      } catch {
        return null;
      }
    }
    const lines = result.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (line && fs.existsSync(line)) {
        console.debug('[KiloCode] findWithWhere: found', line);
        return line;
      }
    }
    return null;
  }

  /**
   * Strategy 2: Check known global npm install locations.
   */
  private async findInGlobalPaths(): Promise<string | null> {
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
      } catch { /* ignore: candidate path not accessible */ }
    }

    // Deep scan: find kilocode native binary under npm global（异步化避免阻塞 UI）
    try {
      const globalRoot = (await execAsync('npm root -g', { timeout: 10000, windowsHide: true })).stdout.trim();
      if (globalRoot) {
        const found = this.searchNpmGlobalDir(globalRoot);
        if (found) return found;
      }
    } catch { /* ignore: npm root -g failed */ }

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
      } catch { /* ignore: entries scan failed */ }
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

    let lastError: unknown = null;
    const sources = this.buildDownloadSources(settings);

    for (const source of sources) {
      for (let attempt = 0; attempt < 2; attempt++) {
        // 阶段式进度 Notice（tarball 无法流式分块），节流 500ms
        let lastProgressNotice = 0;
        const showStage = (progress: DownloadProgress): void => {
          const now = Date.now();
          if (now - lastProgressNotice < 500) return;
          lastProgressNotice = now;
          new Notice('KiloCode: ' + progress.stage + '...', 0);
        };
        try {
          const { binaryBuffer } = await downloadBinary(
            source.packageName, PINNED_CLI_VERSION,
            this.platformInfo.binaryName, source.registry,
            { onProgress: showStage },
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
    throw lastError instanceof Error ? lastError : new Error('All download sources failed');
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

  /** 原子写：先写临时文件，全部成功后换名；中途失败删除 .new，现有二进制不受影响 */
  private writeBinary(binaryBuffer: Buffer): string {
    if (!this.platformInfo) throw new Error('Platform not detected');
    if (!fs.existsSync(this.binDir)) fs.mkdirSync(this.binDir, { recursive: true });
    const binaryPath = path.join(this.binDir, this.platformInfo.binaryName);
    const tmpPath = binaryPath + '.new';
    try {
      fs.writeFileSync(tmpPath, binaryBuffer);
      if (process.platform !== 'win32') fs.chmodSync(tmpPath, 0o755);
      // Windows 的 rename 不覆盖已存在文件，先移除旧二进制（新文件此刻已就绪）
      if (fs.existsSync(binaryPath)) fs.unlinkSync(binaryPath);
      fs.renameSync(tmpPath, binaryPath);
    } catch (err) {
      // 换名失败时清理临时文件，避免下次检测到半成品
      try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch { /* best effort */ }
      throw err;
    }
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
      // 参数化调用避免路径含引号时的命令注入（§7.5.1）
      spawnSync('xattr', ['-d', 'com.apple.quarantine', binaryPath], { timeout: 3000 });
    } catch { /* ignore: xattr not available */ }
  }

  private getBinaryName(): string {
    return process.platform === 'win32' ? 'kilo.exe' : 'kilo';
  }

  /**
   * 校验系统/global 二进制版本与 PINNED_CLI_VERSION 一致（§6.3.3）。
   * 无法运行或版本不符都返回 false，降级走下载路径，避免 SDK/CLI 协议错配。
   */
  private async isCompatibleVersion(binaryPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const isWin = process.platform === 'win32';
      const proc = spawn(binaryPath, ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5000,
        shell: isWin,
        windowsHide: true,
      });
      let out = '';
      proc.stdout?.on('data', (d: Buffer) => { out += d.toString('utf8'); });
      proc.on('error', () => resolve(false));
      proc.on('exit', (code) => {
        if (code !== 0) { resolve(false); return; }
        const m = out.match(/(\d+\.\d+\.\d+)/);
        if (!m) { resolve(false); return; }
        const compatible = m[1] === PINNED_CLI_VERSION;
        if (!compatible) {
          console.warn('[KiloCode] System kilo version', m[1], '!= pinned', PINNED_CLI_VERSION, '- falling back to download');
        }
        resolve(compatible);
      });
    });
  }
}

