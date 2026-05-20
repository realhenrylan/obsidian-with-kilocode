# KiloCode for Obsidian - Phase 3 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现高级交互功能：Inline Edit、Slash Commands、@mention 和设置面板

**Architecture:** 基于 Phase 2 的聊天框架，添加三个交互系统（Inline Edit、Slash Commands、@mention）和完整的设置界面

**Tech Stack:** TypeScript, Obsidian Plugin API, CodeMirror 6

---

## Task 1: Inline Edit 核心

**Files:**
- Create: `src/features/inline-edit/InlineEditModal.ts`
- Create: `src/features/inline-edit/DiffViewer.ts`

- [ ] **Step 1: 创建 InlineEditModal**

```typescript
// src/features/inline-edit/InlineEditModal.ts

import { App, Modal, Setting } from 'obsidian';

/**
 * Inline Edit 模态框
 * 用户选中文本后弹出，输入编辑指令
 */
export class InlineEditModal extends Modal {
  private selectedText: string;
  private onSubmit: (instruction: string) => void;
  private instruction: string = '';

  constructor(app: App, selectedText: string, onSubmit: (instruction: string) => void) {
    super(app);
    this.selectedText = selectedText;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass('kilo-inline-edit-modal');

    // 标题
    contentEl.createEl('h2', { text: 'Inline Edit' });

    // 选中文本预览
    const previewEl = contentEl.createDiv({ cls: 'kilo-preview' });
    previewEl.createEl('label', { text: 'Selected Text:' });
    const preEl = previewEl.createEl('pre');
    preEl.createEl('code', { text: this.selectedText });

    // 指令输入
    const inputContainer = contentEl.createDiv({ cls: 'kilo-instruction-input' });
    inputContainer.createEl('label', { text: 'Edit Instruction:' });

    const textarea = inputContainer.createEl('textarea', {
      cls: 'kilo-instruction-textarea',
      placeholder: 'Describe how to edit the selected text...',
    });
    textarea.addEventListener('input', (e) => {
      this.instruction = (e.target as HTMLTextAreaElement).value;
    });

    // 快捷键提示
    const hintEl = contentEl.createDiv({ cls: 'kilo-hint' });
    hintEl.createSpan({ text: 'Enter to submit, Shift+Enter for new line, Esc to cancel' });

    // 按钮
    const buttonContainer = contentEl.createDiv({ cls: 'kilo-modal-buttons' });

    const submitBtn = buttonContainer.createEl('button', {
      cls: 'kilo-btn kilo-btn-primary',
      text: 'Edit',
    });
    submitBtn.addEventListener('click', () => this.handleSubmit());

    const cancelBtn = buttonContainer.createEl('button', {
      cls: 'kilo-btn kilo-btn-cancel',
      text: 'Cancel',
    });
    cancelBtn.addEventListener('click', () => this.close());

    // 键盘事件
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSubmit();
      }
      if (e.key === 'Escape') {
        this.close();
      }
    });

    // 自动聚焦
    textarea.focus();
  }

  private handleSubmit(): void {
    if (this.instruction.trim()) {
      this.onSubmit(this.instruction.trim());
      this.close();
    }
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
```

- [ ] **Step 2: 创建 DiffViewer**

```typescript
// src/features/inline-edit/DiffViewer.ts

/**
 * Diff 查看器
 * 显示编辑前后的差异
 */
export class DiffViewer {
  private container: HTMLElement;
  private originalText: string;
  private newText: string;

  constructor(container: HTMLElement, originalText: string, newText: string) {
    this.container = container;
    this.originalText = originalText;
    this.newText = newText;
  }

  /** 渲染 diff 视图 */
  render(): void {
    this.container.empty();
    this.container.addClass('kilo-diff-viewer');

    // 标题
    const headerEl = this.container.createDiv({ cls: 'kilo-diff-header' });
    headerEl.createSpan({ text: 'Changes Preview', cls: 'kilo-diff-title' });

    // Diff 内容
    const diffEl = this.container.createDiv({ cls: 'kilo-diff-content' });

    // 简单的逐行对比
    const originalLines = this.originalText.split('\n');
    const newLines = this.newText.split('\n');

    const maxLines = Math.max(originalLines.length, newLines.length);

    for (let i = 0; i < maxLines; i++) {
      const originalLine = originalLines[i] || '';
      const newLine = newLines[i] || '';

      if (originalLine !== newLine) {
        // 删除的行
        if (originalLine) {
          const delEl = diffEl.createDiv({ cls: 'kilo-diff-line kilo-diff-del' });
          delEl.createSpan({ text: '- ', cls: 'kilo-diff-marker' });
          delEl.createSpan({ text: originalLine });
        }
        // 添加的行
        if (newLine) {
          const addEl = diffEl.createDiv({ cls: 'kilo-diff-line kilo-diff-add' });
          addEl.createSpan({ text: '+ ', cls: 'kilo-diff-marker' });
          addEl.createSpan({ text: newLine });
        }
      } else {
        // 未改变的行
        const unchangedEl = diffEl.createDiv({ cls: 'kilo-diff-line kilo-diff-unchanged' });
        unchangedEl.createSpan({ text: '  ', cls: 'kilo-diff-marker' });
        unchangedEl.createSpan({ text: originalLine });
      }
    }

    // 操作按钮
    const actionsEl = this.container.createDiv({ cls: 'kilo-diff-actions' });

    const acceptBtn = actionsEl.createEl('button', {
      cls: 'kilo-btn kilo-btn-primary',
      text: 'Accept Changes',
    });
    acceptBtn.addEventListener('click', () => this.onAccept());

    const rejectBtn = actionsEl.createEl('button', {
      cls: 'kilo-btn kilo-btn-cancel',
      text: 'Reject',
    });
    rejectBtn.addEventListener('click', () => this.onReject());
  }

  private onAccept(): void {
    // 触发接受事件
    this.container.dispatchEvent(new CustomEvent('diff-accepted', {
      detail: { newText: this.newText },
    }));
  }

  private onReject(): void {
    // 触发拒绝事件
    this.container.dispatchEvent(new CustomEvent('diff-rejected'));
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add src/features/inline-edit/
git commit -m "feat: add InlineEditModal and DiffViewer"
```

---

## Task 2: Inline Edit 集成

**Files:**
- Modify: `src/features/chat/KiloCodeView.ts`

- [ ] **Step 1: 添加 Inline Edit 命令**

```typescript
// src/features/chat/KiloCodeView.ts (添加方法)

import { InlineEditModal } from '../inline-edit/InlineEditModal';
import { DiffViewer } from '../inline-edit/DiffViewer';

// 在 KiloCodeView 类中添加

/** 注册 Inline Edit 命令 */
private registerInlineEditCommand(): void {
  this.plugin.addCommand({
    id: 'inline-edit',
    name: 'Inline Edit',
    editorCallback: (editor) => {
      const selection = editor.getSelection();
      if (selection) {
        this.showInlineEditModal(selection, editor);
      }
    },
    hotkeys: [{ modifiers: ['Ctrl', 'Shift'], key: 'e' }],
  });
}

/** 显示 Inline Edit 模态框 */
private showInlineEditModal(selectedText: string, editor: any): void {
  new InlineEditModal(this.app, selectedText, async (instruction) => {
    // TODO: 调用 KiloCode CLI 进行编辑
    // const editedText = await this.plugin.kiloCodeRuntime.inlineEdit(selectedText, instruction);
    // this.showDiffPreview(editor, selectedText, editedText);
  }).open();
}

/** 显示 diff 预览 */
private showDiffPreview(editor: any, originalText: string, newText: string): void {
  // 创建临时容器显示 diff
  const diffContainer = document.createElement('div');
  document.body.appendChild(diffContainer);

  const diffViewer = new DiffViewer(diffContainer, originalText, newText);
  diffViewer.render();

  // 监听接受/拒绝事件
  diffContainer.addEventListener('diff-accepted', ((e: CustomEvent) => {
    editor.replaceSelection(e.detail.newText);
    diffContainer.remove();
  }) as EventListener);

  diffContainer.addEventListener('diff-rejected', () => {
    diffContainer.remove();
  });
}
```

- [ ] **Step 2: 在 onOpen 中注册命令**

```typescript
// src/features/chat/KiloCodeView.ts (在 onOpen 方法中)

async onOpen(): Promise<void> {
  await this.conversationService.initialize();
  this.registerInlineEditCommand();
  this.render();
}
```

- [ ] **Step 3: 提交**

```bash
git add src/features/chat/KiloCodeView.ts
git commit -m "feat: integrate Inline Edit into KiloCodeView"
```

---

## Task 3: Slash Commands 系统

**Files:**
- Create: `src/features/commands/SlashCommand.ts`
- Create: `src/features/commands/CommandPalette.ts`

- [ ] **Step 1: 创建 SlashCommand 定义**

```typescript
// src/features/commands/SlashCommand.ts

/**
 * 斜杠命令定义
 */
export interface SlashCommand {
  id: string;
  name: string;
  description: string;
  icon: string;
  handler: (args: string) => Promise<void>;
}

/**
 * 内置斜杠命令注册表
 */
export class CommandRegistry {
  private commands: Map<string, SlashCommand> = new Map();

  /** 注册命令 */
  register(command: SlashCommand): void {
    this.commands.set(command.id, command);
  }

  /** 获取命令 */
  get(id: string): SlashCommand | undefined {
    return this.commands.get(id);
  }

  /** 获取所有命令 */
  getAll(): SlashCommand[] {
    return Array.from(this.commands.values());
  }

  /** 搜索命令 */
  search(query: string): SlashCommand[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(cmd =>
      cmd.name.toLowerCase().includes(lowerQuery) ||
      cmd.description.toLowerCase().includes(lowerQuery)
    );
  }
}

/** 创建默认命令注册表 */
export function createDefaultCommandRegistry(): CommandRegistry {
  const registry = new CommandRegistry();

  // /compact - 压缩会话
  registry.register({
    id: 'compact',
    name: '/compact',
    description: 'Compact conversation history',
    icon: '📦',
    handler: async () => {
      // TODO: 实现压缩逻辑
    },
  });

  // /clear - 清空会话
  registry.register({
    id: 'clear',
    name: '/clear',
    description: 'Clear current conversation',
    icon: '🗑️',
    handler: async () => {
      // TODO: 实现清空逻辑
    },
  });

  // /model - 切换模型
  registry.register({
    id: 'model',
    name: '/model',
    description: 'Switch AI model',
    icon: '🤖',
    handler: async () => {
      // TODO: 实现模型切换
    },
  });

  // /mode - 切换模式
  registry.register({
    id: 'mode',
    name: '/mode',
    description: 'Switch mode (plan/code/ask)',
    icon: '🔄',
    handler: async () => {
      // TODO: 实现模式切换
    },
  });

  return registry;
}
```

- [ ] **Step 2: 创建 CommandPalette**

```typescript
// src/features/commands/CommandPalette.ts

import type { SlashCommand } from './SlashCommand';

/**
 * 命令面板
 * 显示斜杠命令列表
 */
export class CommandPalette {
  private container: HTMLElement;
  private commands: SlashCommand[];
  private onSelect: (command: SlashCommand) => void;
  private selectedIndex: number = 0;

  constructor(container: HTMLElement, commands: SlashCommand[], onSelect: (command: SlashCommand) => void) {
    this.container = container;
    this.commands = commands;
    this.onSelect = onSelect;
  }

  /** 显示命令面板 */
  show(): void {
    this.container.empty();
    this.container.addClass('kilo-command-palette');

    // 命令列表
    const listEl = this.container.createDiv({ cls: 'kilo-command-list' });

    this.commands.forEach((cmd, index) => {
      const itemEl = listEl.createDiv({
        cls: `kilo-command-item ${index === this.selectedIndex ? 'kilo-command-selected' : ''}`,
      });

      itemEl.createSpan({ cls: 'kilo-command-icon', text: cmd.icon });
      itemEl.createSpan({ cls: 'kilo-command-name', text: cmd.name });
      itemEl.createSpan({ cls: 'kilo-command-desc', text: cmd.description });

      itemEl.addEventListener('click', () => {
        this.onSelect(cmd);
        this.hide();
      });

      itemEl.addEventListener('mouseenter', () => {
        this.selectedIndex = index;
        this.updateSelection();
      });
    });

    // 键盘导航
    this.container.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.commands.length - 1);
        this.updateSelection();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.updateSelection();
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (this.commands[this.selectedIndex]) {
          this.onSelect(this.commands[this.selectedIndex]);
          this.hide();
        }
      }
      if (e.key === 'Escape') {
        this.hide();
      }
    });
  }

  /** 隐藏命令面板 */
  hide(): void {
    this.container.empty();
    this.container.removeClass('kilo-command-palette');
  }

  /** 更新选择状态 */
  private updateSelection(): void {
    const items = this.container.querySelectorAll('.kilo-command-item');
    items.forEach((item, index) => {
      item.classList.toggle('kilo-command-selected', index === this.selectedIndex);
    });
  }

  /** 过滤命令 */
  filter(query: string): void {
    this.commands = this.commands.filter(cmd =>
      cmd.name.toLowerCase().includes(query.toLowerCase()) ||
      cmd.description.toLowerCase().includes(query.toLowerCase())
    );
    this.selectedIndex = 0;
    this.show();
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add src/features/commands/
git commit -m "feat: add SlashCommand system and CommandPalette"
```

---

## Task 4: @mention 系统

**Files:**
- Create: `src/features/mention/MentionService.ts`
- Create: `src/features/mention/MentionDropdown.ts`

- [ ] **Step 1: 创建 MentionService**

```typescript
// src/features/mention/MentionService.ts

import { App, TFile } from 'obsidian';

/**
 * 提及类型
 */
export type MentionType = 'file' | 'folder' | 'tag';

/**
 * 提及项
 */
export interface MentionItem {
  type: MentionType;
  name: string;
  path: string;
  icon: string;
}

/**
 * 提及服务
 * 搜索可提及的内容
 */
export class MentionService {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /** 搜索可提及的内容 */
  async search(query: string): Promise<MentionItem[]> {
    const results: MentionItem[] = [];

    // 搜索文件
    const files = this.app.vault.getMarkdownFiles();
    for (const file of files) {
      if (file.basename.toLowerCase().includes(query.toLowerCase())) {
        results.push({
          type: 'file',
          name: file.basename,
          path: file.path,
          icon: '📄',
        });
      }
    }

    // 搜索文件夹
    const folders = this.app.vault.getRoot().children;
    for (const folder of folders) {
      if ('children' in folder && folder.name.toLowerCase().includes(query.toLowerCase())) {
        results.push({
          type: 'folder',
          name: folder.name,
          path: folder.path,
          icon: '📁',
        });
      }
    }

    // 限制结果数量
    return results.slice(0, 20);
  }

  /** 获取文件内容 */
  async getFileContent(path: string): Promise<string | null> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      return await this.app.vault.read(file);
    }
    return null;
  }
}
```

- [ ] **Step 2: 创建 MentionDropdown**

```typescript
// src/features/mention/MentionDropdown.ts

import type { MentionItem } from './MentionService';

/**
 * 提及下拉菜单
 */
export class MentionDropdown {
  private container: HTMLElement;
  private items: MentionItem[];
  private onSelect: (item: MentionItem) => void;
  private selectedIndex: number = 0;

  constructor(container: HTMLElement, items: MentionItem[], onSelect: (item: MentionItem) => void) {
    this.container = container;
    this.items = items;
    this.onSelect = onSelect;
  }

  /** 显示下拉菜单 */
  show(): void {
    this.container.empty();
    this.container.addClass('kilo-mention-dropdown');

    if (this.items.length === 0) {
      this.container.createDiv({
        cls: 'kilo-mention-empty',
        text: 'No results found',
      });
      return;
    }

    // 按类型分组
    const grouped = this.groupByType();

    for (const [type, items] of Object.entries(grouped)) {
      // 类型标题
      const typeEl = this.container.createDiv({
        cls: 'kilo-mention-type',
        text: this.getTypeLabel(type as MentionType),
      });

      // 项目列表
      for (const item of items) {
        const itemEl = this.container.createDiv({
          cls: 'kilo-mention-item',
        });

        itemEl.createSpan({ cls: 'kilo-mention-icon', text: item.icon });
        itemEl.createSpan({ cls: 'kilo-mention-name', text: item.name });
        itemEl.createSpan({ cls: 'kilo-mention-path', text: item.path });

        itemEl.addEventListener('click', () => {
          this.onSelect(item);
          this.hide();
        });
      }
    }
  }

  /** 隐藏下拉菜单 */
  hide(): void {
    this.container.empty();
    this.container.removeClass('kilo-mention-dropdown');
  }

  /** 按类型分组 */
  private groupByType(): Record<string, MentionItem[]> {
    const grouped: Record<string, MentionItem[]> = {};

    for (const item of this.items) {
      if (!grouped[item.type]) {
        grouped[item.type] = [];
      }
      grouped[item.type].push(item);
    }

    return grouped;
  }

  /** 获取类型标签 */
  private getTypeLabel(type: MentionType): string {
    const labels: Record<MentionType, string> = {
      file: 'Files',
      folder: 'Folders',
      tag: 'Tags',
    };
    return labels[type] || type;
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add src/features/mention/
git commit -m "feat: add MentionService and MentionDropdown"
```

---

## Task 5: 设置面板

**Files:**
- Create: `src/features/settings/SettingsTab.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: 创建 SettingsTab**

```typescript
// src/features/settings/SettingsTab.ts

import { App, PluginSettingTab, Setting } from 'obsidian';
import type KiloCodePlugin from '../main';

/**
 * KiloCode 设置面板
 */
export class KiloCodeSettingTab extends PluginSettingTab {
  plugin: KiloCodePlugin;

  constructor(app: App, plugin: KiloCodePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('kilo-settings');

    // 标题
    containerEl.createEl('h2', { text: 'KiloCode Settings' });

    // === 常规设置 ===
    containerEl.createEl('h3', { text: 'General' });

    // CLI 路径
    new Setting(containerEl)
      .setName('KiloCode CLI Path')
      .setDesc('Path to KiloCode CLI executable')
      .addText(text => text
        .setPlaceholder('kilo')
        .setValue(this.plugin.settings.cliPath)
        .onChange(async (value) => {
          this.plugin.settings.cliPath = value;
          await this.plugin.saveSettings();
        }));

    // 自动启动
    new Setting(containerEl)
      .setName('Auto Start')
      .setDesc('Automatically start KiloCode CLI when opening a vault')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoStart)
        .onChange(async (value) => {
          this.plugin.settings.autoStart = value;
          await this.plugin.saveSettings();
        }));

    // === 聊天设置 ===
    containerEl.createEl('h3', { text: 'Chat' });

    // 最大标签页数
    new Setting(containerEl)
      .setName('Maximum Tabs')
      .setDesc('Maximum number of chat tabs (1-10)')
      .addSlider(slider => slider
        .setLimits(1, 10, 1)
        .setValue(this.plugin.settings.maxTabs)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.maxTabs = value;
          await this.plugin.saveSettings();
        }));

    // 自动保存
    new Setting(containerEl)
      .setName('Auto Save')
      .setDesc('Automatically save conversation history')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.autoSave)
        .onChange(async (value) => {
          this.plugin.settings.autoSave = value;
          await this.plugin.saveSettings();
        }));

    // === 模型设置 ===
    containerEl.createEl('h3', { text: 'Model' });

    // 默认模型
    new Setting(containerEl)
      .setName('Default Model')
      .setDesc('Default AI model to use')
      .addDropdown(dropdown => dropdown
        .addOption('claude-sonnet-4-20250514', 'Claude Sonnet 4')
        .addOption('claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet')
        .addOption('gpt-4o', 'GPT-4o')
        .setValue(this.plugin.settings.defaultModel)
        .onChange(async (value) => {
          this.plugin.settings.defaultModel = value;
          await this.plugin.saveSettings();
        }));

    // 温度
    new Setting(containerEl)
      .setName('Temperature')
      .setDesc('Model temperature (0-1)')
      .addSlider(slider => slider
        .setLimits(0, 1, 0.1)
        .setValue(this.plugin.settings.temperature)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.temperature = value;
          await this.plugin.saveSettings();
        }));

    // === 外观设置 ===
    containerEl.createEl('h3', { text: 'Appearance' });

    // 主题
    new Setting(containerEl)
      .setName('Theme')
      .setDesc('Color theme for KiloCode')
      .addDropdown(dropdown => dropdown
        .addOption('auto', 'Auto')
        .addOption('light', 'Light')
        .addOption('dark', 'Dark')
        .setValue(this.plugin.settings.theme)
        .onChange(async (value: string) => {
          this.plugin.settings.theme = value as 'auto' | 'light' | 'dark';
          await this.plugin.saveSettings();
        }));

    // 字体大小
    new Setting(containerEl)
      .setName('Font Size')
      .setDesc('Font size for chat messages')
      .addSlider(slider => slider
        .setLimits(12, 20, 1)
        .setValue(this.plugin.settings.fontSize)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.fontSize = value;
          await this.plugin.saveSettings();
        }));
  }
}
```

- [ ] **Step 2: 更新 main.ts 注册设置**

```typescript
// src/main.ts (添加导入和注册)

import { KiloCodeSettingTab } from './features/settings/SettingsTab';

// 在 onload 方法中添加
this.addSettingTab(new KiloCodeSettingTab(this.app, this));
```

- [ ] **Step 3: 提交**

```bash
git add src/features/settings/SettingsTab.ts src/main.ts
git commit -m "feat: add SettingsTab with comprehensive options"
```

---

## Task 6: 错误处理增强

**Files:**
- Create: `src/shared/ErrorNotice.ts`
- Modify: `src/features/chat/KiloCodeView.ts`

- [ ] **Step 1: 创建 ErrorNotice**

```typescript
// src/shared/ErrorNotice.ts

import { Notice } from 'obsidian';

/**
 * 错误级别
 */
export type ErrorLevel = 'info' | 'warning' | 'error' | 'fatal';

/**
 * 错误通知
 * 增强的错误提示组件
 */
export class ErrorNotice {
  private message: string;
  private level: ErrorLevel;
  private duration: number;

  constructor(message: string, level: ErrorLevel = 'error', duration: number = 5000) {
    this.message = message;
    this.level = level;
    this.duration = duration;
  }

  /** 显示通知 */
  show(): void {
    const icon = this.getIcon();
    const fullMessage = `${icon} ${this.message}`;

    new Notice(fullMessage, this.duration);
  }

  /** 获取图标 */
  private getIcon(): string {
    const icons: Record<ErrorLevel, string> = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
      fatal: '💀',
    };
    return icons[this.level];
  }

  /** 创建重试通知 */
  static withRetry(message: string, onRetry: () => void): ErrorNotice {
    const notice = new ErrorNotice(`${message}\n\nClick to retry`, 'error', 10000);
    notice.show();
    return notice;
  }
}

/**
 * CLI 错误处理
 */
export class CLIErrorHandler {
  /** 处理 CLI 未找到错误 */
  static handleCLINotFound(): void {
    new ErrorNotice(
      'KiloCode CLI not found. Please install it with: npm install -g @kilocode/cli',
      'fatal',
      10000
    ).show();
  }

  /** 处理 CLI 启动失败 */
  static handleCLIStartFailed(error: string): void {
    new ErrorNotice(
      `Failed to start KiloCode CLI: ${error}`,
      'error',
      8000
    ).show();
  }

  /** 处理网络错误 */
  static handleNetworkError(): void {
    new ErrorNotice(
      'Network error. Please check your connection.',
      'warning',
      5000
    ).show();
  }

  /** 处理工具调用失败 */
  static handleToolError(toolName: string, error: string): void {
    new ErrorNotice(
      `Tool "${toolName}" failed: ${error}`,
      'warning',
      5000
    ).show();
  }
}
```

- [ ] **Step 2: 在 KiloCodeView 中集成错误处理**

```typescript
// src/features/chat/KiloCodeView.ts (添加导入和使用)

import { CLIErrorHandler } from '../../shared/ErrorNotice';

// 在发送消息的错误处理中使用
private async handleSend(content: string): Promise<void> {
  if (!content.trim()) return;

  const activeTab = this.tabManager.getActiveTab();
  if (!activeTab) return;

  // 创建会话（如果需要）
  if (!activeTab.state.conversationId) {
    const conversation = await this.conversationService.createConversation();
    activeTab.setConversation(conversation.id);
  }

  // 添加用户消息
  const userMessage = {
    id: `msg-${Date.now()}`,
    role: 'user' as const,
    content,
    timestamp: Date.now(),
  };

  await this.conversationService.addMessage(
    activeTab.state.conversationId!,
    userMessage
  );

  // 重新渲染
  this.render();

  // TODO: 调用 KiloCode CLI 发送消息
  // try {
  //   await this.plugin.kiloCodeRuntime.sendMessage(content);
  // } catch (error) {
  //   CLIErrorHandler.handleCLIStartFailed(error.message);
  // }
}
```

- [ ] **Step 3: 提交**

```bash
git add src/shared/ErrorNotice.ts src/features/chat/KiloCodeView.ts
git commit -m "feat: add enhanced error handling with ErrorNotice"
```

---

## Task 7: 构建验证

- [ ] **Step 1: 运行 TypeScript 检查**

```bash
npm run typecheck
```

Expected: 无错误

- [ ] **Step 2: 运行构建**

```bash
npm run build
```

Expected: 生成 `main.js` 和 `styles.css`

- [ ] **Step 3: 提交**

```bash
git add -A
git commit -m "chore: verify Phase 3 build"
```

---

## Phase 3 完成检查清单

- [ ] Inline Edit 模态框实现
- [ ] Diff 查看器实现
- [ ] Slash Commands 系统实现
- [ ] 命令面板实现
- [ ] @mention 系统实现
- [ ] 提及下拉菜单实现
- [ ] 设置面板实现
- [ ] 错误处理增强
- [ ] TypeScript 编译通过
- [ ] esbuild 构建成功

---

**下一步：Phase 4 - 增强功能（Plan Mode、MCP、i18n、优化）**
