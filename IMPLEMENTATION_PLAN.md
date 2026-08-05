# KiloCode for Obsidian — 实施方案

> 本文件基于 2026-08-05 对源码（5738 行）+ 测试（24 文件）+ 构建配置的完整探查，给出可执行的改进路线。
> 与 `ROADMAP.md` 关系：ROADMAP 是里程碑视图，本文件是工程实施细节，二者互补。
> 所有问题均带代码证据（`file:line`），便于追溯与验收。

---

## 〇、优先级矩阵

| 优先级 | 维度 | 核心问题 | 对应 Phase |
|-------|------|---------|-----------|
| **P0** | 宣传 vs 实现 | i18n/Slash/MCP/InlineEdit 宣传实现不符 | Phase 0 + Phase 3 |
| **P0** | 架构可维护性 | 1003 行上帝类、mojibake 注释、双套渲染 | Phase 2 |
| **P1** | 健壮性 | runtime 无重连/心跳、错误吞没、PATH 副作用 | Phase 4 |
| **P1** | 数据可靠性 | 无 schema 版本化、非原子双写、丢失不重试 | Phase 4 |
| **P2** | 类型/质量 | `as any` 满天飞、tsconfig 不严、29 处 console | Phase 5 |
| **P2** | 安全 | API key 明文落 vault、xattr 拼接 | Phase 5 |
| **P2** | 性能 | 虚拟滚动定高假设、50 条阈值偏低 | Phase 5 |
| **P2** | 测试 | 主视图/设置 0 测试、无 e2e | Phase 1（基线）+ 各 Phase |

---

## 一、阶段划分与依赖关系

```
Phase 0  文档对齐（零代码风险，立即执行）
   │
   ▼
Phase 1  测试基线补齐（为后续重构提供安全网）
   │
   ├──────────────┐
   ▼              ▼
Phase 2        Phase 3
架构重构       功能补齐
(KiloCodeView  (i18n/Slash/MCP/
 拆分+mojibake  InlineEdit/设置项)
 +统一渲染)
   │              │
   └──────┬───────┘
          ▼
Phase 4  健壮性（runtime 重连 + 数据可靠 + Binary 安全）
          │
          ▼
Phase 5  加固（类型严格 + 清理 + 安全 + 性能 + CI）
```

**依赖说明**：
- Phase 0 可立即执行，无任何前置依赖
- Phase 1 必须早于 Phase 2，否则重构无安全网
- Phase 2 与 Phase 3 可并行，但 Phase 3 的「Slash 命令接入」依赖 Phase 2 拆出的 `SendOrchestrator`
- Phase 4 依赖 Phase 2（runtime 隔离后才能加重连）
- Phase 5 是持续加固，无强前置

---

## 二、Phase 0 — 文档对齐（宣传统一口径）

### 目标
消除 README/CHANGELOG 与实现的偏差，避免用户预期错位。**零代码改动，最低风险**。

### 涉及文件
- 修改 `README.md` / `README_CN.md`
- 修改 `CHANGELOG.md`（记录 Phase 0 的文档调整）

### 具体步骤

**0.1 标注功能状态**
将以下功能在 README 特性表与使用章节标注实际状态：

| 功能 | README 现状 | 实际 | 处理 |
|------|------------|------|------|
| i18n | "Multi-language (EN, ZH, JP, KO, and more)" | `initI18n()` 从未被调用，UI 全英文硬编码 | 标注为 **Planned** |
| Slash Commands | 列出 `/compact /clear /model /mode` 四条 | `SlashCommand.ts:53-83` handler 全 TODO；`triggerSlashCommand()` 弹 "coming soon" | 标注为 **Planned** |
| MCP Support | "Connect external tools via MCP" | `MCPManager.ts:45/73` TODO，`connected=true` 假装连上 | 标注为 **Planned (Phase B in progress)** |
| Inline Edit | "Review the diff preview → Accept/Reject" | `KiloCodeView.ts:918` 回调体是 TODO；`DiffViewer` 从未渲染 | 标注为 **Planned** |
| @mention | 详细表格说明 | `triggerMention()` 弹 "coming soon" | 标注为 **Planned** |
| Permission System | 三模式 + ApprovalModal | `ApprovalManager` 已实现但 runtime 侧 `sendApproval` 未被测试覆盖 | 标注为 **Implemented (partial)**，approval 端到端未验证 |

**0.2 修正 README「Quick Start」**
README 称「CLI binary auto-downloads from npm on first use」属实，但应补充 `PINNED_CLI_VERSION = '7.3.1'` 硬编码约束——当前不支持任意 CLI 版本，删除此约束在 Phase 4。

**0.3 CHANGELOG 条目**
在 `[Unreleased]` 下新增 `### Changed → Documentation` 区块，列出本次文档对齐。

### 验收标准
- `grep -rn "coming soon\|TODO" src` 的条目与 README 的 **Planned** 列表一一对应
- README 不再出现未声明的「已实现」功能

### 工作量
0.5 人日。

---

## 三、Phase 1 — 测试基线补齐

### 目标
为 Phase 2/3 的重构与功能改动提供安全网。覆盖当前 0 测试的关键模块。

### 涉及文件（新建）
- `tests/features/chat/KiloCodeView.test.ts`
- `tests/features/settings/SettingsTab.test.ts`
- `tests/features/commands/SlashCommand.test.ts`（命令 handler 集成测试）
- `tests/features/mention/MentionService.test.ts`
- `tests/features/inline-edit/InlineEditModal.test.ts`、`DiffViewer.test.ts`
- `tests/integration/i18n-wiring.test.ts`（验证 UI 文本经由 `t()`）

### 具体步骤

**1.1 KiloCodeView 行为测试（最高优先级）**
不测 DOM 细节，测公共行为契约。用 `tests/__mocks__/obsidian.ts` 现有 mock。

```ts
describe('KiloCodeView', () => {
  // 关键行为清单：
  it('onOpen 时无 Tab 则自动创建一个默认 Tab');
  it('handleSend 在 activeTab.isStreaming 时静默返回');
  it('handleSend 流式期间切 Tab 不污染目标 Tab 渲染');
  it('cancel 调 streamController + inputController 两者 abort');
  it('rewind 前弹确认框（当前用原生 confirm，Phase 2 改 ApprovalModal 后更新断言）');
  it('fork 达到 maxTabs 时 Notice 拒绝');
  it('restartRuntime 调 resetSession（Phase 2 改为真正 stop+start 后更新断言）');
});
```

**1.2 SettingsTab 测试**
- 每个设置项 onChange → `plugin.saveSettings()` 被调用
- Detect 按钮调 `binaryManager.autoDetect()`，成功/失败两条路径
- 缺失设置项断言：当前 SettingsTab **无 locale 选择器、无 compactKeepRecent 设置项**——写「应当存在」的失败测试，驱动 Phase 3 补齐。

**1.3 SlashCommand handler 集成测试**
当前 handler 全 TODO，直接写「期望行为」的失败测试（Red），Phase 3 实现后变 Green：
```ts
it('/compact 调 conversationController.compact', ...);
it('/clear 重置当前会话', ...);
it('/model 打开 ModelSelectModal', ...);
it('/mode 循环 planModeController', ...);
```

**1.4 i18n wiring 集成测试**
```ts
it('main.onload 调用 initI18n()', /* 当前失败，Phase 3 修复 */);
it('UI 文本经 t() 渲染', /* snapshot 关键 DOM 节点文本 */);
```

**1.5 补 InlineEditModal/DiffViewer/MentionService 单测**
- InlineEditModal：输入指令回调、空输入拒绝
- DiffViewer：新增行绿色、删除行红色、相等无 diff
- MentionService：按类型分组、上限 20 条、大小写不敏感

### 验收标准
- `npm test` 通过且 **新增测试文件数 ≥ 6**
- 关键模块覆盖率：KiloCodeView ≥ 60%、SettingsTab ≥ 70%（当前 0%）
- 所有 Red 测试明确指向 Phase 3 待实现项

### 风险与回滚
- 测试若依赖未稳定的内部接口，Phase 2 重构会频繁修测试。**对策**：测公共行为而非私有方法签名。
- 回滚：删除新增测试文件即可，不影响产物。

### 工作量
2 人日。

---

## 四、Phase 2 — 架构重构（KiloCodeView 拆分 + mojibake + 统一渲染）

### 目标
将 1003 行上帝类按职责拆分，恢复丢失的中文注释，统一消息渲染路径。这是后续所有改动的地基。

### 4.1 KiloCodeView 拆分

**目标结构**（新增文件）：
```
src/features/chat/
├── KiloCodeView.ts                 # 仅保留 ItemView 生命周期与组件编排（目标 < 250 行）
├── layout/
│   └── ChatLayoutBuilder.ts        # buildLayout/dock DOM 骨架
├── tabs/
│   └── TabBarView.ts               # updateTabBar + 事件
├── rendering/
│   └── MessageActionsHandler.ts    # rewind/fork/copy 委托
├── ui/
│   └── ModelSwitcherModal.ts       # 从 handleModelSwitch 内嵌类提取
└── controllers/
    └── SendOrchestrator.ts          # 拆 handleSend 的四段逻辑
```

**拆分步骤**：

1. **提取 `ModelSwitcherModal`**（`KiloCodeView.ts:769-823`）
   现状：`handleModelSwitch` 在方法体内 `class ModelSelectModal extends (this.app as any).Modal` 内联定义，且用 `(this.app as any).Modal` 绕类型。
   做法：抽到 `ui/ModelSwitcherModal.ts`，`import { Modal } from 'obsidian'` 直接收类型；返回 `Promise<string|null>`。

2. **提取 `ChatLayoutBuilder`**（`:173-348` 的 `buildLayout/buildModeToggle/buildToolbar/buildInputArea/buildActionBar`）
   输出 DOM 根节点与关键元素引用对象；事件注册仍留在 View（用 `registerDomEvent`，需传 View 实例或抽 `EventBinder`）。**关注点**：`registerDomEvent` 是 ItemView 方法，不能简单移出——抽 `EventBinder` 接受 register 回调注入。

3. **提取 `TabBarView`**（`:355-395` `updateTabBar` + `:417-420 truncateId`）
   接收 `tabManager` 与 `onTabClick/onNewTab` 回调；纯渲染，无业务。

4. **提取 `SendOrchestrator`**（`:599-761` `handleSend`）
   `handleSend` 当前是单方法 162 行巨型。拆为四段：
   ```ts
   class SendOrchestrator {
     async send(content: string, ctx: SendContext): Promise<void> {
       const prep = this.prepareSend(content, ctx);     // 段1: 会话/消息前缀/图片/当前笔记
       const runtime = await this.acquireRuntime(ctx);  // 段2: runtime 启动/approval 配置
       const msg = await this.consumeStream(runtime, prep, ctx); // 段3: 流式消费
       await this.finalize(msg, ctx);                   // 段4: 落库/清图片/清状态
     }
   }
   ```
   `SendContext` 持有 `activeTab/tabId/generation/senderTabId`，便于 finally 统一清理。

5. **提取 `MessageActionsHandler`**（`:922-1000` `registerMessageActionListeners/handleRewind/handleFork/handleCopy`）
   注入 `conversationController/tabManager/chatState`，输出事件。

**保留在 View 的**：`onOpen/onClose/getViewType` + 组件实例化与 dispose 编排。

### 4.2 mojibake 注释恢复

**现状**：`KiloCodeView.ts` 全文中文注释为 GBK→Latin1→UTF-8 双重编码毁坏的字符（如 `閲嶆瀯锛氬€熼壌` 实为「重构：借鉴」）。`src/features/chat/ui/ImageContext.ts:1` 有 1 行真高位字节。

**做法**：
1. 对 `KiloCodeView.ts`、`ImageContext.ts` 执行：
   ```bash
   iconv -f UTF-8 -t LATIN1 < 文件 | iconv -f GBK -t UTF-8 > 文件.recovered
   ```
   前置验证：先对单行 sample 验证恢复正确性再批处理。
2. 人工 review 恢复内容，修正无法自动恢复的术语（如 CLI 专有名词）。
3. 对注释内容做最小重写，使其准确反映 Phase 2 后的新结构。
4. 其余文件已是正常 UTF-8 中文（grep 确认仅这两个文件有问题）。

**验收**：`iconv` 后 `grep -P "[\x80-\xff]"` 仍命中但语义可读；交由母语 reviewer 抽查 3 处。

### 4.3 统一渲染路径

**现状**：三套渲染——用户消息走 `View.appendUserMessage()`（`:439`，直接 `createSpan` 无 Markdown），助手消息走 `MessageRenderer.renderMessage()`，工具调用回 `View.renderToolCall()`（`:825`，直接操作 DOM）。

**目标**：所有消息统一入口 `MessageRenderer.appendMessage(msg)`，移除 View 中的 `appendUserMessage`/`renderToolCall`/`updateToolCallResult`。

**做法**：
1. `MessageRenderer` 新增 `appendUserMessage(content): HTMLElement`，用户消息也渲染 header + Markdown（与助手一致），但禁止操作按钮（用户消息不可 rewind/fork）。
2. 工具调用渲染从 View 移入 `MessageRenderer.renderToolCallStreaming()`，与 `renderToolCall`（批量恢复用）共用内部 `renderToolCallInternal`。
3. `appendToolResult(id, result)` 暴力 `updateToolCallResult`，移除 View 中的 `querySelector('[data-tool-id]...')`。
4. VirtualScroller 覆盖所有角色消息（当前只对助手生效，见 §8）。

**验收**：
- View 中无 `createDiv/createEl/createSpan` 直接构造消息相关 DOM（layout DOM 除外）
- 用户消息支持 Markdown 渲染（测试：发送含 `## h2` 的用户消息应渲染为标题）

### 4.4 `restartRuntime` 实现修正

**现状**：`KiloCodeView.ts:582-592` 注释承诺「停止当前进程并让下一次创建新进程」，实现只 `resetSession()`（清 sessionId），进程仍存活。

**做法**：
```ts
async restartRuntime(): Promise<void> {
  const runtime = this.inputController.getRuntime();
  if (runtime) {
    await runtime.stop();     // 真正 kill 进程
    this.inputController.setRuntime(null);
  }
  new Notice('KiloCode runtime stopped. Next message starts a fresh CLI.');
}
```
注意 `ChatRuntime.stop()` 已存在（`KiloCodeChatRuntime.stop():42`），调用即可。

### 4.5 `handleTabClick` ChatState 同步补全

**现状**：`KiloCodeView.ts:494` 有 `// 同步 ChatState` 空行。

**做法**：在 `switchTo` 后 `this.chatState.setConversationId(tab.state.conversationId)`。

### 验收标准
- `KiloCodeView.ts` 行数 < 250
- `npm run typecheck && npm run lint && npm test` 全绿
- Phase 1 的 KiloCodeView 测试零修改仍通过（行为契约未变）
- 无新增 `as any`（用 `grep -c "as any"` 对比前后）

### 风险与回滚
- 拆分顺序错误会导致中间态不可编译。**顺序**：先提取无依赖的 Modal/Layout/TabBar → 再 SendOrchestrator → 最后 MessageActionsHandler，每步 commit + typecheck。
- 单 Phase 2 commit 太大不利于 review。**对策**：拆成 4 个子 PR（4.1.1 ~ 4.1.5 + 4.2 + 4.3 + 4.4/4.5）。
- 全程依托 Phase 1 安全网。

### 工作量
4 人日。

---

## 五、Phase 3 — 功能补齐（宣传 vs 实现对齐）

### 目标
实现 README 已宣传但未落地的功能，或使 Phase 0 标注的 Planned 项变为 Implemented。每项独立、可单独发版。

### 5.1 i18n 全链路接入

**涉及文件**：
- 修改 `src/main.ts`（调 `initI18n()`）
- 修改 `src/features/settings/SettingsTab.ts`（加语言下拉）
- 修改 `src/app/settings/defaultSettings.ts`（接入 `locale` 字段）
- 修改所有含用户可见文本的文件（替换字符串为 `t()`）
- 新增 `src/i18n/locales/ja.json`、`ko.json`（README 已宣传）
- 修改 `src/i18n/index.ts`（`Locale` 类型扩为 `'en'|'zh'|'ja'|'ko'`）

**做法**：
1. `main.onload` 顶部：`initI18n(this.settings.locale as Locale || detectLocale())`
2. `SettingsTab` 在 General 段加语言下拉，onChange → `setLocale + saveSettings + 通知用户重开视图生效`
3. 文本替换分批：
   - 第一批：`KiloCodeView` 的硬编码（`'You'/'Send'/'Cancel'/'AI is responding...'` + `getRandomPlaceholder()` 5 条）
   - 第二批：`MessageRenderer`（`'Thinking...'/'Copied!'/'Read File'/'⏳ Pending'` 等工具状态）
   - 第三批：`SettingsTab` 53 处 Setting 的 name/desc
   - 第四批：`ApprovalModal`、`ErrorNotice`、Inline Edit
4. `ij`/`ko` locale 用 en 作为兜底翻译（Phase 5 再校对）。

**验收**：
- Phase 1 的 `i18n-wiring.test.ts` 全部 Green
- 切换 locale 后所有 UI 文本立即变化（除依赖 MarkdownRenderer 的部分，记为 Phase 5 优化项）
- `t('nonexistent.key')` 返回 key 本身（已有测试）

### 5.2 Slash Commands 接入 + handler 实现

**涉及文件**：
- 修改 `src/features/chat/KiloCodeView.ts`（或拆出的 `SendOrchestrator`）
- 修改 `src/features/commands/SlashCommand.ts`（实现 handler）
- 修改 `src/features/commands/CommandPalette.ts`（确认被视图使用）

**做法**：
1. `KiloCodeView` 注入 `CommandRegistry`（构造时调 `createDefaultCommandRegistry()`）。
2. `triggerSlashCommand()` 改为：检测输入框当前文本为 `/<前缀>` → 打开 `CommandPalette` → 选中 handler → 替换输入框为命令结果或执行命令。
3. handler 实现：
   ```ts
   registry.register({ id:'compact', handler: () => conversationController.compact(settings.compactKeepRecent) });
   registry.register({ id:'clear',   handler: async () => { await conversationController.deleteCurrent(); conversationController.createNew(); } });
   registry.register({ id:'model',   handler: () => modelSwitcher.open() });
   registry.register({ id:'mode',    handler: () => planModeController.cycleMode() });
   ```
4. handler 接收 `args`：`/clear <tabId>` 等可选参数（Phase 5 完善）。

**验收**：Phase 1 的 SlashCommand 集成测试 Green。

### 5.3 MCPManager 真正接入（或明确透传策略）

ROADMAP 「Phase B: MCP Server 透传」已列入进行中。两种实现路径，需先决策：

**路径 A（推荐）— 透传给 `kilo serve`**：
- 插件级 MCP 配置（`vault/.kilocode/mcp.json`）由 `KiloCodeChatRuntime.ensureServer()` 在启动时注入 CLI 启动参数/环境变量
- 插件不直接 spawn MCP server 进程，CLI 自己管理
- `MCPManager` 退化为「配置读写 + 状态查询」层，不承载连接逻辑
- 优点：与 CLI 行为一致，无重复实现；缺点：MCP 生命周期不可视化

**路径 B — 插件自管 MCP 进程**：
- `MCPManager.connectServer` 用 `@modelcontextprotocol/sdk` spawn server，走 stdio JSON-RPC
- 与 `kilo serve` 通过 `event.subscribe` 互通工具列表
- 优点：UI 可显示连接状态/工具数；缺点：与 CLI 双重管理、协议同步成本高

**建议**：选路径 A，UI 状态用 `event.subscribe` 的 `mcp.server.changed` 事件反向呈现。

**无论哪条，需修改**：
- `src/features/mcp/MCPManager.ts:45` `connected = true` 假装连上 → 真实状态
- `:73` `callTool` TODO → 透传或移除（路径 A 下 callTool 不在插件层）
- `src/features/mention/MentionService.ts` MCP server 项从「列出空壳」改为「列真实已连接」

### 5.4 Inline Edit 调 CLI + Diff 预览

**涉及文件**：
- 修改 `src/features/chat/KiloCodeView.ts:916-919`（或拆出的 inline-edit 流程）
- 启用 `src/features/inline-edit/DiffViewer.ts`（当前从未被渲染）

**做法**：
```ts
async function runInlineEdit(selectedText: string, instruction: string, file: TFile) {
  const runtime = await getOrCreateRuntime();
  // 用 plan mode 发送，避免直接写文件，拿到 AI 建议
  const result = await collectStream(runtime.sendMessage(
    inlineEditPrompt(file.path, selectedText, instruction, /* mode=plan */)
  ));
  const newText = result.content;
  // 渲染 diff
  const modal = new InlineEditModal(app, selectedText, async () => {}, /* showDiff= */ true);
  modal.attachDiff(DiffViewer.render(selectedText, newText));
  modal.onAccept(() => vault.modify(file, newText));
  modal.open();
}
```
`DiffViewer` 已有逐行 diff 实现，只需接入到 Modal。

**验收**：
- 选中笔记文本 → Ctrl+Shift+E → 输入指令 → 看到 diff → Accept 写入 / Reject 取消
- README 移除 Phase 0 的 Planned 标注

### 5.5 三个无效设置项落实

| 设置项 | 现状 | 做法 |
|--------|------|------|
| `temperature` | `KiloCodeChatRuntime.buildModelConfig():206` 未传 | 在 `buildModelConfig()` 输出加 `temperature: settings.temperature`，确认 CLI `session.create` 接受；若 CLI 不接受改由环境变量传 |
| `chatViewPlacement` | `main.ts:87` 硬编码 `getRightLeaf` | `activateView()` 据 placement 选 `getRightLeaf/getLeftLeaf/getLeaf(false)` 三条路径 |
| `locale` | 无 UI、无读取 | 见 §5.1 |
| `compactKeepRecent` `types` 有字段 SettingsTab 无设置项 | `/compact` 用默认 5 | SettingsTab Chat 段加 slider；Slash `/compact [n]` 优先用参数 |

**验收**：Phase 1 的 SettingsTab 失败测试 Green。

### 5.6 `restartRuntime` 见 Phase 2.4（已列）

### 验收标准
- README 的 Implemented 列表与 `grep -c "coming soon"' src` 数量一致
- Phase 1 中所有 Red 测试转 Green
- 每 5.x 独立 commit、独立 CHANGELOG 条目

### 风险与回滚
- §5.3 MCP 路径选择影响较大。**对策**：先做 §5.3 的决策 PoC（用 1 小时验证 `kilo serve` 是否支持 MCP 启动参数 + `mcp.server.changed` 事件）再下手。
- §5.4 inline edit 依赖 CLI 返回纯文本而非直接写文件，需验证 plan mode 行为。

### 工作量
- §5.1 i18n：2 人日
- §5.2 Slash：1 人日
- §5.3 MCP：2 人日（含路径决策 PoC）
- §5.4 Inline Edit：1.5 人日
- §5.5 设置项：0.5 人日
- 合计 **7 人日**

---

## 六、Phase 4 — 健壮性（runtime + 数据 + Binary）

### 目标
让长会话、网络抖动、进程崩溃、磁盘异常下不再静默失败或丢数据。

### 6.1 KiloCodeChatRuntime 健壮性

**涉及文件**：`src/providers/kilocode/runtime/KiloCodeChatRuntime.ts`

#### 6.1.1 健康检查与自动重连
**现状**：`ensureServer()` 只在启动时跑，`kilo serve` 进程崩溃后无感知，后续所有调用静默失败。

**做法**：
```ts
private async ensureAlive(): Promise<void> {
  if (!this.serverHandle || !this.client) return;
  // 心跳：轻量调 client.session.list，超时即认为进程死
  try {
    await withTimeout((this.client as any).session.list(), 3000);
  } catch {
    await this.stop();
    this.serverHandle = null; this.client = null; this.sessionId = null;
    await this.start();  // 重建
  }
}
// sendMessage 入口先 ensureAlive()
```
配合 `event.subscribe` 的 `server.disconnected` 事件主动触发重建。

#### 6.1.2 sessionId 失效自动重建
**现状**：`sessionId` 一旦创建永久复用，CLI 端 session 失效后持续报错。
**做法**：`session.prompt` 返回 `session.notFound`（或类似）时清 `sessionId` 并重试一次（带 generation 不变保证）。

#### 6.1.3 错误吞没收敛
**现状**：`:47/51/77/164` 多处 `catch {}` / `.catch(() => {})`。
**做法**：
- `stop()`/`cancel()` 的 abort 失败：`console.warn('[KiloCode] stop/abort failed', err)`
- `sendApproval` 失败（`:164`）：`Notice('Failed to send approval: ' + err)` + 一次重试
- 所有 `catch` 至少留日志，禁止空体

#### 6.1.4 `process.env.PATH` 隔离
**现状**：`:194` 直接改全局 `process.env.PATH`，多窗口/多插件污染且每次 start 累积。
**做法**：把 enriched PATH 通过 `createKiloServer` 的 env 选项传给子进程（若 SDK 支持），否则在 `ensureServer` 局部变量构造后只用于本次 spawn，不写回 `process.env`。

#### 6.1.5 流式超时
**现状**：`event.subscribe` 无空闲超时，网络卡住用户只能 Cancel。
**做法**：每个 `parseEvent` yield 后重置 30s 空闲计时器，超时 yield `{ type: 'error', error: 'Stream idle timeout' }` + `{ type: 'done' }`。

### 6.2 ConversationService 数据可靠性

**涉及文件**：`src/features/chat/services/ConversationService.ts`

#### 6.2.1 序列化 schema 版本化（ROADMAP 已列）
**现状**：`saveMessages():357` 直接 `JSON.stringify`，无版本字段。
**做法**：
```ts
const SCHEMA_VERSION = 2;
interface PersistedConversation {
  schemaVersion: number;
  conversation: ConversationMeta;
}
// save 时包裹 { schemaVersion: SCHEMA_VERSION, conversation }
// load 时：v1 → v2 迁移（如 contentBlocks 字段空时填充）
// 迁移失败保留原文件，记录 warn
```

#### 6.2.2 原子写
**现状**：`saveMetadata + saveMessages` 双次 `adapter.write`，中途崩溃不一致。
**做法**：
- Obsidian `vault.adapter` 不支持 atomic rename，但支持 `.tmp` 中转：写 `.json.tmp` → 成功后 `remove` 旧 `.json` → `rename .tmp → .json`（若 adapter 无 rename 则 read 当前 → 失败回滚内容）
- 简化版：先 `saveMessages`（关键数据）成功后 `saveMetadata`，失败时回滚 messages（保留内存版本，标记 dirty 下次重写）

#### 6.2.3 flushDirty 失败定时重试
**现状**：`:66` 写失败重新加入 `dirtyConversations`，但无定时器，下一消息才触发。
**做法**：`flushDirty` catch 中 `setTimeout(() => this.scheduleSave(), 5000)` 启动独立重试定时器，并设最大重试次数（3 次）后告警。

#### 6.2.4 `loadMessages` 类型校验 + 空会话 IO 优化
**现状**：`:396` 直接 `as Message[]`；`getConversation` 用 `messages.length === 0` 判断加载（`:111`），新建空会话每次调用都触发空 IO。
**做法**：
- `loadMessages` 后做 `Array.isArray && every(m => m.id && m.role)` 校验，失败返回 `[]` + warn
- Conversation 加 `messagesLoaded: boolean` 标记，`getConversation` 只在 `!messagesLoaded` 时加载

#### 6.2.5 多窗口并发（评估项）
**现状**：无文件锁，两窗口同写互相覆盖。
**评估**：Obsidian 插件跨窗口文件锁复杂（需 IPC）。**短期不解决**，归入 Phase 5 评估；长期可用 workspaceId+timestamp 写入ominated 模式或 disallow 跨窗口编辑同会话。

### 6.3 BinaryManager 健壮性

**涉及文件**：`src/core/binary/BinaryManager.ts`

#### 6.3.1 下载校验和 + 原子写
**现状**：`writeBinary():302` 无 sha256；`unlinkSync + writeFileSync` 非原子。
**做法**：
- 下载时同步取 npm tarball 的 shasum（npm registry `packument` 含 `dist.shasum`），下载后校验 sha256
- 写入 `.bin/kilo.new` → 校验通过 → `unlinkSync kilo` → `renameSync kilo.new kilo` → 写 version 文件
- 校验失败删除 `.new`，标记下载失败，不污染现有二进制

#### 6.3.2 异步化 execSync
**现状**：`findWithWhere():158`、`findInGlobalPaths():212` `npm root -g` 用 `execSync`，PowerShell 启动数秒阻塞 UI。
**做法**：改 `util.promisify(exec)` 或 `spawn` + Promise，全部走 async。

#### 6.3.3 系统二进制版本一致性
**现状**：`findInPath` 找到 `kilo` 不校验版本，与 SDK `^7.3.1` 可能不符却仍使用。
**做法**：找到后 spawn `kilo --version`，解析版本与 `PINNED_CLI_VERSION` 比较，不匹配则降级到下载（记 Notice 提示）。

#### 6.3.4 下载进度反馈
**现状**：`downloadAndCache` 只首尾 Notice。
**做法**：`npmDownloader` 接口加 `onProgress?: (loaded, total) => void`，BinaryManager 用 Obsidian `Notice` 周期更新进度文本（节流 500ms）。

### 6.4 PINNED_CLI_VERSION 解耦
**现状**：`BinaryManager.ts:9` 硬编码 `'7.3.1'` 与 `package.json` `@kilocode/sdk: ^7.3.1` 手动同步。
**做法**：从 `package.json` 的 `dependencies['@kilocode/sdk']` 解析版本（减 `^`），单一来源。

### 验收标准
- 模拟 kill `kilo serve` 进程：下条消息自动重建（测试 mock `start` 被再次调用）
- 模拟 messages 写入失败：5 秒后自动重试，3 次失败后 Notice
- 下载二进制：提供伪造 tarball → 校验失败 → 现有二进制不受影响
- 新测试：`runtime-reconnect.test.ts`、`conversation-retry.test.ts`、`binary-integrity.test.ts`

### 工作量
- §6.1：2.5 人日
- §6.2：2 人日
- §6.3：1.5 人日
- §6.4：0.5 人日
- 合计 **6.5 人日**

---

## 七、Phase 5 — 加固（类型/清理/安全/性能/CI）

> 此 Phase 各小节相互独立，可持续滚动。

### 7.1 tsconfig 严格化
**现状**：`tsconfig.json` 仅开 `noImplicitAny + strictNullChecks`。
**做法**：阶段性开 `strict: true`：
1. 先开 `strictBindCallApply / strictFunctionTypes`（影响小，修 ts 报错）
2. 再开 `useUnknownInCatchVariables`（`catch (err)` 中 `err` 改 `unknown` 后 `err instanceof Error` 判定）——批量修当前 `err.message` 直用
3. 再开 `noUnusedLocals / noUnusedParameters`（清理死亡变量）
4. 最后 `noImplicitReturns / noFallthroughCasesInSwitch`（StreamController `switch` 已默认）

**验收**：`tsc --noEmit` 0 error；CI 增 `strict` 标志。

### 7.2 类型 `as any` 收敛
**现状**：`KiloCodeChatRuntime.ts` 大量 `(this.client.session as any).create`、`SettingsTab.ts` 已修复 Modal 类。
**做法**：
- 写 `src/providers/kilocode/runtime/kilo-client.d.ts` 描述 SDK 实际可用方法签名（基于读 `@kilocode/sdk/dist/*.d.ts`）
- runtime 中 `as KiloApi` 替代 `as any`，编译期捕获拼写错误

### 7.3 调试日志清理（ROADMAP 已列）
**现状**：29 处 `console.*`。
**做法**：
- esbuild `prod` 加 `drop: ['console','debug']`、`pure: ['console.log']`
- 保留 `console.error`（经 `ErrorNotice` 转化）或全部走 logger 门面
- 测试不应依赖 console 输出（用 mock spy 替代）

### 7.4 死代码删除
**现状**：`KiloCodeChatRuntime.parseSSEBlock():235` 定义无调用（旧子进程模式遗留）；`StreamMessage` 类型 vs `StreamChunk` 重复。
**做法**：删 `parseSSEBlock`、合并 `StreamMessage→StreamChunk`、删 `KiloCodeView` 中 Phase 2 后无用的私有方法。

### 7.5 安全加固

#### 7.5.1 xattr 命令注入
**现状**：`BinaryManager.ts:327` `execSync('xattr -d ... "' + binaryPath + '"')` 路径含引号有注入风险。
**做法**：`spawnSync('xattr', ['-d', 'com.apple.quarantine', binaryPath], { timeout: 3000 })`。

#### 7.5.2 API key 存储加固
**现状**：`apiKey` 存 `data.json`（vault 内），SettingsTab 已警告但仍可填。
**做法**：
- 检测 Obsidian `secretStorage`（Electron `safeStorage`）API 可用性，可用则加密存储
- 不可用时：填入 API key 时 Notice 强提示风险 + 提供「仅 CLI 配置」引导
- `.gitignore` 已包含 `.kilo` 等，确保 `data.json` 不入 Git（检查现有 `.gitignore`）

#### 7.5.3 路径注入
**现状**：`ConversationService.validateId():32` 已校验 `conv-\d{13}-[a-z0-9]{7}`，良好。BinaryManager `settings.cliPath` 直接 `execSync`/`spawn` 路径——若用户填入恶意命令会执行。
**评估**：用户自填路径风险自担，记为可接受；补充 `cliPath` 基本校验（必须是文件存在 + 非 stdin 长度上限）。

### 7.6 性能优化

#### 7.6.1 虚拟滚动动态高度
**现状**：`MessageRenderer.ts:139` `VirtualScroller` 用 `itemHeight: 100` 固定值，消息高度差异大导致滚动跳动。
**做法**：
- 替换为基于 `IntersectionObserver` 的「窗口化」方案：渲染视口上下 `overscan` 个节点，回收远端节点
- 或 `VirtualScroller` 支持动态测量：先用 estimate 高度占位，挂载后测真实高度更新缓存

#### 7.6.2 50 条阈值
**现状**：`:137` 超 50 条启用虚拟滚动，前 50 条全量 Markdown 渲染仍可能卡顿。
**做法**：阈值降到 20；前 20 条用 `requestIdleCallback` 分批 `MarkdownRenderer.renderMarkdown`，避免首帧阻塞。

#### 7.6.3 重型 DOM 节点回收
**现状**：长会话切 Tab 时 `container.empty()` 丢弃所有节点，含已渲染的 Markdown 含代码块 highlight。
**做法**：LRU 缓存最近 5 个 Tab 的 DOM 片段（`DocumentFragment`），切回时不重渲。

### 7.7 CI 加固
**涉及文件**：`.github/workflows/ci.yml`、`package.json`

- 加覆盖率门槛：`jest --coverage --coverageThreshold='{"global":{"lines":70,"branches":60}}'`，CI 失败
- 加覆盖率上传（Codecov 可选）
- 加 `npm audit` 中危以上 fail
- 拆分 lint/typecheck/test 并行 job 加速
- 加 release workflow 的 `main.js` 体积检查（< 阈值如 200KB）

### 7.8 README 二次对齐
Phase 3 完成后更新 Implemented 列表；Phase 5 完成后补充 `CONTRIBUTING.md`、`DEVELOPMENT.md`（构建/测试/调试指南）。

### 验收标准
- tsconfig `strict: true` 全开、0 error
- `grep -c "as any" src/**/*.ts` 较 Phase 4 减少 ≥ 80%
- `npm audit` 无 high 以上漏洞
- CI 含覆盖率门槛
- 虚拟滚动测试：长会话快速滚动无卡顿（手动验收 + 计时）

### 工作量
- §7.1 ~ §7.4：2 人日
- §7.5 安全：1 人日
- §7.6 性能：2 人日
- §7.7-7.8：1 人日
- 合计 **6 人日**（持续滚动）

---

## 八、横切策略

### 8.1 测试策略
- **金字塔**：单元（70%）> 集成（25%）> e2e（5%）
- 任何新功能 PR 必须先带 Red 测试；任何重构 PR 不得改测试断言含义
- Mock 边界：`obsidian` API、`@kilocode/sdk`、`child_process`；其余用真实实现
- Phase 1 引入 `tests/helpers/`（构造 settings/app/vault 的工厂函数），消除每个测试文件的重复 mock
- e2e（Phase 5 选做）：用 `playwright-core`（已在 devDeps）驱动真实 Obsidian + CLI

### 8.2 验证清单（每次改动）
每次 PR 合并前**必须**：
1. `npm run typecheck` 0 error
2. `npm run lint` 0 error
3. `npm run build` exit 0
4. `npm test` 0 failures 且覆盖率不下降
5. CHANGELOG `\n### Changed/Added/Fixed` 记录本次改动
6. 若改 README 功能，同步 Phase 0 的状态标注

违反「完成验证」铁律：**没有运行验证命令 = 不能声称通过**。

### 8.3 单一职责原则
每次 commit 只做一件事，不混合多个变更（全局规则第三条）。Phase 拆分示例：
- Phase 2 拆 4 个 PR（Modal/Layout/TabBar 一组，SendOrchestrator 一组，mojibake 一组，统一渲染一组）
- Phase 3 每个 §5.x 独立 PR
- Phase 4 三大块（runtime/数据/binary）各一 PR

### 8.4 回滚策略
- 所有改动在分支进行，`main` 只接收通过 CI 的 PR
- 关键 Phase（2/4）合并前部署到内测 vault 试用 2 天
- 出现回归：通过 git revert 单个 PR，不影响其他 Phase
- 数据迁移（Phase 6.2.1 schema 版本化）必须保留旧 schema 文件副本直到下一 release

### 8.5 调试流程（systematic-debugging）
遇到 bug 必先根因再修复（全局规则第九条）：
1. 读错误信息 → 稳定复现 → 检查最近变更 → 追踪数据流
2. 对比正常代码路径
3. 单一假设、一次改一个变量
4. 失败测试 → 单一修复 → 验证通过
- 红线：连续 3 次修复失败 → 停止，质疑架构设计

### 8.6 注释与文档
- 注释密度与现有一致（Phase 2 恢复 mojibake 后再统一）
- 复杂 pipeline / 外部依赖特殊用法 / 兜底降级 / magic number 必须写注释
- 临时 hack 不写
- 每个 Phase 完成更新本文件的「实施记录」段（见 §十一）

---

## 九、工作量与里程碑

| Phase | 主题 | 人日 | 关键里程碑 | 建议节奏 |
|-------|------|------|-----------|---------|
| 0 | 文档对齐 | 0.5 | README 不再过度宣传 | Week 1 |
| 1 | 测试基线 | 2 | 主视图/设置覆盖率达标 | Week 1-2 |
| 2 | 架构重构 | 4 | KiloCodeView < 250 行；mojibake 恢复 | Week 2-3 |
| 3 | 功能补齐 | 7 | i18n/Slash/MCP/InlineEdit 全 Implemented | Week 4-5 |
| 4 | 健壮性 | 6.5 | runtime 重连/数据可靠/binary 校验 | Week 6-7 |
| 5 | 加固 | 6（滚动） | strict 严格化/CI 门槛/性能优化 | Week 8-10 |
| **合计** | | **26 人日** | | ~10 周 |

**说明**：
- 1 人日 = 6 小时有效编码
- Phase 2/3 可并行 1 人达加速
- Phase 5 滚动，与发布版本解耦
- 优先级 P0 项（Phase 0/2/3）应在 4 周内完成，避免用户预期持续错位

---

## 十、决策点（需用户/团队表态）

以下决策影响实施方案，需在 Phase 启动前明确：

1. **MCP 接入路径**（Phase 5.3）：路径 A 透传 vs 路径 B 插件自管
2. **API key 存储**（Phase 7.5.2）：是否引入 `safeStorage` 加密（Electron API 可用性需验证）
3. **多窗口并发**（Phase 6.2.5）：是否当前列为已知限制 vs 立即解决
4. **虚拟滚动方案**（Phase 7.6.1）：IntersectionObserver vs 动态高度 VirtualScroller
5. **locale 补全范围**（Phase 5.1）：en/zh/ja/ko 是否在 5.1 一次到位 vs 先 en/zh 验证
6. **严格化节奏**（Phase 7.1）：是否一次性开 `strict: true` 接受短期红 vs 阶段性渐进
7. **e2e 引入**（Phase 5.7 选做）：是否在 Phase 5 引入 Playwright e2e

---

## 十一、实施记录（随推进更新）

> 完成的 Phase 在此追加「完成日期 + 达成情况 + 偏差说明」。

### Phase 0 — 完成 2026-08-05
- 达成：
  - README.md / README_CN.md 特性表为 6 项功能标注状态（Inline Edit / Slash / @mention / MCP / i18n → Planned；Permission → Implemented (partial)），并附状态图例
  - Usage 章节同步标注（Inline Edit / Slash / @mention / Permission / MCP Servers 配置段 + Input Toolbar 表格中 4 个 "coming soon" 按钮）
  - Roadmap 清单 5 项名不副实的 `[x]` 改为 `[ ]` 并注明原因
  - Quick Start 补充 `PINNED_CLI_VERSION = '7.3.1'` 硬编码约束说明（中英双语）
  - CHANGELOG 新增 `### Changed (Documentation)` 区块
- 偏差：
  - 额外修复 `tests/core/binary/BinaryManager.test.ts` 的环境依赖缺陷（`/custom/kilo` 路径在 Windows/CI 不存在导致测试失败，改用 tmpDir 内真实文件）——该测试挡在「npm test 0 failures」基线前，属测试隔离修复，非产品代码变更
  - Phase 0.1 表格未列 Input Toolbar 的 📝/📎 按钮，但代码中同为 "coming soon"，按验收标准一并标注
- 后续遗留：Phase 1（测试基线补齐）

### Phase 1 — 完成 2026-08-05
- 达成：
  - 新增 7 个测试文件 + 2 个 helper 文件（`tests/helpers/obsidianDom.ts`、`tests/helpers/factory.ts`），全量 304 绿 / 8 个预期 Red（全部 @phase3）
  - KiloCodeView：21 用例，Stmts 61.12% / Lines 65.01%（目标 ≥60% ✓）
  - SettingsTab：17 用例，Stmts 90.9%（目标 ≥70% ✓）
  - SlashCommand：3 绿 + 4 Red（/compact /clear /model /mode 期望行为）
  - i18n-wiring：2 Red（main.onload 调 initI18n；发送按钮经 t() 渲染）
  - InlineEditModal / DiffViewer / MentionService：17 用例全绿
  - Red 测试统一以 `@phase3` 标注，全部指向 Phase 3 待实现项
- 偏差：
  - SlashCommand Red 测试通过 `(createDefaultCommandRegistry as any)(deps)` 注入依赖，以行为断言方式表达 Phase 3 §5.2 的期望接口（依赖注入参数），Phase 3 实现时按此签名落地即可转 Green
  - i18n-wiring 测试 2 用「t() 返回唯一标记 + 断言按钮文本」表达「UI 文本经 t() 渲染」契约
- 后续遗留：Phase 2（架构重构）——Phase 1 的 KiloCodeView 测试为行为契约，重构后应零修改通过

### Phase 2 — 完成 2026-08-05
- 达成：
  - KiloCodeView 从 1003 行拆至 632 行（-37%），新增 7 个组件：ModelSwitcherModal / ChatLayoutBuilder / TabBarView / SendOrchestrator / TabController / MessageActionsHandler / ViewActions，均通过 deps 回调注入解耦
  - mojibake 注释全部人工重写为正确中文（含 PUA 私有区字符修复），`grep` 验证残留为 0
  - 统一渲染路径：用户消息走 `MessageRenderer.appendUserMessage`（Markdown + 无操作按钮），工具调用走 `renderToolCallStreaming`/`appendToolResult`，View 旧渲染方法全部删除
  - `restartRuntime` 真正 stop 进程（§4.4）；`handleTabClick` ChatState 同步补全（§4.5）
  - KiloCodeView 中 `as any` = 0（对比提取前多处 `(this.app as any).Modal`）
  - 全量 304 绿 / 8 预期 Red @phase3、typecheck 0 error；Phase 1 KiloCodeView 测试仅 3 处按计划 1.1 预言的断言更新（restartRuntime stop、ViewActions 迁移位置）
- 偏差：
  - **行数目标未达 <250**（实际 632）：计划 4.1 的 5 文件清单提取完成后行数仍远超 250，剩余代码为构造期依赖注入（~150 行）、生命周期与命令注册（~90 行）、事件注册（~120 行）、委托与 UI 状态（~120 行）。继续压缩需把 deps 工厂整体外置（createViewComponents），边际收益低、回归风险高，按 KISS 原则止步。职责边界已清晰，留待 Phase 5 清理期按需评估
  - mojibake 恢复路径偏离：计划假设 GBK→Latin1→UTF-8 标准链，实测文件含 PUA 私有区字符（GBK 字节映射到 U+E000-U+F8FF），iconv 双链与 8 编码暴力搜索均不可逆，改为全人工重写（计划 4.2 步骤 3 的主路径）
  - PUA 字符使 Edit 工具无法匹配，采用 Python 字节级替换（ASCII 方法签名锚点）
- 后续遗留：Phase 3（功能补齐）——8 个 Red 测试已就绪；ViewActions 的 coming-soon 方法为 Phase 3 接入点

### Phase 3（§5.3 MCP 路径 A 透传）— 完成 2026-08-05
- 达成：
  - **决策 PoC**：验证 `createKiloServer({ config })` 将 `config.mcp` 经 `KILO_CONFIG_CONTENT` 注入 `kilo serve`（SDK `mergeConfig` 深度合并 mcp）；`Event` 联合类型无 `mcp.server.changed` → 状态呈现改用 `client.mcp.status()`（connected/disabled/failed+error/needs_auth/needs_client_registration）
  - MCPManager 重构为「配置容器 + 状态查询」层：删假连接与 callTool TODO，新增 setConfigs/getConfigs/removeConfig/applyStatus，getServers 合并真实状态
  - Runtime 新增 mcpConfigProvider 注入（vault/.kilocode/mcp.json → serve 启动参数）+ getMcpStatus() 查询
  - createKilocodeRegistration / main.ts 接线；MentionService mcp-server 只列 connected: true
  - 删除死代码 MCPToolAdapter
  - 全量 323 绿 / 0 Red、typecheck 0 error
- 偏差：
  - 计划假设的 `mcp.server.changed` 事件不存在（PoC 关键发现）→ 状态由轮询/按需 `client.mcp.status()` 提供，无推送订阅
  - MCP 配置写入入口（设置 UI）未在本轮实现（无消费方），MCPManager 只承载读取 + 状态查询
- 后续遗留：§5.4 Inline Edit、§5.5 剩余（temperature 透传 / chatViewPlacement）、Phase 4

### Phase 3（部分）— 完成 2026-08-05（§5.1 / §5.2 / §5.5 设置项）
- 达成：
  - §5.1 i18n 全链路：`initI18n` 接入 main.onload、Locale 扩为 4 语言 + ja/ko 兜底词典、SettingsTab Language 下拉、全量 UI 文本 t() 化（KiloCodeView / MessageRenderer / SettingsTab 41 处 / ApprovalModal / InlineEditModal / ChatLayoutBuilder）
  - §5.2 Slash 命令：`createDefaultCommandRegistry(deps)` 依赖注入 + 4 个 handler 实现 + `ConversationController.compact/deleteCurrent` + CommandPalette 接入 triggerSlashCommand
  - §5.5 设置项：Compact Keep Recent slider
  - **Phase 1 全部 8 个 Red 测试转 Green**（i18n-wiring 2 + SlashCommand 4 + SettingsTab 2），全量 313 绿 / 0 Red、typecheck 0 error
  - README 双语特性状态更新（i18n / Slash → Implemented）
- 偏差：
  - `/compact` 的 summary 为占位文本（'Conversation history compacted'），AI 生成摘要留待后续
  - §5.1 文本替换覆盖主要 UI 面，Toolbar/Notice 等次要文本按计划分四批已基本完成，剩余零星硬编码在 Phase 5 清理
- 后续遗留：§5.4 Inline Edit、§5.5 剩余（temperature 透传 / chatViewPlacement）、Phase 4

```
模板：
### Phase X — 完成 YYYY-MM-DD
- 达成：[关键验收点列表]
- 偏差：[与方案的差异及原因]
- 后续遗留：[转入下一 Phase 的事项]
```

---

## 附：本方案证据索引（探查快照，便于复现）

| 断言 | 代码证据 |
|------|---------|
| KiloCodeView 1003 行上帝类 | `src/features/chat/KiloCodeView.ts` wc -l |
| mojibake 注释 | `KiloCodeView.ts:1` `// 閲嶆瀯锛氬€熼壌 claudian 鏋舵瀯` |
| i18n 未接入 | `grep "i18n" src/main.ts` 无；全仓库无 `t()` UI 调用 |
| Slash handler 空 | `SlashCommand.ts:53/63/73/83` `// TODO` |
| MCP 假连接 | `MCPManager.ts:46` `instance.connected = true` 后无操作 |
| Inline Edit TODO | `KiloCodeView.ts:918` `// TODO: 调用 KiloCode CLI` |
| temperature 未传 | `KiloCodeChatRuntime.ts:206-209` `buildModelConfig` 仅传 modelID |
| placement 未用 | `main.ts:87` 硬编码 `getRightLeaf(false)` |
| restartRuntime 名实不符 | `KiloCodeView.ts:585-590` 注释 stop 进程、实现仅 resetSession |
| Conversation 非 schema 化 | `ConversationService.ts:357` `JSON.stringify(messages)` 无 version |
| Binary 无校验和 | `BinaryManager.ts:302` `writeFileSync` 直写 |
| execSync 阻塞 | `BinaryManager.ts:158/212` `execSync` 调用 |
| xattr 拼接 | `BinaryManager.ts:327` `execSync('xattr -d ... "' + p + '"')` |
| `as any` 满天飞 | `KiloCodeChatRuntime.ts` 多处 `(this.client.session as any)` |
| tsconfig 不严 | `tsconfig.json` 无 `strict: true` |
| 29 处 console | `grep -rc "console\." src --include="*.ts" \| wc -l` |
| 主视图 0 测试 | `find tests -name "KiloCodeView.test.ts"` 空 |
| VirtualScroller 定高 | `MessageRenderer.ts:139` `itemHeight: 100` |
| 空 catch 吞错 | `KiloCodeChatRuntime.ts:47/51/77/164` |
| flushDirty 不重试 | `ConversationService.ts:66` catch 内重加 dirty，无 timer |
| PATH 全局副作用 | `KiloCodeChatRuntime.ts:194` `process.env.PATH = ...` |

---

**文档版本**：v1.0 · 2026-08-05
**来源**：基于 `git rev d7791d4`（HEAD @ main）探查
**适用**：本文件随每个 Phase 完成更新 §十一 实施记录，并据实情迭代本方案文本。