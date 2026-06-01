<p align="center">
  <a href="README.md">English</a> | <a href="README_CN.md">中文</a>
</p>

<p align="center">
  <img src="assets/kilocode-logo.png" alt="KiloCode" width="100" height="100" style="margin-right: 20px;">
  <img src="assets/obsidian-logo.svg" alt="Obsidian" width="100" height="100">
</p>

<h1 align="center">KiloCode for Obsidian</h1>

<p align="center">
  <strong>My Obsidian knowledge base, managed with KiloCode.</strong>
</p>

<p align="center">
  I have a knowledge base (Obsidian), I have an AI tool (KiloCode).<br />
  This plugin bridges them.
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

Managing an Obsidian knowledge base is hard. As notes pile up:

- Notes become disconnected — knowledge silos grow
- Tags drift — the same concept ends up under different labels
- Weekly review becomes a chore — journals pile up without curation
- Knowledge accrual is manual — writing takes effort, organizing takes even more

I already use KiloCode CLI for coding. Now the same tool can help me manage my knowledge in Obsidian.

**This plugin bridges my knowledge base with my AI tool.**

---

## What This Plugin Does

KiloCode for Obsidian is a bidirectional bridge between your knowledge base (Obsidian vault) and the KiloCode CLI. KiloCode is your AI tool — it helps you code in the terminal, and now it helps you manage knowledge in Obsidian. Zero config: same tool, two scenarios.

```
┌──────────────────────────────────────────────────────────────┐
│                     Obsidian Vault                            │
│                  (My Knowledge Base)                          │
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

### What makes it interesting?

- **Knowledge in the vault, shared tooling**: Notes, skill definitions, and conversation history all live in your vault — version-controlled, backed up. KiloCode reads them as context — every session, every message. Same KiloCode config for coding and knowledge management, zero extra setup.
- **Skills are knowledge workflows**: AI skill definitions live at `.kilo/skills/` as `.md` files. Write a weekly review workflow in markdown → run it every week with one `/skill weekly-review` command. Edit a skill, and the behavior changes instantly. No config toggling, no CLI restarts.
- **Reference anything with @**: Type `@` to search and reference vault files, folders, MCP servers, or subagents. Content flows from your notes into the conversation seamlessly.
- **One-click note context**: Toggle "Include current note" and the active note's full content is sent to the AI as context — no copy-paste.
- **File attachments**: Drag, paste, or click to attach files. Text files are read inline and sent to the AI.
- **MCP servers configured in the vault**: `.kilocode/mcp.json` defines tools the AI can use. Edit this file to give KiloCode new capabilities.
- **Zero-install CLI**: The KiloCode CLI auto-downloads on first use. The plugin manages its entire lifecycle — start, keep-alive, idle timeout, and graceful shutdown.
- **Your existing CLI config, respected**: If you already use KiloCode CLI, the plugin reads `~/.config/kilo/kilo.jsonc` directly — API keys, model selections, agent settings. Configure once in your terminal, use everywhere in Obsidian.

---

## What Changes

### Before

Managing the knowledge base is entirely manual:
- Notes are written and rarely revisited
- Tagging conventions drift over time
- Weekly reviews require manual effort and separate notes
- Knowledge silos go unnoticed

### After

KiloCode becomes your knowledge management assistant:
- Workflows for knowledge processing live in the vault as reusable skills
- Previous sessions are searchable and replayable
- Weekly review runs with one command
- Knowledge accumulates and gets organized over time

---

## KiloCode's Toolbox × My Knowledge Management

KiloCode is a versatile toolkit. Here's how each tool helps manage your knowledge base:

| KiloCode Tool | I use it to... | Example |
|---------------|---------------|---------|
| **Skill System** | Write reusable knowledge workflows | Write a `weekly-review.md` skill: auto-scan this week's journals → extract key decisions → generate a weekly summary. Write once, run `/skill weekly-review` every Friday |
| **Bash / Scripting** | Batch-operate on notes | "Find all untagged notes in my vault and auto-tag them based on content" — one instruction, done |
| **File Read/Write** | Generate knowledge indexes and maps | "Scan all ML-related notes in the vault, generate a knowledge map page with backlinks" |
| **MCP Tools** | Import knowledge from external sources | Connect Brave Search → "Search for latest AI Agent developments this week, write into literature notes" |
| **Plan Mode** | Safely analyze the full vault | "Analyze my vault structure, find knowledge silos and tagging inconsistencies" — read-only, confirm before execution |
| **Permission Control** | Trust but verify | Plan mode for analysis, Normal mode for execution. Never Yolo — data safety first |
| **Multi-Tab Chat** | Handle parallel knowledge tasks | Tab 1 researching connections, Tab 2 writing weekly report, Tab 3 organizing tags |
| **Fork/Rewind** | Roll back unsatisfactory changes | "Not happy with the tag organization → Rewind → adjust → re-run" |
| **Session Persistence** | Never lose knowledge work progress | Every organization session auto-saves — open next week and see exactly where you left off |
| **Zero Config** | Open and use | Already using KiloCode in the terminal? Same config, zero extra setup in Obsidian |

---

## Features

| Feature | Capability |
|---------|-----------|
| **AI Chat Sidebar** | Chat with KiloCode AI in Obsidian's sidebar. Each message carries your vault path, active note, and installed skills as context — the AI knows your vault. |
| **@mention Vault Files** | Type `@` to search and reference any vault file or folder. The content flows from your notes into the conversation — no copy-paste. |
| **Custom Instructions** | Click `#` to open an instruction editor — write custom system prompts that get injected into the current conversation. Auto-saved, applied per session. |
| **File Attachments** | Attach any file from your system via the toolbar button. Text files are read inline and sent to the AI conversation. |
| **Current Note Context** | One-click toggle to include the active note as AI context. The plugin reads the note via Obsidian's Vault API and passes it to the CLI. |
| **Vault-Backed Skill System** | Knowledge processing skills are `.md` files in `.kilo/skills/` inside your vault. The plugin loads them automatically and injects them as system context for every message. Edit a skill → behavior changes. No CLI restart needed. |
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

## Documentation

| Document | Audience | Contents |
|----------|----------|----------|
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | Contributors | Directory structure, data flow, key components, design decisions, security model |
| **[DEVELOPMENT.md](DEVELOPMENT.md)** | Developers | Setup, build/test/lint scripts, i18n guide, CI/CD pipeline |
| **[ROADMAP.md](ROADMAP.md)** | Everyone | Current progress and planned features |
| **[CHANGELOG.md](CHANGELOG.md)** | Everyone | Version history and release notes |

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
