<p align="center">
  <a href="README.md">English</a> | <a href="README_CN.md">中文</a>
</p>

<p align="center">
  <img src="assets/kilocode-logo.png" alt="KiloCode" width="100" height="100" style="margin-right: 20px;">
  <img src="assets/obsidian-logo.svg" alt="Obsidian" width="100" height="100">
</p>

<h1 align="center">KiloCode for Obsidian</h1>

<p align="center">
  <strong>Embed KiloCode AI coding agent directly into your Obsidian vault</strong>
</p>

<p align="center">
  <a href="https://github.com/realhenrylan/obsidian-with-kilocode/releases"><img src="https://img.shields.io/github/v/release/realhenrylan/obsidian-with-kilocode?style=flat-square&color=FFB800" alt="Release"></a>
  <a href="https://github.com/realhenrylan/obsidian-with-kilocode/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License"></a>
  <a href="https://github.com/realhenrylan/obsidian-with-kilocode/stargazers"><img src="https://img.shields.io/github/stars/realhenrylan/obsidian-with-kilocode?style=flat-square&color=FFB800" alt="Stars"></a>
  <a href="https://github.com/realhenrylan/obsidian-with-kilocode/issues"><img src="https://img.shields.io/github/issues/realhenrylan/obsidian-with-kilocode?style=flat-square" alt="Issues"></a>
  <a href="https://obsidian.md/plugins?id=kilocode"><img src="https://img.shields.io/badge/Obsidian-Community%20Plugin-purple?style=flat-square&logo=obsidian" alt="Obsidian Plugin"></a>
</p>

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🤖 **AI Chat Sidebar** | Chat with KiloCode AI directly in Obsidian's sidebar |
| 📝 **Inline Edit** | Select text + hotkey to edit notes with AI assistance |
| 🔧 **Slash Commands** | Type `/` for reusable prompt templates |
| 📎 **@mention** | Type `@` to mention vault files, MCP servers, or subagents |
| 📋 **Plan Mode** | Three modes: code, plan (read-only), ask (Q&A only) |
| 💬 **Multi-Tab Chat** | Multiple chat tabs with conversation history |
| 🔄 **Streaming Responses** | Real-time AI responses with interruption support |
| 🧵 **Conversation Fork/Rewind** | Fork conversations at any message, rewind to previous states |
| 📦 **Conversation Compaction** | Compress old messages into summaries to save context |
| 🔌 **MCP Support** | Connect external tools via Model Context Protocol |
| 🖼️ **Image Attachments** | Paste, drag-drop, or pick images as chat context (5MB limit) |
| 📄 **Current Note Context** | Toggle active note as AI context input |
| 🛡️ **Permission System** | Yolo/Normal/Plan security modes with per-tool approval dialogs |
| 🌍 **i18n** | Multi-language support (English, Chinese, Japanese, Korean, and more) |

---

## 🚀 Quick Start

### Prerequisites

- **Obsidian** v1.7.2+ (Desktop only)
- **KiloCode CLI** installed globally

```bash
npm install -g @kilocode/cli
```

### Installation

#### From Obsidian Community Plugins (Recommended)

1. Open Obsidian → Settings → Community plugins → Browse
2. Search for "KiloCode" and click Install
3. Enable the plugin

#### From GitHub Release

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/realhenrylan/obsidian-with-kilocode/releases/latest)
2. Create a folder `kilocode` in your vault's plugins folder:
   ```
   /path/to/vault/.obsidian/plugins/kilocode/
   ```
3. Copy the downloaded files into the `kilocode` folder
4. Enable the plugin in Obsidian: Settings → Community plugins → Enable "KiloCode"

#### From Source (Development)

```bash
cd /path/to/vault/.obsidian/plugins
git clone https://github.com/realhenrylan/obsidian-with-kilocode.git
cd obsidian-kilocode
npm install
npm run build
```

---

## 📖 Usage

### Basic Chat

1. Click the KiloCode icon in the ribbon or use command palette: `KiloCode: Open chat view`
2. Type your message in the input box
3. Press `Enter` to send, `Shift+Enter` for new line
4. AI responses stream in real-time — press `Cancel` to interrupt

### Input Toolbar

The toolbar above the input box provides quick access buttons:

| Button | Action |
|--------|--------|
| `@` | Trigger @mention |
| `/` | Trigger slash command |
| 📝 | Instruction preset |
| 📎 | Attach file |
| 🖼️ | Attach image |
| 📄 | Toggle current note as context |

### Inline Edit

1. Select text in a note
2. Press `Ctrl/Cmd + Shift + E`
3. Enter your editing instruction in the modal
4. Review the diff preview (added lines in green, removed in red)
5. Click **Accept** or **Reject**

### Slash Commands

Type `/` in the input to see available commands. A command palette with keyboard navigation (Arrow/Enter/Escape) will appear:

| Command | Description |
|---------|-------------|
| `/compact` | Compress conversation history — replaces old messages with a summary |
| `/clear` | Clear current conversation |
| `/model` | Switch AI model |
| `/mode` | Switch mode (plan/code/ask) |

### @mention

Type `@` to trigger the mention dropdown, which searches across:

| Type | Icon | Description |
|------|------|-------------|
| **Vault files** | 📄 | Include file content as AI context |
| **Folders** | 📁 | Reference vault folders |
| **MCP servers** | 🔌 | Connect external tools |
| **Subagents** | 🤖 | Call other AI agents |

Results are grouped by type with up to 20 matches returned.

### Plan Mode

Click the mode toggle button in the chat header or press `Shift+Tab` to cycle through modes:

| Mode | Behavior |
|------|----------|
| **Code** | Full read/write access — AI can create and edit files |
| **Plan** | Read-only — AI explores and designs without making changes |
| **Ask** | Q&A only — AI answers questions without file access |

The mode prefix is injected into each message, and the active mode is visually indicated in the UI.

### Conversation Management

Messages display action buttons on hover:

- **⏪ Rewind** — Discard all messages after the selected message (with confirmation)
- **🍴 Fork** — Create a new conversation starting from the selected message
- **📋 Copy** — Copy message content to clipboard

#### Compaction

When conversations grow long, use `/compact` to replace old messages with a system summary, keeping the N most recent messages intact (configurable in settings, default: 5).

### Image Attachments

You can attach images to your messages in three ways:

1. **File picker** — Click the image button in the toolbar
2. **Clipboard paste** — Copy an image and paste (`Ctrl/Cmd+V`) into the input area
3. **Drag & drop** — Drag an image file into the input area

Images are previewed in a grid above the input box with individual remove buttons. Size limit: 5MB per image.

### Current Note Context

Toggle the current note context button in the toolbar to include your active note's content as context for the AI. The toggle state is visually indicated and persists within the session.

### Permission System

Tool calls by the AI are governed by the selected permission mode:

| Mode | Behavior |
|------|----------|
| **Normal** (default) | Read tools auto-approved, write tools require your approval |
| **Yolo** | All tools automatically approved — no prompts |
| **Plan** | Read tools allowed, write tools denied — read-only guarantee |

When a tool requires approval, an `ApprovalModal` dialog appears showing:

- Tool name and description
- Complete input parameters (formatted JSON)
- Buttons: **Allow**, **Always Allow** (skip future prompts for this tool), **Deny**, **Cancel**

---

## ⚙️ Configuration

### Settings

Open Settings → KiloCode to configure:

#### General

| Setting | Description | Default |
|---------|-------------|---------|
| **CLI Path** | Path to KiloCode CLI | Auto-detect |
| **Auto Start** | Start CLI on vault open | Off |
| **API Key** | Your API key | - |

#### Chat

| Setting | Description | Default |
|---------|-------------|---------|
| **Max Tabs** | Maximum number of chat tabs | 3 |
| **Auto Save** | Automatically save conversation history | On |
| **Compact Keep Recent** | Messages to keep during compaction | 5 |

#### Model

| Setting | Description | Default |
|---------|-------------|---------|
| **Default Model** | Default AI model | claude-sonnet-4-20250514 |
| **Temperature** | Model temperature (0-1) | 0.7 |

#### Appearance

| Setting | Description | Default |
|---------|-------------|---------|
| **Theme** | Color theme (auto/light/dark) | Auto |
| **Font Size** | Chat message font size | 14px |

#### Security

| Setting | Description | Default |
|---------|-------------|---------|
| **Permission Mode** | Normal / Yolo / Plan | Normal |

### Environment Variables

Configure environment variables in Settings → Environment:

- **Shared** — Applied to all providers
- **KiloCode** — Applied to KiloCode provider only

### MCP Servers

Configure MCP servers in `vault/.kilocode/mcp.json`:

```json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
    },
    "web-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-brave-search"]
    }
  }
}
```

---

## 🏗️ Architecture

### Directory Structure

```
src/
├── main.ts                      # Plugin entry point — registers views, commands, settings, providers
├── app/
│   └── settings/
│       └── defaultSettings.ts    # DEFAULT_SETTINGS constant with all default values
├── core/
│   ├── types/
│   │   └── index.ts              # Core types: Conversation, Message, ToolCallInfo, KiloCodeSettings...
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

### Data Flow

```
User Input → KiloCodeView
  → PlanModeController (inject mode prefix)
  → ConversationService (persist user message)
  → KiloCodeChatRuntime (JSON-RPC over stdio → CLI)
  → AsyncGenerator<StreamChunk>
  → StreamController (consume chunks, assemble Message)
  → MessageRenderer (incremental UI updates)
  → ApprovalManager (intercept dangerous ops)
     → ApprovalModal (user decision)
  → ConversationService (persist assistant response)
```

### Key Components

| Component | Description |
|-----------|-------------|
| **ProviderRegistry** | Static registry managing AI provider registration. Providers self-register at plugin load. |
| **ChatRuntime** (interface) | AsyncGenerator-based protocol (`sendMessage` returns `AsyncGenerator<StreamChunk>`). Supports `start/stop/cancel/resetSession/sendApproval`. |
| **KiloCodeChatRuntime** | Concrete implementation — spawns CLI child process, communicates via JSON-RPC over stdio. Uses internal pendingChunks + resolveNext queue to bridge stdout events to generator consumption. |
| **StreamController** | Consumes `AsyncGenerator<StreamChunk>`, handles text/tool_use/tool_result/error/done/approval_required chunk types. Supports AbortController-based cancellation. |
| **ConversationService** | Full CRUD for conversations with Promise-queue concurrency protection. Stores sessions as JSON files in `.kilocode/sessions/`. Supports fork, rewind, compact, resume operations. |
| **TabManager** | Manages multiple chat tabs (create/close/switch), persists tab state across sessions. |
| **PlanModeController** | Cycles between code/plan/ask modes, injects mode-specific system prompt prefixes. |
| **ApprovalManager** | Manages tool approval queue — yolo (auto-approve), normal (approve writes), plan (deny writes). Always-allow list for persistent tool approvals. |
| **MessageRenderer** | Renders messages as HTML, handles streaming text append, tool call cards (collapsible), virtual scrolling (>50 messages), action buttons (rewind/fork/copy). |
| **MCPManager** | Manages MCP server lifecycle — add, remove, list servers and tools. |
| **MentionService** | Searches vault files, folders, MCP servers, and subagents for @mention autocomplete. |

### Design Decisions

- **AsyncGenerator pattern** (vs. callbacks): `sendMessage` returns `AsyncGenerator<StreamChunk>` for natural streaming consumption via `for-await-of`
- **AbortController**: Used for stream cancellation — breaks the `for-await` loop cleanly
- **Promise queue**: `ConversationService` uses sequential Promise execution to prevent concurrent modification race conditions
- **Virtual scrolling**: Auto-enabled when message list exceeds 50 items, only renders viewport-visible messages
- **CustomEvent bubbling**: Components communicate via DOM CustomEvents for loose coupling
- **Partial line buffering**: `KiloCodeChatRuntime` buffers incomplete stdout lines to prevent JSON parse failures

---

## 🛡️ Security Model

The plugin implements a multi-layer security architecture for AI tool execution:

### Permission Modes

Three modes control how AI tool calls are handled:

| Mode | Read Tools | Write Tools | Use Case |
|------|-----------|-------------|----------|
| **Yolo** | Auto-approve | Auto-approve | Trusted environments, rapid prototyping |
| **Normal** | Auto-approve | Require approval | Daily development (default) |
| **Plan** | Auto-approve | Denied | Code review, architecture discussions |

### Write Tools (require approval in normal mode)

| Tool | Description |
|------|-------------|
| `write_file` | Create or overwrite files |
| `edit_file` | Modify existing files |
| `delete_file` | Remove files |
| `bash` | Execute shell commands |
| `execute_command` | Run arbitrary commands |

### Approval Modal

When a write tool requires approval, the `ApprovalModal` dialog shows:

- Tool name and description
- Complete input parameters rendered as formatted JSON in a `<pre><code>` block
- Decision buttons: **Allow** (one-time), **Always Allow** (persistent for this tool), **Deny**, **Cancel**

---

## 🎨 Design System

### Brand Colors

| Color | Hex | Usage |
|-------|-----|-------|
| **KiloCode Yellow** | `#FFB800` | Primary accent |
| **Light Yellow** | `#FFD54F` | Hover states |
| **Dark Yellow** | `#E5A600` | Active states |

### Theme Support

- Automatic light/dark theme detection
- Follows Obsidian's theme settings via CSS custom properties
- CSS variables for easy customization

---

## 🛠️ Development

### Setup

```bash
# Clone the repository
git clone https://github.com/realhenrylan/obsidian-with-kilocode.git
cd obsidian-kilocode

# Install dependencies
npm install

# Start development mode (watch mode with esbuild)
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Run linter
npm run lint
```

### Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Development mode with esbuild watch |
| `npm run build` | Production build |
| `npm test` | Run all Jest tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint errors automatically |
| `npm run typecheck` | TypeScript type check (`tsc --noEmit`) |

### Testing

The test suite covers:

- **Unit tests**: ProviderRegistry, StreamController, InputController, TabManager, ConversationService, MessageRenderer, CommandRegistry, PlanModeController, MCPManager, KiloCodeChatRuntime, i18n, ApprovalManager, ImageContext, CurrentNoteContext, InputToolbar
- **Integration tests**: Chat workflow (TabManager + StreamController + InputController + PlanModeController), conversation management (fork/rewind/compact/resume), streaming pipeline

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage
```

### i18n

Adding a new language:

1. Create `src/i18n/locales/{lang}.json` following the structure of `en.json`
2. The i18n system auto-detects the locale and falls back to `en` for missing keys
3. Translation keys use dot notation (e.g., `settings.cliPathDesc`) with `{{param}}` substitution

### CI/CD

- **CI** (`.github/workflows/ci.yml`): Runs on push/PR to main — typecheck → lint → build → test
- **Release** (`.github/workflows/release.yml`): On tag `v*` — build → create GitHub Release with `main.js`, `manifest.json`, `styles.css`

---

## 📋 Roadmap

- [x] Basic chat functionality
- [x] Streaming responses with interruption
- [x] Multi-tab support with state persistence
- [x] Conversation management (CRUD, fork, rewind, compact, resume)
- [x] Inline edit with diff preview
- [x] Slash commands with command palette
- [x] @mention (files, folders, MCP servers, subagents)
- [x] Plan mode (code/plan/ask)
- [x] MCP server support
- [x] Permission system (yolo/normal/plan) with approval dialogs
- [x] Image attachments (paste, drag-drop, file picker)
- [x] Current note context toggle
- [x] Input toolbar
- [x] i18n (English, Chinese)
- [x] Virtual scrolling for large conversations
- [x] Error handling with severity levels
- [ ] Performance optimization for large vaults
- [ ] Additional language support
- [ ] Custom theme support
- [ ] Plugin API for third-party extensions

---

## 🐛 Troubleshooting

### KiloCode CLI not found

```
Error: KiloCode CLI not found
```

1. Install KiloCode CLI: `npm install -g @kilocode/cli`
2. Verify installation: `kilo --version`
3. If still not found, set CLI path in Settings → General → CLI Path

### CLI Path Issues

If using a version manager (nvm, fnm, volta):

1. Leave CLI path empty for auto-detection
2. If auto-detection fails, find your CLI path:
   ```bash
   which kilo  # macOS/Linux
   where.exe kilo  # Windows
   ```
3. Set the path in Settings → General → CLI Path

### JSON-RPC Communication Errors

If the CLI starts but responses fail:

1. Check that `@kilocode/cli` is up to date: `npm update -g @kilocode/cli`
2. Verify your API key is configured correctly
3. Check the CLI process logs for errors

### Network Errors

1. Check your internet connection
2. Verify API key is correct
3. Check firewall settings (the CLI needs outbound HTTPS access)
4. Try increasing timeout in Settings → Advanced

### Conversation Persistence Issues

Conversations are stored in `.kilocode/sessions/` in your vault. If you experience data loss:

1. Check the folder exists and is writable
2. Verify `Auto Save` is enabled in Settings → Chat
3. Check for disk space or permissions issues

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [Obsidian](https://obsidian.md) for the amazing platform
- [KiloCode](https://kilo.ai) for the AI coding agent
- [Claudian](https://github.com/YishenTu/claudian) for architectural inspiration
- All contributors and testers

---

## 📞 Support

- [GitHub Issues](https://github.com/realhenrylan/obsidian-with-kilocode/issues) — Bug reports and feature requests
- [Discussions](https://github.com/realhenrylan/obsidian-with-kilocode/discussions) — Questions and community chat
- [Discord](https://discord.gg/kilocode) — Real-time support

---

<p align="center">
  Made with ❤️ for the Obsidian and KiloCode communities
</p>
