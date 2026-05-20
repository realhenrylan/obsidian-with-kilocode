<p align="center">
  <a href="README.md">English</a> | <a href="README_CN.md">中文</a>
</p>

<p align="center">
  <img src="assets/logo.png" alt="KiloCode for Obsidian" width="200">
</p>

<h1 align="center">KiloCode for Obsidian</h1>

<p align="center">
  <strong>将 KiloCode AI 编码代理嵌入你的 Obsidian Vault</strong>
</p>

<p align="center">
  <a href="https://github.com/your-username/obsidian-kilocode/releases"><img src="https://img.shields.io/github/v/release/your-username/obsidian-kilocode?style=flat-square&color=FFB800" alt="Release"></a>
  <a href="https://github.com/your-username/obsidian-kilocode/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License"></a>
  <a href="https://github.com/your-username/obsidian-kilocode/stargazers"><img src="https://img.shields.io/github/stars/your-username/obsidian-kilocode?style=flat-square&color=FFB800" alt="Stars"></a>
  <a href="https://github.com/your-username/obsidian-kilocode/issues"><img src="https://img.shields.io/github/issues/your-username/obsidian-kilocode?style=flat-square" alt="Issues"></a>
  <a href="https://obsidian.md/plugins?id=kilocode"><img src="https://img.shields.io/badge/Obsidian-社区插件-purple?style=flat-square&logo=obsidian" alt="Obsidian Plugin"></a>
</p>

---

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 🤖 **AI 聊天侧边栏** | 在 Obsidian 侧边栏中直接与 KiloCode AI 对话 |
| 📝 **内联编辑** | 选中文本 + 快捷键，AI 辅助编辑笔记 |
| 🔧 **斜杠命令** | 输入 `/` 使用可复用的提示模板 |
| 📎 **@提及** | 输入 `@` 提及 Vault 文件、MCP 服务器或子代理 |
| 📋 **计划模式** | `Shift+Tab` 切换 - AI 先探索设计再实施 |
| 💬 **多标签页聊天** | 多个聊天标签页，支持会话历史 |
| 🔄 **流式响应** | 实时显示 AI 回复，支持中断 |
| 🌐 **MCP 支持** | 通过 Model Context Protocol 连接外部工具 |
| 🌍 **国际化** | 多语言支持（中文、英文、日文、韩文等） |

---

## 🚀 快速开始

### 前置要求

- **Obsidian** v1.7.2+（仅桌面端）
- **KiloCode CLI** 全局安装

```bash
npm install -g @kilocode/cli
```

### 安装方式

#### 从 Obsidian 社区插件安装（推荐）

1. 打开 Obsidian → 设置 → 社区插件 → 浏览
2. 搜索 "KiloCode" 并点击安装
3. 启用插件

#### 从 GitHub Release 安装

1. 从[最新发布](https://github.com/your-username/obsidian-kilocode/releases/latest)下载 `main.js`、`manifest.json` 和 `styles.css`
2. 在 Vault 的插件文件夹中创建 `kilocode` 文件夹：
   ```
   /path/to/vault/.obsidian/plugins/kilocode/
   ```
3. 将下载的文件复制到 `kilocode` 文件夹
4. 在 Obsidian 中启用插件：设置 → 社区插件 → 启用 "KiloCode"

#### 从源码安装（开发）

```bash
cd /path/to/vault/.obsidian/plugins
git clone https://github.com/your-username/obsidian-kilocode.git
cd obsidian-kilocode
npm install
npm run build
```

---

## 📖 使用方法

### 基本聊天

1. 点击功能区的 KiloCode 图标或使用命令面板：`KiloCode: Open chat view`
2. 在输入框中输入消息
3. 按 `Enter` 发送，`Shift+Enter` 换行

### 内联编辑

1. 在笔记中选中文本
2. 按 `Ctrl/Cmd + Shift + E`
3. 输入编辑指令
4. 查看 diff 预览
5. 接受或拒绝更改

### 斜杠命令

输入 `/` 查看可用命令：

| 命令 | 说明 |
|------|------|
| `/compact` | 压缩会话历史 |
| `/clear` | 清空当前会话 |
| `/model` | 切换 AI 模型 |
| `/mode` | 切换模式（plan/code/ask） |

### @提及

输入 `@` 可提及：

- **Vault 文件** - 将文件内容作为上下文
- **MCP 服务器** - 连接外部工具
- **子代理** - 调用其他 AI 代理

### 计划模式

按 `Shift+Tab` 切换计划模式：

- AI 先探索和设计再实施
- 呈现计划供您审批
- 审批后执行

---

## ⚙️ 配置

### 设置

打开 设置 → KiloCode 进行配置：

| 设置 | 说明 | 默认值 |
|------|------|--------|
| **语言** | UI 语言 | 中文 |
| **放置位置** | 侧边栏位置 | 右侧边栏 |
| **最大标签页数** | 最大标签页数量 | 3 |
| **CLI 路径** | KiloCode CLI 路径 | 自动检测 |
| **模型** | 默认 AI 模型 | kilo-1 |
| **API Key** | 您的 API 密钥 | - |

### 环境变量

在 设置 → 环境 中配置环境变量：

- **共享** - 应用于所有提供者
- **KiloCode** - 仅应用于 KiloCode 提供者

### MCP 服务器

在 `vault/.kilocode/mcp.json` 中配置 MCP 服务器：

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

```
src/
├── main.ts                      # 插件入口
├── app/                         # 插件级存储和设置
├── core/                        # Provider 中立的运行时和注册表
├── providers/
│   └── kilocode/                # KiloCode 提供者实现
├── features/
│   ├── chat/                    # 侧边栏聊天 UI
│   ├── inline-edit/             # 内联编辑模态框
│   └── settings/                # 设置面板
├── shared/                      # 可复用 UI 组件
├── i18n/                        # 国际化
├── utils/                       # 工具函数
└── style/                       # CSS 样式
```

### 核心组件

| 组件 | 说明 |
|------|------|
| **ProviderRegistry** | 管理 AI 提供者注册 |
| **ChatRuntime** | 处理与 KiloCode CLI 的通信 |
| **StreamController** | 处理流式响应 |
| **TabManager** | 管理多个聊天标签页 |
| **InlineEditService** | 处理内联编辑工作流 |

---

## 🎨 设计系统

### 品牌色

| 颜色 | 色值 | 用途 |
|------|------|------|
| **KiloCode 黄** | `#FFB800` | 主强调色 |
| **浅黄** | `#FFD54F` | 悬停状态 |
| **深黄** | `#E5A600` | 激活状态 |

### 主题支持

- 自动检测亮色/暗色主题
- 遵循 Obsidian 的主题设置
- CSS 变量便于自定义

---

## 🛠️ 开发

### 设置

```bash
# 克隆仓库
git clone https://github.com/your-username/obsidian-kilocode.git
cd obsidian-kilocode

# 安装依赖
npm install

# 启动开发模式
npm run dev

# 生产构建
npm run build

# 运行测试
npm test

# 运行代码检查
npm run lint
```

### 脚本命令

| 脚本 | 说明 |
|------|------|
| `npm run dev` | 开发模式（监听文件变化） |
| `npm run build` | 生产构建 |
| `npm test` | 运行测试 |
| `npm run test:watch` | 监听模式运行测试 |
| `npm run test:coverage` | 运行测试并生成覆盖率报告 |
| `npm run lint` | 运行 ESLint |
| `npm run lint:fix` | 修复 ESLint 错误 |
| `npm run typecheck` | TypeScript 类型检查 |

---

## 🤝 贡献

我们欢迎贡献！请查看我们的[贡献指南](CONTRIBUTING.md)了解详情。

### 开发工作流

1. Fork 仓库
2. 创建功能分支：`git checkout -b feature/amazing-feature`
3. 进行更改
4. 运行测试：`npm test`
5. 提交更改：`git commit -m 'Add amazing feature'`
6. 推送到分支：`git push origin feature/amazing-feature`
7. 打开 Pull Request

### 代码风格

- TypeScript 严格模式
- ESLint 配合 Obsidian 插件
- Prettier 格式化
- 约定式提交

---

## 📋 路线图

- [x] 基本聊天功能
- [x] 流式响应
- [x] 多标签页支持
- [ ] 内联编辑
- [ ] 斜杠命令
- [ ] @提及
- [ ] 计划模式
- [ ] MCP 服务器支持
- [ ] 国际化支持
- [ ] 性能优化

---

## 🐛 故障排除

### KiloCode CLI 未找到

如果看到 "KiloCode CLI not found"：

1. 安装 KiloCode CLI：`npm install -g @kilocode/cli`
2. 验证安装：`kilo --version`
3. 如果仍找不到，在 设置 → 高级 → CLI 路径 中设置路径

### CLI 路径问题

如果使用版本管理器（nvm、fnm、volta）：

1. 留空 CLI 路径以自动检测
2. 如果自动检测失败，找到您的 CLI 路径：
   ```bash
   which kilo  # macOS/Linux
   where.exe kilo  # Windows
   ```
3. 在 设置 → 高级 → CLI 路径 中设置路径

### 网络错误

如果遇到网络错误：

1. 检查网络连接
2. 验证 API 密钥是否正确
3. 检查防火墙设置
4. 尝试在 设置 → 高级 中增加超时时间

---

## 📄 许可证

本项目采用 MIT 许可证 - 详情请查看 [LICENSE](LICENSE) 文件。

---

## 🙏 致谢

- [Obsidian](https://obsidian.md) 提供了优秀的平台
- [KiloCode](https://kilo.ai) 提供了 AI 编码代理
- [Claudian](https://github.com/YishenTu/claudian) 提供了架构灵感
- 所有贡献者和测试者

---

## 📞 支持

- [GitHub Issues](https://github.com/your-username/obsidian-kilocode/issues) - Bug 报告和功能请求
- [Discussions](https://github.com/your-username/obsidian-kilocode/discussions) - 问题和社区交流
- [Discord](https://discord.gg/kilocode) - 实时支持

---

<p align="center">
  为 Obsidian 和 KiloCode 社区用心制作 ❤️
</p>
