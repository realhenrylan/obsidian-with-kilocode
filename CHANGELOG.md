# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Fixed

- **SSE stream cancel fix**: added res.on(close) handler in KiloCodeChatRuntime.request() ReadableStream. Without it req.destroy() leaves stream hanging, blocking all subsequent AI responses.

### Added

- **多 Runtime 支持 v1 (T3.2)**: 每个聊天标签拥有独立的 `kilo serve` 进程，实现真正的多会话并行。`Tab` 类新增 `runtime` 字段和 `disposeRuntime()` 方法；`TabManager.closeTab()` 改为 async 并在关闭标签时自动停止对应进程；`KiloCodeView.getOrCreateRuntime()` 改为按标签创建/获取 runtime；`main.ts` 改为管理 `Set<ChatRuntime>` 集合，`onunload()` 停止所有运行中进程。新增 8 个单元测试覆盖独立 sessionId、标签切换、关闭清理、进程泄露检测。

- **技能编目系统 v1 (T3.3)**: 新增 `src/providers/kilocode/runtime/SkillCatalog.ts`，提供 4 个预定义官方技能（frontmatter、vault-org、obsidian-search、template-engine），每个技能含完整模板内容。新增 `installSkill()` 安装函数（已存在跳过，不覆盖用户修改）。新增 4 个 Obsidian 命令：`List available skills`、`Install skill...`、以及每个技能独立的 `Install skill: <name>` 命令。新增 7 个单元测试覆盖编目列表、安装新建、未知技能、已存在跳过、已安装检测。

  - `buildReviewPrompt()` — 构建结构化审查 Prompt（含用户请求、文件列表、READ-ONLY 约束）
  - `parseReviewResponse()` — 解析审查回复（`'LGTM'` 通过 / 问题列表）
  - `extractEditedFiles()` — 从助手消息的 toolCalls 中提取 `write_file`/`edit_file` 路径
  - `runReview()` — 创建独立 Runtime 执行审查，完成后自动 stop，stream 失败也确保清理

- **技能热重载 (SkillWatcher)**: 新增 `src/providers/kilocode/runtime/SkillWatcher.ts`，使用 Node.js 内置 `fs.watch(recursive: true)` 监控 `.kilo/skills/` 目录变更，300ms 防抖后自动调用 `invalidateSkillsCache()`。用户在编辑 SKILL.md 或新增技能目录后，下一次 `sendMessage()` 立即使用新内容，无需重启 Obsidian。集成到 `main.ts` — `onload()` 中启动 watcher，`onunload()` 中 `dispose()`。

- **预热优化 v2 (Early Warmup)**: `main.ts` 新增后台预热机制，`onload()` 末尾调用 `scheduleWarmup()`，延迟 1 秒后在后台创建并启动 `kilo serve` 进程。仅在 `autoStart=true` 时执行。预热创建的 runtime 通过 `warmupRuntimeRef` 公开字段共享给 `KiloCodeView` — `getOrCreateRuntime()` 优先认领预热 runtime，免去 spawn + 端口发现 + HTTP 就绪 + session 创建的全链路冷启动延迟。预热失败静默处理，不影响 View 正常创建流程。`onunload()` 中清理未认领的预热定时器和 runtime。

- **事件缓冲器 v1 (EventBuffer)**: 新增 `src/providers/kilocode/runtime/EventBuffer.ts` 模块，在 `sendMessage()` 流式消费过程中逐块记录每个 `StreamChunk`，支持 500 事件滚动窗口。`getSince(seq)` 二分查找高效查询，`replay(seq)` 返回纯 chunk 数组供 View 渲染。`KiloCodeChatRuntime` 集成：每个 `yield` 后追加到 buffer、`stop()` 时清空。`KiloCodeView.handleTabClick()` 集成：标签切换时从 EventBuffer 恢复未渲染的流内容。覆盖率 Statements 97.14%、Branches 100%。

- **HTTP Keep-Alive 连接池**: `KiloCodeChatRuntime` 构造函数创建 `http.Agent({ keepAlive: true, keepAliveMsecs: 30000, maxSockets: 1 })`，所有 HTTP 请求复用单 TCP socket，减少三次握手开销。`stop()` 时调用 `agent.destroy()` 清理连接。
- **技能目录系统 v1**: 新增 `SkillLoader` 模块（`src/providers/kilocode/runtime/SkillLoader.ts`），从 `.kilo/skills/*/SKILL.md` 目录结构加载技能文件。零依赖 frontmatter 解析，30 秒 TTL 缓存，提供 `invalidateSkillsCache()` 支持热重载。
- **技能上下文注入**: `KiloCodeChatRuntime` 的 `buildMessagePayload()` 自动加载并注入技能上下文。`kilocode-core` 技能完整注入作为系统指令，其他 specialist 技能以目录列表形式注入。
- **核心技能文件**: 新增 `.kilo/skills/kilocode-core/SKILL.md`，定义基本原则、Obsidian 专业知识、Anti-patterns 硬性规则和对话行为。
- **结构化提问协议**: 新增 `src/providers/kilocode/runtime/prompts.ts`，定义 `QUESTION_PROTOCOL` 常量并集成到 `buildSkillsContext()`，注入在技能上下文之后、用户消息之前。协议指导 Agent 使用 "Decide for me" 和 "Explore options" 格式的结构化多选问题。

- **KiloCode Obsidian 插件改进方案文档**: 新增 `docs/kilocode-improvement-plan.md`，基于对 OpenDesign/OpenDesignr 的深度技术分析，针对 KiloCode 子进程架构提出了 9 项具体改进方案：技能目录系统（`.kilo/skills/*/SKILL.md`）、HTTP 连接池化、结构化事件缓冲、Anti-pattern Rules、启动预热优化、会话续接、结构化提问协议、验证器子代理（Review Loop）。含三阶段实施计划和详细的伪代码实现。

- **OpenDesign Agent CLI 深度技术分析文档**（第三版）: `docs/opendesign-agent-cli-analysis.md` 追加了 14 个源代码文件的精确分析，包括 5 个平台的插件接入机制（Gemini 仅 281 字节）、4 个 Provider 的完整源代码（Claude SDK/Codex SDK/OpenCode API/NVIDIA API）、进程内 MCP Server 的内存对象架构、端到端延迟毫秒级分解。

### Added

- **OpenDesign 项目 Agent CLI 集成分析文档**: 新增 `docs/opendesign-agent-cli-analysis.md`，深入分析了 [manalkaff/opendesign](https://github.com/manalkaff/opendesign) 和 [opendesignr/opendesignr](https://github.com/opendesignr/opendesignr) 两个项目的 Agent CLI 集成架构，涵盖：纯技能化插件系统（跨 5 个平台分发）、MCP 服务器（19+ 工具直接驱动）、聊天抽屉 SSR 流式集成、技能自动发现与编目系统、以及验证器子代理（Review Loop）模式。分析报告包含了对当前项目的 6 条可直接采用的设计模式和 4 层建议集成架构。

### Added

- **空闲超时自动停止 `kilo serve`** (token 节省): `KiloCodeChatRuntime` 新增空闲超时机制，消息完成后 N 秒自动停止 `kilo serve` 进程，避免持续消耗 token。`sendMessage()` 结束时启动定时器，下次发消息自动取消并重启进程。超时时间通过设置面板 `Idle Timeout` 滑块可配置（0-600 秒，默认 120 秒/2 分钟）。`main.ts` `onunload()` 添加兜底清理，确保 Obsidian 关闭时直接杀死子进程而非依赖视图清理。`KiloCodeView` 创建 runtime 后注册到插件，使插件层可追踪进程生命周期。
- **运行时预启动（冷启动预热）**: `KiloCodeView.onOpen()` 末尾 fire-and-forget 调用 `warmupRuntime()`，用户在打开聊天面板后的打字/思考期间在后台完成 CLI 进程启动，显著减少首次 Enter 到首 token 的等待时间。
- **计时埋点（performance.now）**: `KiloCodeChatRuntime.startServer()` 输出各阶段耗时（getBinaryPath/waitForPort/waitForHttpReady/createSession）；`KiloCodeChatRuntime.sendMessage()` 输出 buildPayload/httpRequest/timeToFirstToken；`KiloCodeView.handleSend()` 输出 runtimeAcquisition + timeToFirstChunk。帮助定位冷启动和消息传输中的性能瓶颈。

### Changed

- **空闲超时默认值延长**: `idleTimeoutSeconds` 从 120 秒改为 600 秒（10 分钟），减少日常聊天停顿触发热启动的频率。
- **端口发现加速**: `PORT_DISCOVERY_DELAY_MS` 从 1500ms 降低到 300ms，后备端口扫描提前触发。
- **HTTP 就绪探测加速**: `waitForHttpReady()` 轮询间隔从固定 200ms 改为指数退避 50ms→100ms→200ms，平衡快速检测和总线压力。

### Changed

- **模型覆盖修复**: 插件不再硬编码 `modelID` 覆盖 `kilo serve` CLI 自身配置。`defaultModel` 默认值从 `'claude-sonnet-4-20250514'` 改为空字符串。当用户在插件设置中未显式配置模型时，API 请求不发送 `modelID` 字段，让 CLI 使用其配置文件中的默认模型。设置面板模型下拉框新增 "Use CLI default" 选项。`KiloCodeChatRuntime` 构造函数改为接受设置 getter 函数 `() => KiloCodeSettings` 而非快照对象，确保运行时始终使用最新设置。

### Added

- **CLI 配置自动读取**: 新增 `src/core/cliConfigReader.ts`，插件启动时自动读取 `~/.config/kilo/config.json`，将 `defaultModel` 和 `baseUrl` 合并到插件设置（插件已有值优先，CLI 配置作为 fallback）。设置面板新增 "CLI Configuration" 区域，显示当前检测到的 CLI 模型和 API key 状态。
- **CLI 重载命令**: 添加 "KiloCode: Reload CLI Configuration" 命令，用于在修改 `kilo` CLI 配置文件后手动重启子进程。`kilo serve` 只在启动时读取一次配置，修改 `~/.config/kilo/config.json` 后需要触发此命令使 new API key 等变更生效。

### Fixed

- **context 参数丢失**: `KiloCodeChatRuntime.sendMessage()` 的 `context` 参数（包含 `vaultPath` 和 `currentNote`）之前未传递给 `buildMessagePayload()`，导致 vault 路径上下文从未发送到 CLI。现已修复并将 `vaultPath` 写入请求 payload。
- **首次打开无响应**: `KiloCodeView.onOpen()` 未自动创建默认标签页，`TabManager` 始终为空。用户输入消息后 `handleSend()` 因 `getActiveTab()` 返回 null 而静默退出，不提供任何反馈。修复：在 `onOpen()` 中检测无标签页时自动调用 `tabManager.createTab()` 创建首个标签页。
- **`.playwright-mcp` 调试日志泄漏**: 工作区残留 37 个 Playwright 浏览器调试文件（console log + 页面快照）。删除目录并加入 `.gitignore`。

### Added

- **ChatState 集中状态管理**: `src/features/chat/state/ChatState.ts` — 管理流式状态（isStreaming/streamGeneration/cancelRequested）、会话状态（currentConversationId/hasPendingConversationSave）、流式内容缓冲（currentTextContent/currentThinkingContent/toolCalls）。使用 getter/setter + 回调通知模式，支持事件订阅（streamingChange/cancelRequested/conversationChange）
- **ConversationController 会话生命周期控制**: `src/features/chat/controllers/ConversationController.ts` — 从 KiloCodeView 抽取会话管理逻辑，提供 createNew()、switchTo()、ensureConversation()（懒创建）、save()、restoreConversation()、rewind()、fork()、addMessage()、getConversation() 方法。通过回调注入（onRenderMessages/onClearMessages）避免直接依赖 DOM
- **ContentBlock 类型**: `src/core/types/index.ts` 新增 `ContentBlock` 接口和 `contentBlocks` 字段 — 将消息分解为有序块（text/thinking/tool_use），与现有 thinking/toolCalls 字段并存，提供有序渲染能力
- **代码块优化**: MessageRenderer 的 `enhanceCodeBlocks()` 方法 — 自动为 `<pre>` 代码块添加 `.kilo-code-wrapper` 包裹、语言标签（从 `class="language-xxx"` 提取）和复制按钮（带 "Copied!" 反馈）
- **欢迎语随机化**: KiloCodeView 的 `getRandomPlaceholder()` 方法 — textarea 占位符从 5 条提示语中随机选择
- **会话标题显示**: ConversationService 的 `getConversationTitle()` 轻量查询方法 — 标签栏显示会话标题而非截断的 ID

### Changed

- **KiloCodeView**: 集成 ChatState 和 ConversationController — 构造函数实例化新组件并注入回调，onOpen/handleTabClick/handleSend/handleRewind/handleFork/handleCopy/handleNewTab/onClose 全部迁移至使用 ConversationController。删除已废弃的 `loadConversationMessages()` 方法
- **ConversationService**: 移除 2 处诊断用 `console.log`（getConversation/addMessage 的调试输出）
- **KiloCodeChatRuntime**: 移除 14 处诊断用 `console.log`（启动路径、端口发现、SSE 解析、chunk 内容输出等临时调试日志）
- **MessageRenderer**: `renderMessage()` 和 `finalizeMessage()` 在 Markdown 渲染后调用 `enhanceCodeBlocks()` 进行代码块后处理
- **MessageRenderer**: `scrollToBottom()` 使用 `requestAnimationFrame` 节流 — 流式渲染期间每个 SSE chunk 都会触发 `scrollTop` 赋值导致浏览器回流，现在同一帧内多次调用只执行一次，减少 layout thrashing
- **ConversationService**: `addMessage()` 磁盘写入防抖 — 内存立即更新保证一致性，磁盘写入延迟 300ms 合并，减少流式响应期间的 I/O 次数。新增 `flush()` 方法在视图关闭时强制写入
- **KiloCodeChatRuntime**: SSE chunk 合并 — `parseEventStream()` 将同次 `read()` 内相邻的 text/thinking chunk 合并后 yield，减少 `for-await` 循环和 UI 回调次数。新增 `mergeAdjacentChunks()` 生成器
- **MessageRenderer**: `finalizeMessage()` 延迟 Markdown 渲染 — 使用 `requestAnimationFrame` 将 Obsidian `MarkdownRenderer.renderMarkdown()` 推迟到下一帧，避免阻塞 UI 线程
- **KiloCodeChatRuntime**: 重写通信层 — 废弃 `kilo run <message>` 子进程模式，改为 `kilo serve` HTTP 模式。`start()` spawn HTTP server 进程，`sendMessage()` 通过 HTTP POST 发送消息并处理 SSE/ndjson 流式响应，`stop()` kill 进程
- **KiloCodeChatRuntime**: HTTP 请求改用 Node.js `http` 模块 — 浏览器 `fetch()` 在 Electron renderer 进程中受 CORS 限制（`app://obsidian.md` origin 无法访问 `http://127.0.0.1`），Node.js HTTP 完全绕过此限制
- **KiloCodeView**: 重构为 claudian 架构 — DOM 骨架只在 `onOpen()` 创建一次，通过 `updateUI()` 更新内容，解决 textarea 事件监听器丢失和消息 DOM 被销毁的问题

### Fixed

- **Thinking/Reasoning 文本与正常回答分离** — DeepSeek R1 等模型的推理过程（`parts[].type === "thinking"`）不再混入回答显示，通过 `extractThinkingAndText()` 按 `type` 字段区分
- **流式响应实时渲染** — 用户发送消息后可看到逐步生成的文本，替代之前的"等待完成后一次性渲染"
- **streamGeneration 冲突保护** — 快速连发消息时旧流不会覆盖新流，通过 `TabState.streamGeneration` 代数匹配机制实现
- **KiloCodeView**: 修复无法发送第二条消息 — 根因是 `render()` 每次调用 `container.empty()` 销毁 DOM，导致 textarea 的 `registerDomEvent` 事件监听器丢失。现在 textarea 和所有事件监听器只注册一次
- **KiloCodeView**: 修复切换会话时消息消失 — 根因是 `render()` 销毁消息 DOM 后 `renderConversationMessages` 未正确调用。现在通过 `handleTabClick()` → `loadConversationMessages()` 正确加载消息
- **KiloCodeView**: 修复重启 Obsidian 后首个会话无法发送 — 根因是 `render()` 在 `onOpen()` 时被调用但会话尚未初始化。现在 `buildLayout()` 只创建骨架，消息加载异步进行
- **KiloCodeView**: 修复流式响应串台到其他标签页 — 添加 `senderTabId` 跟踪发送者标签，流式进行中阻止切换标签，渲染前校验当前标签是否为发送者
- **KiloCodeView**: 修复聊天发送消息时 "Runtime not started" 错误 — `getOrCreateRuntime()` 改为 async 等待 `start()` 完成后再返回 runtime
- **CORS**: 修复 Obsidian 插件无法访问 `kilo serve` HTTP API 的 CORS 策略错误

### Added

- **StreamChunkType**: 新增 `'thinking'` 类型，支持 thinking/reasoning 文本与普通文本分离
- **Message**: 新增 `thinking?: string` 字段，持久化 thinking/reasoning 内容
- **TabState**: 新增 `streamGeneration: number` 字段和 `bumpStreamGeneration()` 方法，用于流式冲突保护
- **KiloCodeChatRuntime**: `extractThinkingAndText()` 方法 — 递归遍历 JSON 结构，按 `parts[].type` 字段区分 thinking 和 text
- **StreamController**: `onThinking` 回调 + `generation` 参数 — 支持 thinking chunk 处理和 streamGeneration 冲突保护
- **MessageRenderer**: 流式增量渲染 — `addAssistantMessage()` 创建空容器、`appendText()` 增量文本追加（textContent 避免高频 Markdown 渲染）、`appendThinking()` 创建/更新 thinking block、`finalizeMessage()` 流结束后最终 Markdown 渲染
- **MessageRenderer**: thinking block 折叠显示 — 流式阶段 `<details>` 展开显示、历史消息 `<details>` 折叠显示并标注字符数
- **SettingsTab**: 新增 API Configuration 区域 — API Key（密码输入框）和 Base URL 配置项
- **KiloCodeChatRuntime**: 环境变量注入 — `apiKey` → `KILO_API_KEY`，`baseUrl` → `KILO_BASE_URL`，`vaultPath` → `cwd`
- **registration**: `createKilocodeRegistration()` 接受 settings getter，确保 runtime 使用最新的用户配置而非默认空值

## [0.7.0] - 2026-05-21

### Added

- **BinaryManager**: CLI binary lifecycle manager — `getBinaryPath()` priority chain (user config → system PATH → local cache → auto-download), `preload()` async preloading without blocking UI, `.version` file management, download fallback chain with multiple npm package names + mirror URL support, macOS quarantine attribute auto-removal
- **PlatformDetector**: Platform/arch/AVX2/musl detection module ported from @kilocode/cli's bin/kilo script — `detectPlatform()` returns platform info and npm package candidate list, `supportsAvx2()` detects AVX2 instruction set support, `isMusl()` detects musl libc environment
- **npmDownloader**: npm tarball download + gzip decompression + tar parsing for binary extraction — `buildTarballUrl()` constructs registry download URLs, `extractBinaryFromTarball()` extracts target file from tar buffer, `downloadBinary()` end-to-end download flow
- **Settings extension**: `KiloCodeSettings` adds `mirrorUrl` field for custom binary download mirror URL
- **SettingsTab**: "Download Mirror URL" setting for configuring custom binary download source

### Changed

- **KiloCodeChatRuntime**: Constructor changed to `(binaryManager, settings)`, `start()` calls `binaryManager.getBinaryPath(settings)` for lazy CLI path resolution
- **registration.ts**: Refactored to factory function `createKilocodeRegistration(binaryManager)` accepting BinaryManager dependency
- **main.ts**: Creates BinaryManager in `onload()`, calls `preload()` in background, passes to provider registration
- **README.md**: Removed manual CLI install prerequisite, added auto-download feature documentation, updated architecture and settings sections
- **README_CN.md**: Synced with English version changes

### Fixed

- **KiloCodeView**: Fixed "Runtime not started" error when sending messages — `getOrCreateRuntime()` now awaits `start()` completion before returning runtime

## [0.6.1] - 2026-05-21

### Changed

- **README.md**: 全面细化文档内容 — 新增输入工具栏、对话管理、图片附件、权限系统使用说明；架构章节重写为完整目录树+数据流+设计决策；新增 Security Model、Testing、i18n、CI/CD 独立章节；扩展故障排除与路线图
- **README_CN.md**: 与英文版保持同步的中文细化

## [0.6.0] - 2026-05-20

### Added

- **Permission modes**: `PermissionMode` type with `yolo` (auto-approve all), `normal` (approve writes), `plan` (read-only, deny writes) modes
- **ApprovalManager**: Tool call approval queue with `requestApproval`, `cancelAll`, `resetAlwaysAllow`, and `setApprovalHandler` for UI injection
- **ApprovalModal**: Obsidian Modal dialog with Allow / Always Allow / Deny / Cancel buttons, ESC key support, and JSON input preview
- **Settings extension**: `KiloCodeSettings` adds `permissionMode` field (default: `'normal'`)
- **Permission mode dropdown**: SettingsTab adds Security section with permission mode selector (Normal / Yolo / Plan)
- **StreamController approval handling**: Processes `approval_required` chunks from AsyncGenerator, invokes `onApprovalRequired` callback, calls `onApprovalDecision` to notify runtime, auto-cancels on `'cancel'` decision
- **KiloCodeView approval integration**: Creates `ApprovalManager` instance, sets `showApprovalModal` as handler, syncs permission mode from settings before each send, wires `approval_required` callback into stream pipeline
- **CurrentNoteContext**: Toggles inclusion of active note as AI context, reads note content via `getNoteContent()`, refreshes on active view change
- **ImageContext**: Image attachment manager supporting file picker (`addFromFile`), clipboard paste (`addFromPaste`), drag-and-drop (`addFromDrop`), with 5MB size limit, preview rendering, and per-image removal
- **InputToolbar**: Configurable toolbar component with action buttons, `updateButton` for active state toggle, and destroy cleanup
- **@mention enhancement**: `MentionService.search` extended with optional `context` parameter for MCP server and subagent search; `MentionType` adds `'mcp-server'` and `'subagent'`; `MentionDropdown` type labels updated
- **KiloCodeView input integration**: InputToolbar renders 6 buttons (mention, command, instruction, attach file, attach image, current note); textarea handles paste/drop for images; `handleSend` passes images and current note content to runtime; images cleared after send
- **CSS styles**: Input toolbar, toolbar button active state, image preview grid with remove buttons, approval modal layout (description, pre/code input, button group), message action buttons with hover reveal

## [0.5.0] - 2026-05-20

### Added

- **Conversation forking**: `forkConversation` creates a new conversation from a specified message, copying messages with new IDs to avoid conflicts
- **Conversation rewinding**: `rewindToMessage` discards all messages after a specified point, returns removed messages
- **Conversation compaction**: `compactConversation` replaces old messages with a system summary, keeping the N most recent messages
- **Conversation resumption**: `resumeConversation` loads full message history from storage for a previously loaded conversation
- **Conversation type extensions**: `Conversation` interface adds `forkedFrom`, `forkedAtMessageId`, `isCompacted` fields
- **TabState extensions**: `TabState` interface adds `isForked`, `forkSourceId`, `scrollPosition` fields
- **Settings extension**: `KiloCodeSettings` adds `compactKeepRecent` field (default: 5)
- **Message action buttons**: MessageRenderer renders rewind (⏪), fork (🍴), copy (📋) buttons per message with `data-action` event delegation
- **Message action handlers**: KiloCodeView implements `handleRewind`, `handleFork`, `handleCopy` with confirmation dialogs and Notices
- **Unit tests**: 13 new tests covering ConversationService fork/rewind/compact/resume methods
- **Unit tests**: 3 new tests covering MessageRenderer action button rendering
- **Integration tests**: 4 end-to-end tests covering full conversation management workflows (fork→rewind, compact→continue, resume, fork→compact isolation)
- **Unit tests**: 34 supplementary tests covering ConversationService CRUD (create/get/add/delete/list/rename), fork/rewind/compact edge cases, ID validation
- **Unit tests**: 3 new StreamController tests covering approval_required chunk passthrough and generator error handling

## [0.4.0] - 2026-05-20

### Added

- **Plan Mode**: PlanModeController with code/plan/ask modes, mode toggle button, Shift+Tab hotkey, message prefix injection
- **MCP Server support**: MCPManager for server connection management, MCPToolAdapter for tool format conversion
- **i18n**: Internationalization system with English and Chinese translations, dot-notation keys, parameter substitution
- **Virtual scrolling**: VirtualScroller for performance optimization with large message lists (>50 messages)
- **Unit tests**: 18 tests covering PlanModeController, MCPManager, i18n modules
- **KiloCodeChatRuntime**: Rewrote to implement AsyncGenerator-based ChatRuntime interface; internal queue mechanism (pendingChunks + resolveNext) bridges stdout data events to generator consumption; `done` and `error` chunks treated as terminal; partial line buffering preserved
- **Jest configuration**: Added tsconfig.test.json with ES2018 target for async generator support in tests
- **Unit tests**: 7 new tests covering KiloCodeChatRuntime AsyncGenerator behavior (text/tool_use/error chunks, partial lines, cancel, sendApproval)
- **StreamChunk types**: StreamChunkType and StreamChunk interface for async streaming (Phase A preparation)
- **Unit tests**: 55 new tests covering TabManager, StreamController, InputController, ProviderRegistry, CommandRegistry
- **StreamController**: Refactored to AsyncGenerator pattern — `consumeStream(generator, callbacks)` returns `Promise<Message>`; `cancel()` uses AbortController to break the for-await loop
- **Unit tests**: 6 new tests covering StreamController AsyncGenerator consumption (text/tool_use+tool_result/error/cancel/empty-stream/mixed-messages)
- **KiloCodeView integration**: Connected `handleSend` to real CLI streaming pipeline — `getOrCreateRuntime()` lazily creates ChatRuntime via ProviderRegistry, `sendMessage` returns AsyncGenerator consumed by StreamController with incremental UI updates (`appendToLastMessage`, `renderToolCall`, `updateToolCallResult`)

### Changed

- **InputController**: Simplified to a runtime container with `setRuntime`/`getRuntime`/`cancel`; removed redundant `isStreaming`, `sendMessage`, `setCallbacks`, `InputCallbacks` — all handled by StreamController
- **ChatRuntime interface**: Refactored from callback-based (`onMessage/onError/onComplete`) to AsyncGenerator pattern (`sendMessage` returns `AsyncGenerator<StreamChunk>`); added optional `sendApproval` method
- **Integration tests**: Updated chat-workflow tests to use new StreamController AsyncGenerator API
- **Integration tests**: 5 tests covering chat workflow (TabManager, StreamController, InputController, PlanModeController)
- **Jest configuration**: jest.config.js with ts-jest, Obsidian API mock

## [0.3.0] - 2026-05-20

### Added

- **Inline Edit**: InlineEditModal for editing selected text with instructions, DiffViewer for previewing changes
- **Slash Commands**: CommandRegistry with /compact, /clear, /model, /mode commands; CommandPalette with keyboard navigation
- **@mention system**: MentionService for searching vault files/folders, MentionDropdown with grouped results
- **Settings panel**: KiloCodeSettingTab with General, Chat, Model, Appearance sections
- **Error handling**: ErrorNotice with severity levels (info/warning/error/fatal), CLIErrorHandler for common CLI errors
- **KiloCodeSettings扩展**: 新增 autoStart, defaultModel, temperature, autoSave, theme, fontSize 字段

### Fixed

- **DiffViewer**: CustomEvents now bubble to parent elements
- **InlineEditModal**: removed unused import

## [0.2.0] - 2026-05-20

### Added

- **Tab management**: Tab and TabManager classes for managing multiple chat tabs with persistence
- **StreamController**: streaming response handler with text/tool/error callbacks
- **InputController**: user input handler bridging UI with ChatRuntime
- **ConversationService**: session management with Obsidian vault persistence (.kilocode/sessions/)
- **MessageRenderer**: renders messages as HTML with Markdown support, tool call display, and streaming text append
- **KiloCodeView**: main chat interface integrating all Phase 2 components
- **Base styles**: `styles.css` with KiloCode branding theme, CSS custom properties for light/dark mode

### Fixed

- **Tab/TabManager**: ID duplication, deep copy, input validation, silent close failure
- **StreamController**: non-null assertion risk, input validation, ID collision
- **InputController**: isStreaming never reset, duplicate state desync, premature callback, encapsulation leak
- **ConversationService**: path injection risk, concurrency race condition, silent error swallowing
- **MessageRenderer**: `any` type for app, system role handling
- **KiloCodeView**: event listener memory leaks, missing error handling, resource cleanup

## [0.1.0] - 2026-05-20

### Added

- **Project initialization**: package.json, tsconfig.json, esbuild.config.mjs, manifest.json, .gitignore
- **Core type definitions**: ProviderId, Conversation, Message, ToolCallInfo, StreamMessage, KiloCodeSettings
- **Provider registry**: ProviderRegistry static class for managing AI providers
- **KiloCode provider**: capabilities, settings, models, ChatRuntime (JSON-RPC over stdio), registration
- **Plugin entry point**: KiloCodePlugin class with settings management, view registration, ribbon icon, commands
- **StreamController**: streaming response handler with text/tool/error callbacks
- **MessageRenderer**: renders messages as HTML with Markdown support, tool call display, and streaming text append
- **Build verification**: TypeScript type checking and esbuild production build both pass
- **Base styles**: `styles.css` with KiloCode branding theme, CSS custom properties for light/dark mode, styles for chat UI components (messages, tools, tabs, input, buttons)

### Fixed

- **ConversationService**: path injection risk — added id format validation (`conv-{timestamp}-{random}`)
- **ConversationService**: concurrency race condition in addMessage — added Promise queue for sequential execution
- **ConversationService**: silent error swallowing in loadAllMetadata/loadMessages — added console.warn logging
- **InputController**: isStreaming never reset on successful send — now auto-resets via runtime onComplete/onError callbacks
- **InputController**: duplicate isStreaming state desync — removed standalone flag, wired to runtime callbacks
- **InputController**: onSend callback fired before message actually sent — moved after successful send
- **InputController**: setStreaming exposed internal state — removed public method
- **InputController**: setCallbacks replaced instead of merged — now uses spread merge pattern
- Moved @codemirror packages from dependencies to devDependencies (externalized by esbuild)
- Removed importHelpers from tsconfig (not needed with esbuild)
- Added esModuleInterop and forceConsistentCasingInFileNames to tsconfig
- Buffered partial stdout lines in KiloCodeChatRuntime to prevent JSON parse failures
- Removed shell:true from spawn options to prevent command injection
- Placeholder KiloCodeView/KiloCodeSettingTab now extend proper Obsidian base classes
