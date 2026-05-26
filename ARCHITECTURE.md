# Architecture

## Directory Structure

```
src/
├── main.ts                      # Plugin entry point — registers views, commands, settings, providers
├── app/
│   └── settings/
│       └── defaultSettings.ts    # DEFAULT_SETTINGS constant with all default values
├── core/
│   ├── types/
│   │   └── index.ts              # Core types: Conversation, Message, ToolCallInfo, KiloCodeSettings...
│   ├── binary/
│   │   ├── BinaryManager.ts      # CLI binary discovery, download, caching, version management
│   │   ├── PlatformDetector.ts   # Platform/arch/AVX2/musl detection, npm package name construction
│   │   └── npmDownloader.ts      # npm tarball download + gzip decompression + tar extraction
│   ├── providers/
│   │   ├── types.ts              # Provider protocol: ChatRuntime, ProviderCapabilities, StreamChunk
│   │   └── ProviderRegistry.ts   # Static registry for AI provider registration/lookup
│   └── security/
│       ├── PermissionMode.ts     # Permission types, write/read tool sets
│       ├── ApprovalManager.ts    # Approval queue management with yolo/normal/plan modes
│       └── ApprovalModal.ts      # Obsidian Modal dialog for tool call approval
├── providers/
│   └── kilocode/
│       ├── capabilities.ts       # Provider capability declarations
│       ├── models.ts             # Model definitions (kilo-1, kilo-1-fast)
│       ├── registration.ts       # Provider registration factory
│       ├── settings.ts           # Provider-specific settings
│       └── runtime/
│           └── KiloCodeChatRuntime.ts  # JSON-RPC over stdio communication with CLI
├── features/
│   ├── chat/
│   │   ├── KiloCodeView.ts       # Main chat ItemView — integrates all chat components
│   │   ├── PlanModeController.ts # Code/plan/ask mode management
│   │   ├── controllers/
│   │   │   ├── StreamController.ts    # Consumes AsyncGenerator, assembles messages
│   │   │   └── InputController.ts     # Runtime container for send/cancel
│   │   ├── rendering/
│   │   │   └── MessageRenderer.ts     # Message→HTML rendering with virtual scrolling
│   │   ├── services/
│   │   │   └── ConversationService.ts # Session CRUD with vault persistence
│   │   ├── tabs/
│   │   │   ├── Tab.ts                 # Tab state management
│   │   │   └── TabManager.ts          # Multi-tab lifecycle
│   │   └── ui/
│   │       ├── CurrentNoteContext.ts   # Active note context provider
│   │       ├── ImageContext.ts         # Image attachment manager
│   │       └── InputToolbar.ts         # Configurable toolbar component
│   ├── commands/
│   │   ├── SlashCommand.ts            # CommandRegistry for /commands
│   │   └── CommandPalette.ts          # Keyboard-navigable command selector
│   ├── inline-edit/
│   │   ├── InlineEditModal.ts         # Modal for text selection + edit instruction
│   │   └── DiffViewer.ts              # Line-by-line diff preview
│   ├── mcp/
│   │   ├── MCPManager.ts              # MCP server configuration and connection
│   │   └── MCPToolAdapter.ts          # Tool format conversion across servers
│   ├── mention/
│   │   ├── MentionService.ts          # Search vault files/folders/MCP/subagents
│   │   └── MentionDropdown.ts         # Grouped result display
│   └── settings/
│       └── SettingsTab.ts             # Plugin settings panel (5 sections)
├── shared/
│   ├── ErrorNotice.ts                 # Error handling with severity levels
│   └── VirtualScroller.ts             # Virtual scrolling for large message lists
├── i18n/
│   ├── index.ts                       # Translation system (get/set locale, key lookup)
│   └── locales/
│       ├── en.json                    # English translations
│       └── zh.json                    # Chinese translations

styles.css                             # Global styles (brand theme, light/dark)
```

## Data Flow

```
User Input → KiloCodeView
  → PlanModeController (inject mode prefix)
  → ConversationService (persist user message)
  → KiloCodeChatRuntime (HTTP serve → CLI via Node.js http module)
  → AsyncGenerator<StreamChunk>
  → StreamController (consume chunks, assemble Message)
  → MessageRenderer (incremental UI updates)
  → ApprovalManager (intercept dangerous ops)
     → ApprovalModal (user decision)
  → ConversationService (persist assistant response)
```

## Key Components

| Component | Responsibility |
|-----------|---------------|
| **BinaryManager** | CLI binary lifecycle — discovers existing CLI (user path → system PATH → local cache), auto-downloads from npm when not found, handles version management and macOS quarantine |
| **PlatformDetector** | Detects platform/arch/AVX2/musl and constructs npm package candidate list |
| **npmDownloader** | Downloads npm tarballs, decompresses gzip, parses tar to extract platform binary |
| **ProviderRegistry** | Static registry for AI provider registration. Providers self-register at plugin load. |
| **ChatRuntime** (interface) | `AsyncGenerator<StreamChunk>`-based protocol. Supports `sendMessage/start/stop/cancel/resetSession/sendApproval`. |
| **KiloCodeChatRuntime** | Spawns `kilo serve` HTTP server, communicates via HTTP POST with SSE/ndjson streaming. Uses Node.js `http` module to bypass Electron renderer CORS restrictions. |
| **StreamController** | Consumes `AsyncGenerator<StreamChunk>`, handles text/tool_use/tool_result/error/done/approval_required chunk types. Supports AbortController-based cancellation. |
| **ConversationService** | Full CRUD for conversations with Promise-queue concurrency protection. Stores sessions in `.kilocode/sessions/`. Supports fork, rewind, compact, resume. |
| **TabManager** | Manages multi-tab chat (create/close/switch), persists tab state across sessions. |
| **PlanModeController** | Cycles code/plan/ask modes, injects mode-specific system prompt prefixes. |
| **ApprovalManager** | Tool approval queue — yolo (auto-approve), normal (approve writes), plan (deny writes). Always-allow list for persistent approvals. |
| **MessageRenderer** | Renders messages as HTML, streaming text append, tool call cards (collapsible), virtual scrolling (>50 messages), action buttons (rewind/fork/copy). |
| **MCPManager** | MCP server lifecycle — add, remove, list servers and tools. |
| **MentionService** | Searches vault files, folders, MCP servers, and subagents for @mention autocomplete. |

## Design Decisions

- **AsyncGenerator pattern** (vs. callbacks): `sendMessage` returns `AsyncGenerator<StreamChunk>` for natural streaming consumption via `for-await-of`
- **AbortController**: Used for stream cancellation — breaks the `for-await` loop cleanly
- **Promise queue**: `ConversationService` uses sequential Promise execution to prevent concurrent modification race conditions
- **Virtual scrolling**: Auto-enabled when message list exceeds 50 items, only renders viewport-visible messages
- **CustomEvent bubbling**: Components communicate via DOM CustomEvents for loose coupling
- **Node.js `http` module** (vs. `fetch`): `KiloCodeChatRuntime` uses Node.js `http` for HTTP requests instead of browser `fetch()`, because Electron's renderer process enforces CORS — the `app://obsidian.md` origin cannot access `http://127.0.0.1`. Node.js `http` runs entirely outside the browser security boundary, avoiding CORS entirely.
- **Binary auto-download**: `BinaryManager` uses npm registry as primary source (no extra CI needed), falls back to user-configured mirror URL; lazy path resolution in `start()` keeps `createRuntime` synchronous

## Security Model

The permission system controls AI tool execution with three modes:

| Mode | Read Tools | Write Tools | Use Case |
|------|-----------|-------------|----------|
| **Yolo** | Auto-approve | Auto-approve | Trusted environments, rapid prototyping |
| **Normal** | Auto-approve | Require approval | Daily development (default) |
| **Plan** | Auto-approve | Denied | Code review, architecture discussions |

Write tools (require approval in normal mode): `write_file`, `edit_file`, `delete_file`, `bash`, `execute_command`.

When a write tool requires approval, the `ApprovalModal` dialog shows tool name, full input parameters as formatted JSON, and decision buttons: Allow (one-time), Always Allow (persistent), Deny, Cancel.
