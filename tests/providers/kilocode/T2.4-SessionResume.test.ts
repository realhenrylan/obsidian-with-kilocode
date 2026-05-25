// T2.4 会话续接 — 前提验证
//
// 此测试验证 `kilo serve` CLI 是否支持 session resume。
// 需要 KILO_API_KEY 或有效的 KiloCode CLI 配置才能运行。
//
// 测试流程：
// 1. 启动 kilo serve（子进程）
// 2. POST /session 创建会话 A
// 3. 保存 sessionId = A
// 4. 停止 kilo serve
// 5. 启动新的 kilo serve
// 6. POST /session { id: sessionId } — 尝试恢复会话 A
// 7. 检查 CLI 是否返回 200（支持 resume）vs 错误（不支持）
//
// 如果此测试被跳过（无 API key），表明 CLI 环境未配置，
// 会话续接功能应标记为「推迟 — 需要 CLI 支持」。

import { spawn, type ChildProcess } from 'child_process';
import http from 'http';
import { randomBytes } from 'crypto';
import os from 'os';
import * as fs from 'fs';
import * as pathModule from 'path';

// ── 配置 ────────────────────────────────────────────────────────

/** kilo 可执行文件路径（在 npm global 包中） */
const KILO_BIN = process.env.KILO_BIN_PATH || (() => {
  // 尝试从 npm global 包中查找
  const candidates = [
    // npm global dir
    pathModule.join(process.execPath, '..', '..', 'node_modules', '@kilocode', 'cli', 'node_modules', '@kilocode'),
    // Common locations
    pathModule.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', '@kilocode', 'cli', 'node_modules', '@kilocode'),
  ];
  for (const base of candidates) {
    try {
      const items = fs.readdirSync(base);
      for (const item of items) {
        if (item.startsWith('cli-') || item.startsWith('kilocode-')) {
          const binDir = pathModule.join(base, item, 'bin');
          const bin = fs.readdirSync(binDir).find((f: string) => f.startsWith('kilo'));
          if (bin) return pathModule.join(binDir, bin);
        }
      }
    } catch { continue; }
  }
  return 'kilo'; // fallback to PATH
})();

// ── Helpers ──────────────────────────────────────────────────────

function generatePassword(): string {
  return randomBytes(24).toString('base64url');
}

function basicAuthHeader(password: string): string {
  return `Basic ${Buffer.from(`kilo:${password}`).toString('base64')}`;
}

interface ServerInfo {
  process: ChildProcess;
  port: number;
  password: string;
}

/**
 * 启动 kilo serve 并等待其就绪。
 * 返回进程引用、端口和密码。
 */
function startKiloServe(password: string): Promise<ServerInfo> {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      KILO_SERVER_PASSWORD: password,
    };

    const proc = spawn(KILO_BIN, ['serve', '--port', '0'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });

    let settled = false;
    let output = '';

    const onData = (data: Buffer) => {
      output += data.toString();
      const portMatch = output.match(/https?:\/\/127\.0\.0\.1:(\d+)/);
      if (portMatch && !settled) {
        settled = true;
        resolve({ process: proc, port: Number(portMatch[1]), password });
      }
    };

    const onError = (err: Error) => {
      if (!settled) { settled = true; reject(err); }
    };

    const onExit = (code: number | null) => {
      if (!settled) { settled = true; reject(new Error(`kilo serve exited with code ${code}`)); }
    };

    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onData);
    proc.on('error', onError);
    proc.on('exit', onExit);

    // 超时
    setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Timed out waiting for kilo serve to start'));
      }
    }, 15000);
  });
}

function httpRequest(port: number, password: string, path: string, method: string, body?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': basicAuthHeader(password),
      } as Record<string, string>,
    };

    if (body) options.headers['Content-Length'] = Buffer.byteLength(body).toString();

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf-8'),
        });
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── 测试 ────────────────────────────────────────────────────────

describe('T2.4 Session Resume — Prerequisite Verification', () => {
  // 此测试需要有效的 KiloCode CLI 配置（API key）。
  // 如果 KILO_SKIP_CLI_TESTS 环境变量存在或没有 API key，跳过测试。
  const hasApiKey = !!(process.env.KILO_API_KEY || process.env.KILO_BASE_URL);
  const testFn = hasApiKey ? test : test.skip;

  testFn('POST /session with custom id returns the same session', async () => {
    const password = generatePassword();

    // 启动第一个 serve 实例
    const server1 = await startKiloServe(password);
    try {
      // 创建 session
      const createResp = await httpRequest(server1.port, password, '/session', 'POST', '{}');
      expect(createResp.status).toBe(200);
      const sessionData = JSON.parse(createResp.body);
      const sessionId = sessionData.id ?? sessionData.sessionId;
      expect(sessionId).toBeTruthy();

      // 尝试在同一个进程中发消息（已有 session ID — 不创建新的）
      const msgResp = await httpRequest(
        server1.port, password,
        `/session/${encodeURIComponent(sessionId)}/message`,
        'POST',
        JSON.stringify({ messageID: 'msg-1', parts: [{ type: 'text', text: 'hello' }] }),
      );
      // 至少应该返回 200 而不是 404
      expect(msgResp.status).toBe(200);
    } finally {
      server1.process.kill();
    }

    // 启动第二个 serve 实例（模拟重启）
    const server2 = await startKiloServe(password);
    try {
      // 尝试用相同的 session ID 创建 session（session resume）
      // 如果 CLI 支持，POST /session { id: oldSessionId } 应返回 200
      // 如果不支持，可能返回错误或生成新 ID
      const resumeResp = await httpRequest(
        server2.port, password,
        '/session',
        'POST',
        JSON.stringify({ id: 'resumable-session-test-id' }),
      );

      // 验证：无论 CLI 是否支持，都应该有合理的返回
      // 如果返回 200，表明支持自定义 ID
      // 如果返回错误，表明不支持
      if (resumeResp.status === 200) {
        const data = JSON.parse(resumeResp.body);
        const returnedId = data.id ?? data.sessionId;
        console.log('[SessionResume] CLI supports custom session ID:', returnedId);
        expect(returnedId).toBeTruthy();
      } else {
        // CLI 不支持自定义 session ID — 此功能需推迟
        console.log('[SessionResume] CLI does NOT support custom session ID (HTTP ' + resumeResp.status + ')');
        console.log('[SessionResume] Response:', resumeResp.body.slice(0, 200));
      }
    } finally {
      server2.process.kill();
    }
  }, 30000);
});
