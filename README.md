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

## Documentation

| Document | Audience | Contents |
|----------|----------|----------|
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | Contributors | Directory structure, data flow, key components, design decisions, security model |
| **[DEVELOPMENT.md](DEVELOPMENT.md)** | Developers | Setup, build/test/lint scripts, i18n guide, CI/CD pipeline |
| **[ROADMAP.md](ROADMAP.md)** | Everyone | Current progress and planned features |
| **[CHANGELOG.md](CHANGELOG.md)** | Everyone | Version history and release notes |

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
| 🔌 **MCP Support** | Connect external tools via Model Context Protocol |
| 🖼️ **Image Attachments** | Paste, drag-drop, or pick images as chat context (5MB limit) |
| 🛡️ **Permission System** | Yolo/Normal/Plan security modes with per-tool approval dialogs |
| 🌍 **i18n** | Multi-language support (English, Chinese, Japanese, Korean, and more) |
| 📦 **CLI Auto-Download** | Zero-config setup — CLI binary auto-downloads from npm on first use |

---

## 🚀 Quick Start

**Prerequisites**: Obsidian v1.7.2+ (Desktop only)

> No CLI installation required. The plugin auto-downloads the platform-appropriate KiloCode CLI binary from npm on first use. If you already have `kilo` installed globally, it will be detected and used.

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

## 📖 Usage

### Basic Chat

Click the KiloCode icon in the ribbon (or `Command Palette → KiloCode: Open chat view`), type your message, and press `Enter`. Responses stream in real-time — press `Cancel` to interrupt. `Shift+Enter` for new line.

### Quick Reference

| Action | How |
|--------|-----|
| **Inline Edit** | Select text → `Ctrl/Cmd+Shift+E` → enter instruction → review diff → Accept/Reject |
| **Slash Commands** | Type `/` in chat input (`/compact`, `/clear`, `/model`, `/mode`) |
| **@mention** | Type `@` to reference vault files, folders, MCP servers, or subagents |
| **Switch Mode** | Click mode toggle or `Shift+Tab` to cycle Code/Plan/Ask |
| **Fork/Rewind** | Hover a message for ⏪ Rewind, 🍴 Fork, or 📋 Copy |
| **Image Attach** | Paste (`Ctrl/Cmd+V`), drag-drop, or click the image button |
| **Note Context** | Toggle the 📄 button to include the active note as AI context |

### Permission Modes

| Mode | Behavior |
|------|----------|
| **Normal** (default) | Read tools auto-approved, write tools require your approval |
| **Yolo** | All tools automatically approved — no prompts |
| **Plan** | Read tools allowed, write tools denied — read-only guarantee |

---

## ⚙️ Configuration

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

## 🏗️ Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for directory structure, data flow diagram, key component descriptions, design decisions, and security model details.

---

## 🛠️ Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for setup, build/test/lint commands, i18n guide, and CI/CD pipeline.

---

## 📋 Roadmap

See [ROADMAP.md](ROADMAP.md) for current progress and planned features.

---

## 🐛 Troubleshooting

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

## 📄 License

MIT — see [LICENSE](LICENSE).

---

## 📞 Support

- [GitHub Issues](https://github.com/realhenrylan/obsidian-with-kilocode/issues) — Bug reports and feature requests
- [Discussions](https://github.com/realhenrylan/obsidian-with-kilocode/discussions) — Questions and community chat
- [Discord](https://discord.gg/kilocode) — Real-time support

---

<p align="center">
  Made with ❤️ for the Obsidian and KiloCode communities
</p>
