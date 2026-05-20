# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
