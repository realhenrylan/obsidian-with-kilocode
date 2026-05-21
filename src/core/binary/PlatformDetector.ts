import * as os from 'os';
import * as fs from 'fs';
import { execSync } from 'child_process';

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
  const arch = ARCH_MAP[os.arch()];
  if (arch !== 'x64') return false;

  const platform = PLATFORM_MAP[os.platform()];
  if (platform === 'linux') {
    try {
      return /(^|\s)avx2(\s|$)/i.test(fs.readFileSync('/proc/cpuinfo', 'utf8'));
    } catch {
      return false;
    }
  }

  if (platform === 'darwin') {
    try {
      const result = execSync('sysctl -n hw.optional.avx2_0', { encoding: 'utf8', timeout: 1500 });
      return result.trim() === '1';
    } catch {
      return false;
    }
  }

  if (platform === 'windows') {
    const cmd = '(Add-Type -MemberDefinition "[DllImport(""kernel32.dll"")] public static extern bool IsProcessorFeaturePresent(int ProcessorFeature);" -Name Kernel32 -Namespace Win32 -PassThru)::IsProcessorFeaturePresent(40)';
    for (const exe of ['powershell.exe', 'pwsh.exe']) {
      try {
        const result = execSync(`${exe} -NoProfile -NonInteractive -Command "${cmd}"`, {
          encoding: 'utf8',
          timeout: 3000,
          windowsHide: true,
        });
        const out = result.trim().toLowerCase();
        if (out === 'true' || out === '1') return true;
        if (out === 'false' || out === '0') return false;
      } catch {
        continue;
      }
    }
    return false;
  }

  return false;
}

/**
 * 检测 Linux 系统是否使用 musl libc（如 Alpine Linux）。
 */
export function isMusl(): boolean {
  if (os.platform() !== 'linux') return false;

  try {
    if (fs.existsSync('/etc/alpine-release')) return true;
  } catch {
    // ignore
  }

  try {
    const result = execSync('ldd --version', { encoding: 'utf8', timeout: 1500 });
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
  const platform = PLATFORM_MAP[os.platform()];
  const arch = ARCH_MAP[os.arch()];

  if (!platform || !arch) {
    throw new Error(`Unsupported platform: ${os.platform()}-${os.arch()}`);
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
