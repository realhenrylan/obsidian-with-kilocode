# 工作日志 — Obsidian KiloCode 插件

---

## 2026-05-25: 第三阶段实施完成（T3.2 多 Runtime + T3.3 技能编目）

### T3.2 多 Runtime 支持

**设计决策**: 每个标签持有独立的 `ChatRuntime` 引用（方案 A），Tab 关闭时自动停止对应 `kilo serve` 进程。

**变更文件**:
| 文件 | 变更 |
|------|------|
| `src/features/chat/tabs/Tab.ts` | 新增 `runtime: ChatRuntime | null` 字段 + `disposeRuntime()` 方法 |
| `src/features/chat/tabs/TabManager.ts` | `closeTab()` 改为 async（内部调用 `disposeRuntime()`），新增 `disposeAllRuntimes()` |
| `src/features/chat/KiloCodeView.ts` | `getOrCreateRuntime()` 改为按标签创建/获取 runtime；`handleTabClick()` 从标签 runtime 读取 EventBuffer；`handleCancel()` 取消当前标签 runtime；`onClose()` 清理所有标签 runtime；`restartRuntime()` 重启当前标签 runtime；审批回调使用标签 runtime |
| `src/main.ts` | 单 `kilocodeRuntime` → `Set<ChatRuntime>` + `addKilocodeRuntime()`；`onunload()` 停止所有 runtime |

**测试**: 8 个单元测试，全部通过。

### T3.3 技能编目系统

**新文件**: `src/providers/kilocode/runtime/SkillCatalog.ts`（~150 行）

**设计决策**:
- 预定义 4 个官方技能（frontmatter、vault-org、obsidian-search、template-engine），每个技能含完整 SKILL.md 模板内容
- 安装到 `.kilo/skills/<name>/SKILL.md`，已存在跳过（不覆盖用户自定义）
- 通过 Obsidian 命令系统提供 4 个子命令（每个技能独立的 `Install skill: <name>`）

**测试**: 7 个单元测试（编目列表 2 + 安装 3 + 检测 2），全部通过。

### 阶段三验收

| 检查项 | 结果 |
|--------|------|
| `npm test` | 339 tests passed, 1 skipped (T2.4), 0 failures |
| `tsc --noEmit` | 0 errors |
| `npm run lint` | 1 pre-existing error (unchanged), 32 pre-existing warnings |
| 新增测试 | T3.2: 8个, T3.3: 7个, 共15个（>12 目标） |

---

## 2026-05-24: T3.1 ReviewLoop 验证器子代理完成

### T3.1 ReviewLoop 模块

**新文件**: `src/providers/kilocode/runtime/ReviewLoop.ts`（~220 行）

**设计决策**：
- 使用独立 `kilo serve` 子进程进行审查（ADR-8），审查完成立即 `stop()`，不占用 idle timeout
- 审查 Prompt 包含：`## Original User Request`、`## Files Modified`、`## Review Checklist`、`## Constraints`（含 `READ-ONLY` 约束）
- 结果解析：`LGTM` 开头视为通过；`- ` 前缀的行视为问题列表；其他视为摘要

**编辑文件提取**：
- `extractEditedFiles(message)` — 从 `Message.toolCalls` 中过滤 `write_file` / `edit_file` / `write` / `edit` 工具
- 提取 `input.file_path` 或 `input.path` 字段，自动去重

**集成到 KiloCodeView**：
- `handleSend()` 中第 7 步：`autoReview` 开启且 `editedFiles.length > 0` 时调用 `runReview()`
- 审查结果以 `Notice` 弹出（`'🔍 Review found issues:' + 问题列表`）

**新增设置项**：
- `autoReview: boolean`（默认 `false`）
- 类型 `KiloCodeSettings`、默认值（×3 处）、设置面板 Toggle

**测试**: 18 个单元测试全部通过
- 编辑文件提取 4（基本提取、去重、无 toolCalls、undefined）
- Prompt 构建 4（用户请求、文件列表、READ-ONLY、空列表）
- 结果解析 5（LGTM 精确/换行/小写、问题列表、摘要）
- 隔离性 3（独立实例、stop 清理、stream 失败也 stop）
- 端到端 2（LGTM 通过、发现问题）

---

## 2026-05-24: T2.4 会话续接前提验证 — 推迟

### T2.4 会话续接 — 前提验证结果

**状态**: 🔴 推迟

**所做工作**：
1. 编写 `T2.4-SessionResume.test.ts` — 集成测试验证 CLI 是否支持自定义 session ID
2. 测试条件判断：`hasApiKey` 为 false 时自动 skip（需 `KILO_API_KEY` 或 `KILO_BASE_URL` 环境变量）
3. 确认 kilo CLI v7.3.1 已安装（Go 二进制），但缺少 API 凭证无法启动 serve

**结果**：
- KiloCode CLI 是闭源 Go 二进制，无 HTTP API 文档
- 无法确定 `POST /session` 是否支持 `{ id: custom }` 参数
- 会话续接任务已标记为「推迟 — 需要 CLI 支持」

**替代建议**：
- 当前多轮对话已复用同一 session（同一 Runtime 实例内的连续 `sendMessage()` 共享 sessionId）
- EventBuffer（T2.1）已覆盖标签切换流恢复场景
- 预热优化（T2.2）已覆盖冷启动延迟场景
- 会话续接的边际收益在当前架构下有限，推迟是合理选择

### 阶段二总结

| 模块 | 状态 |
|------|------|
| T2.1 EventBuffer | ✅ 14 tests, 97.14% coverage |
| T2.2 预热优化 | ✅ 4 tests |
| T2.3 技能热重载 | ✅ 6 tests |
| T2.4 会话续接 | 🔴 推迟 — 需 CLI 支持 |
| 阶段二验收 | ✅ 305 tests passed, 0 lint errors |

---

## 2026-05-24: T2.3 技能热重载完成

### T2.3 技能热重载

**新文件**: `src/providers/kilocode/runtime/SkillWatcher.ts`（~90 行）

**设计决策**：
- 使用 Node.js 内置 `fs.watch(recursive: true)` 而非 chokidar（零原生依赖，符合约束）
- 300ms 防抖：文件写入可能触发多次 `change` 事件，防抖确保只触发一次 `invalidateSkillsCache`
- `fs.existsSync` + `mkdirSync` 确保目标目录存在，避免 `fs.watch` 在部分平台因路径不存在报错
- 所有 `fs.watch` 失败（权限、路径等）被 try/catch 静默捕获

**集成到 main.ts**：
- `onload()` 中 `createSkillWatcher(vaultPath)` 启动监听
- `onunload()` 中 `this.skillWatcher.dispose()` 停止监听并释放资源

**测试**: 6 个测试全部通过
1. 目录存在时创建 watcher
2. 目录不存在时自动创建 + 创建 watcher
3. dispose 正确清理（含二次调用幂等）
4. 修改 SKILL.md → 触发 invalidateSkillsCache
5. 新增 SKILL.md → 触发 invalidateSkillsCache
6. 内容更新后 loadSkills 返回新内容（验证缓存失效 → 重读）

---

## 2026-05-24: T2.2 预热优化完成

### T2.2 预热优化

**修改文件**: `src/main.ts`、`src/features/chat/KiloCodeView.ts`

**变更描述**：

**main.ts**:
- 新增 `warmupRuntimeRef: ChatRuntime | null` 公开字段（只读），供 View 认领预热 runtime
- 新增 `private warmupTimer` 字段，跟踪预热定时器
- 新增 `scheduleWarmup()` — 检查 `autoStart`，若 true 则在 1 秒后执行 `doWarmup()`
- 新增 `doWarmup()` — 创建 runtime → `start()` → 成功则写入 `warmupRuntimeRef`
- `onload()` 末尾调用 `this.scheduleWarmup()`
- `onunload()` 清理定时器和未认领的预热 runtime

**KiloCodeView.ts**:
- `getOrCreateRuntime()` 中新增判断：若 `plugin.warmupRuntimeRef` 存在，直接认领（置空插件引用、设置到 inputController、注册到插件），免去 `spawn + 端口发现 + HTTP 就绪 + session 创建` 的全链路冷启动

**设计原理**：
- 预热发生在插件加载而非视图打开时，更早启动 CLI 进程
- 延迟 1 秒避免与插件初始化竞争资源
- `autoStart=false` 时不预热，节约 token 和进程资源
- 预热失败静默，View 正常走冷启动流程

**测试**: 4 个单元测试
1. autoStart=true → setTimeout(1000) → createRuntime + start → warmupRuntimeRef 设置
2. autoStart=false → 不创建 runtime
3. 预热失败静默 → 不抛出异常
4. 预热失败不影响后续 View 正常创建 runtime

---

## 2026-05-24: 第二阶段开始 — EventBuffer 模块完成

### T2.1 EventBuffer 模块

**新文件**: `src/providers/kilocode/runtime/EventBuffer.ts`（120 行）

**功能**:
- `append(chunk)` — 追加 StreamChunk，返回单调递增序号
- `getSince(seq)` — 二分查找返回序号之后的所有 StoredChunk
- `replay(seq)` — 返回纯 chunk 数组，供 View 层直接渲染
- `clear()` — 清空所有事件
- 500 事件滚动窗口（惰性丢弃 + 定期裁剪，避免 O(n²) 性能退化）

**集成到 KiloCodeChatRuntime** (`KiloCodeChatRuntime.ts`):
- 新增 `readonly eventBuffer = new EventBuffer()` 公开字段
- `sendMessage()` 中每个 `yield chunk` 后追加到 buffer（含 error/done 信号）
- `stop()` 时 `this.eventBuffer.clear()`

**集成到 KiloCodeView** (`KiloCodeView.ts`):
- `handleTabClick()` 中新增 EventBuffer 恢复逻辑：当 streaming state 已被清理（流在后台完成）时，从 Runtime 的 EventBuffer 恢复未渲染的流内容
- 检查 `messagesEl` 是否已有内容避免与已加载会话重复

**测试**: 14 个单元测试全部通过
- 核心操作 5 case（append/getSince/replay/clear/空 buffer）
- 滚动窗口 3 case（500 不丢弃、501 丢弃、2000 裁剪）
- 性能 1 case（1000 次 append < 50ms）
- Runtime 集成 3 case（append 回调、getEventBuffer 引用、stop clear）
- View 集成 2 case（标签切换 replay、replay 渲染回调）

**覆盖率**: Statements 97.14%、Branches 100%、Functions 100%

---

## 2026-05-24: 第一阶段实施完成（HTTP Keep-Alive + 技能系统 + 提问协议）

### 完成的工作

#### T1.1 HTTP Keep-Alive 连接池
- **修改文件**: `src/providers/kilocode/runtime/KiloCodeChatRuntime.ts`
- **变更**:
  - constructor 中创建 `http.Agent({ keepAlive: true, keepAliveMsecs: 30000, maxSockets: 1 })`
  - `request()` 方法传入 `agent: this.httpAgent`
  - `stop()` 调用 `this.httpAgent.destroy()`
- **测试**: 4 个单元测试（agent 创建参数 ×2、request 传参、stop 销毁）
- **注意**: 修复了原有 `KiloCodeChatRuntime.test.ts` 的 `http` mock 缺少 `Agent` 类导致构造失败的回归

#### T1.2 SkillLoader 模块
- **新文件**: `src/providers/kilocode/runtime/SkillLoader.ts`（~200 行）
- **功能**:
  - `loadSkills(vaultPath)` — 扫描 `.kilo/skills/*/SKILL.md` 目录结构
  - 零依赖 frontmatter 解析（纯文本，无 gray-matter）
  - 30 秒缓存 TTL（参考 OpenCode Provider 的 SKILLS_TTL_MS 模式）
  - `invalidateSkillsCache()` — 热重载时调用
- **测试**: 8 个单元测试，覆盖率 Statements 91.66%、Branches 88%

#### T1.3 集成 SkillLoader 到 KiloCodeChatRuntime
- **修改文件**: `src/providers/kilocode/runtime/KiloCodeChatRuntime.ts`
- **变更**:
  - `buildMessagePayload()` 中自动加载 `.kilo/skills/` 下的技能
  - 新增 `buildSkillsContext(vaultPath)` 方法
  - 注入格式：`[SYSTEM CONTEXT — Obsidian KiloCode Core]` + core skill 正文章节 + `[AVAILABLE SPECIALIST SKILLS]` 目录列表
  - 提问协议（QUESTION_PROTOCOL）始终注入在上下文末尾
- **测试**: 5 个单元测试

#### T1.4 核心技能文件
- **新文件**: `.kilo/skills/kilocode-core/SKILL.md`
- **内容**: 基本原则、Obsidian 专业知识、Anti-patterns 硬性规则、对话行为
- **测试**: 3 个验证测试（文件存在、frontmatter 合法、关键章节）

#### T1.5 提问协议注入
- **新文件**: `src/providers/kilocode/runtime/prompts.ts`
- **功能**: 定义 `QUESTION_PROTOCOL` 常量，集成到 `buildSkillsContext()`
- **测试**: 3 个单元测试（协议前缀、关键词、位置顺序）

### 整体测试结果
- **281 tests passed**（258 原始 + 23 新增），0 failures
- **Lint**: 0 new errors（pre-existing 1 error 不变）
- **覆盖率**: SkillLoader 91.66%（>85%），修改部分 > 80%

### 阶段一总结
| 模块 | 文件 | 状态 |
|------|------|------|
| HTTP Keep-Alive | `KiloCodeChatRuntime.ts` | ✅ |
| SkillLoader | `SkillLoader.ts` | ✅ |
| 集成到 Runtime | `KiloCodeChatRuntime.ts` | ✅ |
| Core Skill 文件 | `.kilo/skills/kilocode-core/SKILL.md` | ✅ |
| 提问协议 | `prompts.ts` | ✅ |
| **阶段一验收** | — | ✅ |

---

## 2026-05-24: 规划文件已创建

### task_plan.md
创建了完整的任务路线图，包含：
- **项目目标**：3 个核心指标（冷启动延迟、标签切换恢复、Agent 感知）
- **验收标准**：三阶段共 24 个可勾选条件
- **已知约束**：8 项约束（硬/建议级别标记）
- **实施方案**：8 个模块的详细技术方案（修改文件、变更描述、关键接口、验证方法、回滚策略）
- **子任务清单**：16 个原子修改步骤
- **进度状态**：表格跟踪

### findings.md
新增 7 条架构决策记录（ADR-4 至 ADR-10），涵盖各模块的技术选型理由和代价分析：
- ADR-4: 技能目录 vs 单文件 AGENTS.md
- ADR-5: 30 秒技能缓存 TTL
- ADR-6: 500 事件滚动窗口
- ADR-7: HTTP Keep-Alive 单 Socket
- ADR-8: 验证器用独立进程
- ADR-9: 纯文本提问协议
- ADR-10: 多 Runtime 可选推迟

### 当前状态
进入等待阶段——`task_plan.md` 已创建，等待用户确认后开始执行。

---

## 2026-05-24: 冷启动延迟优化 — 减少发消息等待时间

### 问题描述

用户反映从按下 Enter 到 AI 开始响应的时间很长，即使发送 "hi" 这样的短消息也需要等待数秒。

### 根因分析

经过代码审查，定位到三个主要延迟来源：

**1. 冷启动发生在首次消息（最严重）**
`handleSend()` → `getOrCreateRuntime()` → spawn CLI → 等待端口 → HTTP 就绪 → 创建 session。
这个链路需要 2-6 秒，全部发生在用户按 Enter 之后。

**2. 空闲超时默认值太小（120 秒）**
用户看了 2 分钟回复才打下一条消息 → 进程被杀 → 下一条消息冷启动重来。
对于使用习惯慢的用户（阅读思考型），每句话都在触发冷启动。

**3. 端口发现和 HTTP 就绪探测过于保守**
`PORT_DISCOVERY_DELAY_MS = 1500ms`（后备扫描在进程启动 1.5 秒后才触发）
HTTP 轮询间隔固定 200ms

### 所做工作

#### 1. 后台预热 runtime（KiloCodeView.onOpen）
- 在 `onOpen()` 末尾添加 `warmupRuntime()` 调用（fire-and-forget，不阻塞视图初始化）
- 用户在打开聊天面板 + 打字/思考的间隙完成 runtime 启动
- 预热失败静默处理，`handleSend()` 中会再次尝试

#### 2. 延长空闲超时默认值
- `defaultSettings.ts` 和 `providers/kilocode/settings.ts` 中 `idleTimeoutSeconds` 从 120 改为 600
- 设置面板描述同步更新

#### 3. 加速端口发现 + HTTP 轮询
- `PORT_DISCOVERY_DELAY_MS`: 1500ms → 300ms
- `waitForHttpReady` 轮询间隔: 固定 200ms → 指数退避（50ms → 100ms → 200ms）

#### 4. 添加计时埋点（`performance.now`）
- `startServer()` 输出 `getBinaryPath / waitForPort / waitForHttpReady / createSession` 各阶段耗时
- `sendMessage()` 输出 `buildPayload / httpRequest / timeToFirstToken`
- `handleSend()` 输出 `runtimeAcquisition + timeToFirstChunk`

### 测试

`npx jest` — 258 tests passed, 0 failures。无回归。

### 总结

| 优化项 | 改动 | 预期效果 |
|--------|------|----------|
| 后台预热 | `onOpen()` → fire-and-forget `warmupRuntime()` | 冷启动发生在用户打字期间，按 Enter 时无需等待 |
| 空闲超时 120s→600s | `defaultSettings.ts` | 日常聊天停顿不再触发热启动 |
| 端口发现 1500ms→300ms | `KiloCodeChatRuntime.ts` | 缩短冷启动中端口检测时间 |
| HTTP 轮询 200ms→指数 50-200ms | `KiloCodeChatRuntime.ts` | 加速 HTTP 就绪检测 |
| 计时埋点 | `performance.now()` 在 3 个关键位置 | 定位后续残留瓶颈 |

---

## 2026-05-24: Claudian 架构分析 — DeepSeek 回答慢根因定位

### 任务描述

用户反映 DeepSeek 模型回答速度慢，查阅 Claudian 源码分析其流式传输机制。

### 所做工作

#### 1. 分析 Claudian 源码

查阅了以下关键文件：
- `src/core/runtime/ChatRuntime.ts` — Runtime 接口定义
- `src/providers/claude/runtime/ClaudeChatRuntime.ts` — 64KB 主 runtime
- `src/providers/claude/runtime/ClaudeMessageChannel.ts` — 队列式消息通道
- `src/providers/claude/runtime/customSpawn.ts` — spawn 封装
- `src/providers/claude/runtime/claudeColdStartQuery.ts` — 冷启动查询
- `src/providers/claude/stream/transformClaudeMessage.ts` — SDK message 转换

#### 2. 关键发现

**Claudian 使用 `@anthropic-ai/claude-agent-sdk` 直接通信**，没有中间 HTTP 服务器：
- `agentQuery()` 创建长驻子进程（persistent query）
- SDK 内置 streaming parser 直接处理 API SSE
- MessageChannel 在同一轮 turn 中将文本用 `\n\n` 合并

**KiloCode 的架构多了额外的一跳**：
- Plugin → HTTP POST → `kilo serve` → LLM API
- 这意味着两次 SSE 解析（CLI 解析一次 API 的 SSE，插件再解析 CLI 转发的 HTTP SSE）
- DeepSeek 的 `reasoning_content`（CoT）很长时，`kilo serve` 的内部缓冲会加剧延迟

#### 3. 更新文档

- `task_plan.md` — 更新状态为"维护优化中"，新增空闲超时验收标准
- `findings.md` — 新增"Claudian 架构分析"章节，更新"与 Claudian 的差异"表（加入通信协议对比），更新遗留问题列表
- `progress.md` — 记录本次分析

### 结论

DeepSeek 慢的问题**根因在 CLI 层**（HTTP SSE 双跳），插件层能做的有限。已记录到遗留问题。token 消耗问题已通过空闲超时修复解决。

---

## 2026-05-23: 空闲超时自动停止 + onunload 兜底清理

### 任务描述

修复 `kilo serve` 在消息完成后无限期运行、持续消耗 API token 的问题。
两个层面的修复：
1. 空闲超时自动停止（`KiloCodeChatRuntime` 自管理）
2. Obsidian 关闭/插件卸载时兜底清理（`main.ts` `onunload()`）

### 所做工作

#### 1. 根因分析

- `KiloCodeChatRuntime.sendMessage()` 完成后，`kilo serve` 进程一直存活等待下一条消息
- `main.ts` `onunload()` 是空函数，依赖 `KiloCodeView.onClose()` 清理
- `onClose()` 确实会杀进程，但 Obsidian 强制关闭时视图清理不可靠
- 多个编辑器（VS Code + Obsidian）各自独立启动 `kilo serve`，彼此无关

#### 2. 空闲超时机制（KiloCodeChatRuntime）

- 新增 `idleTimer` 字段 + `clearIdleTimer()`/`startIdleTimer()` 方法
- `sendMessage()` 开始时取消 timer，finally 中重启 timer
- `stop()`/`cancel()` 中取消 timer
- 超时默认 120 秒，通过设置面板可配（0 = 禁用，10-600 秒滑块）

#### 3. onunload 兜底（main.ts）

- 新增 `kilocodeRuntime` 引用 + `setKilocodeRuntime()` setter
- `onunload()` 直接调用 `runtime.stop()` 杀进程
- `KiloCodeView.getOrCreateRuntime()` 注册 runtime 到插件

#### 4. 设置面板

- Chat 区域新增 "Idle Timeout (seconds)" 滑块（0-600 秒，步长 10）

### 测试

`npx jest` — 258 tests passed, 0 failures. 无回归。

### 风险评估

- 空闲超时默认 120 秒，对正常使用无影响（发消息时自动取消 timer）
- 设为 0 恢复旧行为（进程持续运行），兼容极端用户需求
- `onunload()` 中 `runtime.stop()` 若正在流式，会 abort HTTP + 杀进程，行为正确

### 总结

token 消耗问题已修复：两层防线（空闲超时 + 插件卸载兜底）确保 `kilo serve` 不会无故持续运行。

---

## 2026-05-23: plans 整理归档

### 任务描述

将 `.kilo/plans/` 目录下杂乱无章的 17 个计划文件整理为规范的三个核心规划文件：
- `task_plan.md` — 任务路线图
- `findings.md` — 研究发现
- `progress.md` — 工作日志（本文件）

### 所做工作

#### 1. 阅读并分析所有现有文件

- 通读项目根目录 `README.md`、`README_CN.md`、`CHANGELOG.md`、`manifest.json`、`package.json`
- 通读 `.kilo/plans/` 下全部 17 个 Markdown 文件
- 遍历项目源码目录结构（`src/`、`tests/`、`.github/`、`assets/`）

#### 2. 创建 `task_plan.md`

- **项目目标**: 从 `2026-05-20-obsidian-kilocode-design.md` 提取项目定位
- **验收标准**: 综合 CHANGELOG 中各版本的添加项，整理 27 项已完成验收标准
- **已知约束**: 从设计文档和 manifest 中提取技术约束
- **实施方案**: 
  - 提炼总体架构（方案C）
  - 整理分层架构（Plugin → Core → Provider → Features → Shared）
  - 描述数据流
  - 记录 11 项关键技术决策
  - 列出回滚策略
- **子任务清单**: 按 Phase A-D + Binary Manager + 后期增强 分类，共 50+ 子任务，全部标记完成
- **进度状态**: 整体置为 ✅ 已完成

#### 3. 创建 `findings.md`

- **架构决策记录**: 6 项 ADR（AsyncGenerator、HTTP SSE、BinaryManager 链、ChatState、Node.js http、方案C）
- **关键设计模式**: 5 种核心实现模式（Runtime 队列、审批流程、下载降级链、SSE 通信、TabStreamingState）
- **模块依赖关系**: 完整的依赖树
- **历史设计文档索引**: 17 个计划文件的摘要和状态
- **与 Claudian 的差异**: 7 个维度的对比表
- **安全考虑**: 权限模式、写工具列表、二进制安全
- **性能优化记录**: 6 项优化策略
- **已知遗留问题**: 5 项待改进项

#### 4. 创建 `progress.md`

- 本次工作日志（本文件）

### 风险评估

- **无风险**: 本次操作只创建新文件，不修改任何现有代码
- **向后兼容**: 原 `.kilo/plans/` 目录保留不动，不删除任何历史文件

### 总结

杂乱无章的 17 个计划文档已整理为 3 个结构化的核心规划文件。原计划文件保留在 `.kilo/plans/` 作为历史记录。项目当前主力功能开发已全部完成，处于维护优化阶段。
