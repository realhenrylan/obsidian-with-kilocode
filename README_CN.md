<p align="center">
  <a href="README.md">English</a> | <a href="README_CN.md">中文</a>
</p>

<p align="center">
  <img src="assets/kilocode-logo.png" alt="KiloCode" width="100" height="100" style="margin-right: 20px;">
  <img src="assets/obsidian-logo.svg" alt="Obsidian" width="100" height="100">
</p>

<h1 align="center">KiloCode for Obsidian</h1>

<p align="center">
  <strong>将 KiloCode AI 编码代理嵌入你的 Obsidian Vault</strong>
</p>

<p align="center">
  <a href="https://github.com/realhenrylan/obsidian-with-kilocode/releases"><img src="https://img.shields.io/github/v/release/realhenrylan/obsidian-with-kilocode?style=flat-square&color=FFB800" alt="Release"></a>
  <a href="https://github.com/realhenrylan/obsidian-with-kilocode/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License"></a>
  <a href="https://github.com/realhenrylan/obsidian-with-kilocode/stargazers"><img src="https://img.shields.io/github/stars/realhenrylan/obsidian-with-kilocode?style=flat-square&color=FFB800" alt="Stars"></a>
  <a href="https://github.com/realhenrylan/obsidian-with-kilocode/issues"><img src="https://img.shields.io/github/issues/realhenrylan/obsidian-with-kilocode?style=flat-square" alt="Issues"></a>
  <a href="https://obsidian.md/plugins?id=kilocode"><img src="https://img.shields.io/badge/Obsidian-社区插件-purple?style=flat-square&logo=obsidian" alt="Obsidian Plugin"></a>
</p>

---

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 🤖 **AI 聊天侧边栏** | 在 Obsidian 侧边栏中直接与 KiloCode AI 对话 |
| 📝 **内联编辑** | 选中文本 + 快捷键，AI 辅助编辑笔记并预览 diff |
| 🔧 **斜杠命令** | 输入 `/` 使用可复用的提示模板（compact/clear/model/mode） |
| 📎 **@提及** | 输入 `@` 提及 Vault 文件、文件夹、MCP 服务器或子代理 |
| 📋 **计划模式** | 三种模式：code（读写）、plan（只读）、ask（仅问答） |
| 💬 **多标签页聊天** | 多个聊天标签页，支持会话历史持久化 |
| 🔄 **流式响应** | 实时显示 AI 回复，支持中断取消 |
| 🧵 **对话分支/回退** | 在任意消息处创建分支（fork），或回退到之前的对话状态 |
| 📦 **对话压缩** | 将旧消息压缩为摘要，节省上下文窗口 |
| 🔌 **MCP 支持** | 通过 Model Context Protocol 连接外部工具 |
| 🖼️ **图片附件** | 粘贴、拖拽或选择图片作为聊天上下文（单张 5MB 限制） |
| 📄 **当前笔记上下文** | 一键切换将当前活跃笔记作为 AI 上下文 |
| 🛡️ **权限系统** | Yolo/Normal/Plan 三种安全模式，支持逐次审批对话框 |
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

1. 从[最新发布](https://github.com/realhenrylan/obsidian-with-kilocode/releases/latest)下载 `main.js`、`manifest.json` 和 `styles.css`
2. 在 Vault 的插件文件夹中创建 `kilocode` 文件夹：
   ```
   /path/to/vault/.obsidian/plugins/kilocode/
   ```
3. 将下载的文件复制到 `kilocode` 文件夹
4. 在 Obsidian 中启用插件：设置 → 社区插件 → 启用 "KiloCode"

#### 从源码安装（开发）

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

1. 点击功能区的 KiloCode 图标或使用命令面板：`KiloCode: Open chat view`
2. 在输入框中输入消息
3. 按 `Enter` 发送，`Shift+Enter` 换行
4. AI 响应实时流式显示 — 点击"取消"按钮可中断

### 输入工具栏

输入框上方提供快捷操作按钮：

| 按钮 | 操作 |
|------|------|
| `@` | 触发 @提及 |
| `/` | 触发斜杠命令 |
| 📝 | 指令预设 |
| 📎 | 附加文件 |
| 🖼️ | 附加图片 |
| 📄 | 切换当前笔记为上下文 |

### 内联编辑

1. 在笔记中选中文本
2. 按 `Ctrl/Cmd + Shift + E`
3. 在弹窗中输入编辑指令
4. 查看逐行 diff 预览（新增行绿色、删除行红色）
5. 点击 **接受** 或 **拒绝**

### 斜杠命令

在输入框中输入 `/` 查看可用命令。支持键盘导航的命令选择面板（方向键/回车/Esc）：

| 命令 | 说明 |
|------|------|
| `/compact` | 压缩对话历史 — 将旧消息替换为摘要 |
| `/clear` | 清空当前对话 |
| `/model` | 切换 AI 模型 |
| `/mode` | 切换模式（plan/code/ask） |

### @提及

输入 `@` 触发提及下拉菜单，支持搜索以下内容：

| 类型 | 图标 | 说明 |
|------|------|------|
| **Vault 文件** | 📄 | 将文件内容作为 AI 上下文 |
| **文件夹** | 📁 | 引用 Vault 中的文件夹 |
| **MCP 服务器** | 🔌 | 连接外部工具 |
| **子代理** | 🤖 | 调用其他 AI 代理 |

结果按类型分组显示，最多返回 20 个匹配项。

### 计划模式

点击聊天顶部的模式切换按钮或按 `Shift+Tab` 循环切换模式：

| 模式 | 行为 |
|------|------|
| **Code** | 完全读写权限 — AI 可创建和编辑文件 |
| **Plan** | 只读 — AI 仅探索和设计，不做任何修改 |
| **Ask** | 仅问答 — AI 回答问题，不访问文件 |

模式前缀会自动注入到每条消息中，当前活跃模式在界面中有视觉指示。

### 对话管理

每条消息悬停时显示操作按钮：

- **⏪ 回退** — 丢弃选中消息之后的所有对话（需确认）
- **🍴 分支** — 从选中消息处创建新的对话分支
- **📋 复制** — 复制消息内容到剪贴板

#### 压缩

当对话过长时，使用 `/compact` 命令将旧消息替换为系统摘要，保留最近的 N 条消息不变（可在设置中配置，默认 5 条）。

### 图片附件

支持三种方式附加图片：

1. **文件选择器** — 点击工具栏中的图片按钮
2. **剪贴板粘贴** — 复制图片后在输入区域按 `Ctrl/Cmd+V`
3. **拖拽** — 将图片文件拖入输入区域

图片预览显示在输入框上方的网格中，每张图片有独立的移除按钮。单张图片大小限制为 5MB。

### 当前笔记上下文

点击工具栏中的"当前笔记"按钮，切换是否将当前活跃笔记的内容作为 AI 上下文。切换状态有视觉指示，在会话期间保持。

### 权限系统

AI 的工具调用受所选权限模式控制：

| 模式 | 行为 |
|------|------|
| **Normal**（默认） | 读取工具自动放行，写入工具需要审批 |
| **Yolo** | 所有工具自动放行 — 不弹出提示 |
| **Plan** | 读取工具放行，写入工具拒绝 — 只读保障 |

当工具需要审批时，`ApprovalModal` 对话框会显示：

- 工具名称和描述
- 完整的输入参数（格式化 JSON）
- 按钮：**允许**、**始终允许**（跳过该工具后续审批）、**拒绝**、**取消**

---

## ⚙️ 配置

### 设置

打开 设置 → KiloCode 进行配置：

#### 常规

| 设置 | 说明 | 默认值 |
|------|------|--------|
| **CLI 路径** | KiloCode CLI 可执行文件路径 | 自动检测 |
| **自动启动** | 打开 Vault 时自动启动 CLI | 关闭 |
| **API Key** | 您的 API 密钥 | - |

#### 聊天

| 设置 | 说明 | 默认值 |
|------|------|--------|
| **最大标签页数** | 聊天标签页最大数量 | 3 |
| **自动保存** | 自动保存对话历史 | 开启 |
| **压缩保留数** | 压缩时保留的最近消息数 | 5 |

#### 模型

| 设置 | 说明 | 默认值 |
|------|------|--------|
| **默认模型** | 默认 AI 模型 | claude-sonnet-4-20250514 |
| **温度** | 模型温度 (0-1) | 0.7 |

#### 外观

| 设置 | 说明 | 默认值 |
|------|------|--------|
| **主题** | 颜色主题（自动/亮色/暗色） | 自动 |
| **字体大小** | 聊天消息字体大小 | 14px |

#### 安全

| 设置 | 说明 | 默认值 |
|------|------|--------|
| **权限模式** | Normal / Yolo / Plan | Normal |

### 环境变量

在 设置 → 环境 中配置环境变量：

- **共享** — 应用于所有提供者
- **KiloCode** — 仅应用于 KiloCode 提供者

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

### 目录结构

```
src/
├── main.ts                      # 插件入口 — 注册视图、命令、设置面板、Provider
├── app/
│   └── settings/
│       └── defaultSettings.ts    # DEFAULT_SETTINGS 常量，包含所有默认值
├── core/
│   ├── types/
│   │   └── index.ts              # 核心类型：Conversation, Message, ToolCallInfo, KiloCodeSettings...
│   ├── providers/
│   │   ├── types.ts              # Provider 协议：ChatRuntime, ProviderCapabilities, StreamChunk
│   │   └── ProviderRegistry.ts   # Provider 注册表（静态类）
│   └── security/
│       ├── PermissionMode.ts     # 权限类型定义、读写工具集合
│       ├── ApprovalManager.ts    # 审批队列管理（yolo/normal/plan 模式）
│       └── ApprovalModal.ts      # Obsidian 模态审批对话框
├── providers/
│   └── kilocode/
│       ├── capabilities.ts       # Provider 能力声明
│       ├── models.ts             # 模型定义（kilo-1, kilo-1-fast）
│       ├── registration.ts       # Provider 注册工厂
│       ├── settings.ts           # Provider 特定设置
│       └── runtime/
│           └── KiloCodeChatRuntime.ts  # JSON-RPC over stdio 与 CLI 通信
├── features/
│   ├── chat/
│   │   ├── KiloCodeView.ts       # 主聊天视图 — 集成所有聊天组件
│   │   ├── PlanModeController.ts # Code/plan/ask 模式管理
│   │   ├── controllers/
│   │   │   ├── StreamController.ts    # 消费 AsyncGenerator，组装 Message
│   │   │   └── InputController.ts     # Runtime 容器（send/cancel）
│   │   ├── rendering/
│   │   │   └── MessageRenderer.ts     # 消息→HTML 渲染，支持虚拟滚动
│   │   ├── services/
│   │   │   └── ConversationService.ts # 会话 CRUD 操作，Vault 持久化
│   │   ├── tabs/
│   │   │   ├── Tab.ts                 # 标签页状态管理
│   │   │   └── TabManager.ts          # 多标签页生命周期管理
│   │   └── ui/
│   │       ├── CurrentNoteContext.ts   # 当前笔记上下文提供者
│   │       ├── ImageContext.ts         # 图片附件管理器
│   │       └── InputToolbar.ts         # 可配置工具栏组件
│   ├── commands/
│   │   ├── SlashCommand.ts            # CommandRegistry 注册表
│   │   └── CommandPalette.ts          # 键盘导航命令选择面板
│   ├── inline-edit/
│   │   ├── InlineEditModal.ts         # 选中文本 + 编辑指令弹窗
│   │   └── DiffViewer.ts              # 逐行 diff 预览
│   ├── mcp/
│   │   ├── MCPManager.ts              # MCP 服务器配置和连接管理
│   │   └── MCPToolAdapter.ts          # 跨服务器工具格式转换
│   ├── mention/
│   │   ├── MentionService.ts          # 搜索 Vault 文件/文件夹/MCP/子代理
│   │   └── MentionDropdown.ts         # 分组结果展示
│   └── settings/
│       └── SettingsTab.ts             # 插件设置面板（5 个分区）
├── shared/
│   ├── ErrorNotice.ts                 # 分级错误处理
│   └── VirtualScroller.ts             # 虚拟滚动组件
├── i18n/
│   ├── index.ts                       # 翻译系统（set/get locale、dot-key 查找）
│   └── locales/
│       ├── en.json                    # 英文翻译
│       └── zh.json                    # 中文翻译

styles.css                             # 全局样式（品牌主题、亮/暗色）
```

### 数据流

```
用户输入 → KiloCodeView
  → PlanModeController（注入模式前缀）
  → ConversationService（持久化用户消息）
  → KiloCodeChatRuntime（JSON-RPC over stdio → CLI 进程）
  → AsyncGenerator<StreamChunk>
  → StreamController（消费数据块，组装 Message）
  → MessageRenderer（增量 UI 更新）
  → ApprovalManager（拦截危险操作）
     → ApprovalModal（用户决策）
  → ConversationService（持久化助手响应）
```

### 核心组件

| 组件 | 说明 |
|------|------|
| **ProviderRegistry** | 静态 Provider 注册表。Provider 在插件加载时自行注册。 |
| **ChatRuntime** (接口) | 基于 AsyncGenerator 的协议（`sendMessage` 返回 `AsyncGenerator<StreamChunk>`）。支持 `start/stop/cancel/resetSession/sendApproval`。 |
| **KiloCodeChatRuntime** | 具体实现 — 派生 CLI 子进程，通过 JSON-RPC over stdio 通信。使用内部 pendingChunks + resolveNext 队列将 stdout 事件桥接到生成器消费。 |
| **StreamController** | 消费 `AsyncGenerator<StreamChunk>`，处理 text/tool_use/tool_result/error/done/approval_required 数据块类型。支持基于 AbortController 的取消。 |
| **ConversationService** | 完整的会话 CRUD，Promise 队列防止并发竞态。以 JSON 文件形式存储在 `.kilocode/sessions/`。支持 fork/rewind/compact/resume 操作。 |
| **TabManager** | 管理多个聊天标签页（创建/关闭/切换），跨会话持久化标签状态。 |
| **PlanModeController** | 循环切换 code/plan/ask 模式，注入模式相关的系统提示前缀。 |
| **ApprovalManager** | 工具审批队列管理 — yolo（自动放行）、normal（写入需审批）、plan（拒绝写入）。支持 always-allow 列表持久化。 |
| **MessageRenderer** | 消息→HTML 渲染，支持流式文本追加、工具调用卡片（可折叠）、虚拟滚动（>50 条）、操作按钮（rewind/fork/copy）。 |
| **MCPManager** | 管理 MCP 服务器生命周期 — 添加、移除、列出服务器和工具。 |
| **MentionService** | 搜索 Vault 文件、文件夹、MCP 服务器和子代理，用于 @提及自动补全。 |

### 设计决策

- **AsyncGenerator 模式**（替代回调）：`sendMessage` 返回 `AsyncGenerator<StreamChunk>`，通过 `for-await-of` 自然消费流式数据
- **AbortController**：用于流式取消 — 干净地中断 `for-await` 循环
- **Promise 队列**：`ConversationService` 使用顺序 Promise 执行防止并发竞态条件
- **虚拟滚动**：消息列表超过 50 条时自动启用，仅渲染视口内的消息
- **CustomEvent 冒泡**：组件通过 DOM CustomEvent 通信，实现松耦合
- **部分行缓冲**：`KiloCodeChatRuntime` 缓冲不完整的 stdout 行，防止 JSON 解析失败

---

## 🛡️ 安全模型

插件实现了多层安全架构来管控 AI 工具执行：

### 权限模式

三种模式控制 AI 工具调用的处理方式：

| 模式 | 读取工具 | 写入工具 | 适用场景 |
|------|----------|----------|----------|
| **Yolo** | 自动放行 | 自动放行 | 可信环境、快速原型 |
| **Normal** | 自动放行 | 需审批 | 日常开发（默认） |
| **Plan** | 自动放行 | 拒绝 | 代码审查、架构讨论 |

### 写入工具（Normal 模式下需审批）

| 工具 | 说明 |
|------|------|
| `write_file` | 创建或覆写文件 |
| `edit_file` | 修改已有文件 |
| `delete_file` | 删除文件 |
| `bash` | 执行 Shell 命令 |
| `execute_command` | 运行任意命令 |

### 审批对话框

当写入工具需要审批时，`ApprovalModal` 对话框会显示：

- 工具名称和描述
- 完整的输入参数（格式化的 `<pre><code>` JSON 块）
- 决策按钮：**允许**（一次）、**始终允许**（该工具持久放行）、**拒绝**、**取消**

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
- 通过 CSS 自定义属性遵循 Obsidian 的主题设置
- 支持 CSS 变量自定义

---

## 🛠️ 开发

### 设置

```bash
# 克隆仓库
git clone https://github.com/realhenrylan/obsidian-with-kilocode.git
cd obsidian-kilocode

# 安装依赖
npm install

# 启动开发模式（esbuild 监听模式）
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
| `npm run dev` | 开发模式（esbuild 监听文件变化） |
| `npm run build` | 生产构建 |
| `npm test` | 运行所有 Jest 测试 |
| `npm run test:watch` | 监听模式运行测试 |
| `npm run test:coverage` | 运行测试并生成覆盖率报告 |
| `npm run lint` | 运行 ESLint |
| `npm run lint:fix` | 自动修复 ESLint 错误 |
| `npm run typecheck` | TypeScript 类型检查（`tsc --noEmit`） |

### 测试

测试套件覆盖：

- **单元测试**：ProviderRegistry、StreamController、InputController、TabManager、ConversationService、MessageRenderer、CommandRegistry、PlanModeController、MCPManager、KiloCodeChatRuntime、i18n、ApprovalManager、ImageContext、CurrentNoteContext、InputToolbar
- **集成测试**：聊天工作流（TabManager + StreamController + InputController + PlanModeController）、会话管理（fork/rewind/compact/resume）、流式管道

```bash
# 运行所有测试
npm test

# 运行测试并查看覆盖率
npm run test:coverage
```

### 国际化

添加新语言：

1. 在 `src/i18n/locales/{lang}.json` 创建翻译文件，参照 `zh.json` 的结构
2. i18n 系统会自动检测语言，缺失的键会回退到英文
3. 翻译键使用点号表示法（如 `settings.cliPathDesc`），支持 `{{param}}` 参数替换

### CI/CD

- **CI**（`.github/workflows/ci.yml`）：push/PR 到 main 时触发 — typecheck → lint → build → test
- **发布**（`.github/workflows/release.yml`）：打 `v*` 标签时触发 — build → 创建 GitHub Release（包含 `main.js`、`manifest.json`、`styles.css`）

---

## 📋 路线图

- [x] 基本聊天功能
- [x] 流式响应与中断支持
- [x] 多标签页支持与状态持久化
- [x] 会话管理（CRUD、fork、rewind、compact、resume）
- [x] 内联编辑与 diff 预览
- [x] 斜杠命令与命令选择面板
- [x] @提及（文件、文件夹、MCP 服务器、子代理）
- [x] 计划模式（code/plan/ask）
- [x] MCP 服务器支持
- [x] 权限系统（yolo/normal/plan）与审批对话框
- [x] 图片附件（粘贴、拖拽、文件选择）
- [x] 当前笔记上下文开关
- [x] 输入工具栏
- [x] 国际化（中文、英文）
- [x] 虚拟滚动优化长对话性能
- [x] 分级错误处理
- [ ] 大型 Vault 性能优化
- [ ] 更多语言支持
- [ ] 自定义主题支持
- [ ] 第三方扩展插件 API

---

## 🐛 故障排除

### KiloCode CLI 未找到

```
错误：未找到 KiloCode CLI
```

1. 安装 KiloCode CLI：`npm install -g @kilocode/cli`
2. 验证安装：`kilo --version`
3. 如果仍找不到，在 设置 → 常规 → CLI 路径 中设置路径

### CLI 路径问题

如果使用版本管理器（nvm、fnm、volta）：

1. 留空 CLI 路径以自动检测
2. 如果自动检测失败，找到您的 CLI 路径：
   ```bash
   which kilo  # macOS/Linux
   where.exe kilo  # Windows
   ```
3. 在 设置 → 常规 → CLI 路径 中设置路径

### JSON-RPC 通信错误

如果 CLI 启动成功但响应失败：

1. 检查 `@kilocode/cli` 是否为最新版：`npm update -g @kilocode/cli`
2. 确认 API 密钥配置正确
3. 检查 CLI 进程日志是否有错误信息

### 网络错误

1. 检查网络连接
2. 验证 API 密钥是否正确
3. 检查防火墙设置（CLI 需要出站 HTTPS 访问）
4. 尝试在 设置 → 高级 中增加超时时间

### 对话持久化问题

对话存储在 Vault 的 `.kilocode/sessions/` 目录中。如果遇到数据丢失：

1. 检查该文件夹是否存在且可写
2. 确认 设置 → 聊天 → 自动保存 已开启
3. 检查磁盘空间或权限问题

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

- [GitHub Issues](https://github.com/realhenrylan/obsidian-with-kilocode/issues) — Bug 报告和功能请求
- [Discussions](https://github.com/realhenrylan/obsidian-with-kilocode/discussions) — 问题和社区交流
- [Discord](https://discord.gg/kilocode) — 实时支持

---

<p align="center">
  为 Obsidian 和 KiloCode 社区用心制作 ❤️
</p>
