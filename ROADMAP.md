# KiloCode for Obsidian — Roadmap

> 更新于 2026-05-25

## 当前状态

- **测试通过**: ✅ TypeScript 类型检查 + esbuild 生产构建
- **插件已发布**: Obsidian Community Plugin 商店已上架

## 已完成里程碑

### v0.x — 基础功能与稳定性

- [x] AI Chat Sidebar（侧边栏聊天）
- [x] 多 Tab 聊天与会话历史
- [x] 流式响应与中断支持
- [x] 会话 Fork / Rewind
- [x] 会话压缩（Compaction）
- [x] Slash Commands 与 @mention
- [x] Plan Mode（code / plan / ask 三模式）
- [x] Inline Edit（选中文本 + 快捷键编辑）
- [x] MCP 工具支持
- [x] 图片附件（粘贴 / 拖拽 / 文件选择）
- [x] 当前笔记上下文（Toggle）
- [x] 权限系统（Yolo / Normal / Plan）
- [x] i18n 多语言支持（中 / 英 / 日 / 韩等）
- [x] CLI 自动下载（零配置启动）

### v1.x — 架构重构与性能优化

- [x] **ChatState + ConversationController 架构** — 集中流式状态管理、会话生命周期控制
- [x] **流式渲染性能优化** — rAF 节流滚动、防抖磁盘写入、SSE chunk 合并
- [x] **@kilocode/sdk 迁移** — 通信层从子进程切换到官方 SDK（server + client API）
- [x] **二进制检测多阶段策略** — 手动路径 → 插件目录 → 系统 PATH → 全局 npm → 下载
- [x] **CLI 配置文件增强** — 支持 kilo.jsonc 等多文件名；内置 JSONC 解析器
- [x] **模型选择支持** — ChatRuntime setModel/getModel；视图层模型按钮

## 进行中

- [ ] **Phase B: MCP Server 透传** — 将插件级 MCP server 注入 CLI 运行时
- [ ] **Phase C: 审批系统集成** — 插件 UI 审批对话框 ↔ CLI 审批回调
- [ ] **Phase D: Subagent / Agent Group** — 多智能体编排
- [ ] 提升测试覆盖率（runtime + view + settings）

## 计划中

- [ ] 插件设置搜索
- [ ] 自定义/推荐 Prompt 模板市场
- [ ] 对话导出（Markdown / JSON）
- [ ] Vault 全文搜索集成（Semantic search）
- [ ] Obsidian Mobile 适配（平板端聊天界面）
- [ ] CLI 版本管理 — 可视化切换/回滚 CLI 版本

## 技术债 / 待改进

- [ ] 移除老旧 console.log / console.warn 调试日志
- [ ] ConversationService 序列化格式版本化
- [ ] 移出 write_runtime.js 测试辅助文件到 tests 目录
- [ ] 文档：添加贡献指南（CONTRIBUTING.md）
