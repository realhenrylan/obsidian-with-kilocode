// npm tarball 下载 + gzip 解压 + tar 解析，提取平台二进制

import { gunzipSync } from 'zlib';
import { requestUrl } from 'obsidian';

const NPM_REGISTRY = 'https://registry.npmjs.org';
const TAR_BLOCK_SIZE = 512;

export interface DownloadResult {
  binaryBuffer: Buffer;
  version: string;
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

/**
 * 从 tar buffer 中提取指定路径的文件。
 * tar 格式: 每个文件由 512 字节头 + 文件内容（512 对齐）组成。
 * 文件头结构: name(0,100) | size(124,12,八进制) | typeflag(156,1) | checksum(148,8)
 */
export function extractBinaryFromTarball(tarBuffer: Buffer, targetPath: string): Buffer | null {
  let offset = 0;

  while (offset + TAR_BLOCK_SIZE <= tarBuffer.length) {
    const isZeroBlock = tarBuffer.slice(offset, offset + TAR_BLOCK_SIZE).every(b => b === 0);
    if (isZeroBlock) break;

    let nameEnd = offset + 100;
    for (let i = offset; i < offset + 100; i++) {
      if (tarBuffer[i] === 0) { nameEnd = i; break; }
    }
    const name = tarBuffer.slice(offset, nameEnd).toString('utf8');

    const sizeStr = tarBuffer.slice(offset + 124, offset + 136).toString('utf8').replace(/\0.*/, '');
    const size = parseInt(sizeStr, 8) || 0;

    const typeFlag = tarBuffer[offset + 156];

    offset += TAR_BLOCK_SIZE;

    if (name === targetPath && (typeFlag === 48 || typeFlag === 0) && size > 0) {
      return tarBuffer.slice(offset, offset + size);
    }

    offset += Math.ceil(size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
  }

  return null;
}

/**
 * 从 npm registry 下载平台包 tarball 并提取二进制。
 */
export async function downloadBinary(
  packageName: string,
  version: string,
  binaryName: string,
  registry?: string
): Promise<DownloadResult> {
  const url = buildTarballUrl(packageName, version, registry);

  const response = await requestUrl({ url, method: 'GET' });

  if (response.status !== 200) {
    throw new Error(`Download failed: HTTP ${response.status} from ${url}`);
  }

  const tgzBuffer = Buffer.from(response.arrayBuffer);
  const tarBuffer = gunzipSync(tgzBuffer);

  const binaryPath = `package/bin/${binaryName}`;
  const binaryBuffer = extractBinaryFromTarball(tarBuffer, binaryPath);

  if (!binaryBuffer) {
    throw new Error(`Binary "${binaryPath}" not found in tarball from ${url}`);
  }

  return { binaryBuffer, version };
}
