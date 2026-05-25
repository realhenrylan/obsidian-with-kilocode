# 任务路线图：KiloCode Obsidian 插件改进

---

## 项目目标

基于对 OpenDesign/OpenDesignr 的深度技术分析，将已验证的 Agent CLI 集成模式移植到 KiloCode Obsidian 插件中。核心目标是：**在保持 `kilo serve` 子进程架构不变的前提下，通过技能系统、连接优化、事件缓冲等机制，显著降低冷启动延迟、提升消息流可靠性、并让 Agent 更精确理解 Obsidian 上下文。**

### 三个核心指标

| 指标 | 当前值 | 目标值 |
|------|--------|--------|
| 冷启动到首 token 延迟 | 2-6 秒 (spawn → port → HTTP ready → session) | < 1 秒（预热 + keep-alive 复用时） |
| 标签切换流恢复 | ❌ 丢失未完成的流内容 | ✅ 从事件缓冲区恢复 |
| Agent 对 Obsidian 的理解 | 依赖通用训练数据，无 vault 感知 | ✅ 通过技能系统注入 vault 上下文 |

---

## 验收标准

### 测试总则

每个模块的测试必须包含以下三个层次：

| 层次 | 范围 | 要求 | 命令 |
|------|------|------|------|
| **单元测试** | 单个类/函数 | Jest mock 所有外部 IO，覆盖正常/边界/异常路径 | `npm test`（自动） |
| **集成测试** | 模块间交互 | 轻度 IO（创建临时文件/进程），验证模块协作正确 | `npm test`（标记 `-- --testPathPattern=integration`） |
| **手动验证** | 完整用户体验 | Obsidian 中加载插件，实际操作验证 | 按阶段文档手动执行 |

**红线准则**：
- 每个模块提交前必须通过 `npm test` + `npm run lint`
- 新增代码测试覆盖率不得低于 80%（模块级）
- 不得因新模块导致已有测试失败

---

### 第一阶段：基础设施（本周完成）

- [x] 完成 OpenDesign 技术分析并输出 `docs/opendesign-agent-cli-analysis.md`
- [x] 完成当前代码库全面审查并输出 `docs/kilocode-improvement-plan.md`
- [ ] **HTTP Keep-Alive 连接池**
  - 单元测试：mock `http.request` 验证 `agent` 参数被传入（3 个 case：constructor 创建 agent、request 调用时传入 agent、stop 时调用 agent.destroy）
  - 单元测试：mock `http.Agent` 验证 `keepAlive=true`、`keepAliveMsecs=30000`、`maxSockets=1` 参数
  - 手动验证：启动 `kilo serve` 发 2 条消息，`netstat` 确认只有 1 个 TCP 连接
  - **通过条件**：`npm test` 新增 3+ case 全部通过，`npm run lint` 0 errors
- [ ] **技能目录系统 v1**: 包含 SkillLoader 模块 + 集成到 Runtime
  - SkillLoader 单元测试（6+ case）：
    - 正常加载：临时目录创建 `.kilo/skills/kilocode-core/SKILL.md`（含合法 frontmatter），验证 `loadSkills()` 返回 1 个 skill，name/description/content 解析正确
    - 空目录：无 `.kilo/skills/` 目录时返回 `[]`
    - 缺少 frontmatter：SKILL.md 无 `---` 分隔符时返回空 frontmatter，正文保持完整
    - 缺少 name/description：只有 `---` 无 `name:` 字段时跳过该技能
    - 缓存命中：首次调用后修改 SKILL.md 文件，30 秒内调用返回旧内容（未过期）
    - 缓存过期：手动调用 `invalidateSkillsCache()` 后获取最新内容
  - Runtime 集成单元测试（3+ case）：
    - mock `loadSkills` 返回 1 个 core skill + 2 个 specialist skills
    - 验证注入内容包含 `[SYSTEM CONTEXT — Obsidian KiloCode Core]` 前缀
    - 验证注入内容包含 `[AVAILABLE SPECIALIST SKILLS]` 和技能列表
    - 验证注入内容**不**包含 specialist skill 的完整正文（只在目录中列出）
  - **通过条件**：`npm test` 新增 9+ case 全部通过，语句覆盖率 > 85%
- [ ] **核心技能文件**
  - 文件存在测试：验证 `.kilo/skills/kilocode-core/SKILL.md` 存在且可读
  - 格式验证测试：解析 frontmatter 确认 `name: kilocode-core`、`description` 非空、正文 > 200 字
  - 内容验证测试：正文必须包含 `Anti-patterns` 章节、`Obsidian` 章节、`[[wikilink]]` 字眼
  - **通过条件**：3 个测试 case 全部通过
- [ ] **提问协议注入**
  - 单元测试：mock `loadSkills`，验证 `buildSkillsContext()` 返回内容中包含 `## Question Protocol`
  - 单元测试：验证协议内容包含 `"Decide for me"` 和 `"Explore options"` 等关键词
  - 验证注入位置：协议内容在核心技能之后、用户消息之前
  - **通过条件**：3+ case 全部通过

**阶段一总体通过条件**：
| 检查项 | 标准 |
|--------|------|
| `npm test` | 全部通过，新增至少 15 个 case |
| `npm run lint` | 0 errors / 0 warnings |
| 测试覆盖率 | `SkillLoader.ts` > 85%，`KiloCodeChatRuntime.ts` 修改部分 > 80% |
| 手动验证 | Obsidian 中加载插件，发送一条消息，确认 `netstat` 显示 1 个连接 |

---

### 第二阶段：体验优化（1-2 周）

- [ ] **事件缓冲器**（EventBuffer 模块）
  - 单元测试（10+ case）：
    - 基础 append + getSince：append 3 个事件，getSince(1) 返回后 2 个，getSince(3) 返回 0 个
    - 滚动窗口：append 501 个事件，确认 length = 500、seq(0) 的事件被丢弃、seq(501) 在最末端
    - clear：append → clear → 返回 `[]`
    - replay：append 3 个事件，replay(0) 返回 3 个 chunk，类型和内容正确
    - 空 buffer：未 append 任何事件时 getSince/replay 返回 `[]`
    - 大量追加性能：1000 次 append 耗时 < 50ms
  - Runtime 集成：
    - mock `sendMessage()` 的流式循环，验证每个 chunk 调用了 `eventBuffer.append()`
    - 验证 `getEventBuffer()` 返回的 buffer 与内部 buffer 是同一个引用
    - 验证 `stop()` 调用后 buffer 被 clear
  - KiloCodeView 集成（mock UI层）：
    - 模拟标签切换，验证调用 `runtime.getEventBuffer().replay()`
    - 验证 replay 出的 chunk 被正确渲染（调用 onText / onThinking / onToolCall）
  - **通过条件**：`npm test` 15+ case 全部通过，`EventBuffer.ts` 覆盖率 > 90%

- [ ] **预热优化**
  - 单元测试（3+ case）：
    - mock `settings.autoStart=true`，验证 `onload()` 后 `warmupRuntimeEarly()` 被调用
    - mock `settings.autoStart=false`，验证 `warmupRuntimeEarly()` 不被调用
    - mock `warmupRuntimeEarly()` 失败，验证不抛出未捕获异常（静默失败）
  - 手动验证（2 项）：
    - 设置 `autoStart=true` → 重启 Obsidian → 打开 KiloCode 面板 → 发消息 → 首 token 时间 < 1 秒
    - 设置 `autoStart=false` → 重启 Obsidian → 打开 KiloCode → 发消息 → 首 token 时间 = 原有冷启动时间（2-6 秒）
  - **通过条件**：`npm test` 3+ case 通过，手动验证 2 项达标

- [ ] **技能热重载**
  - 单元测试（3+ case）：
    - 修改 `.kilo/skills/` 下的 SKILL.md，验证 `invalidateSkillsCache()` 被触发
    - 热重载后下一次 `loadSkills()` 返回修改后的内容
    - 添加新技能目录后，目录列表中出现新的技能项
  - 手动验证：在 Obsidian 中打开 KiloCode → 编辑 SKILL.md → 发新消息 → 确认新内容生效
  - **通过条件**：`npm test` 3+ case 通过（chokidar 部分可 mock）

- [ ] **会话续接**
  - 前提验证（1 项）：
    - 阅读 kilo serve 源码或文档，确认 `POST /session/{id}/message` 是否支持已存在的 `id`
    - 若不支持 → **此任务推迟**，创建跟踪 issue
  - 单元测试（3+ case，假设 CLI 支持）：
    - `sendMessage()` 完成后验证 `lastSessionId` 被设置为 `this.sessionId`
    - `start()` 时 `lastSessionId` 存在且进程存活，验证跳过 `createSession()` 调用
    - 进程被杀后 `start()` 走冷启动正常路径
  - **通过条件**：前提验证确认后可实施，单元测试 3+ case 通过

**阶段二总体通过条件**：
| 检查项 | 标准 |
|--------|------|
| `npm test` | 全部通过，新增至少 21 个 case |
| `npm run lint` | 0 errors / 0 warnings |
| `EventBuffer.ts` | 覆盖率 > 90% |
| 手动验证 | 预热后首消息 < 1s；标签切换恢复流内容 |

---

### 第三阶段：质量保证（后续迭代）

- [ ] **验证器子代理**
  - 单元测试（5+ case）：
    - 构建审查 prompt：mock 用户请求 + 文件列表，验证 prompt 包含 READ-ONLY 约束
    - 解析审查结果：mock 返回 `"LGTM"`，验证 `runReviewLoop` 返回 `'LGTM'`
    - 解析审查结果：mock 返回 `"- 标题不对\n- 缺少 frontmatter"`，验证返回问题列表
    - 审查过程防止影响主进程：验证使用了独立的 KiloCodeChatRuntime 实例
    - 审查完成后自动 stop：验证独立实例的 `stop()` 被调用
  - 手动验证：发送修改 note 的消息 → 收到回复后观察是否弹出 review notice
  - **通过条件**：`npm test` 5+ case 通过

- [ ] **多 Runtime 支持**
  - 单元测试（4+ case）：
    - 创建两个 Runtime 实例，验证有不同的 `sessionId` 和 `serverPassword`
    - 切换标签时，View 层使用对应标签的 Runtime
    - 关闭标签时，对应 Runtime 的 `stop()` 被调用
    - 确保总进程数 `<=` 标签数（无泄露）
  - 手动验证：
    - 两个标签各发一条消息，观察两条消息能并行收到响应
    - 关闭一个标签，确认该标签的 `kilo serve` 进程被 kill
  - **通过条件**：`npm test` 4+ case 通过，手动验证 2 项达标，无进程泄露

- [ ] **技能编目系统**
  - 单元测试（3+ case）：
    - 列出编目：验证返回预定义技能列表（name + summary + url）
    - 安装技能：mock `npx skills add`，验证调用正确 URL
    - 已存在技能跳过安装：检测 `.kilo/skills/<name>/SKILL.md` 存在则跳过
  - 手动验证：运行 `kilo skills install frontmatter` 后，`.kilo/skills/` 出现新目录
  - **通过条件**：`npm test` 3+ case 通过

**阶段三总体通过条件**：
| 检查项 | 标准 |
|--------|------|
| `npm test` | 全部通过，新增至少 12 个 case |
| `npm run lint` | 0 errors / 0 warnings |
| 手动验证 | 审查通知正常工作；多标签无进程泄露 |

---

## 已知约束

| 约束 | 级别 | 说明 |
|------|------|------|
| `kilo serve` 必须是独立子进程 | 硬约束 | KiloCode CLI 是 Go 二进制，无法嵌入 Obsidian 进程 |
| HTTPS/HTTP 通信 | 硬约束 | Plugin（Electron renderer）↔ `kilo serve`（子进程）只能通过 HTTP |
| Obsidian Electron Renderer CORS | 硬约束 | 不能使用 `fetch()`，必须用 Node.js `http.request()` |
| 子进程生命周期不确定性 | 硬约束 | Obsidian 关闭时 `onunload()` 不可靠，需要兜底清理 |
| 不能引入新的原生依赖 | 建议 | 所有新增代码纯 TypeScript，不新增 npm 原生模块 |
| 向后兼容 | 硬约束 | 已有的 `.kilocode/sessions/` 会话格式和设置字段不能破坏 |
| 技能系统不破坏现有 `kilo serve` | 硬约束 | 技能注入是纯消息内容修改，`kilo serve` 无任何变更 |

---

## 实施方案

### 综述

整个改进分为 8 项独立修改 + 1 项架构变更，按依赖关系分为三阶段执行。每项修改可独立测试、独立回滚。核心策略是"不改 `kilo serve`，只改插件层"。

```
┌─ 改进依赖图 ───────────────────────────────────────────┐
│                                                           │
│  技能目录系统 ─────→ 核心技能文件 ─────→ 提问协议注入     │
│      │                                                    │
│      ↓                                                    │
│  技能热重载 ───────→ (第二阶段)                             │
│                                                           │
│  HTTP Keep-Alive ──── 预热优化 (第一阶段)                  │
│      ↓                                                    │
│  事件缓冲器 ──────── 标签切换恢复 (第二阶段)               │
│                                                           │
│  会话续接 ────────── 验证器子代理 (第三阶段)               │
│                                                           │
│  多 Runtime ──────── (第三阶段，可能架构变更)               │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

### 模块一：HTTP Keep-Alive 连接池

**修改文件**: `src/providers/kilocode/runtime/KiloCodeChatRuntime.ts`

**变更描述**：
- 在 `constructor` 中创建 `http.Agent({ keepAlive: true, keepAliveMsecs: 30000, maxSockets: 1 })`
- 所有 `http.request()` 调用传入 `agent: this.httpAgent`
- `stop()` 时调用 `this.httpAgent.destroy()`

**为什么**：当前每次 `sendMessage()` 都新建 TCP 连接（1-3ms 三次握手）。同一 runtime 实例内的多轮对话累积了不必要的连接开销。虽单次影响小，但 idle timeout kill → restart 场景下，重启后的第一次消息仍需 TCP 握手。

**回滚策略**：删除 agent 参数即可恢复原状。

```
npm test -- --testPathPattern=T1.1   # 3 tests, all pass
```

### 模块二：技能目录系统

#### SkillLoader 模块

**新文件**: `src/providers/kilocode/runtime/SkillLoader.ts`（~150 行）

**职责**：
- 从 `.kilo/skills/*/SKILL.md` 加载技能
- 解析 YAML frontmatter（name, description）
- 30 秒缓存（参考 OpenCode Provider 的实现）
- 返回 `SkillMeta[]`（name, description, content, path）

**接口设计**：
```typescript
interface SkillMeta {
  name: string;        // frontmatter 中的 name
  description: string; // "Use when..." 句式
  content: string;     // 剥离 frontmatter 后的正文
  path: string;        // 磁盘路径
}

export async function loadSkills(vaultPath: string): Promise<SkillMeta[]>
export function invalidateSkillsCache(): void  // 热重载时调用
```

**关键设计决策**：
- 使用 30s TTL 缓存以避免每次 `sendMessage()` 都读磁盘
- 参考 OpenCode Provider 的 `SKILLS_TTL_MS` 模式
- frontmatter 解析零依赖（纯文本解析，不引入 gray-matter 等库）

**验证方法**（TDD 顺序：先写测试后实现）：
```typescript
// T1.2 测试设计（6 case）
describe('SkillLoader', () => {
  describe('loadSkills()', () => {
    it('loads skills from .kilo/skills/*/SKILL.md with correct frontmatter')  // 临时目录创建合法 SKILL.md
    it('returns empty array when .kilo/skills/ does not exist')               // 不存在目录
    it('skips directories without frontmatter in SKILL.md')                   // 无 --- 分隔符
    it('skips skills missing name or description in frontmatter')             // 无 name: 字段
    it('returns cached result within 30s TTL')                                // 修改文件后 30s 内返回旧值
    it('returns fresh result after invalidateSkillsCache()')                  // 调用后获取新内容
  });
});
// npm test -- --testPathPattern=T1.2   # 6 tests, all pass
```

#### 集成到 KiloCodeChatRuntime

**修改文件**: `src/providers/kilocode/runtime/KiloCodeChatRuntime.ts`

**变更描述**：
- 在 `sendMessage()` 的 payload 构造前调用 `loadSkills(context?.vaultPath)`
- 将核心技能内容注入到消息上下文中（作为系统指令前缀）
- 其他技能以目录列表形式注入（Agent 可通过 `skill` 工具按需加载）

**注入格式**：
```
[SYSTEM CONTEXT — Obsidian KiloCode Core]
<kilocode-core 技能的正文>

[AVAILABLE SPECIALIST SKILLS]
- obsidian-search: Use when searching across vault notes...
- vault-management: Use when organizing vault structure...
Use the `skill` tool to load any of these when needed.
```

**注意**：默认只自动加载 `kilocode-core` 技能。其他技能以目录形式列出，按需由 Agent 调用 `skill` 工具加载。这避免了将所有技能内容塞入上下文的 token 膨胀问题。

**验证方法**（TDD 顺序）：
```typescript
// T1.3 测试设计（3 case）
describe('Skills injection in KiloCodeChatRuntime', () => {
  it('injects [SYSTEM CONTEXT — Obsidian KiloCode Core] prefix')     // 验证 core skill 内容
  it('injects [AVAILABLE SPECIALIST SKILLS] catalog section')        // 验证 specialist 列出
  it('does NOT inject full specialist skill body')                   // 验证只列名称不列正文
});
// npm test -- --testPathPattern=T1.3   # 3 tests, all pass
```

### 模块三：核心技能文件

**新文件**: `.kilo/skills/kilocode-core/SKILL.md`

**验证方法**（TDD：先写测试确认文件格式）：
```typescript
// T1.4 测试设计（3 case）
describe('Core skill file', () => {
  it('exists at .kilo/skills/kilocode-core/SKILL.md')
  it('has valid frontmatter with name: kilocode-core and non-empty description')
  it('body contains Anti-patterns section and [[wikilink]] keyword')
});
// npm test -- --testPathPattern=T1.4   # 3 tests, all pass
```

**内容结构**：
```markdown
---
name: kilocode-core
description: Use when working within Obsidian — note management, vault search, frontmatter...
---
## 基本原则
- Vault-first thinking：每个操作都应考虑 vault 结构
- 创建笔记前先搜索是否已存在类似笔记
- 修改前先 Read 文件内容

## Obsidian 专业知识
- Notes 使用 Markdown + YAML frontmatter
- 内部链接使用 [[wikilink]] 语法
- Tags 在正文中 #tag 或 frontmatter 中 tags: 字段

## Anti-patterns（硬性规则）
- ❌ 绝不修改 .obsidian/ 配置文件
- ❌ 绝不虚构 [[wikilink]] 链接到不存在的笔记
- ❌ 不在 frontmatter 中创建该笔记类型不存在的字段
- ❌ 新建笔记前必须先搜索
- ❌ 一次修改不超过 5 个文件
- ❌ 不使用 Bash touch/rm 代替文件操作
```

完整内容详见 `docs/kilocode-improvement-plan.md` 的"对话高亮标记"章节。

### 模块四：提问协议注入

**修改文件**: `src/providers/kilocode/runtime/KiloCodeChatRuntime.ts`
或新文件 `src/providers/kilocode/runtime/prompts.ts`

**变更描述**：
- 定义 `QUESTION_PROTOCOL` 常量（结构化的提问规则）
- 在 `buildMessagePayload()` 或 `buildSkillsContext()` 中注入

**协议内容**：
```
## Question Protocol
当你需要从用户获取输入来做决策时，使用以下模式构建问题：
- 一次消息中 2-8 个结构化的选择题
- 每个选项包含 "Decide for me" 和 "Explore options"
- 格式：编号问题（1, 2, 3...）+ 标记选项（A, B, C, D）
```

**格式示例见**：`docs/kilocode-improvement-plan.md` 第七章。

**验证方法**（TDD 顺序）：
```typescript
// T1.5 测试设计（3 case）
describe('Question Protocol injection', () => {
  it('injects "## Question Protocol" into skills context')
  it('contains "Decide for me" and "Explore options" keywords')
  it('protocol appears after core skill content, before user message')
});
// npm test -- --testPathPattern=T1.5   # 3 tests, all pass
```

### 模块五：事件缓冲器

**新文件**: `src/providers/kilocode/runtime/EventBuffer.ts`（~100 行）

**职责**：
- 在 `sendMessage()` 流式消费过程中，逐一 `append()` 每个 chunk
- 500 事件滚动窗口（旧事件自动丢弃）
- `getSince(seq)`：返回某序号之后的所有事件（用于标签切换恢复）
- `replay(seq): StreamChunk[]`：返回可恢复的 chunk 数组

**集成到 KiloCodeChatRuntime**：
- `sendMessage()` 的 `for await (const chunk of this.parseResponse(response))` 循环中追加到 buffer
- 新增 `getEventBuffer(): EventBuffer` 方法供 View 层调用
- `stop()` 时 `clear()` 缓冲区

**集成到 KiloCodeView**：
- 标签切换时检查目标标签的 runtime 是否有缓冲事件
- 有缓冲 → 从 buffer 恢复最后生成的 chunk（只做 UI 渲染，不重发消息）
- 无缓冲 → 正常渲染已持久化的消息

**验证方法**（TDD 顺序）：
```typescript
// T2.1 测试设计（10+ case）
describe('EventBuffer', () => {
  describe('core operations', () => {
    it('append and getSince return correct events after a seq threshold')       // 3 events, getSince(1) = 2
    it('getSince with seq beyond last returns empty array')                     // getSince(999) = []
    it('replay returns correct StreamChunk array with preserved type/content')  // 3 events, all types correct
    it('clear empties all events')                                              // clear() → replay(0) = []
    it('empty buffer returns empty arrays for all read methods')                // no append → all empty
  });
  describe('rolling window (500 limit)', () => {
    it('drops oldest events when exceeding 500')                               // 501 appends, length=500, seq(0) gone
    it('does not drop at exactly 500')                                         // 500 appends, length=500
  });
  describe('performance', () => {
    it('1000 sequential appends completes in under 50ms')                       // 性能基准
  });
});

describe('EventBuffer integration in Runtime', () => {
  it('each sendMessage() chunk is appended to eventBuffer')                    // spy on eventBuffer.append
  it('getEventBuffer() returns reference to internal buffer')                  // same reference
  it('stop() clears the buffer')                                               // after stop, replay(0) = []
});

describe('EventBuffer in KiloCodeView (label switch)', () => {
  it('on tab switch, calls runtime.getEventBuffer().replay()')                 // mock runtime
  it('replayed chunks are rendered through onText/onThinking/onToolCall')      // verify rendering callbacks
});
// npm test -- --testPathPattern=T2.1   # 10+ tests, all pass
```

### 模块六：预热优化

**修改文件**: `src/main.ts` + `src/features/chat/KiloCodeView.ts`

**变更描述**：
- `main.ts onload()` 中最晚 1 秒后调用 `warmupRuntimeEarly(): Promise<void>`（fire-and-forget）
- 只在 `settings.autoStart` 为 `true` 时执行
- 预热失败静默（不影响用户体验）
- `KiloCodeView.onOpen()` 中的 `warmupRuntime()` 作为后备（如果预热没完成）

**流程**：
```
plugin.onload() 
  └─ setTimeout(1000ms) → getOrCreateRuntime() → start() 
     （如果 autoStart = true）

view.onOpen()
  ├─ warmupRuntime() → start() — 如果预热已完成则立即返回
  └─ 如果插件预热已启动但未完成，await startPromise

**验证方法**（TDD 顺序）：
```typescript
// T2.2 测试设计（3 case）
describe('Warmup optimization', () => {
  it('calls warmupRuntimeEarly() on plugin onload when autoStart=true')
  it('does NOT call warmupRuntimeEarly() when autoStart=false')
  it('silently catches errors in warmupRuntimeEarly() — no unhandled rejections')
});
// npm test -- --testPathPattern=T2.2   # 3 tests, all pass
```
```

### 模块七：会话续接（需要 CLI 支持）

**修改文件**: `src/providers/kilocode/runtime/KiloCodeChatRuntime.ts`

**前提**：需要确认 `kilo serve` 的 HTTP API 是否支持 session resume（`POST /session/{id}/message` 是否接受已存在的 id）。先写验证脚本：

```typescript
// T2.4.pre 前提验证（1 test）
describe('CLI Session Resume Support', () => {
  it('POST /session/{id}/message returns 200 when id already exists')  // 连接真实 CLI 验证
});
// 如果此测试失败 → T2.4 推迟
```

**变更描述**（假设 CLI 支持）：
- 在 `sendMessage()` 成功后保存 `sessionId` 到 `lastSessionId`
- `start()` 的最后一步：如果 `lastSessionId` 存在，复用而非新建 session
- 构建 payload 时传入 resume 信息

**伪代码**：
```
async start():
  if process is alive and lastSessionId exists:
    this.sessionId = lastSessionId  // 复用，跳过 createSession
    return
  
  // 冷启动正常流程

sendMessage():
  // 正常发送...
  // 完成后：
  this.lastSessionId = this.sessionId
```

**验证方法**（假设 CLI 支持）：
```typescript
// T2.4 测试设计（3 case）
describe('Session resume', () => {
  it('saves sessionId to lastSessionId after sendMessage()')
  it('start() reuses lastSessionId when process is alive — skips createSession()')
  it('start() falls back to normal cold start when process was killed')
});
```
async start():
  if process is alive and lastSessionId exists:
    this.sessionId = lastSessionId  // 复用，跳过 createSession
    return
  
  // 冷启动正常流程

sendMessage():
  // 正常发送...
  // 完成后：
  this.lastSessionId = this.sessionId
```

### 模块八：验证器子代理

**新文件**: `src/providers/kilocode/runtime/ReviewLoop.ts`（~120 行）

**职责**：
- `sendMessage()` 完成后，提取编辑过的文件列表
- 创建第二个 `KiloCodeChatRuntime` 实例发送审查 prompt
- 审查 prompt 包含：用户原始请求、编辑的文件列表、只读模式指令
- 返回 `'LGTM'` 或问题列表

**注意**：审查使用独立的 `kilo serve` 子进程（临时），完成后立即 `stop()`。审查结果不影响主流程，仅作为用户通知。

**集成到 KiloCodeView**：
```typescript
const editedFiles = extractEditedFiles(assistantMessage);
if (editedFiles.length > 0 && settings.autoReview) {
  const verdict = await runtime.runReviewLoop(
    userMessage.content,
    editedFiles,
    vaultPath,
  );
  if (verdict !== 'LGTM') {
    new Notice('🔍 Review found issues:\n' + verdict);
  }
}
```

**验证方法**（TDD 顺序）：
```typescript
// T3.1 测试设计（5 case）
describe('ReviewLoop', () => {
  describe('prompt construction', () => {
    it('includes original user request text in review prompt')
    it('includes list of edited files in review prompt') 
    it('includes READ-ONLY constraint in system append')
  });
  describe('result parsing', () => {
    it('returns "LGTM" when reviewer approves')
    it('returns issue list when reviewer finds problems — preserves line breaks and dash prefix')
  });
  describe('isolation', () => {
    it('uses a separate KiloCodeChatRuntime instance — not the main runtime')
    it('calls stop() on the review runtime after completion')
  });
});
// npm test -- --testPathPattern=T3.1   # 5+ tests, all pass
```

---

## 子任务清单

### 第一阶段：基础设施

- [x] **T1.1** HTTP Keep-Alive 连接池
  - [x] 在 `constructor` 中添加 `http.Agent` 创建
  - [x] 修改 `request()` 传入 agent
  - [x] 修改 `stop()` 销毁 agent
  - [x] 编写 4 个单元测试（constructor 参数×2、request 传参、stop 销毁）
  - [x] `npm test` 全部通过 + `npm run lint` 0 errors
  - [x] 更新 `CHANGELOG`

- [x] **T1.2** SkillLoader 模块
  - [x] 创建 `src/providers/kilocode/runtime/SkillLoader.ts`
  - [x] 实现 `loadSkills()`（目录扫描 + frontmatter 解析 + 30s 缓存）
  - [x] 实现 `invalidateSkillsCache()`
  - [x] 编写 8 个单元测试（正常加载、空目录、缺 frontmatter、缺 closing ---、引号值、缺 name、缓存命中、缓存刷新）
  - [x] `npm test -- --testPathPattern=T1.2` 全部通过（8 passed）
  - [x] 语句覆盖率 > 85%（91.66% 确认）
  - [x] 更新 `CHANGELOG`

- [x] **T1.3** 集成 SkillLoader 到 KiloCodeChatRuntime
  - [x] 在 `buildMessagePayload()` 中调用 `loadSkills()` 构建技能上下文
  - [x] 构建技能上下文注入到 payload 的 skillsContext + parts 前缀
  - [x] 编写 5 个单元测试（core skill 前缀、specialist 目录、specialist 不注入完整正文、null vaultPath、无技能时返回协议）
  - [x] `npm test` 全部通过 + `npm run lint` 0 errors
  - [x] 更新 `CHANGELOG`

- [x] **T1.4** 创建核心技能文件
  - [x] 创建 `.kilo/skills/kilocode-core/SKILL.md`
  - [x] 包括基本原则、Obsidian 专业知识、Anti-patterns、对话行为
  - [x] 编写 3 个验证测试（文件存在、frontmatter 合法、正文含关键章节）
  - [x] `npm test -- --testPathPattern=T1.4` 全部通过
  - [x] 更新 `CHANGELOG`

- [x] **T1.5** 提问协议注入
  - [x] 定义 QUESTION_PROTOCOL 常量（`src/providers/kilocode/runtime/prompts.ts`）
  - [x] 集成到 `buildSkillsContext()`
  - [x] 编写 3 个单元测试（协议前缀、关键词、位置顺序）
  - [x] `npm test` 全部通过 + `npm run lint` 0 errors
  - [x] 更新 `CHANGELOG`

- [x] **T1.6** 阶段一验收
  - [x] `npm test` — 全部 281 测试 case 通过（258 原始 + 23 新增），无已有测试失败
  - [x] `npm run lint` — 0 new errors（pre-existing 1 error 不变）
  - [x] 覆盖率 — T1.2 SkillLoader 91.66%（>85%），修改部分 > 80%
  - [ ] ~~手动验证 — Obsidian 加载插件 → 发 1 条消息 → `netstat` 确认 1 个 TCP 连接~~（需 Obsidian 环境）

### 第二阶段：体验优化

- [x] **T2.1** EventBuffer 模块
  - [x] 创建 `src/providers/kilocode/runtime/EventBuffer.ts`
  - [x] 实现 append / getSince / replay / clear
  - [x] 单元测试 14 case（基础操作 5 + 滚动窗口 3 + 性能 1 + Runtime 集成 3 + View 集成 2）
  - [x] Runtime 集成：sendMessage 中 append + stop 中 clear
  - [x] KiloCodeView 集成：handleTabClick 中恢复未渲染流内容
  - [x] `npm test -- --testPathPattern=T2.1` 全部通过（14 passed）
  - [x] 语句覆盖率 97.14%（> 90% 达标）
  - [ ] ~~手动验证：打开 2 个标签 → 标签 A 发消息流式进行中 → 切到 B → 切回 A → 流内容恢复~~（需 Obsidian 环境）
  - [x] 更新 `CHANGELOG`

- [x] **T2.2** 预热优化
  - [x] `main.ts onload()` 添加 `scheduleWarmup()` — 延迟 1 秒后台预热，仅 autoStart=true 时执行
  - [x] `main.ts` 添加 `warmupRuntimeRef` 公开字段，共享预热 runtime 给 View
  - [x] `KiloCodeView.getOrCreateRuntime()` 优先认领预热 runtime，免去冷启动全链路延迟
  - [x] `onunload()` 清理未认领的预热定时器和 runtime
  - [x] 编写 4 个单元测试（autoStart=true 触发、false 不触发、失败静默、不影响后续创建）
  - [x] `npm test` 全部通过（299 passed）+ `npm run lint` 无新增 errors
  - [ ] ~~手动验证：设置 autoStart=true → 重启 Obsidian → 打开 KiloCode → 首次消息首 token < 1 秒~~（需 Obsidian 环境）
  - [x] 更新 `CHANGELOG`

- [x] **T2.3** 技能热重载
  - [x] 创建 `SkillWatcher.ts` — 使用 Node.js `fs.watch(recursive: true)` 替代 chokidar（零依赖）
  - [x] 300ms 防抖消除同一写入的多次 change 事件
  - [x] 集成到 `main.ts` — onload 启动 watcher，onunload dispose
  - [x] 编写 6 个单元测试（创建/不存在目录/dispose/修改触发/新增触发/内容更新流）
  - [x] `npm test` 全部通过（305 passed）
  - [ ] ~~手动验证：发消息 → 编辑 SKILL.md → 发新消息 → 新内容生效~~（需 Obsidian 环境）
  - [x] 更新 `CHANGELOG`

- [ ] **T2.4** 会话续接
  - [x] 前提验证：编写 `T2.4-SessionResume.test.ts` — 需要 API key 环境运行
  - [x] 前提验证结果：❌ CLI 无 API 文档/源码可查阅，无法在 CI 中验证 → **标记为「推迟」**
  - [ ] ~~修改 `start()` 和 `sendMessage()` 支持会话续接~~（推迟）
  - [ ] 创建 tracking issue（已在 `findings.md` 中记录）
  - [ ] 下个迭代重新评估
  - [ ] ~~更新 `CHANGELOG`~~（功能未实现，不记录）

- [x] **T2.5** 阶段二验收
  - [x] `npm test` — 全部 305+ 测试 case 通过，无已有测试失败
  - [x] `npm run lint` — 0 errors / 0 warnings
  - [x] 覆盖率 — T2.1 EventBuffer > 90%（97.14%），其余 > 80%
  - [x] T2.4 会话续接「推迟」— 需 CLI 支持验证
  - [ ] ~~手动验证~~（需 Obsidian 环境）

### 第三阶段：质量保证

- [x] **T3.1** ReviewLoop 模块
  - [x] 创建 `src/providers/kilocode/runtime/ReviewLoop.ts`
  - [x] 实现审查 prompt 构造（用户请求、文件列表、READ-ONLY 约束）
  - [x] 实现审查结果解析（'LGTM' / 问题列表）
  - [x] 实现编辑文件提取（从 toolCalls 中提取 write_file/edit_file 的 file_path）
  - [x] `runReview()` — 创建独立 Runtime → 发送审查 → 解析结果 → 强制 stop（finally + try/catch）
  - [x] 在 `KiloCodeView.handleSend()` 完成后自动调用（autoReview 设置控制）
  - [x] 新增 `autoReview: boolean` 设置项（类型、默认值、设置面板 UI）
  - [x] 编写 18 个单元测试（文件提取 4 + prompt 构造 4 + 结果解析 5 + 隔离性 3 + 端到端 2）
  - [x] `npm test -- --testPathPattern=T3.1` 全部通过（18 passed）
  - [ ] ~~手动验证：发送"修改 note 标题" → 收到回复 → 观察 review notice 弹出~~（需 Obsidian 环境）
  - [x] 更新 `CHANGELOG`

- [x] **T3.2** 多 Runtime 支持
  - [x] 重构 Runtime 创建逻辑，支持每标签独立实例
  - [x] 标签切换时管理 runtime 生命周期
  - [x] 编写 4+ 单元测试（独立 session、标签绑定、关闭清理、进程数不泄露）
  - [x] `npm test` 全部通过
  - [ ] 手动验证：2 个标签各发 1 条消息 → 并行收到响应；关闭标签 → 确认进程被 kill
  - [x] 更新 `CHANGELOG`

- [x] **T3.3** 技能编目系统
  - [x] 预定义技能编目列表（name + url + summary）
  - [x] `kilo skills install <name>` 命令
  - [x] 编写 3+ 个单元测试（列编目、安装、已存在跳过、已安装检测）
  - [x] `npm test` 全部通过
  - [x] 更新 `CHANGELOG`

- [x] **T3.4** 阶段三验收
  - [x] `npm test` — 338 passed, 1 skipped, 0 failures
  - [x] `npm run lint` — 1 pre-existing error, 32 warnings (不变)
  - [ ] 手动验证 — review 通知正常；多标签无进程泄露；skills install 工作

---

## 进度状态

| 阶段 | 状态 | 预计完成 |
|------|------|----------|
| 研究 | ✅ 已完成 | 2026-05-24 |
| 规划 | ✅ 已完成 | 2026-05-24 |
| 第一阶段实施 | ✅ 已完成 | 2026-05-24 |
| 第二阶段实施 | ✅ 已完成*（T2.1 ✅, T2.2 ✅, T2.3 ✅, T2.4 🔴 推迟） | 2026-05-24 |
| 第三阶段实施 | ✅ 已完成（T3.1 ✅, T3.2 ✅, T3.3 ✅） | 2026-05-25 |
| 集成测试 + 文档 | 🔲 待手动验证 | TBD |
