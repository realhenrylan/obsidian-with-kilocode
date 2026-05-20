<p align="center">
  <a href="README.md">English</a> | <a href="README_CN.md">中文</a>
</p>

<p align="center">
  <img src="assets/logo.png" alt="KiloCode for Obsidian" width="200">
</p>

<h1 align="center">KiloCode for Obsidian</h1>

<p align="center">
  <strong>Embed KiloCode AI coding agent directly into your Obsidian vault</strong>
</p>

<p align="center">
  <a href="https://github.com/your-username/obsidian-kilocode/releases"><img src="https://img.shields.io/github/v/release/your-username/obsidian-kilocode?style=flat-square&color=FFB800" alt="Release"></a>
  <a href="https://github.com/your-username/obsidian-kilocode/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License"></a>
  <a href="https://github.com/your-username/obsidian-kilocode/stargazers"><img src="https://img.shields.io/github/stars/your-username/obsidian-kilocode?style=flat-square&color=FFB800" alt="Stars"></a>
  <a href="https://github.com/your-username/obsidian-kilocode/issues"><img src="https://img.shields.io/github/issues/your-username/obsidian-kilocode?style=flat-square" alt="Issues"></a>
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
| 📋 **Plan Mode** | Toggle with `Shift+Tab` - AI explores and designs before implementing |
| 💬 **Multi-Tab Chat** | Multiple chat tabs with conversation history |
| 🔄 **Streaming Responses** | Real-time AI responses with interruption support |
| 🌐 **MCP Support** | Connect external tools via Model Context Protocol |
| 🌍 **i18n** | Multi-language support (EN, ZH, JA, KO, and more) |

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

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/your-username/obsidian-kilocode/releases/latest)
2. Create a folder `kilocode` in your vault's plugins folder:
   ```
   /path/to/vault/.obsidian/plugins/kilocode/
   ```
3. Copy the downloaded files into the `kilocode` folder
4. Enable the plugin in Obsidian: Settings → Community plugins → Enable "KiloCode"

#### From Source (Development)

```bash
cd /path/to/vault/.obsidian/plugins
git clone https://github.com/your-username/obsidian-kilocode.git
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

### Inline Edit

1. Select text in a note
2. Press `Ctrl/Cmd + Shift + E`
3. Enter your editing instruction
4. Review the diff preview
5. Accept or Reject the changes

### Slash Commands

Type `/` to see available commands:

| Command | Description |
|---------|-------------|
| `/compact` | Compress conversation history |
| `/clear` | Clear current conversation |
| `/model` | Switch AI model |
| `/mode` | Switch mode (plan/code/ask) |

### @mention

Type `@` to mention:

- **Vault files** - Include file content as context
- **MCP servers** - Connect external tools
- **Subagents** - Call other AI agents

### Plan Mode

Press `Shift+Tab` to toggle Plan Mode:

- AI explores and designs before implementing
- Presents a plan for your approval
- Executes after you approve

---

## ⚙️ Configuration

### Settings

Open Settings → KiloCode to configure:

| Setting | Description | Default |
|---------|-------------|---------|
| **Language** | UI language | English |
| **Placement** | Sidebar position | Right sidebar |
| **Max Tabs** | Maximum number of tabs | 3 |
| **CLI Path** | Path to KiloCode CLI | Auto-detect |
| **Model** | Default AI model | kilo-1 |
| **API Key** | Your API key | - |

### Environment Variables

Configure environment variables in Settings → Environment:

- **Shared** - Applied to all providers
- **KiloCode** - Applied to KiloCode provider only

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

```
src/
├── main.ts                      # Plugin entry point
├── app/                         # Plugin-level storage and settings
├── core/                        # Provider-neutral runtime and registry
├── providers/
│   └── kilocode/                # KiloCode provider implementation
├── features/
│   ├── chat/                    # Sidebar chat UI
│   ├── inline-edit/             # Inline edit modal
│   └── settings/                # Settings panel
├── shared/                      # Reusable UI components
├── i18n/                        # Internationalization
├── utils/                       # Utility functions
└── style/                       # CSS styles
```

### Key Components

| Component | Description |
|-----------|-------------|
| **ProviderRegistry** | Manages AI provider registration |
| **ChatRuntime** | Handles communication with KiloCode CLI |
| **StreamController** | Processes streaming responses |
| **TabManager** | Manages multiple chat tabs |
| **InlineEditService** | Handles inline editing workflow |

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
- Follows Obsidian's theme settings
- CSS variables for easy customization

---

## 🛠️ Development

### Setup

```bash
# Clone the repository
git clone https://github.com/your-username/obsidian-kilocode.git
cd obsidian-kilocode

# Install dependencies
npm install

# Start development mode
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
| `npm run dev` | Development mode with watch |
| `npm run build` | Production build |
| `npm test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint errors |
| `npm run typecheck` | TypeScript type check |

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `npm test`
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Code Style

- TypeScript strict mode
- ESLint with Obsidian plugin
- Prettier for formatting
- Conventional commits

---

## 📋 Roadmap

- [x] Basic chat functionality
- [x] Streaming responses
- [x] Multi-tab support
- [ ] Inline edit
- [ ] Slash commands
- [ ] @mention
- [ ] Plan mode
- [ ] MCP server support
- [ ] i18n support
- [ ] Performance optimization

---

## 🐛 Troubleshooting

### KiloCode CLI not found

If you see "KiloCode CLI not found":

1. Install KiloCode CLI: `npm install -g @kilocode/cli`
2. Verify installation: `kilo --version`
3. If still not found, set CLI path in Settings → Advanced → CLI Path

### CLI Path Issues

If using a version manager (nvm, fnm, volta):

1. Leave CLI path empty for auto-detection
2. If auto-detection fails, find your CLI path:
   ```bash
   which kilo  # macOS/Linux
   where.exe kilo  # Windows
   ```
3. Set the path in Settings → Advanced → CLI Path

### Network Errors

If you experience network errors:

1. Check your internet connection
2. Verify API key is correct
3. Check firewall settings
4. Try increasing timeout in Settings → Advanced

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

- [GitHub Issues](https://github.com/your-username/obsidian-kilocode/issues) - Bug reports and feature requests
- [Discussions](https://github.com/your-username/obsidian-kilocode/discussions) - Questions and community chat
- [Discord](https://discord.gg/kilocode) - Real-time support

---

<p align="center">
  Made with ❤️ for the Obsidian and KiloCode communities
</p>
