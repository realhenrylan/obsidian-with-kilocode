# Contributing to KiloCode for Obsidian

感谢你有兴趣为这个项目做贡献！本指南说明开发流程与约定。

## 快速开始

```bash
git clone https://github.com/realhenrylan/obsidian-with-kilocode.git
cd obsidian-kilocode
npm install --legacy-peer-deps
npm run dev     # esbuild watch 模式
```

完整的构建/测试/调试说明见 [DEVELOPMENT.md](DEVELOPMENT.md)。

## 提交前必做（完成验证铁律）

**没有运行验证命令 = 不能声称完成**。每次 PR 前必须全绿：

```bash
npm run typecheck   # 0 error（tsconfig 已开启全量 strict）
npm run lint        # 0 error
npm run build       # exit 0
npm test            # 0 failures（376+ 用例）
```

CI（`.github/workflows/ci.yml`）会以 5 个并行 job 强制执行以上检查，另含
产物体积守门（main.js ≤ 200KB）、覆盖率守门（lines 55% / branches 44%，目标
70/60 随补测上调）与生产依赖安全审计。

## 开发约定

### 单一职责

- 一次 commit / PR 只做一件事，不混合多个变更
- 每次修改必须同步更新 `CHANGELOG.md`（Keep a Changelog 格式）
- 修复 bug 前先找到根因再动手：读错误信息 → 稳定复现 → 检查最近变更 → 追踪数据流

### 测试策略

- 新功能 / bug 修复先写测试（Red → Green → Refactor）
- 测公共行为契约，不测私有方法签名；重构 PR 不得改变测试断言含义
- Mock 边界：`obsidian` API、`@kilocode/sdk`、`child_process`；其余用真实实现

### 代码风格

- 复杂 pipeline、兜底/降级策略、外部依赖特殊用法、magic number 必须写注释（说明「为什么」）
- 不言自明的代码不写注释；禁止空 catch（至少 `console.warn` 留痕）
- TypeScript 全量 strict 模式，禁止 `as any`

## 提交信息

使用 Conventional Commits 风格：

```
feat: 新功能
fix: 缺陷修复
docs: 文档
chore: 构建/工具
refactor: 重构（不改行为）
test: 测试
```

## 提交 PR

1. 从 `main` 拉出特性分支
2. 通过上面的验证清单
3. PR 描述写清「做了什么 / 为什么 / 如何验证」
4. CI 全绿后等待 review

## 报告问题

提交 Issue 时请附上：Obsidian 版本、插件版本、操作系统、CLI 版本（`kilo --version`）、
控制台报错（Ctrl+Shift+I）与稳定复现步骤。
