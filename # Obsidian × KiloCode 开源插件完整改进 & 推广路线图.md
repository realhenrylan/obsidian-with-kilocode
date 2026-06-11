# Obsidian × KiloCode 开源插件完整改进 & 推广路线图 v2

> 项目：https://github.com/realhenrylan/obsidian-with-kilocode
>
> 核心叙事：**我有一个 Obsidian 个人知识库 Wiki，我用 KiloCode 来管理它。**
> 我是知识库的主人，KiloCode 是工具，这个插件是让它们在一起工作的桥梁。

---

# 一、v1 路线图复盘

## 当前问题

v1 定位是 **"Persistent Memory for AI Coding Agents"**——主语一直是 KiloCode，Obsidian 只是它的"内存盘"。

| v1（错误） | v2 修正 |
|-----------|--------|
| 这是 AI coding agent 的"长期记忆层" | 这是我的 Obsidian 知识库，我用 KiloCode 来打理它 |
| KiloCode 是主角，Obsidian 是配角 | **我是主人**，我有知识库（Obsidian），我有工具（KiloCode），这个插件让它们打通 |
| 面向开发者，强调"Agent 需要记忆" | 面向 Obsidian 用户（包括但不限于开发者），强调"你可以用 AI 工具管好你的知识库" |
| 功能叙事：Memory Panel、Session Summary | 功能叙事：Skill 驱动的知识加工、Agent 代劳整理 |

**核心认知纠偏**：用户打开 Obsidian 不是为了"给 AI 提供记忆"，而是为了管理自己的知识。KiloCode 不是入驻 Obsidian 的"大人物"，它是用户手里的一把好用的工具。

---

# 二、竞品差异分析：KiloCode 插件 vs Claudian

## 谁是真正的竞争对手？

Obsidian AI 插件生态分层：

- **Chatbot 层**：Copilot, Smart Connections, Text Generator — 纯 API 调用，只聊天，不执行
- **Agent 层**：**Claudian**（12k stars）+ **KiloCode Plugin** — CLI Agent 驱动，完整读写/执行/MCP/Skill 能力

真正的竞品只有一个：**Claudian**。

Claudian（github.com/YishenTu/claudian）是一个 Obsidian 插件，内嵌 Claude Code（以及 Codex、Opencode）作为 AI Agent。12k stars，720 forks，35 个 release，10 种语言——它是这个赛道的绝对领先者。

## 功能对比

两者高度同构：

| 功能 | Claudian | KiloCode Plugin |
|------|----------|-----------------|
| AI 侧边栏聊天 | ✅ | ✅ |
| Inline Edit | ✅ | ✅（stub） |
| @mention vault 文件 | ✅ | ✅ |
| Slash Commands | ✅ | ✅ |
| Skill 系统 | ✅ | ✅ |
| Plan Mode | ✅ | ✅ |
| Custom Instructions | ✅ | ✅ |
| MCP 工具 | ✅ | ✅ |
| 多标签页 / Fork/Rewind/Compact | ✅ | ✅ |
| 多 AI 后端 | ✅（Claude/Codex/Opencode） | ❌ 仅 KiloCode |
| CLI 安装 | 需手动安装 | **零配置自动下载** |
| 社区规模 | 12k stars | 早期 |

功能层面，KiloCode 插件和 Claudian 是同一个物种。**KiloCode 没有功能优势。**

## 差异化在哪？

差异化不在**插件层**，而在 **Agent 层**——用户手里拿的工具不同：

- **KiloCode CLI** 是 MIT 开源（vs Claude Code 闭源）
- **KiloCode CLI** 不绑定单一厂商（vs Claude Code 锁定 Anthropic）
- **零配置继承**（vs Claudian 需手动安装 Claude Code）

## 现实判断

KiloCode 插件不应该试图"做得比 Claudian 更好"——不现实。

正确策略：**如果我的工具是 KiloCode，那么用这个插件管理我的 Obsidian 知识库是最自然的选择。**

目标用户不是"所有 Obsidian 用户"，而是 **已经选择了 KiloCode 作为 AI 工具的人**。对他们来说，Claudian 不可替代 KiloCode 插件：
- 他们已经投入了 KiloCode 生态（配置、skill、工作流）
- 他们不想同时维护两个不同的 AI 工具（Claude Code + KiloCode）
- 他们信任开源工具胜过闭源黑盒

---

# 三、重新定位

## 主定位

> **用 KiloCode 来管理我的 Obsidian 个人知识库 Wiki。我是主人，KiloCode 是工具。**

## 副标题

1. "我的 Obsidian 知识库，我用 KiloCode 来打理。"
2. "我有一个 Wiki，我有一个 AI 工具。这个插件让它们对话。"
3. "人 + 知识库 = 主角。AI 是工具。这个插件是桥梁。"

## 关键叙事

- 我有我的知识库（Obsidian）
- 我有我的 AI 工具（KiloCode）
- 这个插件让它们在一起工作

**不是 "KiloCode 入驻 Obsidian"，而是 "我用 KiloCode 管理我的知识库"。**

## README Hero 建议

```md
# KiloCode for Obsidian

我的 Obsidian 知识库，我用 KiloCode 来管理。

KiloCode 是我的 AI 工具——它在终端帮我写代码，现在在 Obsidian 里帮我整理知识。
零配置：同一个工具，两个场景。配置自动继承，打开就能用。
```

---

# 四、核心价值

## 1. 我拥有我的知识库，我用工具管理它

KiloCode 是 MIT 开源的工具，不是闭源的黑盒。我的知识始终在我的掌控中。

## 2. 同一个工具，做不同的事

我已经在用 KiloCode 写代码了。现在同一个工具，在 Obsidian 里帮我整理知识。不装新东西，不重新学习。

## 3. 工具灵活，不被绑定

KiloCode 不绑定单一 AI 厂商——我想用 Claude、GPT、DeepSeek、本地模型都可以。工具听我的。

---

# 五、README 改进方案

## 现有问题

- v1 改写后仍然是 "Persistent Memory" 叙事，主语是 KiloCode
- 没有说出"我才是知识库的主人"这个角度
- 用户看了不知道这和自己的 Obsidian 使用场景有什么关系

## 新 README 结构

1. **Hero**：我的 Obsidian 知识库，我用 KiloCode 来管理
2. **人的视角**：我有一个 Wiki，我有一个工具，这个插件是桥梁
3. **Skill 驱动的知识加工**：用 markdown 定义知识处理流程
4. **Plan 模式**：只读分析我的 vault，放心
5. **功能列表**
6. **快速开始**
7. **配置 / 故障排除**

## 要删除的内容

- "一个 Obsidian 插件，把你的 KiloCode AI Agent 变成私人知识管家"——变成了"KiloCode 是管家，我是被服务的"
- "Persistent Memory" 整个概念

---

# 六、KiloCode 的工具箱 × 我的知识库管理

KiloCode 是我手里的工具箱。每个工具怎么用在知识库管理上：

| KiloCode 的工具 | 我用它来... | 举个例子 |
|----------------|------------|---------|
| Skill 系统 | 编写可复用的知识处理流程 | 我写了一个 weekly-review.md 技能：每周五跑一次，自动扫描本周日记 → 提取关键决策 → 生成周度摘要。一次编写，每周 `/skill weekly-review` 一键执行 |
| Bash / 脚本 | 批量操作笔记 | "把我文件夹里所有没有标签的笔记，根据内容自动打上标签"——一条指令，它帮我做完 |
| 文件读写 | 生成知识索引和地图 | "扫描 vault 里所有关于机器学习的笔记，生成一个带反向链接的知识地图页面" |
| MCP 工具 | 从外部往知识库"进货" | 接 Brave Search → "搜索最近一周关于 AI Agent 的最新进展，写入文献笔记" |
| Plan 模式 | 安全地分析知识库全貌 | "分析我的 vault 结构，找出知识孤岛、标签混乱"——只看不改，确认后再动手 |
| 权限控制 | 放心让它干活 | 日常用 Plan 模式分析，确认后用 Normal 模式执行。永不开 Yolo——我的数据安全第一 |
| 多标签页 | 并行处理多个知识任务 | Tab 1 在研究关联，Tab 2 在写周报，Tab 3 在整理标签 |
| Fork/Rewind | 不满意就回退重来 | "刚整理的标签我不满意 → Rewind 回退 → 调整一下 → 重新执行" |
| 会话持久化 | 知识工作的积累不丢失 | 每次整理会话自动保存——下周打开能看到上周做了什么整理 |
| 零配置 | 打开就能用 | 我已经在终端用 KiloCode 了，在 Obsidian 里打开同一个工具，什么都不用配置 |

---

# 七、功能改进路线图

## P0：叙事 & 文档层

- [x] README v1 重写（但叙事方向需要调整）
- [ ] README v2 重写：基于"人 + Obsidian 为主"的定位
- [ ] manifest.json / package.json 调整
- [ ] README_CN.md 同步

## P1：Skill 系统强化（知识库管理场景）

- [ ] 内置知识管理技能模板：
  - `weekly-review.md`：周度知识回顾
  - `tag-organizer.md`：标签规范化
  - `note-linker.md`：发现笔记关联
  - `literature-note.md`：结构化文献笔记
  - `index-generator.md`：生成索引页
- [ ] `/skill install <name>` 一键安装
- [ ] Skill Gallery：浏览 + 预览 + 安装

## P1：知识库管理特色功能

- [ ] Vault Dashboard：一目了然我的知识库状态——笔记数、标签分布、孤立笔记、最近更新
- [ ] 每周摘要：自动生成一周知识工作摘要

## P2：知识工具生态

- [ ] MCP 工具模板：web-search、rss-reader、arxiv-search
- [ ] 一键接入外部知识源

## P2：协作与分享

- [ ] Skill 分享生态：别人写的知识管理技能，我也可以装来用
- [ ] 工作流模板："研究→笔记→整理→输出"

## 不做什么

- ❌ 不和 Claudian 做功能军备竞赛
- ❌ 不追求"支持多个 AI 后端"——这和我用 KiloCode 有什么冲突？
- ❌ 不做泛化的 PKM 功能——Obsidian 本身已经很好用了

---

# 八、传播策略

## 核心策略：讲"我"的故事，不讲"KiloCode 有什么"

不要从"KiloCode 的功能"出发，要从"我管理我的知识库"出发。

## 叙事角度

**角度 1（主推）：人 + Obsidian 为主**
> "我有一个 Obsidian 知识库，里面攒了好几百篇笔记。找到了 KiloCode 这个好用的 AI 工具来管理它——这是让它们在一起的插件。"

**角度 2：同一个工具，两种用法**
> "我本来用 KiloCode 写代码。一次配置，在 Obsidian 里同一个工具也能管我的知识库。"

## 平台策略

| 平台 | 目标用户 | 叙事 |
|------|---------|------|
| r/ObsidianMD（第一优先） | Obsidian 用户，关心知识管理 | "我的 Obsidian 知识库，我用 KiloCode 管理——一个插件的分享" |
| KiloCode Discord / GitHub Discussions | 已有 KiloCode 用户 | "我用 KiloCode 管理我的 Obsidian 知识库，这是让它们打通的插件" |
| 少数派 / 知乎 | 中文 PKM 用户 | "我的 Obsidian 知识库，我用 KiloCode AI 来打理" |
| HN | 技术用户 | "Show HN: An Obsidian plugin — I use KiloCode to manage my knowledge base" |

## 帖子文案

### r/ObsidianMD（第一优先）

**标题**：I use KiloCode to manage my Obsidian knowledge base — here's how

**正文**（从"我"出发）：

```
I've been building my Obsidian knowledge base for a while. Notes, articles, research — it grows every week.

Managing it became the hard part. Finding connections, keeping tags consistent, summarizing what I learned.

I already use KiloCode CLI for coding. Same tool, now in Obsidian. Zero config — it reads my existing settings.

This is the plugin that connects KiloCode to Obsidian.
```

### KiloCode Discord

**标题**：我在 Obsidian 里用 KiloCode 管我的知识库

**正文**：

```
我有一个 Obsidian 知识库，用 KiloCode 来管它。

插件直接读我 ~/.config/kilo/kilo.jsonc 的配置。
同一个工具：终端写代码，Obsidian 管知识。

[链接]
```

---

# 九、最终判断

## 现实检验

- KiloCode 插件不是一个"全新的 Obsidian AI 体验"——Claudian 已经做得很成熟了
- 它的不可替代性不在功能，而在**工具链的统一**——如果我的 AI 工具是 KiloCode，用这个插件管理我的知识库是最自然的选择

## 核心竞争力

不是我"做得比 Claudian 好"，而是：

**我有我的知识库。我有我的 AI 工具。这个插件让它们在一起工作。**

只要 KiloCode 有人在用，这个插件就有人需要。

## 最重要的一句话

> **我有一个 Obsidian 知识库 Wiki，我用 KiloCode 来管理它。我是主人，KiloCode 是工具，这个插件是桥梁。**
