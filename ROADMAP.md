# KiloCode for Obsidian — Roadmap

> 更新于 2026-08-30（与 IMPLEMENTATION_PLAN.md 的工程实施记录同步）

## 当前状态

- **测试通过**: ✅ TypeScript 全量 strict + ESLint + esbuild 生产构建 + 376 测试全绿
- **插件已发布**: Obsidian Community Plugin 商店已上架

## 已完成里程碑

### v0.x — 基础功能与稳定性

- [x] AI Chat Sidebar（侧边栏聊天）
- [x] 多 Tab 聊天与会话历史
- [x] 流式响应与中断支持
- [x] 会话 Fork / Rewind
- [x] 会话压缩（Compaction）
- [x] Slash Commands（`/compact /clear /model /mode /skills /skill`）
- [x] Plan Mode（code / plan / ask 三模式）
- [x] Inline Edit（选中文本 + 快捷键编辑，经 CLI 生成建议 + diff 预览后写入）
- [x] 图片附件（粘贴 / 拖拽 / 文件选择）
- [x] 当前笔记上下文（Toggle）
- [x] 权限系统（Yolo / Normal / Plan）
- [x] CLI 自动下载（零配置启动）
- [x] i18n 多语言支持（中 / 英 / 日 / 韩，全链路 `t()` 接入，设置面板可切换）

### v1.x — 架构重构与性能优化

- [x] **ChatState + ConversationController 架构** — 集中流式状态管理、会话生命周期控制
- [x] **流式渲染性能优化** — rAF 节流滚动、防抖磁盘写入、SSE chunk 合并
- [x] **@kilocode/sdk 迁移** — 通信层从子进程切换到官方 SDK（server + client API）
- [x] **二进制检测多阶段策略** — 手动路径 → 插件目录 → 系统 PATH → 全局 npm → 下载
- [x] **CLI 配置文件增强** — 支持 kilo.jsonc 等多文件名；内置 JSONC 解析器
- [x] **模型选择支持** — ChatRuntime setModel/getModel；视图层模型按钮

### 工程实施计划 Phase 0-3（2026-08 完成）

- [x] **Phase 0 文档对齐** — README 功能状态标注（Planned/Implemented 图例），消除宣传与实现偏差
- [x] **Phase 1 测试基线** — 主视图/设置/命令/i18n/inline-edit 全覆盖（Phase 3 驱动的 Red 测试全部转绿）
- [x] **Phase 2 架构重构** — KiloCodeView 按职责拆分（SendOrchestrator/TabController/MessageActionsHandler/ViewActions/ChatLayoutBuilder/TabBarView/ModelSwitcherModal），mojibake 注释修复，统一渲染路径
- [x] **Phase 3 功能补齐** — i18n 全链路、Slash 命令 handler、MCP 路径 A 透传（真实状态查询）、Inline Edit 经 CLI + diff 预览、temperature 透传、chatViewPlacement 三路径
- [x] **Phase 4 健壮性** — runtime 探活自动重建、sessionId 失效重试、错误吞没收敛、PATH 隔离、prompt 超时；ConversationService schema v2 版本化/关键数据先行/失败重试/懒加载标记；BinaryManager sha512 校验/原子写/exec 异步化/版本一致性/PINNED 解耦
- [x] **Phase 5 加固** — tsconfig 全量 strict、`as any` 归零、生产构建去调试日志、死代码清理、cliPath 注入防护、虚拟滚动动态高度（估算+实测回填）、阈值 50→20、CI 五并行 job（覆盖率守门 + 200KB 体积守门 + 生产依赖审计）

## 进行中

- [ ] **Phase C: 审批系统集成** — 插件 UI 审批对话框 ↔ CLI 审批回调（UI 已实现，端到端链路待验证）
- [ ] **Phase D: Subagent / Agent Group** — 多智能体编排
- [ ] 提升测试覆盖率（当前 lines 57% / branches 45%，守门基线 55/44，目标 70/60）

## 计划中

- [ ] 插件设置搜索
- [ ] 自定义/推荐 Prompt 模板市场
- [ ] 对话导出（Markdown / JSON）
- [ ] Vault 全文搜索集成（Semantic search）
- [ ] Obsidian Mobile 适配（平板端聊天界面）
- [ ] CLI 版本管理 — 可视化切换/回滚 CLI 版本（PINNED_CLI_VERSION 已随 SDK 版本解耦）

## 技术债 / 待改进

- [x] 移除老旧 console.log / console.warn 调试日志（生产构建 esbuild pure 移除 log/debug/info，warn/error 保留为诊断）
- [x] ConversationService 序列化格式版本化（schema v2 + v1 兼容读取）
- [x] 移除根目录遗留的 write_runtime.js 草稿文件（确认无引用后删除）
- [x] 文档：添加贡献指南（CONTRIBUTING.md）
