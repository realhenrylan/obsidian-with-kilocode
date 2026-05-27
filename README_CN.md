<p align="center">
  <a href="README.md">English</a> | <a href="README_CN.md">中文</a>
</p>

<p align="center">
  <img src="assets/kilocode-logo.png" alt="KiloCode" width="100" height="100" style="margin-right: 20px;">
  <img src="assets/obsidian-logo.svg" alt="Obsidian" width="100" height="100">
</p>

<h1 align="center">KiloCode for Obsidian</h1>

<p align="center">
  <strong>一个 Obsidian 插件，把你的 vault 变成 KiloCode 的长期记忆。</strong>
</p>

<p align="center">
  每次对话重置后不再丢失上下文。<br />
  KiloCode 能从你的 vault 中记住架构决策、项目上下文、<br />
  可复用的工作流、编码规范和之前的会话。
</p>

<p align="center">
  <a href="https://github.com/realhenrylan/obsidian-with-kilocode/releases"><img src="https://img.shields.io/github/v/release/realhenrylan/obsidian-with-kilocode?style=flat-square&color=FFB800" alt="Release"></a>
  <a href="https://github.com/realhenrylan/obsidian-with-kilocode/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License"></a>
  <a href="https://github.com/realhenrylan/obsidian-with-kilocode/stargazers"><img src="https://img.shields.io/github/stars/realhenrylan/obsidian-with-kilocode?style=flat-square&color=FFB800" alt="Stars"></a>
  <a href="https://github.com/realhenrylan/obsidian-with-kilocode/issues"><img src="https://img.shields.io/github/issues/realhenrylan/obsidian-with-kilocode?style=flat-square" alt="Issues"></a>
  <a href="https://obsidian.md/plugins?id=kilocode"><img src="https://img.shields.io/badge/Obsidian-社区插件-purple?style=flat-square&logo=obsidian" alt="Obsidian Plugin"></a>
</p>

---

## 问题

KiloCode 很强大。但和所有 AI coding agent 一样，它有一个致命的缺陷：

**每次会话结束，它什么都记不住。**

每次对话重置意味着：
- 丢失的架构上下文 — 同样的决策需要反复解释
- 遗忘的编码规范 — 同样的错误反复出现
- 不一致的工作流 — 每次会话都要重新定义模式
- 重复的提示词 — 同样的指令一遍遍输入

这个插件就是解决方案：**你的 Obsidian vault 成为 KiloCode 的长期记忆。**

---

## 这个插件做什么

KiloCode for Obsidian 是你的知识库（Obsidian vault）和 KiloCode CLI 之间的双向桥梁。vault 不只是存笔记的地方 — 它存储的是你编码代理的长期记忆。

```
┌──────────────────────────────────────────────────────────────┐
│                     Obsidian Vault                            │
│                (持久化记忆层)                                   │
│                                                               │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────┐   │
│  │ 笔记     │  │ .kilo/skills/ │  │ .kilocode/sessions/   │   │
│  │ (.md)    │  │ (AI 技能文件  │  │ (对话历史)             │   │
│  │          │  │  存放在 vault │  │                        │   │
│  │          │  │  里)          │  │                        │   │
│  └──────────┘  └──────────────┘  └───────────────────────┘   │
│         ▲              ▲                      ▲               │
│         │              │                      │               │
│         └──────────────┼──────────────────────┘               │
│                        │                                      │
│            ┌───────────┴───────────┐                          │
│            │   KiloCode 插件        │                          │
│            │   (本插件)             │                          │
│            │                       │                          │
│            │  @提及 vault 文件     │                          │
│            │  注入技能上下文        │                          │
│            │  附加当前笔记          │                          │
│            │  路由对话              │                          │
│            └───────────┬───────────┘                          │
│                        │ HTTP (127.0.0.1)                     │
└────────────────────────┼──────────────────────────────────────┘
                         │
            ┌────────────▼────────────┐
            │    KiloCode CLI         │
            │    (kilo serve)         │
            │                         │
            │  AI 模型                │
            │  工具执行               │
            │  代码生成               │
            └─────────────────────────┘
```

### 为什么是"记忆系统"而非"聊天面板"？

- **持久的项目记忆**: 架构决策、编码规范、项目知识都以 markdown 形式存在 vault 中。KiloCode 每次会话、每条消息都读取它们作为上下文。没有任何上下文会丢失。
- **技能文件就在 vault 里**: AI 技能定义是 vault 内 `.kilo/skills/` 目录下的 `.md` 文件。编辑技能文件 → KiloCode 行为即时改变。无需切换配置，无需重启 CLI。
- **会话历史在 vault 中**: 每次对话持久化到 `.kilocode/sessions/`，版本控制、自动备份、跨会话可搜索。
- **@ 即搜即引**: 输入 `@` 搜索并引用 vault 中的文件、文件夹、MCP 服务器或子代理。内容从你的记忆系统无缝流入 AI 对话。
- **一键笔记上下文**: 切换"包含当前笔记"按钮，当前笔记内容自动发送给 AI — 无需复制粘贴。
- **文件附件**: 拖拽、粘贴或点击附加文件。文本文件自动读取内容发送给 AI。
- **MCP 配置在 vault 里**: `.kilocode/mcp.json` 定义 AI 工具。编辑这个文件就能赋予 KiloCode 新能力。
- **CLI 零安装**: 首次使用时自动下载 KiloCode CLI 二进制文件。插件管理完整的生命周期 — 启动、保活、空闲超时自动关闭。
- **直接读取 CLI 配置**: 如果已在终端中使用 KiloCode CLI，插件直接读取 `~/.config/kilo/kilo.jsonc` — API 密钥、模型选择、代理设置全部自动继承。终端配置一次，Obsidian 中直接使用。

---

## 变化对比

### 之前

KiloCode 的每次对话结束，什么都留不下来：
- 架构决策丢失
- 工作流每次重置
- 编码规范需要反复解释
- 可复用的模式从未沉淀

### 之后

你的 Obsidian vault 成为 KiloCode 的持久化记忆：
- 架构始终作为上下文加载
- 技能随时可用（vault 中的 markdown 文件）
- 之前的会话可搜索、可复用
- 项目知识随着时间不断积累

---

| 文档 | 读者 | 内容 |
|------|------|------|
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | 贡献者 | 目录结构、数据流、核心组件、设计决策、安全模型 |
| **[DEVELOPMENT.md](DEVELOPMENT.md)** | 开发者 | 搭建、构建/测试/代码检查命令、国际化指南、CI/CD 流程 |
| **[ROADMAP.md](ROADMAP.md)** | 所有人 | 当前进展和未来计划 |
| **[CHANGELOG.md](CHANGELOG.md)** | 所有人 | 版本历史和发布说明 |

---

## 功能特性

| 功能 | 如何构建记忆 |
|------|--------------|
| **AI 聊天侧边栏** | 在 Obsidian 侧边栏中与 KiloCode AI 对话。每条消息携带 vault 路径、当前笔记和已安装的技能作为上下文 — AI 知道你的 vault。 |
| **@提及 Vault 文件** | 输入 `@` 或点击工具栏 `@` 按钮，搜索并引用 vault 中的文件、文件夹、MCP 服务器。笔记内容直接流入对话 — 无需复制粘贴。 |
| **自定义指令** | 点击 `#` 打开指令编辑器 — 编写自定义系统提示词，注入到当前对话。文本自动保存，每个 session 需重新应用。 |
| **文件附件** | 点击工具栏 `📎` 从系统附加任意文件。文本文件自动读取内容随消息发送给 AI。 |
| **当前笔记上下文** | 一键切换将当前活跃笔记作为 AI 上下文。插件通过 Obsidian 的 Vault API 读取笔记内容并传递给 CLI。 |
| **Vault 内技能系统** | AI 技能是 vault 中 `.kilo/skills/` 目录下的 `.md` 文件。插件自动加载它们并注入到每次 AI 对话的系统上下文中。编辑技能文件 → AI 行为即时改变。无需重启 CLI。 |
| **斜杠命令** | `/skill` 从内置目录激活技能，`/model` 切换 AI 模型，`/mode` 切换 code/plan/ask 模式，`/compact` 压缩对话历史，`/clear` 开始新会话。 |
| **MCP 工具框架** | 工具定义在 vault 内的 `.kilocode/mcp.json` 中。插件在 @mention 下拉列表中列出可用 MCP 服务器，方便在对话中引用。 |
| **计划模式** | 三种模式：code（完整读写）、plan（只读分析）、ask（仅问答）。模式前缀注入每条发送给 CLI 的消息。 |
| **多标签页聊天** | 多个独立聊天会话。每个标签页的对话历史存储在 `.kilocode/sessions/` 中 — 跟随你的 vault 一起备份。 |
| **流式响应** | 实时 AI 响应，支持取消中断。插件消费 CLI 的异步生成器，增量更新 UI。 |
| **对话分支/回退** | 在任意消息处创建分支（fork），或回退到之前的对话状态。通过 ConversationController 层管理。 |
| **权限系统** | Yolo（自动放行）/ Normal（逐次审批对话框）/ Plan（只读模式）。ApprovalManager 在工具调用到达 CLI 前进行拦截。 |
| **国际化** | 中英文界面，支持根据浏览器语言自动切换。 |
| **CLI 自动下载** | 无需手动安装 CLI。BinaryManager 在首次使用时自动检测、下载并缓存对应平台的 KiloCode 二进制文件。后台预热预启动 CLI 进程，使首次消息发送更快速。 |
| **直接读取 CLI 配置，开箱即用** | 已在终端中使用 KiloCode？插件直接读取 `~/.config/kilo/kilo.jsonc` — API 密钥、模型选择、代理设置自动继承，无需在插件设置中重复输入。`/model` 命令直接列出你 CLI 配置中的模型。终端配置一次，Obsidian 中直接使用。 |
| **空闲超时** | 无活动 10 分钟后自动停止 CLI 进程以节省资源。下一条消息透明地重新启动。使用 HTTP keep-alive 减少连接开销。 |

---

## 快速开始

**前置要求**：Obsidian v1.7.2+（仅桌面端）

> **零配置启动。** 无需手动安装 CLI — 插件首次使用时自动下载 KiloCode 二进制文件。如果你已全局安装 `kilo` 或已有 `~/.config/kilo/kilo.jsonc` 配置，插件自动检测使用。API 密钥、模型偏好、代理设置全部自动继承，零额外配置。

### 安装方式

**从 Obsidian 社区插件安装（推荐）**

1. 打开 Obsidian → 设置 → 社区插件 → 浏览
2. 搜索 "KiloCode" 并点击安装
3. 启用插件

**从 GitHub Release 安装**

从[最新发布](https://github.com/realhenrylan/obsidian-with-kilocode/releases/latest)下载 `main.js`、`manifest.json` 和 `styles.css`，放入 `<vault>/.obsidian/plugins/kilocode/`。

**从源码安装**

```bash
cd /path/to/vault/.obsidian/plugins
git clone https://github.com/realhenrylan/obsidian-with-kilocode.git
cd obsidian-kilocode
npm install
npm run build
```

---

## 使用方法

### 基本聊天

点击功能区 KiloCode 图标（或 `命令面板 → KiloCode: Open chat view`），输入消息后按 `Enter` 发送。响应实时流式显示 — 按 `取消` 中断。`Shift+Enter` 换行。

### 快速参考

| 操作 | 方法 |
|------|------|
| **@提及 Vault 文件** | 输入 `@` 或点击工具栏 `@` → 搜索引用文件、文件夹、MCP 服务器 |
| **斜杠命令** | 输入 `/` 或点击工具栏 `/` → `/skill`、`/model`、`/mode`、`/compact`、`/clear` |
| **自定义指令** | 点击工具栏 `#` 编写自定义系统提示词，应用到当前 session |
| **文件附件** | 点击工具栏 `📎` 从系统附加任意文件 |
| **当前笔记上下文** | 切换工具栏 `📝` 按钮将当前笔记作为 AI 上下文 |
| **切换模式** | 点击模式按钮或 `Shift+Tab` 循环 Code/Plan/Ask |
| **分支/回退** | 悬停消息显示 ⏪ 回退、🍴 分支、📋 复制 |
| **内联编辑** | 选中文本 → `Ctrl/Cmd+Shift+E` → 输入指令（AI 调用待完成） |

### 权限模式

| 模式 | 行为 |
|------|------|
| **Normal**（默认） | 读取工具自动放行，写入工具需要审批 |
| **Yolo** | 所有工具自动放行 — 不弹出提示 |
| **Plan** | 读取工具放行，写入工具拒绝 — 只读保障 |

---

## 配置

打开 设置 → KiloCode：

| 分区 | 关键设置 |
|------|----------|
| 常规 | CLI 路径（自动检测）、自动启动 |
| API | API Key、Base URL（留空则使用 CLI 存储的凭据） |
| 聊天 | 最大标签页数（默认 3）、自动保存、压缩保留数（默认 5） |
| 模型 | 默认模型（默认 `claude-sonnet-4-20250514`）、温度（默认 0.7） |
| 外观 | 主题（自动/亮色/暗色）、字体大小（默认 14px） |
| 安全 | 权限模式（Normal / Yolo / Plan） |

**环境变量**：在 设置 → 环境 中配置（共享和 KiloCode 特定）。设置 API Key / Base URL 时，会传递 `KILO_API_KEY` 和 `KILO_BASE_URL` 给 `kilo serve` 进程。

**MCP 服务器**：在 `vault/.kilocode/mcp.json` 中配置：

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

## 架构

详见 [ARCHITECTURE.md](ARCHITECTURE.md) — 目录结构、数据流图、核心组件说明、设计决策和安全模型。

---

## 开发

详见 [DEVELOPMENT.md](DEVELOPMENT.md) — 搭建步骤、构建/测试/代码检查命令、国际化指南和 CI/CD 流程。

---

## 路线图

详见 [ROADMAP.md](ROADMAP.md) — 当前进展和未来计划。

---

## 故障排除

### KiloCode CLI 未找到

插件首次使用时自动下载 CLI。如果失败：
1. 检查网络连接
2. 在 设置 → 常规 → 下载镜像 URL 中设置镜像地址
3. 手动安装：`npm install -g @kilocode/cli`
4. 验证：`kilo --version`

### CLI 路径问题

留空以自动检测。如需手动设置，使用 `which kilo`（macOS/Linux）或 `where.exe kilo`（Windows）查找路径，在 设置 → 常规 → CLI 路径 中设置。

### JSON-RPC 通信错误

确保 `@kilocode/cli` 为最新版（`npm update -g @kilocode/cli`）并确认 API 密钥配置正确。

### 网络错误

检查网络连接、API 密钥和防火墙设置（CLI 需要出站 HTTPS 访问）。

### 对话持久化问题

对话存储在 `.kilocode/sessions/` 中。检查文件夹是否可写、自动保存是否开启。

---

## 许可证

MIT — 详见 [LICENSE](LICENSE)。

---

## 支持

- [GitHub Issues](https://github.com/realhenrylan/obsidian-with-kilocode/issues) — Bug 报告和功能请求
- [Discussions](https://github.com/realhenrylan/obsidian-with-kilocode/discussions) — 问题和社区交流
- [Discord](https://discord.gg/kilocode) — 实时支持

---

<p align="center">
  为 Obsidian 和 KiloCode 社区用心制作 ❤️
</p>
