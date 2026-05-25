# KiloCode Obsidian 插件改进方案

> 基于 OpenDesign/OpenDesignr 技术分析的实战改进  
> 日期：2026-05-24  
> 目标：在保持 KiloCode CLI 子进程架构的前提下，最大化借鉴 OpenDesign 的设计模式

---

## 零、约束条件与可行范围

### 不变的约束

| 约束 | 原因 |
|------|------|
| `kilo serve` 必须是独立子进程 | KiloCode CLI 是独立的 Go 二进制，无法嵌入 Obsidian 进程 |
| HTTP 通信不可避免 | Plugin（Electron renderer）↔ `kilo serve`（子进程）只能通过 HTTP |
| 不能使用 `@anthropic-ai/claude-agent-sdk` | 该 SDK 面向 Claude Code 生态，与 KiloCode CLI 不兼容 |

### OpenDesign 可移植的模式

| 模式 | 可移植性 | 说明 |
|------|----------|------|
| ✅ 技能目录系统 | **高** | 纯文件系统操作，与 Agent 无关 |
| ✅ 结构化提问协议 | **高** | `ask_questions`/`pick_option` 模式 |
| ✅ 验证器子代理 | **高** | 第二个独立会话的 `kilo serve` 调用 |
| ✅ 系统提示词注入 | **高** | 将技能内容注入消息上下文 |
| ✅ SSE 事件缓冲 | **中** | 需要修改运行时层 |
| ✅ 会话续接 | **中** | 取决于 `kilo serve` 是否支持 session resume |
| ✅ HTTP Keep-Alive | **中** | Node.js `http.Agent` 原生支持 |
| ⚠️ 进程内 MCP | **低** | KiloCode CLI 不支持进程内 MCP |
| ❌ SDK 替代子进程 | **不可行** | 架构约束 |

---

## 一、技能目录系统（最高优先级）

### 1.1 设计

这是从 OpenDesign 借鉴的最核心模式。当前 KiloCode 的 Agent 行为定义散落在 `AGENTS.md` 和 `.kilo/agent/*.md` 中，Agent 需要**手动**加载。改为技能目录后，Agent 自动发现并按需加载。

```
.vault/
├── .kilo/
│   ├── skills/                      # ← 新技能目录
│   │   ├── kilocode-core/SKILL.md   # 入口技能（始终加载）
│   │   ├── obsidian-search/SKILL.md # 搜索专家（按需）
│   │   ├── vault-management/SKILL.md
│   │   ├── note-creation/SKILL.md
│   │   ├── plugin-dev/SKILL.md
│   │   ├── frontmatter/SKILL.md
│   │   └── dataview/SKILL.md
│   ├── sessions/                    # 会话存储（现已有）
│   └── agent/                       # 旧 agent 指令（逐步迁移到 skills/）
```

### 1.2 技能文件格式

```markdown
---
name: kilocode-core
description: Use when working within Obsidian — note management, vault search, frontmatter...
---

You are embedded in an Obsidian vault. Your working directory is the vault root.

## Core Principles
1. **Vault-first thinking**: Every action should consider the vault structure.
   - Before creating a note, check if a similar one already exists
   - Before modifying, read the file and surrounding context
2. **Obsidian-specific knowledge**:
   - Notes use Markdown with YAML frontmatter
   - Internal links use `[[wikilink]]` syntax
   - Tags are `#tag` in body or in frontmatter `tags:` field
3. **File operations**: Always use absolute paths within the vault.

## Workflow
1. **Scan vault structure** — use Glob/Grep to understand existing patterns
2. **Read relevant files** — never assume content from filenames
3. **Make changes** — prefer Edit (targeted) over Write (full overwrite)
4. **Verify** — re-read the modified file to confirm correctness

## Anti-patterns
- ❌ Never modify `.obsidian/` config files without explicit user request
- ❌ Never use paths outside the vault root
- ❌ Never assume Note A links to Note B without checking
- ❌ Never create duplicate notes — search first
```

### 1.3 实现方案

**文件**：`src/core/skills/SkillLoader.ts`（新文件，~150 行）

```typescript
import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';

interface SkillMeta {
  name: string;
  description: string;  // "Use when..." 句式
  content: string;       // 剥离 frontmatter 后的正文
  path: string;
}

const SKILLS_CACHE = new Map<string, { skills: SkillMeta[]; loadedAt: number }>();
const CACHE_TTL_MS = 30_000;  // 30 秒缓存（参考 OpenCode Provider）

/**
 * 扫描 .kilo/skills/ 目录，返回所有已发现的技能
 */
export async function loadSkills(vaultPath: string): Promise<SkillMeta[]> {
  const cached = SKILLS_CACHE.get(vaultPath);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.skills;
  }

  const skillsDir = resolve(vaultPath, '.kilo', 'skills');
  if (!existsSync(skillsDir)) return [];

  const entries = await readdir(skillsDir);
  const skills: SkillMeta[] = [];

  for (const name of entries.sort()) {
    if (name.startsWith('.')) continue;
    const skillPath = resolve(skillsDir, name, 'SKILL.md');
    if (!existsSync(skillPath)) continue;

    const raw = await readFile(skillPath, 'utf-8');
    const { frontmatter, content } = extractFrontmatter(raw);

    if (frontmatter.name && frontmatter.description) {
      skills.push({
        name: frontmatter.name,
        description: frontmatter.description,
        content: content.trim(),
        path: skillPath,
      });
    }
  }

  SKILLS_CACHE.set(vaultPath, { skills, loadedAt: Date.now() });
  return skills;
}

function extractFrontmatter(raw: string): {
  frontmatter: Record<string, string>;
  content: string;
} {
  if (!raw.startsWith('---')) return { frontmatter: {}, content: raw };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { frontmatter: {}, content: raw };

  const fmBlock = raw.slice(3, end).trim();
  const body = raw.slice(end + 4);

  const fm: Record<string, string> = {};
  for (const line of fmBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      fm[line.slice(0, colonIdx).trim()] = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
    }
  }

  return { frontmatter: fm, content: body };
}
```

**集成到 Runtime**：在 `buildMessagePayload()` 前注入核心技能

```typescript
// KiloCodeChatRuntime.ts sendMessage() 修改
async *sendMessage(content: string, context?: MessageContext): AsyncGenerator<StreamChunk> {
  await this.start();

  // ↓ 新增：加载技能并注入到消息上下文
  const skillsContext = await this.buildSkillsContext(context?.vaultPath);

  // 原有的 payload 构建...
  const payload = await this.buildMessagePayload(
    skillsContext + '\n\n' + content,  // 技能上下文前置
    context
  );
  // ...
}

private async buildSkillsContext(vaultPath?: string): Promise<string> {
  if (!vaultPath) return '';
  const skills = await loadSkills(vaultPath);
  if (skills.length === 0) return '';

  const core = skills.find(s => s.name === 'kilocode-core');
  const others = skills.filter(s => s.name !== 'kilocode-core');

  const parts: string[] = [];

  // 核心技能：注入为系统级指令
  if (core) {
    parts.push(`[SYSTEM CONTEXT — Obsidian KiloCode Core]\n${core.content}`);
  }

  // 其他技能：列出可用（Agent 可通过 skill 工具按需加载）
  if (others.length > 0) {
    parts.push('\n[AVAILABLE SPECIALIST SKILLS]');
    for (const s of others) {
      parts.push(`- ${s.name}: ${s.description}`);
    }
    parts.push('Use the `skill` tool to load any of these when needed.');
  }

  return parts.join('\n');
}
```

### 1.4 收益

| 方面 | 改进前 | 改进后 |
|------|--------|--------|
| Agent 对 Obsidian 的理解 | 依赖通用训练数据 | 精确的 vault 结构 + API 知识 |
| 跨 vault 一致性 | 每个 vault 行为不同 | 技能统一行为 |
| 更新维护 | 修改 AGENTS.md 需要重启 | 技能自动发现 + 30s 热更新 |
| 用户可定制 | 需要理解插件代码 | 编辑 .kilo/skills/*/SKILL.md |
| Token 效率 | 每次都需描述 vault 结构 | 核心技能只需一次（通过 prompt caching） |

---

## 二、HTTP 连接池化（高优先级，低风险）

### 2.1 现状问题

```typescript
// 当前：每次 sendMessage() 创建新的 TCP 连接
private async request(path: string, options: RequestOptions): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = http.request(this.serverBaseUrl + path, options, (res) => {
      // 每次 new connection — TCP 三次握手 (1-3ms) + TLS (如使用 HTTPS)
    });
    req.end();
  });
}
```

慢速操作中这 1-3ms 可忽略，但问题是频繁的冷启动 + 空闲超时后每次都走完整的 TCP 握手。

### 2.2 改进方案

```typescript
// KiloCodeChatRuntime.ts 新增
import http from 'http';

// 连接池 — 整个 runtime 生命周期复用
private httpAgent: http.Agent;

constructor(binaryManager: BinaryManager, getSettings: () => KiloCodeSettings) {
  // ...
  this.httpAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 30_000,    // 30 秒保活
    maxSockets: 1,             // 单连接到 kilo serve
    maxFreeSockets: 1,
    timeout: 60_000,           // 60 秒空闲超时
  });
}

private async request(path: string, options: RequestOptions): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      this.serverBaseUrl + path,
      {
        ...options,
        agent: this.httpAgent,  // ← 使用连接池
      },
      (res) => { /* ... */ }
    );
    req.end();
  });
}

// stop() 时销毁连接池
async stop(): Promise<void> {
  this.httpAgent.destroy();
  // ... 原有的清理逻辑
}
```

### 2.3 收益

- 消除每次 `sendMessage()` 的 TCP 握手延迟（1-3ms → 0ms）
- 减少 `kilo serve` 的 socket 创建/销毁压力
- 特别有利于多轮对话（同一 runtime 内多次 sendMessage）

---

## 三、结构化事件缓冲（中等优先级）

### 3.1 设计

参考 OpenDesignr 的 `job-registry.ts`，在当前 runtime 中添加轻量级事件缓冲：

```
当前流程（无缓冲）:
  sendMessage() → SSE stream → 直接 yield chunk
  问题：如果 Obsidian 视图关闭/切换标签，流中断且无法恢复

改进流程（有缓冲）:
  sendMessage() → SSE stream → buffer.append(chunk) → yield chunk
  同时：buffer 保存在 runtime 中
  重新打开视图时：buffer.replay(sinceSeq) → 恢复所有已收到的消息
```

### 3.2 实现方案

```typescript
// src/providers/kilocode/runtime/EventBuffer.ts（新文件，~100 行）

interface BufferedEvent {
  seq: number;
  type: StreamChunk['type'];
  data: unknown;
  timestamp: number;
}

export class EventBuffer {
  private events: BufferedEvent[] = [];
  private maxEvents = 500;  // 最多缓存 500 个事件

  append(chunk: StreamChunk): void {
    this.events.push({
      seq: this.events.length + 1,
      type: chunk.type,
      data: chunk,
      timestamp: Date.now(),
    });
    // 滚动窗口
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }

  /** 获取 sinceSeq 之后的所有事件 */
  getSince(seq: number): BufferedEvent[] {
    return this.events.filter(e => e.seq > seq);
  }

  /** 返回最后 N 个事件 */
  getLast(n: number): BufferedEvent[] {
    return this.events.slice(-n);
  }

  clear(): void {
    this.events = [];
  }

  get length(): number {
    return this.events.length;
  }
}
```

**集成到 KiloCodeChatRuntime**：

```typescript
export class KiloCodeChatRuntime implements ChatRuntime {
  private eventBuffer = new EventBuffer();
  private currentSeq = 0;

  async *sendMessage(content: string, context?: MessageContext): AsyncGenerator<StreamChunk> {
    // ...
    for await (const chunk of this.parseResponse(response)) {
      // 缓冲事件（用于标签切换恢复）
      this.eventBuffer.append(chunk);
      yield chunk;
    }
    // ...
  }

  /** 恢复流状态 — 标签切换后调用 */
  replaySince(seq: number): StreamChunk[] {
    return this.eventBuffer.getSince(seq).map(e => e.data as StreamChunk);
  }
}
```

### 3.3 收益

| 场景 | 改进前 | 改进后 |
|------|--------|--------|
| 切换标签再切回 | 流内容丢失 | 从缓冲区恢复 |
| 短时间网络抖动 | TCP 重连需重建一切 | 从 lastSeq 恢复 |
| 关闭再打开视图 | 必须重新发送消息 | 可恢复进度（若 runtime 未 kill） |

---

## 四、对话高亮标记（Anti-pattern Rules）

### 4.1 设计

参考 OpenDesign 核心技能中的 **Anti-slop list** 和 opendesignr 系统提示词中的 **硬性约束**。

在当前 `AGENTS.md` 和系统提示词中增加 Obsidian 特定的禁止模式：

```markdown
## Obsidian Anti-patterns — HARD RULES

### 文件操作
- ❌ 绝不修改 `.obsidian/` 下的任何配置文件（除非用户明确要求）
- ❌ 绝不在 vault 之外创建文件
- ❌ 绝不删除用户的笔记（只做标记或移到 trash）

### 内容规范
- ❌ 不要虚构 [[wikilink]] 链接到不存在的笔记
- ❌ 不要在 frontmatter 中创建虚假字段
- ❌ 不要假设 Dataview 查询的可用性（先检查 dataview 插件是否存在）

### 行为规范
- ❌ 一次修改不要跨越超过 5 个文件（避免级联错误）
- ❌ 不要在没有先 Read 文件内容的情况下 Edit
- ❌ 新建笔记前必须先 Glob 搜索是否已存在类似笔记
- ❌ 不要添加不必要的 frontmatter 字段

### 工具使用
- ❌ 不要用 Write 覆盖大型已有文件 — 用 Edit 做定向修改
- ❌ 不要用 Bash touch/rm 代替文件操作 — 用 Write/Edit
```

这些规则会通过技能系统自动注入到每次对话的上下文中。

---

## 五、启动预热优化

### 5.1 现状

```typescript
// KiloCodeView.ts onOpen()
warmupRuntime() {
  // fire-and-forget — 只在视图打开时触发
  // 如果用户打开 Obsidian 后很久才打开 KiloCode 面板，预热无效果
}
```

### 5.2 改进

```typescript
// main.ts onload()
async onload() {
  // ... 现有初始化代码

  // 新增：插件加载时立即开始预热（不等待视图打开）
  if (settings.autoStart) {
    this.warmupRuntimeEarly();
  }
}

private async warmupRuntimeEarly(): Promise<void> {
  // 在后台启动 kilo serve，不阻塞 UI
  // 用户打开 KiloCode 面板时进程已就绪
  setTimeout(async () => {
    try {
      const runtime = await this.getOrCreateRuntime();
      await runtime.start();
      console.log('[KiloCode] Pre-warmed runtime on plugin load');
    } catch (err) {
      // 静默失败 — 不影响用户体验
      console.debug('[KiloCode] Early warmup failed (will retry on first message):', err);
    }
  }, 1000);  // 1 秒延迟，让 Obsidian UI 先完成渲染
}
```

**配合**：将 `autoStart` 设置默认设为 `true`。

### 5.3 收益

| 场景 | 改进前 | 改进后 |
|------|--------|--------|
| 打开 Obsidian → 立即使用 KiloCode | 2-6s 冷启动 | < 500ms（进程已就绪） |
| 打开 Obsidian → 5 分钟后使用 | 可能已超时被杀 | 进程保活（keep-alive 连接池） |

---

## 六、会话续接（Session Resume）

### 6.1 现状

```typescript
// 当前：每次 startServer() 都创建新 session
private async startServer(): Promise<void> {
  // ...
  this.sessionId = await this.createSession();  // 总是新建
}
```

### 6.2 改进

如果 `kilo serve` 支持 session resume（通过 `POST /session/{id}/message` 复用已有 session），我们可以：

```typescript
export class KiloCodeChatRuntime implements ChatRuntime {
  private lastSessionId: string | null = null;

  async start(): Promise<void> {
    if (this.serverBaseUrl && this.currentProcess && !this.currentProcess.killed) {
      // 进程活着的，尝试续接上次会话
      if (this.lastSessionId) {
        this.sessionId = this.lastSessionId;
        return;  // 复用已有 session，跳过 createSession
      }
      return;
    }
    // 冷启动...
  }

  async *sendMessage(content: string, context?: MessageContext): AsyncGenerator<StreamChunk> {
    await this.start();

    // 构建 payload 时传入 resume 信息
    const payload = await this.buildMessagePayload(content, context);
    if (this.lastSessionId) {
      payload.resume = this.lastSessionId;  // 告诉 CLI 复用会话
    }

    // ...发送请求

    // 完成后保存 sessionId
    this.lastSessionId = this.sessionId;
  }
}
```

**关键前提**：KiloCode CLI 的 HTTP API 需要支持 session resume。需确认 CLI 版本。

### 6.3 收益

- 启用 prompt caching（系统提示词 90% token 折扣）
- 第二轮开始延迟从 3-5s 降到 1-2s
- 对话历史上下文保持连续

---

## 七、结构化提问协议

### 7.1 设计

参考 OpenDesign 的 `ask_questions`（批量多问题单卡片）和 `pick_option`（单选）模式。

当前 KiloCode 的 Agent 使用自由文本提问，导致：
- Agent 可能一次问太多问题（token 浪费）
- 问题格式不一致
- 无法实现"Decide for me"和"Explore options"语义

### 7.2 实现

在系统提示词中注入结构化提问规则：

```typescript
// src/providers/kilocode/runtime/prompts.ts（新文件）
export const QUESTION_PROTOCOL = `
## Question Protocol

When you need user input for multiple decisions, use the BATCH QUESTIONS pattern:
- Ask 2-8 questions in ONE message, each with options
- Include "Decide for me" and "Explore options" for every multiple-choice
- Format: numbered questions with labeled options (A/B/C/D)

Example:
"""
I need to clarify a few things before I proceed:

1. **Note location**: Where should this note go?
   A. Root of vault
   B. In a specific folder (tell me which)
   C. Decide for me (based on content type)
   D. Explore a few options

2. **Template style**: Any preference for the note template?
   A. Minimal (just title + body)
   B: Structured (with tags, aliases, created date)
   C. Academic (with citations, abstract)
   D. Decide for me
   E. Explore a few options

3. **Links**: Should I add backlinks to related notes?
   A. Yes, find and link all related notes
   B. Only if obvious connections exist
   C. No links for now
   D. Decide for me
"""
`;
```

**集成到 Runtime**：

```typescript
// 在 MAIN_SYSTEM_APPEND 或技能文件中注入
private async buildSkillsContext(vaultPath?: string): Promise<string> {
  const parts: string[] = [];

  // 核心技能
  const skills = await loadSkills(vaultPath);
  // ...

  // 提问协议
  parts.push(QUESTION_PROTOCOL);

  return parts.join('\n');
}
```

### 7.3 收益

- 减少"来回问答"的 round-trip 次数（token 节省 20-40%）
- 用户获得一致的结构化体验
- Agent 避免一次问太多分散的问题

---

## 八、验证器子代理（Review Sub-agent）

### 8.1 设计

参考 OpenDesignr 的 Review Loop：主 Agent 完成任务后，自动 fork 一个只读子代理检查结果。

### 8.2 实现方案

由于 KiloCode 使用子进程架构，验证器子代理就是**第二个 `kilo serve` 调用**（独立会话）：

```typescript
// KiloCodeChatRuntime.ts 新增
async runReviewLoop(
  userRequest: string,
  editedFiles: string[],
  vaultPath: string,
): Promise<'lgtm' | string> {
  // 创建独立的临时 runtime（专门用于审查）
  const reviewRuntime = new KiloCodeChatRuntime(this.binaryManager, this.getSettings);
  await reviewRuntime.start();

  const reviewPrompt = `
[REVIEW MODE — READ ONLY]

Original user request:
"""${userRequest}"""

Files modified:
${editedFiles.map(f => `- ${f}`).join('\n')}

Your task:
1. Read each modified file
2. Compare against the original request
3. Check for common issues:
   - Broken [[wikilinks]]
   - Inconsistent frontmatter format
   - Duplicate content with existing notes
   - Missing required fields

Output format:
- If everything is correct: respond with ONLY "LGTM"
- If issues found: list each issue on its own line, prefixed with "- "
  Keep under 200 words. Do NOT suggest fixes — just findings.

CONSTRAINT: You are in READ-ONLY mode. Do not use Write/Edit/Bash.`;

  let verdict = '';
  for await (const chunk of reviewRuntime.sendMessage(reviewPrompt, { vaultPath })) {
    if (chunk.type === 'text') verdict += chunk.text;
  }

  await reviewRuntime.stop();
  return verdict.trim();
}
```

**集成到 sendMessage 完成后的处理**：

```typescript
// KiloCodeView.ts handleSend() 的末尾
if (assistantMessage && settings.autoReview) {
  const editedFiles = extractEditedFiles(assistantMessage);
  if (editedFiles.length > 0) {
    const verdict = await runtime.runReviewLoop(
      userMessage.content,
      editedFiles,
      this.app.vault.adapter.basePath,
    );

    if (verdict !== 'LGTM') {
      new Notice(`🔍 Review found issues:\n${verdict}`);
    }
  }
}
```

### 8.3 收益

- 自动化的"第二双眼睛"质量检查
- 捕获常见错误（死链、格式不一致）
- 减少用户手动检查的工作量

---

## 九、改进后架构全景图

```
┌─ Obsidian Plugin 进程 ──────────────────────────────────────┐
│                                                               │
│  ┌─ Skills Loader ───────────────────────────────────────┐  │
│  │ .kilo/skills/*/SKILL.md → 注入到消息上下文              │  │
│  │ 30s TTL 缓存 → 技能热更新                               │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ Event Buffer ────────────────────────────────────────┐  │
│  │ 500 事件滑动窗口 → 标签切换恢复 → 断线重连              │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ HTTP Agent (Keep-Alive) ─────────────────────────────┐  │
│  │ 连接复用 → 消除 TCP 握手 → 30s 保活                     │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ KiloCodeChatRuntime ─────────────────────────────────┐  │
│  │  ┌─ EventBuffer  ┌─ SkillsContext  ┌─ ReviewLoop ─┐   │  │
│  │  └─────────────── └──────────────── └──────────────┘   │  │
│  │                                                         │  │
│  │  spawn("kilo", ["serve", "--port", "0"])               │  │
│  │    ├─ 预热：插件 onload 时启动（autoStart=true）        │  │
│  │    ├─ 连接：http.Agent keep-alive 池                    │  │
│  │    └─ 会话：resume 已有 sessionId（支持时）             │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌─ Review Loop ─────────────────────────────────────────┐  │
│  │ 主 Agent 完成后 → 独立 kilo serve 调用                  │  │
│  │ Read-only 模式 → QC 检查清单 → LGTM / 发现列表          │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

## 十、实施优先级与预期收益

### 第一阶段（本周可完成）

| 改进 | 工作量 | 文件 | 收益 |
|------|--------|------|------|
| HTTP Keep-Alive 连接池 | 10 行 | `KiloCodeChatRuntime.ts` | 消除 1-3ms TCP 握手 |
| 技能目录系统 | ~150 行 | 新 `SkillLoader.ts` + 修改 runtime | Agent 精确理解 Obsidian |
| 提问协议注入 | ~30 行 | 修改 `sendMessage()` | 减少 20-40% token |

### 第二阶段（1-2 周）

| 改进 | 工作量 | 文件 | 收益 |
|------|--------|------|------|
| 事件缓冲 | ~100 行 | 新 `EventBuffer.ts` | 标签切换不丢失流状态 |
| 启动预热优化 | ~20 行 | `main.ts` | 首次消息延迟减半 |
| 对话高亮标记 | 纯 Markdown | `.kilo/skills/kilocode-core/SKILL.md` | 减少 Agent 错误 |

### 第三阶段（后续迭代）

| 改进 | 工作量 | 文件 | 收益 |
|------|--------|------|------|
| 会话续接 | ~30 行 | `KiloCodeChatRuntime.ts` | 第二轮延迟降 50% |
| 验证器子代理 | ~100 行 | 新 `ReviewLoop.ts` | 自动化质量检查 |
| 多 Runtime 支持 | ~200 行 | 运行时重构 | 多标签并行消息 |

---

## 十一、与 OpenDesign 对应的文件对照

| OpenDesign/OpenDesignr 文件 | KiloCode 对应实现 |
|---|---|
| `skills/opendesign/SKILL.md` | `.kilo/skills/kilocode-core/SKILL.md` |
| `src/server/providers/claude.ts` (query() + MCP) | `KiloCodeChatRuntime.ts` (spawn + HTTP) |
| `src/server/chat/job-registry.ts` | `EventBuffer.ts`（新） |
| `src/server/chat/job-runner.ts` (main/review/fix) | `ReviewLoop.ts`（新） |
| `src/server/chat/prompts.ts` (MAIN_SYSTEM_APPEND) | Skill 系统 + 提问协议 |
| `skills/*/SKILL.md` (专家技能) | `.kilo/skills/*/SKILL.md` |
| `.opencode/plugins/opendesign.js` (config + transform) | `SkillLoader.ts`（新） |
| `src/auth/credentials.ts` | 不变（CLI 已有认证） |
| `validate-skills.sh` | 可选 CI 脚本 |
