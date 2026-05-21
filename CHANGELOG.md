# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Changed

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
