# 研究发现 — Obsidian KiloCode 插件

> **更新时间**: 2026-05-24

---

## KiloCode Obsidian 插件改进 — 架构决策记录

### ADR-4: 技能目录系统替代单文件 AGENTS.md

**决策**：使用 `.kilo/skills/*/SKILL.md` 目录结构替代当前 `AGENTS.md` 单文件指令。

**理由**：
- OpenDesign 已验证目录扫描 + frontmatter 发现是最轻量的跨平台技能分发机制
- 每个技能独立文件，可独立更新、独立缓存
- 用户可通过编辑 SKILL.md 自定义 Agent 行为，无需理解插件代码
- YAML frontmatter 的 `description` 字段支持 "Use when..." 触发条件描述

**代价**：需要在消息 payload 构造时注入额外上下文（约 1-3KB 文本）。通过限定只有 `kilocode-core` 技能自动注入，其他按需加载来控制 token 增长。

**约束**：纯文本 frontmatter 解析，不引入 `gray-matter` 等外部依赖（零额外 npm 依赖）。

### ADR-5: 30 秒技能缓存 TTL

**决策**：`SkillLoader` 使用 30 秒 TTL 缓存（参考 OpenCode Provider 的 `SKILLS_TTL_MS` 实现）。

**理由**：
- 避免每次 `sendMessage()` 都读磁盘（SSD 约 2-5ms 每次，累积可观）
- 30 秒足够短到技能热更新在合理时间内生效
- 提供 `invalidateSkillsCache()` 方法支持显式刷新

### ADR-6: EventBuffer 滚动窗口 500 事件

**决策**：`EventBuffer` 最多保留 500 个事件，滚动丢弃最旧的。

**理由**：
- 一条典型的 Agent 回复产生 50-200 个 SSE chunk（text + thinking + tool_use + tool_result）
- 500 事件 ≈ 2-10 条完整回复，足够覆盖标签切换后恢复
- 内存开销可控：每个 chunk 约 200 字节，500 × 200B = 100KB

**实现细节**：
- 使用 `startIndex` 偏移量实现惰性丢弃，避免每次 append 超过上限时都 `shift()` 导致 O(n²)
- 当 `startIndex >= MAX_EVENTS` 时执行一次裁剪（`slice(startIndex)` + `startIndex = 0`），周期性回收内存
- `getSince()` 使用二分查找（`O(log n)`）而非线性扫描（`O(n)`），尽管 n=500 时差异不大，但考虑到 View 层可能高频调用 replay，二分查找更安全

### ADR-7: HTTP Keep-Alive 单 Socket 连接

**决策**：`http.Agent({ keepAlive: true, keepAliveMsecs: 30000, maxSockets: 1 })`

**理由**：
- `kilo serve` 是单线程事件循环，并行多个 socket 无意义
- 单 socket 确保请求序列化，避免竞态
- 空闲 30 秒保活足够覆盖消息间隔（idle timeout 默认 600 秒）
- Agent 销毁时 `destroy()` 强制关闭

### ADR-8: 验证器子代理使用独立 `kilo serve` 进程

**决策**：审查模式 fork 临时 `kilo serve` 实例，完成后立即 `stop()`。

**理由**：
- 无法在同一个 session 中同时维护"主 Agent"和"审查 Agent"的独立上下文
- 独立进程确保审查结果不受主任务上下文污染
- 审查完成即销毁，不占用 idle timeout 资源

**代价**：每个审查需要 0.5-1 秒冷启动（实际上因为 BinaryManager 缓存命中，只需 spawn + port 发现）。

### ADR-9: 提问协议注入为纯文本不修改客户端

**决策**：结构化提问协议以纯文本注入到消息上下文，不新增 UI 组件。

**理由**：
- 当前 `kilo serve` 的协议不支持 `ask_questions`/`pick_option` 之类的高级交互模式
- 纯文本注入是零侵入的：`kilo serve` 无任何变更
- Agent 遵循文本指令已足够产生结构化的多选问题
- 用户通过纯文本格式的编号问题（1. 2. 3.）回复， Agent 解析答案

**代价**：不如 OpenDesign 的 MCP 工具+UI 卡片的交互体验流畅，但这是子进程架构约束下的最佳可行方案。

### ADR-10: 多 Runtime 为可选架构变更

**决策**：多 Runtime（每标签独立 `kilo serve`）标记为第三阶段，且**可推迟**。

**理由**：
- 架构影响大：需要修改 `ProviderRegistry` → `createRuntime()` 的调用频次和生命周期
- 实际需求不明确：单标签对话场景下多 Runtime 无收益
- 可通过 EventBuffer（标签切换恢复）覆盖大部分用户体验问题



---

## 架构决策记录

### ADR-1: AsyncGenerator 模式替代回调

**决策**: `ChatRuntime.sendMessage()` 返回 `AsyncGenerator<StreamChunk>`
**理由**:
- 审批机制需要"暂停-恢复"语义，`for await` 天然支持
- 取消通过 `break` / `generator.return()` 自然中断
- 错误沿调用栈向上传播，`try/catch` 即可捕获
- Claudian 已验证此方案在生产环境可行

**代价**: Runtime 内部需要队列 + resolve 机制（~150 行额外代码）

### ADR-2: `kilo serve` HTTP 替代 JSON-RPC over stdio

**决策**: 从子进程 JSON-RPC 切换到 `kilo serve` HTTP + SSE 模式
**理由**:
- `kilo run <message>` 子进程模式难以处理审批暂停-恢复
- HTTP 流式响应（SSE/ndjson）更标准化
- 使用 Node.js `http` 模块通信，避免 Obsidian Electron 的 CORS 限制

### ADR-3: BinaryManager 三级优先级链

**决策**: 用户配置 → PATH 检测 → 本地缓存 → 自动下载
**理由**: 零配置安装体验，无需用户手动 `npm install -g @kilocode/cli`
**实现**:
- `ProviderRegistration.createRuntime` 保持同步，BinaryManager 引用传给 Runtime
- 路径解析在 `start()` 中懒执行
- `preload()` 在插件 `onload()` 后台预热
- npm tarball 下载 + gzip 解压 + tar 解析提取二进制

### ADR-4: ChatState 集中状态管理

**决策**: 吸收 Claudean 的 ChatState 模式，从 TabState(6字段) 升级为 ChatState(30+属性)
**理由**:
- 流式过程中需要在标签切换时保持状态
- getter/setter + 回调通知模式更可控
- 统一管理 isStreaming/cancelRequested/streamGeneration 等流式状态

### ADR-5: Node.js `http` 模块绕过 CORS

**决策**: 使用 Node.js `http` / `https` 内置模块，而非浏览器 `fetch()`
**理由**: Obsidian Electron renderer 进程的 `fetch()` 受 CORS 限制（`app://obsidian.md` origin 无法访问 `http://127.0.0.1`），Node.js 完全绕过此限制。

### ADR-6: 方案 C — 全新项目 + 混合借鉴

**决策**: 创建独立 Obsidian 插件项目，架构参考 Claudian 的 Provider 模式
**理由**: 平衡速度和控制权；Provider 层是核心差异点，需要独立实现；UI 体验与 Claudian 一致

---

## 关键设计模式

### 1. Runtime 内部队列机制

```
stdout data → handleStdout() → 解析 JSON → handleParsedChunk()
  → 如果 generator 在等待（resolveNext 存在）：直接 resolve
  → 否则：推入 pendingChunks 队列

generator.next() → nextChunk()
  → 如果队列非空：直接返回队首
  → 如果 done：返回 { done: true }
  → 否则：返回 Promise，等待 resolveNext
```

参考文件: `src/providers/kilocode/runtime/KiloCodeChatRuntime.ts`

### 2. 审批流程

```
approval_required chunk → StreamController
  → callbacks.onApprovalRequired()
    → ApprovalManager.requestApproval()
      → yolo模式: 自动 allow
      → plan模式: 写入 deny，读取 allow
      → normal模式: 读取 allow，写入 → ApprovalModal
        → Allow / Always Allow / Deny / Cancel
  → sendApproval() → runtime 通知 CLI
  → cancel (如果用户选择 cancel)
```

参考文件: `src/core/security/ApprovalManager.ts`, `src/core/security/ApprovalModal.ts`

### 3. BinaryManager 下载降级链

```
npm 官方源 → 重试1次 → 用户 mirrorUrl → 重试1次 → 全部失败 → Notice 报错
```

参考文件: `src/core/binary/BinaryManager.ts`

### 4. SSE 流式通信

```
kilo serve HTTP server
  → sendMessage() → HTTP POST → SSE/ndjson 流
  → parseEventStream() → yield StreamChunk
  → StreamController.consumeStream() → for await
```

参考文件: `src/providers/kilocode/runtime/KiloCodeChatRuntime.ts`（`kilo serve` 版本）

### 5. TabStreamingState 跨标签缓冲

```
handleSend() → 为发送者标签创建 TabStreamingState
  → onText/onThinking 始终缓冲到标签状态
  → 仅当前标签 == 发送者标签时增量渲染 DOM
  → handleTabClick() 切换时，从缓冲重建流式渲染状态
  → 流完成后清理状态
```

参考文件: `src/features/chat/KiloCodeView.ts`

---

## 模块依赖关系

```
main.ts
  ├── BinaryManager ─→ PlatformDetector, npmDownloader
  ├── ProviderRegistry ←── createKilocodeRegistration(binaryManager)
  │   └── KiloCodeChatRuntime(binaryManager, settings)
  │       ├── ChatRuntime（接口）
  │       └── StreamChunk（类型）
  ├── KiloCodeView
  │   ├── TabManager
  │   │   └── Tab
  │   ├── StreamController
  │   │   ├── StreamCallbacks
  │   │   └── ApprovalManager（审批回调）
  │   ├── ConversationService
  │   ├── MessageRenderer
  │   ├── InputController
  │   ├── PlanModeController
  │   ├── ChatState
  │   ├── ConversationController
  │   ├── InputToolbar
  │   ├── ImageContext
  │   └── CurrentNoteContext
  ├── SettingsTab
  │   └── KiloCodeSettings（类型）
  ├── CommandRegistry / CommandPalette
  └── MentionService / MentionDropdown
```

---

## 历史设计文档索引

以下文件已在 `.kilo/plans/` 目录中完成历史使命，核心内容已整理到本文件：

| 文件 | 说明 | 状态 |
|------|------|------|
| `2026-05-20-obsidian-kilocode-design.md` | 初始设计规范（v1.0） | ✅ 已归档 |
| `2026-05-20-implementation-approaches.md` | 三种实现方案对比 | ✅ 已归档（采用方案C） |
| `2026-05-20-kilocode-enhancement-design.md` | 四阶段增强设计（A-D） | ✅ 已归档 |
| `2026-05-20-design-doc.md` | 错误处理与 UI 设计 | ✅ 已归档 |
| `2026-05-20-phase-a-core-communication.md` | Phase A 实施计划 | ✅ 已归档 |
| `2026-05-20-phase-b-conversation-management.md` | Phase B 实施计划 | ✅ 已归档 |
| `2026-05-20-phase-c-security-approval.md` | Phase C 实施计划 | ✅ 已归档 |
| `2026-05-20-phase-d-input-experience.md` | Phase D 实施计划 | ✅ 已归档 |
| `2026-05-20-phase1-implementation-plan.md` | Phase 1 实施计划 | ✅ 已归档 |
| `2026-05-20-phase2-implementation-plan.md` | Phase 2 实施计划 | ✅ 已归档 |
| `2026-05-20-phase3-implementation-plan.md` | Phase 3 实施计划 | ✅ 已归档 |
| `2026-05-20-phase4-implementation-plan.md` | Phase 4 实施计划 | ✅ 已归档 |
| `2026-05-21-binary-manager-design.md` | BinaryManager 设计规格 | ✅ 已归档 |
| `2026-05-21-binary-manager-implementation.md` | BinaryManager 实施计划 | ✅ 已归档 |
| `2026-05-21-stream-tab-switching.md` | 流式标签切换实施计划 | ✅ 已归档 |
| `1779333029026-tidy-sailor.md` | 部署构建产物到 Obsidian | ✅ 已归档 |
| `1779356957885-mighty-meadow.md` | Claudian 对比分析 | ✅ 已归档 |

---

## 与 Claudian 的差异

| 维度 | Claudian | KiloCode |
|------|----------|----------|
| AI 后端 | Claude/Codex/OpenCode（SDK 直连） | KiloCode CLI（`kilo serve` HTTP 中转） |
| 通信协议 | Claude Agent SDK subprocess stdio | HTTP SSE（`kilo serve` 中间层） |
| 流式传输 | SDK 原生 streaming parser（零额外 hop） | CLI 转发的 HTTP SSE（双 hop：插件→CLI→API） |
| 冷启动延迟 | Persistent query 长驻子进程，零延迟 | 首次启动需 spawn + 端口发现 + HTTP 就绪（3-5s） |
| 品牌色 | 蓝色系 | 黄色系（#FFB800） |
| 存储目录 | `.claudian/` | `.kilocode/` |
| 插件 ID | `realclaudian` | `kilocode` |
| 二进制管理 | 无自动下载 | BinaryManager + npm tarball |
| CLI 调用 | 回调模式 → AsyncGenerator | AsyncGenerator 从设计开始 |
| 审批系统 | 内置 | ApprovalManager + PermissionMode |
| 进程保活 | SD 内置 `agentQuery()` 持续运行 | 需自建空闲超时（已修复 ✅） |

### 核心架构差异：双跳 vs 单跳

```
KiloCode:
  Plugin → HTTP POST → kilo serve → HTTP/SSE → LLM API
                                    ← SSE ←
                         ← HTTP SSE ←

Claudian:
  Plugin → SDK subprocess stdio → LLM API (via Agent SDK)
```

KiloCode 多了**一次序列化/反序列化 hop**。对于 DeepSeek 等需要输出大量 `reasoning_content` 的模型，`kilo serve` CLI 内部的 SSE 转发缓冲可能进一步加剧延迟感知。

---

## 安全考虑

### 权限模式

| 模式 | 读工具 | 写工具 | 适用场景 |
|------|--------|--------|----------|
| Yolo | 自动放行 | 自动放行 | 可信环境、快速原型 |
| Normal | 自动放行 | 需审批 | 日常开发（默认） |
| Plan | 自动放行 | 拒绝 | 讨论/审阅 |

### 写工具列表（Normal 模式下需审批）

- `write_file`、`edit_file`、`delete_file`
- `bash`、`execute_command`

### 二进制安全

- npm tarball 通过 HTTPS 下载，npm registry 自身有完整性校验
- macOS 自动移除 Gatekeeper 隔离标记
- 文件权限：类 Unix `chmod 755`，Windows `.exe` 无需额外设置

---

## Claudian 架构分析（2026-05-24）

### Persistent Query vs Cold-Start Query 双轨制

Claudian 使用 Claude Agent SDK 的 `agentQuery()` 实现两种查询模式：

**Persistent Query（活跃聊天）**:
- `agentQuery({ prompt: messageChannel, options })` — **长驻子进程**
- 通过 `MessageChannel` 队列式 async iterator 发送消息
- 消息在同一轮 turn 活跃时用 `\n\n` 合并，减少 SDK 调用次数
- SDK 原生 streaming parser 直接处理 API SSE，零中间层
- 内置 crash recovery：最后一次消息 + queryOptions 缓存，进程崩溃后自动重发

**Cold-Start Query（内联编辑、标题生成）**:
- `queryViaSDK()` — 每次创建全新 SDK 查询
- 用于 `forceColdStart`、无 session 但有历史记录等场景

### MessageChannel 消息合并策略

| 消息类型 | 同一轮 turn 中的行为 |
|---------|-------------------|
| 纯文本 | 与队列中现有文本合并（`\n\n` 分隔），上限 `MAX_MERGED_CHARS` |
| 含附件（图片） | 替换队列中现有的附件消息（一轮只有一个附件） |
| 合并超限 | 丢弃最新消息并发出警告 |

### 参考文件

- `src/providers/claude/runtime/ClaudeChatRuntime.ts` — 主 runtime，64KB
- `src/providers/claude/runtime/ClaudeMessageChannel.ts` — 消息队列
- `src/providers/claude/runtime/claudeColdStartQuery.ts` — 冷启动查询
- `src/providers/claude/runtime/ClaudeQueryOptionsBuilder.ts` — 查询选项构建
- `src/providers/claude/runtime/customSpawn.ts` — spawn 封装（处理 Node 路径）
- `src/providers/claude/stream/transformClaudeMessage.ts` — SDK message → StreamChunk 转换
- `src/core/runtime/ChatRuntime.ts` — Runtime 接口定义

## 性能优化记录

| 优化点 | 策略 | 效果 |
|--------|------|------|
| 虚拟滚动 | >50 条消息仅渲染视口内容 | 减少 DOM 节点数 |
| rAF 滚动节流 | 同一帧多次 `scrollTop` 赋值合并执行 | 减少 layout thrashing |
| 磁盘写入防抖 | 流式期间 300ms 合并磁盘写入 | 减少 I/O 次数 |
| SSE chunk 合并 | 同次 `read()` 内相邻 text/thinking chunk 合并 | 减少 UI 回调次数 |
| 延迟 Markdown 渲染 | `finalizeMessage()` 使用 `requestAnimationFrame` 推迟到下一帧 | 不阻塞 UI 线程 |
| **冷启动预热** | 视图打开时后台预启动 runtime（fire-and-forget） | 将冷启动延迟从用户按 Enter 时转移到打字/思考期间 |
| **空闲超时延长** | 默认值 120s → 600s（10 分钟） | 减少聊天停顿后冷启动重启频率 |
| **端口发现加速** | PORT_DISCOVERY_DELAY_MS: 1500ms → 300ms；HTTP 轮询: 200ms → 指数退避 50-200ms | 缩短冷启动中端口检测和 HTTP 就绪等待时间 |
| **计时埋点** | `startServer()` 和 `sendMessage()` 各阶段 `performance.now()` 输出 | 定位后续残留性能瓶颈 |

---

## 已修复问题

### 空闲超时自动停止 `kilo serve` + onunload 兜底（2026-05-24）

**症状**: 插件在使用后 `kilo serve` 无限期运行，持续消耗 API token；Obsidian 关闭后进程可能变成孤儿。

**根因**:
1. 无空闲超时机制 — `kilo serve` 在消息完成后持续运行
2. `main.ts` `onunload()` 为空 — 依赖视图 `onClose()`，但视图清理在 Obsidian 强制关闭时不可靠

**修复**:
1. `KiloCodeChatRuntime` 添加 `idleTimer` + `clearIdleTimer()`/`startIdleTimer()` — 消息完成后 N 秒自动 `stop()`，默认 120 秒
2. `main.ts` 添加 `kilocodeRuntime` 引用 + `setKilocodeRuntime()` — `onunload()` 直接杀进程兜底
3. `KiloCodeView.getOrCreateRuntime()` 注册 runtime 到插件
4. 设置面板添加 `idleTimeoutSeconds` 滑块（0-600 秒）

**文件变更**:
- `src/providers/kilocode/runtime/KiloCodeChatRuntime.ts` — idleTimer 字段 + 方法 + sendMessage/stop/cancel 接入
- `src/main.ts` — runtime 引用 + onunload 兜底
- `src/features/chat/KiloCodeView.ts` — 注册 runtime
- `src/core/types/index.ts` — KiloCodeSettings 新增 idleTimeoutSeconds
- `src/app/settings/defaultSettings.ts` — 默认值 120
- `src/providers/kilocode/settings.ts` — 默认值 120
- `src/features/settings/SettingsTab.ts` — Idle Timeout 设置项

## 跟踪问题（Tracking Issues）

### T2.4: 会话续接（Session Resume）— 推迟

**状态**: 🔴 推迟 — 需要 CLI 支持验证
**创建日期**: 2026-05-24
**优先级**: 低（依赖 kilo CLI HTTP API 能力）

**问题描述**：
会话续接功能旨在允许 `kilo serve` 重启后复用之前的 session ID，避免 `POST /session` 的 HTTP 请求和 session 初始化延迟。

**阻塞原因**：
- 需要 `kilo serve` CLI 的 `POST /session` 端点支持接收自定义 `id` 参数
- 无法在无 API key 的 CI 环境中验证此行为
- `POST /session` 当前请求体为 `{}`（空对象），CLI 服务端自动生成 session ID
- 没有 KiloCode CLI 的 HTTP API 文档/源码可查阅

**前置条件**：
1. 获取 KiloCode CLI 的 HTTP API 文档或 Docker 镜像用于离线测试
2. 或在有 KILO_API_KEY 的集成环境中运行 `T2.4-SessionResume.test.ts`
3. 若 CLI 不支持 → 可考虑替代方案：插件侧维护 session 状态映射（但无法解决 CLI 端 session 过期问题）

**重新评估时间**: 下个迭代周期

---

## 已知遗留问题 / 待改进项

1. **DeepSeek 回答慢**（Root Cause 已定位）: `kilo serve` CLI 的 HTTP SSE 双跳架构导致。Claudian 通过直接使用 Claude Agent SDK subprocess stdio 避免了此问题。修复需要 CLI 层优化 SSE 转发透传，不缓冲。
2. **冷启动额外延迟**: 已通过预启动和加速端口发现优化，但 cold start 仍然存在（首次加载或超时空闲后）。根因在于 `kilo serve` CLI 的 spawn + 端口发现 + HTTP 就绪 + session 创建链路。理想方案是让 `kilo serve` 支持更快的预热，或插件侧采用持久连接池。
2. **更多语言支持**: 目前只有 en/zh，路线图中包含日文、韩文等
2. **自定义主题**: 目前只有 light/dark 跟随 Obsidian
3. **第三方扩展插件 API**: 目前无公开 API，路线图中计划
4. **自动更新机制**: BinaryManager 当前硬编码版本号 `7.3.1`，需定期 npm registry 检测新版本
5. **下载进度条**: 目前只有 Notice 提示"正在初始化"，未来可使用 Obsidian StatusBar API
6. **共享二进制目录**: 多个 Vault 当前各自缓存二进制，可共享减少磁盘占用
