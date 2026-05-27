<p align="center">
  <a href="README.md">English</a> | <a href="README_CN.md">中文</a>
</p>

<p align="center">
  <img src="assets/kilocode-logo.png" alt="KiloCode" width="100" height="100" style="margin-right: 20px;">
  <img src="assets/obsidian-logo.svg" alt="Obsidian" width="100" height="100">
</p>

<h1 align="center">KiloCode for Obsidian</h1>

<p align="center">
  <strong>An Obsidian plugin that turns your vault into persistent memory for KiloCode.</strong>
</p>

<p align="center">
  Stop losing context every time the conversation resets.<br />
  Your KiloCode agent remembers architecture decisions, project context,<br />
  reusable workflows, coding standards, and previous sessions — from your vault.
</p>

<p align="center">
  <a href="https://github.com/realhenrylan/obsidian-with-kilocode/releases"><img src="https://img.shields.io/github/v/release/realhenrylan/obsidian-with-kilocode?style=flat-square&color=FFB800" alt="Release"></a>
  <a href="https://github.com/realhenrylan/obsidian-with-kilocode/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License"></a>
  <a href="https://github.com/realhenrylan/obsidian-with-kilocode/stargazers"><img src="https://img.shields.io/github/stars/realhenrylan/obsidian-with-kilocode?style=flat-square&color=FFB800" alt="Stars"></a>
  <a href="https://github.com/realhenrylan/obsidian-with-kilocode/issues"><img src="https://img.shields.io/github/issues/realhenrylan/obsidian-with-kilocode?style=flat-square" alt="Issues"></a>
  <a href="https://obsidian.md/plugins?id=kilocode"><img src="https://img.shields.io/badge/Obsidian-Community%20Plugin-purple?style=flat-square&logo=obsidian" alt="Obsidian Plugin"></a>
</p>

---

## The Problem

KiloCode is powerful. But like every AI coding agent, it has a fundamental flaw:

**It forgets everything between sessions.**

Every conversation reset means:
- Lost architecture context — you re-explain the same decisions
- Forgotten coding standards — the agent repeats the same mistakes
- Inconsistent workflows — no two sessions produce the same result
- Repeated prompting — you type the same instructions again and again

This plugin is the fix: **your Obsidian vault becomes KiloCode's long-term memory.**

---

## What This Plugin Does

KiloCode for Obsidian is a bidirectional bridge between your knowledge base (Obsidian vault) and the KiloCode CLI. The vault doesn't just store notes — it stores memory for your coding agent.

```
┌──────────────────────────────────────────────────────────────┐
│                     Obsidian Vault                            │
│               (Persistent Memory Layer)                       │
│                                                               │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────┐   │
│  │ Notes    │  │ .kilo/skills/ │  │ .kilocode/sessions/   │   │
│  │ (.md)    │  │ (AI skills   │  │ (conversation history) │   │
│  │          │  │  live in the │  │                        │   │
│  │          │  │  vault!)     │  │                        │   │
│  └──────────┘  └──────────────┘  └───────────────────────┘   │
│         ▲              ▲                      ▲               │
│         │              │                      │               │
│         └──────────────┼──────────────────────┘               │
│                        │                                      │
│            ┌───────────┴───────────┐                          │
│            │   KiloCode Plugin     │                          │
│            │   (this plugin)       │                          │
│            │                       │                          │
│            │  @mention vault files │                          │
│            │  Inject skills        │                          │
│            │  Attach notes as ctx  │                          │
│            │  Route conversation   │                          │
│            └───────────┬───────────┘                          │
│                        │ HTTP (127.0.0.1)                     │
└────────────────────────┼──────────────────────────────────────┘
                         │
            ┌────────────▼────────────┐
            │    KiloCode CLI         │
            │    (kilo serve)         │
            │                         │
            │  AI model               │
            │  Tool execution         │
            │  Code generation        │
            └─────────────────────────┘
```

### What makes it a memory system, not just a chat panel?

- **Persistent project memory**: Architecture decisions, coding standards, and project knowledge live in your vault as markdown. KiloCode reads them as context — every session, every message. No context is ever lost.
- **Skills stored in your vault**: AI skill definitions live at `.kilo/skills/` as `.md` files. Edit a skill, and KiloCode's behavior changes instantly. No config toggling, no CLI restarts.
- **Session history in your vault**: Every conversation persists to `.kilocode/sessions/` — version-controlled, backed up with your notes, searchable across sessions.
- **Reference anything with @**: Type `@` to search and reference vault files, folders, MCP servers, or subagents. Content flows from your memory into the conversation seamlessly.
- **One-click note context**: Toggle "Include current note" and the active note's full content is sent to the AI as context — no copy-paste.
- **File attachments**: Drag, paste, or click to attach files. Text files are read inline and sent to the AI.
- **MCP servers configured in the vault**: `.kilocode/mcp.json` defines tools the AI can use. Edit this file to give KiloCode new capabilities.
- **Zero-install CLI**: The KiloCode CLI auto-downloads on first use. The plugin manages its entire lifecycle — start, keep-alive, idle timeout, and graceful shutdown.
- **Your existing CLI config, respected**: If you already use KiloCode CLI, the plugin reads `~/.config/kilo/kilo.jsonc` directly — API keys, model selections, agent settings. Configure once in your terminal, use everywhere in Obsidian.

---

## What Changes

### Before

KiloCode forgets everything when the conversation ends:
- Architecture decisions are lost
- Workflows reset every session
- Coding standards must be re-explained
- Reusable patterns never accumulate

### After

Your Obsidian vault becomes KiloCode's persistent memory:
- Architecture is always loaded as context
- Skills are always available (markdown files in vault)
- Previous sessions are searchable and reusable
- Project knowledge accumulates over time

---

## Documentation

| Document | Audience | Contents |
|----------|----------|----------|
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | Contributors | Directory structure, data flow, key components, design decisions, security model |
| **[DEVELOPMENT.md](DEVELOPMENT.md)** | Developers | Setup, build/test/lint scripts, i18n guide, CI/CD pipeline |
| **[ROADMAP.md](ROADMAP.md)** | Everyone | Current progress and planned features |
| **[CHANGELOG.md](CHANGELOG.md)** | Everyone | Version history and release notes |

---

## Features

| Feature | How it builds memory |
|---------|---------------------|
| **AI Chat Sidebar** | Chat with KiloCode AI in Obsidian's sidebar. Each message carries your vault path, active note, and installed skills as context — the AI knows your vault. |
| **@mention Vault Files** | Type `@` to search and reference any vault file or folder. The content flows from your notes into the conversation — no copy-paste. |
| **Custom Instructions** | Click `#` to open an instruction editor — write custom system prompts that get injected into the current conversation. Auto-saved, applied per session. |
| **File Attachments** | Attach any file from your system via the toolbar button. Text files are read inline and sent to the AI conversation. |
| **Current Note Context** | One-click toggle to include the active note as AI context. The plugin reads the note via Obsidian's Vault API and passes it to the CLI. |
| **Vault-Backed Skill System** | AI skills are `.md` files in `.kilo/skills/` inside your vault. The plugin loads them automatically and injects them as system context for every message. Edit a skill → AI behavior changes. No CLI restart needed. |
| **Slash Commands** | `/skill` to activate skills from the catalog, `/model` to switch AI models on the fly, `/mode` to toggle code/plan/ask, `/compact` to summarize conversation history, `/clear` to start fresh. |
| **MCP Tool Framework** | Tools are defined in `.kilocode/mcp.json` inside your vault. The plugin lists available MCP servers in the @mention dropdown so you can reference them in chat. |
| **Plan Mode** | Three modes: code (full read/write), plan (read-only analysis), ask (Q&A only). The mode prefix is injected into every message sent to the CLI. |
| **Multi-Tab Chat** | Multiple independent chat sessions. Each tab has its own conversation history stored in `.kilocode/sessions/` — backed up with your vault. |
| **Streaming Responses** | Real-time AI responses with cancel support. The plugin consumes the CLI's async generator and updates the UI incrementally. |
| **Conversation Fork/Rewind** | Fork a new conversation from any message, rewind to previous states. All managed through the ConversationController layer. |
| **Permission System** | Yolo (auto-approve) / Normal (per-tool approval dialogs) / Plan (read-only). The ApprovalManager intercepts tool calls before they reach the CLI. |
| **i18n** | English and Chinese UI, auto-switches by browser language. |
| **CLI Auto-Download** | No manual CLI install. The BinaryManager auto-detects, downloads, and caches the platform-appropriate KiloCode binary from npm on first use. Background warmup pre-starts the CLI process so your first message is fast. |
| **CLI Config Aware** | Already using KiloCode CLI in your terminal? The plugin reads `~/.config/kilo/kilo.jsonc` directly — your API keys, model selections, and agent settings carry over automatically. The `/model` command lists models from your CLI config. Configure once, use everywhere. |
| **Idle Timeout** | After 10 minutes of inactivity, the CLI process auto-stops to save resources. Next message restarts it transparently. HTTP keep-alive is used to reduce connection overhead. |

---

## Quick Start

**Prerequisites**: Obsidian v1.7.2+ (Desktop only)

> **Zero config.** No CLI installation required — the plugin auto-downloads the KiloCode binary on first use. If you already have `kilo` installed globally or have config at `~/.config/kilo/kilo.jsonc`, the plugin detects and uses them automatically. Your API keys, model preferences, and agent settings carry over with zero extra setup.

### Installation

**From Obsidian Community Plugins (Recommended)**

1. Open Obsidian → Settings → Community plugins → Browse
2. Search for "KiloCode" and click Install
3. Enable the plugin

**From GitHub Release**

Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/realhenrylan/obsidian-with-kilocode/releases/latest) and place in `<vault>/.obsidian/plugins/kilocode/`.

**From Source**

```bash
cd /path/to/vault/.obsidian/plugins
git clone https://github.com/realhenrylan/obsidian-with-kilocode.git
cd obsidian-kilocode
npm install
npm run build
```

---

## Usage

### Basic Chat

Click the KiloCode icon in the ribbon (or `Command Palette → KiloCode: Open chat view`), type your message, and press `Enter`. Responses stream in real-time — press `Cancel` to interrupt. `Shift+Enter` for new line.

### Quick Reference

| Action | How |
|--------|-----|
| **@mention Vault Files** | Type `@` or click toolbar `@` → search and reference files, folders, MCP servers |
| **Slash Commands** | Type `/` or click toolbar `/` for `/skill`, `/model`, `/mode`, `/compact`, `/clear` |
| **Custom Instructions** | Click toolbar `#` to write and apply custom system prompts for the current session |
| **File Attachment** | Click toolbar `📎` to attach any file from your system |
| **Current Note Context** | Toggle toolbar `📝` to include active note as AI context |
| **Switch Mode** | Click mode toggle or `Shift+Tab` to cycle Code/Plan/Ask |
| **Fork/Rewind** | Hover a message for ⏪ Rewind, 🍴 Fork, or 📋 Copy |
| **Inline Edit** | Select text → `Ctrl/Cmd+Shift+E` → enter instruction (AI call pending) |

### Permission Modes

| Mode | Behavior |
|------|----------|
| **Normal** (default) | Read tools auto-approved, write tools require your approval |
| **Yolo** | All tools automatically approved — no prompts |
| **Plan** | Read tools allowed, write tools denied — read-only guarantee |

---

## Configuration

Open Settings → KiloCode:

| Section | Key Settings |
|---------|-------------|
| General | CLI Path (auto-detect), Download Mirror URL, Auto Start |
| API | API Key, Base URL (leave empty to use CLI's stored credentials) |
| Chat | Max Tabs (default: 3), Auto Save, Compact Keep Recent (default: 5) |
| Model | Default Model (default: `claude-sonnet-4-20250514`), Temperature (default: 0.7) |
| Appearance | Theme (auto/light/dark), Font Size (default: 14px) |
| Security | Permission Mode (Normal / Yolo / Plan) |

**Environment variables**: Configured in Settings → Environment (Shared and KiloCode-specific). When API Key / Base URL are set, they pass `KILO_API_KEY` and `KILO_BASE_URL` to the `kilo serve` process.

**MCP servers**: Configure in `vault/.kilocode/mcp.json`:

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

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for directory structure, data flow diagram, key component descriptions, design decisions, and security model details.

---

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for setup, build/test/lint commands, i18n guide, and CI/CD pipeline.

---

## Roadmap

See [ROADMAP.md](ROADMAP.md) for current progress and planned features.

---

## Troubleshooting

### KiloCode CLI not found

The plugin auto-downloads the CLI on first use. If it fails:
1. Check your internet connection
2. Set a mirror URL in Settings → General → Download Mirror URL
3. Install manually: `npm install -g @kilocode/cli`
4. Verify: `kilo --version`

### CLI Path Issues

Leave empty for auto-detection. If needed, find the path with `which kilo` (macOS/Linux) or `where.exe kilo` (Windows) and set in Settings → General → CLI Path.

### JSON-RPC Errors

Ensure `@kilocode/cli` is up to date (`npm update -g @kilocode/cli`) and verify your API key.

### Network Errors

Check internet connection, API key, and firewall settings (CLI needs outbound HTTPS).

### Conversation Persistence Issues

Conversations are stored in `.kilocode/sessions/`. Check the folder is writable and Auto Save is enabled.

---

## License

MIT — see [LICENSE](LICENSE).

---

## Support

- [GitHub Issues](https://github.com/realhenrylan/obsidian-with-kilocode/issues) — Bug reports and feature requests
- [Discussions](https://github.com/realhenrylan/obsidian-with-kilocode/discussions) — Questions and community chat
- [Discord](https://discord.gg/kilocode) — Real-time support

---

<p align="center">
  Made with ❤️ for the Obsidian and KiloCode communities
</p>
