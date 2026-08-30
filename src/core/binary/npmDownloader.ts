// npm tarball 下载 + gzip 解压 + tar 解析，提取平台二进制

import { gunzipSync } from 'zlib';
import { createHash } from 'crypto';
import { requestUrl } from 'obsidian';

const NPM_REGISTRY = 'https://registry.npmjs.org';
const TAR_BLOCK_SIZE = 512;

export interface DownloadResult {
  binaryBuffer: Buffer;
  version: string;
}

/** 下载进度回调：阶段式（tarball 无法流式分块时 stage 驱动 Notice 更新） */
export interface DownloadProgress {
  stage: 'manifest' | 'downloading' | 'verifying' | 'extracting';
  bytesTotal?: number;
}

export interface DownloadOptions {
  onProgress?: (progress: DownloadProgress) => void;
}

/**
 * 构造 npm tarball 下载 URL。
 * 格式: {registry}/{packageName}/-/{nameWithoutScope}-{version}.tgz
 */
export function buildTarballUrl(packageName: string, version: string, registry?: string): string {
  const base = registry || NPM_REGISTRY;
  const nameWithoutScope = packageName.replace(/^@[^/]+\//, '');
  return `${base}/${packageName}/-/${nameWithoutScope}-${version}.tgz`;
}

/** 获取指定版本的 dist 完整性信息（integrity 为 sha512-base64，shasum 为 sha1 hex） */
export async function fetchDistIntegrity(
  packageName: string,
  version: string,
  registry?: string,
): Promise<{ integrity?: string; shasum?: string }> {
  const base = registry || NPM_REGISTRY;
  const url = `${base}/${encodeURIComponent(packageName).replace('%40', '@')}/${version}`;
  try {
    const response = await requestUrl({ url, method: 'GET' });
    if (response.status !== 200) return {};
    const manifest = response.json as {
      dist?: { integrity?: string; shasum?: string };
    };
    return { integrity: manifest?.dist?.integrity, shasum: manifest?.dist?.shasum };
  } catch {
    // registry 不可达 integrity 端点时退化为不校验（不阻塞下载主流程）
    return {};
  }
}

/** 校验 buffer 与 npm dist 声明一致；integrity 缺失时跳过（返回 true） */
export function verifyBufferIntegrity(
  buffer: Buffer,
  expected: { integrity?: string; shasum?: string },
): boolean {
  if (expected.integrity?.startsWith('sha512-')) {
    const actual = 'sha512-' + createHash('sha512').update(buffer).digest('base64');
    return actual === expected.integrity;
  }
  if (expected.shasum) {
    return createHash('sha1').update(buffer).digest('hex') === expected.shasum;
  }
  // registry 未提供校验信息：跳过（记为通过）
  return true;
}

/**
 * 从 tar buffer 中提取指定路径的文件。
 * tar 格式: 每个文件由 512 字节头 + 文件内容（512 对齐）组成。
 * 文件头结构: name(0,100) | size(124,12,八进制) | typeflag(156,1) | checksum(148,8)
 */
export function extractBinaryFromTarball(tarBuffer: Buffer, targetPath: string): Buffer | null {
  let offset = 0;

  while (offset + TAR_BLOCK_SIZE <= tarBuffer.length) {
    const isZeroBlock = tarBuffer.subarray(offset, offset + TAR_BLOCK_SIZE).every(b => b === 0);
    if (isZeroBlock) break;

    let nameEnd = offset + 100;
    for (let i = offset; i < offset + 100; i++) {
      if (tarBuffer[i] === 0) { nameEnd = i; break; }
    }
    const name = tarBuffer.subarray(offset, nameEnd).toString('utf8');

    const sizeStr = tarBuffer.subarray(offset + 124, offset + 136).toString('utf8').replace(/\0.*/, '');
    const size = parseInt(sizeStr, 8) || 0;

    const typeFlag = tarBuffer[offset + 156];

    offset += TAR_BLOCK_SIZE;

    if (name === targetPath && (typeFlag === 48 || typeFlag === 0) && size > 0) {
      return tarBuffer.subarray(offset, offset + size);
    }

    offset += Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
  }

  return null;
}

/**
 * 从 npm registry 下载平台包 tarball 并提取二进制。
 * 下载前查询 dist integrity 供调用方做完整性校验（§6.3.1）。
 */
export async function downloadBinary(
  packageName: string,
  version: string,
  binaryName: string,
  registry?: string,
  options?: DownloadOptions,
): Promise<DownloadResult & { integrity: { integrity?: string; shasum?: string } }> {
  options?.onProgress?.({ stage: 'manifest' });
  const integrity = await fetchDistIntegrity(packageName, version, registry);

  options?.onProgress?.({ stage: 'downloading' });
  const url = buildTarballUrl(packageName, version, registry);

  const response = await requestUrl({ url, method: 'GET' });

  if (response.status !== 200) {
    throw new Error(`Download failed: HTTP ${response.status} from ${url}`);
  }

  const tgzBuffer = Buffer.from(response.arrayBuffer);

  options?.onProgress?.({ stage: 'verifying' });
  if (!verifyBufferIntegrity(tgzBuffer, integrity)) {
    throw new Error(`Checksum mismatch for tarball from ${url} — download corrupted, aborting`);
  }

  options?.onProgress?.({ stage: 'extracting' });
  const tarBuffer = gunzipSync(tgzBuffer);

  const binaryPath = `package/bin/${binaryName}`;
  const binaryBuffer = extractBinaryFromTarball(tarBuffer, binaryPath);

  if (!binaryBuffer) {
    throw new Error(`Binary "${binaryPath}" not found in tarball from ${url}`);
  }

  return { binaryBuffer, version, integrity };
}
