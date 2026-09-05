import { supportsAvx2 } from '../../../src/core/binary/PlatformDetector';

jest.mock('child_process');

import * as childProcess from 'child_process';

describe('supportsAvx2 (Windows 分支)', () => {
  const platformDesc = Object.getOwnPropertyDescriptor(process, 'platform');
  const archDesc = Object.getOwnPropertyDescriptor(process, 'arch');

  const spawnMock = childProcess.spawnSync as jest.MockedFunction<typeof childProcess.spawnSync>;

  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    Object.defineProperty(process, 'arch', { value: 'x64' });
    spawnMock.mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (platformDesc) Object.defineProperty(process, 'platform', platformDesc);
    if (archDesc) Object.defineProperty(process, 'arch', archDesc);
  });

  it('powershell 报告 AVX2 存在时返回 true', () => {
    spawnMock.mockReturnValue({ status: 0, stdout: '1\n' } as never);
    expect(supportsAvx2()).toBe(true);
  });

  it('powershell 报告 AVX2 不存在时返回 false', () => {
    spawnMock.mockReturnValue({ status: 0, stdout: '0\n' } as never);
    expect(supportsAvx2()).toBe(false);
  });

  it('powershell 失败时回退到 pwsh 继续探测', () => {
    spawnMock.mockImplementation((exe: string) => {
      if (exe === 'powershell.exe') throw new Error('not found');
      return { status: 0, stdout: '1\n' } as never;
    });
    expect(supportsAvx2()).toBe(true);
  });
});
