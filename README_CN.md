<p align="center">
  <a href="README.md">English</a> | <a href="README_CN.md">中文</a>
</p>

<p align="center">
  <img src="assets/kilocode-logo.png" alt="KiloCode" width="100" height="100" style="margin-right: 20px;">
  <img src="assets/obsidian-logo.svg" alt="Obsidian" width="100" height="100">
</p>

<h1 align="center">KiloCode for Obsidian</h1>

<p align="center">
  <strong>将 KiloCode AI 编码代理嵌入你的 Obsidian</strong>
</p>

<p align="center">
  <a href="https://github.com/realhenrylan/obsidian-with-kilocode/releases"><img src="https://img.shields.io/github/v/release/realhenrylan/obsidian-with-kilocode?style=flat-square&color=FFB800" alt="Release"></a>
  <a href="https://github.com/realhenrylan/obsidian-with-kilocode/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License"></a>
  <a href="https://github.com/realhenrylan/obsidian-with-kilocode/stargazers"><img src="https://img.shields.io/github/stars/realhenrylan/obsidian-with-kilocode?style=flat-square&color=FFB800" alt="Stars"></a>
  <a href="https://github.com/realhenrylan/obsidian-with-kilocode/issues"><img src="https://img.shields.io/github/issues/realhenrylan/obsidian-with-kilocode?style=flat-square" alt="Issues"></a>
  <a href="https://obsidian.md/plugins?id=kilocode"><img src="https://img.shields.io/badge/Obsidian-社区插件-purple?style=flat-square&logo=obsidian" alt="Obsidian Plugin"></a>
</p>

---

## 文档索引

| 文档 | 读者 | 内容 |
|------|------|------|
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | 贡献者 | 目录结构、数据流、核心组件、设计决策、安全模型 |
| **[DEVELOPMENT.md](DEVELOPMENT.md)** | 开发者 | 搭建、构建/测试/代码检查命令、国际化指南、CI/CD 流程 |
| **[ROADMAP.md](ROADMAP.md)** | 所有人 | 当前进展和未来计划 |
| **[CHANGELOG.md](CHANGELOG.md)** | 所有人 | 版本历史和发布说明 |

---

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 🤖 **AI 聊天侧边栏** | 在 Obsidian 侧边栏中直接与 KiloCode AI 对话 |
| 📝 **内联编辑** | 选中文本 + 快捷键，AI 辅助编辑笔记并预览 diff（弹窗和 diff 查看器就绪，AI 调用待完成） |
| 🔧 **斜杠命令** | 框架已搭建，内置命令（/compact、/clear、/model、/mode）的 handler 待实现 |
| 📎 **@提及** | 搜索服务和下拉菜单已就绪，尚未接入聊天输入框 |
| 📋 **计划模式** | 三种模式：code（读写）、plan（只读）、ask（仅问答） |
| 💬 **多标签页聊天** | 多个聊天标签页，支持会话历史持久化 |
| 🔄 **流式响应** | 实时显示 AI 回复，支持中断取消 |
| 🧵 **对话分支/回退** | 在任意消息处创建分支（fork），或回退到之前的对话状态 |
| 📦 **对话压缩** | 后端压缩方法已完成，暂无 UI 触发入口 |
| 🔌 **MCP 支持** | 管理器和工具适配器框架已搭建，协议连接和工具调用待实现 |
| 🖼️ **图片附件** | UI 支持粘贴/拖拽/选择图片并预览，图片传递到 CLI 后端待完成 |
| 📄 **当前笔记上下文** | 一键切换将当前活跃笔记作为 AI 上下文 |
| 🛡️ **权限系统** | Yolo/Normal/Plan 三种安全模式，支持逐次审批对话框 |
| 🌍 **国际化** | 中英文界面，支持根据浏览器语言自动切换 |
| 📦 **CLI 自动下载** | 零配置安装 — 首次使用时从 npm 自动下载 CLI 二进制文件 |

---

## 🚀 快速开始

**前置要求**：Obsidian v1.7.2+（仅桌面端）

> 无需手动安装 CLI。插件首次使用时自动从 npm 下载对应平台的 KiloCode CLI 二进制文件。如果已全局安装 `kilo`，插件会自动检测使用。

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

## 📖 使用方法

### 基本聊天

点击功能区 KiloCode 图标（或 `命令面板 → KiloCode: Open chat view`），输入消息后按 `Enter` 发送。响应实时流式显示 — 按 `取消` 中断。`Shift+Enter` 换行。

### 快速参考

| 操作 | 方法 |
|------|------|
| **内联编辑** | 选中文本 → `Ctrl/Cmd+Shift+E` → 输入指令 → 预览 diff → 接受/拒绝（AI 调用待完成） |
| **斜杠命令** | 在输入框输入 `/`（`/compact`、`/clear`、`/model`、`/mode`）（待实现） |
| **@提及** | 输入 `@` 引用 Vault 文件、文件夹、MCP 服务器或子代理（待接入） |
| **切换模式** | 点击模式按钮或 `Shift+Tab` 循环 Code/Plan/Ask |
| **分支/回退** | 悬停消息显示 ⏪ 回退、🍴 分支、📋 复制 |
| **图片附件** | 粘贴（`Ctrl/Cmd+V`）、拖拽或点击图片按钮（UI 可用，传输待完成） |
| **笔记上下文** | 切换 📄 按钮将当前笔记作为 AI 上下文 |

### 权限模式

| 模式 | 行为 |
|------|------|
| **Normal**（默认） | 读取工具自动放行，写入工具需要审批 |
| **Yolo** | 所有工具自动放行 — 不弹出提示 |
| **Plan** | 读取工具放行，写入工具拒绝 — 只读保障 |

---

## ⚙️ 配置

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

## 🏗️ 架构

详见 [ARCHITECTURE.md](ARCHITECTURE.md) — 目录结构、数据流图、核心组件说明、设计决策和安全模型。

---

## 🛠️ 开发

详见 [DEVELOPMENT.md](DEVELOPMENT.md) — 搭建步骤、构建/测试/代码检查命令、国际化指南和 CI/CD 流程。

---

## 📋 路线图

详见 [ROADMAP.md](ROADMAP.md) — 当前进展和未来计划。

---

## 🐛 故障排除

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

## 📄 许可证

MIT — 详见 [LICENSE](LICENSE)。

---

## 📞 支持

- [GitHub Issues](https://github.com/realhenrylan/obsidian-with-kilocode/issues) — Bug 报告和功能请求
- [Discussions](https://github.com/realhenrylan/obsidian-with-kilocode/discussions) — 问题和社区交流
- [Discord](https://discord.gg/kilocode) — 实时支持

---

<p align="center">
  为 Obsidian 和 KiloCode 社区用心制作 ❤️
</p>
