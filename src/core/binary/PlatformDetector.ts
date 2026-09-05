import * as fs from 'fs';
import { execFileSync, spawnSync } from 'child_process';

export interface PlatformInfo {
  platform: 'windows' | 'darwin' | 'linux';
  arch: 'x64' | 'arm64';
  isBaseline: boolean;
  isMusl: boolean;
  binaryName: string;
  npmPackageCandidates: string[];
}

const PLATFORM_MAP: Record<string, 'windows' | 'darwin' | 'linux'> = {
  win32: 'windows',
  darwin: 'darwin',
  linux: 'linux',
};

const ARCH_MAP: Record<string, 'x64' | 'arm64'> = {
  x64: 'x64',
  arm64: 'arm64',
};

/**
 * 检测当前 CPU 是否支持 AVX2 指令集。
 * x64 架构下，无 AVX2 的 CPU 需要使用 baseline 变体。
 */
export function supportsAvx2(): boolean {
  const arch = ARCH_MAP[process.arch];
  if (arch !== 'x64') return false;

  const platform = PLATFORM_MAP[process.platform];
  if (platform === 'linux') {
    try {
      return /(^|\s)avx2(\s|$)/i.test(fs.readFileSync('/proc/cpuinfo', 'utf8'));
    } catch {
      return false;
    }
  }

  if (platform === 'darwin') {
    try {
      // 参数化调用（无 shell）：固定参数数组，规避 shell 解析与命令注入（§7.5.1）
      const result = execFileSync('sysctl', ['-n', 'hw.optional.avx2_0'], { encoding: 'utf8', timeout: 1500 });
      return result.trim() === '1';
    } catch {
      return false;
    }
  }

  if (platform === 'windows') {
    const cmd = '(Add-Type -MemberDefinition "[DllImport(""kernel32.dll"")] public static extern bool IsProcessorFeaturePresent(int ProcessorFeature);" -Name Kernel32 -Namespace Win32 -PassThru)::IsProcessorFeaturePresent(40)';
    try {
      // 参数化调用（无 shell）：PowerShell 命令文本作为单个参数传递，避免 shell 引号解析与命令注入（§7.5.1）
      const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], {
        encoding: 'utf8',
        timeout: 3000,
        windowsHide: true,
      });
      if (result.status !== 0) throw new Error(`powershell exit code ${result.status}`);
      const out = (result.stdout || '').trim().toLowerCase();
      if (out === 'true' || out === '1') return true;
      if (out === 'false' || out === '0') return false;
    } catch {
      // 继续尝试 pwsh.exe
    }
    try {
      const result = spawnSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], {
        encoding: 'utf8',
        timeout: 3000,
        windowsHide: true,
      });
      if (result.status !== 0) return false;
      const out = (result.stdout || '').trim().toLowerCase();
      if (out === 'true' || out === '1') return true;
      if (out === 'false' || out === '0') return false;
    } catch {
      // 两个 shell 均不可用，按不支持 AVX2 处理
    }
    return false;
  }

  return false;
}

/**
 * 检测 Linux 系统是否使用 musl libc（如 Alpine Linux）。
 */
export function isMusl(): boolean {
  if (process.platform !== 'linux') return false;

  try {
    if (fs.existsSync('/etc/alpine-release')) return true;
  } catch {
    // ignore
  }

  try {
    const result = execFileSync('ldd', ['--version'], { encoding: 'utf8', timeout: 1500 });
    const text = (result || '').toLowerCase();
    if (text.includes('musl')) return true;
  } catch {
    // ignore
  }

  return false;
}

/**
 * 检测当前平台信息并返回 npm 包名候选列表（按优先级排列）。
 * 逻辑与 @kilocode/cli 的 bin/kilo 脚本完全一致。
 */
export function detectPlatform(): PlatformInfo {
  const platform = PLATFORM_MAP[process.platform];
  const arch = ARCH_MAP[process.arch];

  if (!platform || !arch) {
    throw new Error(`Unsupported platform: ${process.platform}-${process.arch}`);
  }

  const binaryName = platform === 'windows' ? 'kilo.exe' : 'kilo';
  const baseline = arch === 'x64' && !supportsAvx2();
  const musl = platform === 'linux' ? isMusl() : false;
  const base = `@kilocode/cli-${platform}-${arch}`;

  const npmPackageCandidates = buildCandidateList(platform, arch, base, baseline, musl);

  return { platform, arch, isBaseline: baseline, isMusl: musl, binaryName, npmPackageCandidates };
}

/**
 * 构造 npm 包名候选列表，按优先级排列。
 */
function buildCandidateList(
  platform: 'windows' | 'darwin' | 'linux',
  arch: 'x64' | 'arm64',
  base: string,
  baseline: boolean,
  musl: boolean
): string[] {
  if (platform === 'linux') {
    if (musl) {
      if (arch === 'x64') {
        return baseline
          ? [`${base}-baseline-musl`, `${base}-musl`, `${base}-baseline`, base]
          : [`${base}-musl`, `${base}-baseline-musl`, base, `${base}-baseline`];
      }
      return [`${base}-musl`, base];
    }
    if (arch === 'x64') {
      return baseline
        ? [`${base}-baseline`, base, `${base}-baseline-musl`, `${base}-musl`]
        : [base, `${base}-baseline`, `${base}-musl`, `${base}-baseline-musl`];
    }
    return [base, `${base}-musl`];
  }

  if (arch === 'x64') {
    return baseline ? [`${base}-baseline`, base] : [base, `${base}-baseline`];
  }

  return [base];
}
