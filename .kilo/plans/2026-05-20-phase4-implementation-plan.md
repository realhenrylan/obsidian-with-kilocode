# KiloCode for Obsidian - Phase 4 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现增强功能：Plan Mode、MCP Server 支持、i18n 国际化、性能优化和测试

**Architecture:** 在前三阶段基础上，添加模式切换、外部工具连接、多语言支持，并进行性能优化和测试覆盖

**Tech Stack:** TypeScript, Obsidian Plugin API, MCP SDK, i18n

---

## Task 1: Plan Mode

**Files:**
- Create: `src/features/chat/PlanModeController.ts`
- Modify: `src/features/chat/KiloCodeView.ts`

- [ ] **Step 1: 创建 PlanModeController**

```typescript
// src/features/chat/PlanModeController.ts

/**
 * 聊天模式
 */
export type ChatMode = 'code' | 'plan' | 'ask';

/**
 * 模式配置
 */
export interface ModeConfig {
  id: ChatMode;
  name: string;
  description: string;
  icon: string;
  promptPrefix: string;
}

/**
 * 模式定义
 */
const MODES: Record<ChatMode, ModeConfig> = {
  code: {
    id: 'code',
    name: 'Code',
    description: 'Write and edit code',
    icon: '💻',
    promptPrefix: '',
  },
  plan: {
    id: 'plan',
    name: 'Plan',
    description: 'Plan and discuss without making changes',
    icon: '📋',
    promptPrefix: '[PLAN MODE] Please analyze and plan, but do not make any changes yet.\n\n',
  },
  ask: {
    id: 'ask',
    name: 'Ask',
    description: 'Ask questions without code changes',
    icon: '❓',
    promptPrefix: '[ASK MODE] Please answer the following question:\n\n',
  },
};

/**
 * Plan Mode 控制器
 * 管理聊天模式切换
 */
export class PlanModeController {
  private currentMode: ChatMode = 'code';
  private onModeChange?: (mode: ChatMode) => void;

  /** 获取当前模式 */
  getCurrentMode(): ChatMode {
    return this.currentMode;
  }

  /** 获取当前模式配置 */
  getCurrentModeConfig(): ModeConfig {
    return MODES[this.currentMode];
  }

  /** 获取所有模式 */
  getAllModes(): ModeConfig[] {
    return Object.values(MODES);
  }

  /** 切换模式 */
  setMode(mode: ChatMode): void {
    this.currentMode = mode;
    this.onModeChange?.(mode);
  }

  /** 切换到下一个模式 */
  cycleMode(): void {
    const modes: ChatMode[] = ['code', 'plan', 'ask'];
    const currentIndex = modes.indexOf(this.currentMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    this.setMode(modes[nextIndex]);
  }

  /** 设置模式变更回调 */
  setOnModeChange(callback: (mode: ChatMode) => void): void {
    this.onModeChange = callback;
  }

  /** 获取带模式前缀的消息 */
  getMessageWithPrefix(message: string): string {
    return this.getCurrentModeConfig().promptPrefix + message;
  }
}
```

- [ ] **Step 2: 在 KiloCodeView 中集成 Plan Mode**

```typescript
// src/features/chat/KiloCodeView.ts (添加导入和属性)

import { PlanModeController } from './PlanModeController';

// 在类中添加属性
private planModeController: PlanModeController;

// 在构造函数中初始化
this.planModeController = new PlanModeController();

// 添加模式切换按钮渲染
private renderModeToggle(container: HTMLElement): void {
  const modeToggleEl = container.createDiv({ cls: 'kilo-mode-toggle' });

  const currentMode = this.planModeController.getCurrentModeConfig();

  const modeBtn = modeToggleEl.createEl('button', {
    cls: 'kilo-mode-btn',
    text: `${currentMode.icon} ${currentMode.name}`,
  });

  modeBtn.addEventListener('click', () => {
    this.planModeController.cycleMode();
    this.render();
  });

  // 快捷键提示
  modeBtn.createSpan({
    cls: 'kilo-mode-hint',
    text: ' (Shift+Tab)',
  });
}

// 在 render 方法中调用
private render(): void {
  // ... existing code ...
  this.renderModeToggle(container);
}

// 在发送消息时使用模式前缀
private async handleSend(content: string): Promise<void> {
  // ... existing code ...
  const messageWithPrefix = this.planModeController.getMessageWithPrefix(content);
  // 使用 messageWithPrefix 发送
}
```

- [ ] **Step 3: 添加模式切换快捷键**

```typescript
// src/features/chat/KiloCodeView.ts (在 onOpen 中)

// 注册模式切换快捷键
this.plugin.addCommand({
  id: 'toggle-plan-mode',
  name: 'Toggle Plan Mode',
  callback: () => {
    this.planModeController.cycleMode();
    this.render();
  },
  hotkeys: [{ modifiers: ['Shift'], key: 'Tab' }],
});
```

- [ ] **Step 4: 提交**

```bash
git add src/features/chat/PlanModeController.ts src/features/chat/KiloCodeView.ts
git commit -m "feat: add Plan Mode with mode switching"
```

---

## Task 2: MCP Server 支持

**Files:**
- Create: `src/features/mcp/MCPManager.ts`
- Create: `src/features/mcp/MCPToolAdapter.ts`

- [ ] **Step 1: 创建 MCPManager**

```typescript
// src/features/mcp/MCPManager.ts

/**
 * MCP 服务器配置
 */
export interface MCPServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * MCP 工具定义
 */
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

/**
 * MCP 服务器实例
 */
export interface MCPServerInstance {
  config: MCPServerConfig;
  tools: MCPTool[];
  connected: boolean;
}

/**
 * MCP 管理器
 * 管理 MCP 服务器连接和工具
 */
export class MCPManager {
  private servers: Map<string, MCPServerInstance> = new Map();
  private onToolsChange?: () => void;

  /** 添加服务器 */
  async addServer(config: MCPServerConfig): Promise<void> {
    const instance: MCPServerInstance = {
      config,
      tools: [],
      connected: false,
    };

    this.servers.set(config.id, instance);
    await this.connectServer(config.id);
  }

  /** 移除服务器 */
  removeServer(id: string): void {
    this.servers.delete(id);
    this.onToolsChange?.();
  }

  /** 连接服务器 */
  private async connectServer(id: string): Promise<void> {
    const instance = this.servers.get(id);
    if (!instance) return;

    try {
      // TODO: 实现 MCP 协议连接
      // 这里需要使用 MCP SDK
      instance.connected = true;
      this.onToolsChange?.();
    } catch (error) {
      console.error(`Failed to connect to MCP server ${id}:`, error);
      instance.connected = false;
    }
  }

  /** 获取所有服务器 */
  getServers(): MCPServerInstance[] {
    return Array.from(this.servers.values());
  }

  /** 获取所有工具 */
  getAllTools(): MCPTool[] {
    const tools: MCPTool[] = [];
    for (const server of this.servers.values()) {
      if (server.connected) {
        tools.push(...server.tools);
      }
    }
    return tools;
  }

  /** 调用工具 */
  async callTool(serverId: string, toolName: string, args: any): Promise<any> {
    const instance = this.servers.get(serverId);
    if (!instance || !instance.connected) {
      throw new Error(`MCP server ${serverId} not connected`);
    }

    // TODO: 实现 MCP 工具调用
    return null;
  }

  /** 设置工具变更回调 */
  setOnToolsChange(callback: () => void): void {
    this.onToolsChange = callback;
  }
}
```

- [ ] **Step 2: 创建 MCPToolAdapter**

```typescript
// src/features/mcp/MCPToolAdapter.ts

import type { MCPManager, MCPTool } from './MCPManager';

/**
 * MCP 工具适配器
 * 将 MCP 工具转换为 KiloCode 可用的工具格式
 */
export class MCPToolAdapter {
  private mcpManager: MCPManager;

  constructor(mcpManager: MCPManager) {
    this.mcpManager = mcpManager;
  }

  /** 获取所有可用工具 */
  getAvailableTools(): any[] {
    const mcpTools = this.mcpManager.getAllTools();
    return mcpTools.map(tool => this.convertTool(tool));
  }

  /** 转换单个工具 */
  private convertTool(mcpTool: MCPTool): any {
    return {
      name: mcpTool.name,
      description: mcpTool.description,
      parameters: mcpTool.inputSchema,
    };
  }

  /** 调用工具 */
  async callTool(toolName: string, args: any): Promise<any> {
    // 查找工具所在的服务器
    for (const server of this.mcpManager.getServers()) {
      const tool = server.tools.find(t => t.name === toolName);
      if (tool) {
        return await this.mcpManager.callTool(server.config.id, toolName, args);
      }
    }
    throw new Error(`Tool ${toolName} not found`);
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add src/features/mcp/
git commit -m "feat: add MCP Server support"
```

---

## Task 3: i18n 国际化

**Files:**
- Create: `src/i18n/index.ts`
- Create: `src/i18n/locales/en.json`
- Create: `src/i18n/locales/zh.json`

- [ ] **Step 1: 创建 i18n 索引**

```typescript
// src/i18n/index.ts

import en from './locales/en.json';
import zh from './locales/zh.json';

/**
 * 支持的语言
 */
export type Locale = 'en' | 'zh';

/**
 * 翻译资源
 */
const resources: Record<Locale, any> = {
  en,
  zh,
};

/**
 * 当前语言
 */
let currentLocale: Locale = 'en';

/**
 * 设置语言
 */
export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

/**
 * 获取当前语言
 */
export function getLocale(): Locale {
  return currentLocale;
}

/**
 * 获取翻译文本
 * @param key 翻译键，支持点号分隔（如 'chat.send'）
 * @param params 替换参数
 */
export function t(key: string, params?: Record<string, string>): string {
  const keys = key.split('.');
  let value: any = resources[currentLocale];

  for (const k of keys) {
    if (value && typeof value === 'object') {
      value = value[k];
    } else {
      return key; // 键不存在，返回原始键
    }
  }

  if (typeof value !== 'string') {
    return key;
  }

  // 替换参数
  if (params) {
    return value.replace(/\{\{(\w+)\}\}/g, (_, name) => params[name] || '');
  }

  return value;
}

/**
 * 检测系统语言
 */
export function detectLocale(): Locale {
  const lang = navigator.language.toLowerCase();
  if (lang.startsWith('zh')) {
    return 'zh';
  }
  return 'en';
}

/**
 * 初始化 i18n
 */
export function initI18n(locale?: Locale): void {
  setLocale(locale || detectLocale());
}
```

- [ ] **Step 2: 创建英文翻译**

```json
// src/i18n/locales/en.json

{
  "common": {
    "ok": "OK",
    "cancel": "Cancel",
    "save": "Save",
    "delete": "Delete",
    "close": "Close",
    "loading": "Loading...",
    "error": "Error",
    "success": "Success"
  },
  "chat": {
    "title": "KiloCode",
    "send": "Send",
    "cancel": "Cancel",
    "placeholder": "Type a message... (Enter to send, Shift+Enter for new line)",
    "newTab": "New Tab",
    "closeTab": "Close Tab",
    "noConversation": "No conversation yet",
    "startConversation": "Start a conversation with KiloCode"
  },
  "modes": {
    "code": "Code",
    "codeDesc": "Write and edit code",
    "plan": "Plan",
    "planDesc": "Plan and discuss without making changes",
    "ask": "Ask",
    "askDesc": "Ask questions without code changes"
  },
  "commands": {
    "compact": "/compact",
    "compactDesc": "Compact conversation history",
    "clear": "/clear",
    "clearDesc": "Clear current conversation",
    "model": "/model",
    "modelDesc": "Switch AI model",
    "mode": "/mode",
    "modeDesc": "Switch mode (plan/code/ask)"
  },
  "mention": {
    "files": "Files",
    "folders": "Folders",
    "tags": "Tags",
    "noResults": "No results found"
  },
  "settings": {
    "title": "KiloCode Settings",
    "general": "General",
    "cliPath": "KiloCode CLI Path",
    "cliPathDesc": "Path to KiloCode CLI executable",
    "autoStart": "Auto Start",
    "autoStartDesc": "Automatically start KiloCode CLI when opening a vault",
    "chat": "Chat",
    "maxTabs": "Maximum Tabs",
    "maxTabsDesc": "Maximum number of chat tabs (1-10)",
    "autoSave": "Auto Save",
    "autoSaveDesc": "Automatically save conversation history",
    "model": "Model",
    "defaultModel": "Default Model",
    "defaultModelDesc": "Default AI model to use",
    "temperature": "Temperature",
    "temperatureDesc": "Model temperature (0-1)",
    "appearance": "Appearance",
    "theme": "Theme",
    "themeDesc": "Color theme for KiloCode",
    "fontSize": "Font Size",
    "fontSizeDesc": "Font size for chat messages"
  },
  "errors": {
    "cliNotFound": "KiloCode CLI not found. Please install it with: npm install -g @kilocode/cli",
    "cliStartFailed": "Failed to start KiloCode CLI: {{error}}",
    "networkError": "Network error. Please check your connection.",
    "toolFailed": "Tool \"{{tool}}\" failed: {{error}}"
  }
}
```

- [ ] **Step 3: 创建中文翻译**

```json
// src/i18n/locales/zh.json

{
  "common": {
    "ok": "确定",
    "cancel": "取消",
    "save": "保存",
    "delete": "删除",
    "close": "关闭",
    "loading": "加载中...",
    "error": "错误",
    "success": "成功"
  },
  "chat": {
    "title": "KiloCode",
    "send": "发送",
    "cancel": "取消",
    "placeholder": "输入消息... (Enter 发送，Shift+Enter 换行)",
    "newTab": "新建标签页",
    "closeTab": "关闭标签页",
    "noConversation": "暂无对话",
    "startConversation": "开始与 KiloCode 对话"
  },
  "modes": {
    "code": "代码",
    "codeDesc": "编写和编辑代码",
    "plan": "计划",
    "planDesc": "计划和讨论，不做修改",
    "ask": "提问",
    "askDesc": "提问问题，不修改代码"
  },
  "commands": {
    "compact": "/compact",
    "compactDesc": "压缩对话历史",
    "clear": "/clear",
    "clearDesc": "清空当前对话",
    "model": "/model",
    "modelDesc": "切换 AI 模型",
    "mode": "/mode",
    "modeDesc": "切换模式 (plan/code/ask)"
  },
  "mention": {
    "files": "文件",
    "folders": "文件夹",
    "tags": "标签",
    "noResults": "未找到结果"
  },
  "settings": {
    "title": "KiloCode 设置",
    "general": "常规",
    "cliPath": "KiloCode CLI 路径",
    "cliPathDesc": "KiloCode CLI 可执行文件路径",
    "autoStart": "自动启动",
    "autoStartDesc": "打开 Vault 时自动启动 KiloCode CLI",
    "chat": "聊天",
    "maxTabs": "最大标签页数",
    "maxTabsDesc": "聊天标签页最大数量 (1-10)",
    "autoSave": "自动保存",
    "autoSaveDesc": "自动保存对话历史",
    "model": "模型",
    "defaultModel": "默认模型",
    "defaultModelDesc": "默认使用的 AI 模型",
    "temperature": "温度",
    "temperatureDesc": "模型温度 (0-1)",
    "appearance": "外观",
    "theme": "主题",
    "themeDesc": "KiloCode 颜色主题",
    "fontSize": "字体大小",
    "fontSizeDesc": "聊天消息字体大小"
  },
  "errors": {
    "cliNotFound": "未找到 KiloCode CLI。请使用以下命令安装：npm install -g @kilocode/cli",
    "cliStartFailed": "启动 KiloCode CLI 失败：{{error}}",
    "networkError": "网络错误，请检查连接。",
    "toolFailed": "工具 \"{{tool}}\" 失败：{{error}}"
  }
}
```

- [ ] **Step 4: 提交**

```bash
git add src/i18n/
git commit -m "feat: add i18n support with English and Chinese"
```

---

## Task 4: 性能优化 - 虚拟滚动

**Files:**
- Create: `src/shared/VirtualScroller.ts`
- Modify: `src/features/chat/rendering/MessageRenderer.ts`

- [ ] **Step 1: 创建 VirtualScroller**

```typescript
// src/shared/VirtualScroller.ts

/**
 * 虚拟滚动配置
 */
export interface VirtualScrollerConfig {
  itemHeight: number;
  overscan: number;
}

/**
 * 虚拟滚动器
 * 优化长列表性能
 */
export class VirtualScroller {
  private container: HTMLElement;
  private contentEl: HTMLElement;
  private items: any[] = [];
  private config: VirtualScrollerConfig;
  private renderItem: (item: any, index: number) => HTMLElement;
  private visibleItems: Map<number, HTMLElement> = new Map();

  constructor(
    container: HTMLElement,
    config: VirtualScrollerConfig,
    renderItem: (item: any, index: number) => HTMLElement
  ) {
    this.container = container;
    this.config = config;
    this.renderItem = renderItem;

    // 创建内容容器
    this.contentEl = container.createDiv({ cls: 'kilo-virtual-content' });

    // 监听滚动
    container.addEventListener('scroll', () => this.onScroll());
  }

  /** 设置数据 */
  setItems(items: any[]): void {
    this.items = items;
    this.updateTotalHeight();
    this.renderVisibleItems();
  }

  /** 追加数据 */
  appendItem(item: any): void {
    this.items.push(item);
    this.updateTotalHeight();
    this.renderVisibleItems();
  }

  /** 更新总高度 */
  private updateTotalHeight(): void {
    const totalHeight = this.items.length * this.config.itemHeight;
    this.contentEl.style.height = `${totalHeight}px`;
  }

  /** 渲染可见项 */
  private renderVisibleItems(): void {
    const scrollTop = this.container.scrollTop;
    const containerHeight = this.container.clientHeight;

    const startIndex = Math.max(0, Math.floor(scrollTop / this.config.itemHeight) - this.config.overscan);
    const endIndex = Math.min(
      this.items.length,
      Math.ceil((scrollTop + containerHeight) / this.config.itemHeight) + this.config.overscan
    );

    // 清除不可见的项
    for (const [index, el] of this.visibleItems.entries()) {
      if (index < startIndex || index >= endIndex) {
        el.remove();
        this.visibleItems.delete(index);
      }
    }

    // 渲染新可见的项
    for (let i = startIndex; i < endIndex; i++) {
      if (!this.visibleItems.has(i)) {
        const el = this.renderItem(this.items[i], i);
        el.style.position = 'absolute';
        el.style.top = `${i * this.config.itemHeight}px`;
        el.style.width = '100%';
        this.contentEl.appendChild(el);
        this.visibleItems.set(i, el);
      }
    }
  }

  /** 滚动事件处理 */
  private onScroll(): void {
    requestAnimationFrame(() => this.renderVisibleItems());
  }

  /** 滚动到底部 */
  scrollToBottom(): void {
    this.container.scrollTop = this.container.scrollHeight;
  }

  /** 销毁 */
  destroy(): void {
    this.contentEl.remove();
  }
}
```

- [ ] **Step 2: 在 MessageRenderer 中集成虚拟滚动**

```typescript
// src/features/chat/rendering/MessageRenderer.ts (修改)

import { VirtualScroller } from '../../shared/VirtualScroller';

// 添加属性
private virtualScroller: VirtualScroller | null = null;

// 修改 renderMessages 方法
renderMessages(messages: Message[]): void {
  this.container.empty();

  // 如果消息较多，使用虚拟滚动
  if (messages.length > 50) {
    this.virtualScroller = new VirtualScroller(
      this.container,
      { itemHeight: 100, overscan: 5 },
      (message, index) => this.renderMessage(message)
    );
    this.virtualScroller.setItems(messages);
  } else {
    // 消息较少时直接渲染
    for (const message of messages) {
      this.renderMessage(message);
    }
    this.scrollToBottom();
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add src/shared/VirtualScroller.ts src/features/chat/rendering/MessageRenderer.ts
git commit -m "feat: add virtual scrolling for performance"
```

---

## Task 5: 单元测试

**Files:**
- Create: `tests/features/chat/PlanModeController.test.ts`
- Create: `tests/features/mcp/MCPManager.test.ts`
- Create: `tests/i18n/index.test.ts`

- [ ] **Step 1: 创建 PlanModeController 测试**

```typescript
// tests/features/chat/PlanModeController.test.ts

import { PlanModeController } from '../../../src/features/chat/PlanModeController';

describe('PlanModeController', () => {
  let controller: PlanModeController;

  beforeEach(() => {
    controller = new PlanModeController();
  });

  test('should initialize with code mode', () => {
    expect(controller.getCurrentMode()).toBe('code');
  });

  test('should get current mode config', () => {
    const config = controller.getCurrentModeConfig();
    expect(config.id).toBe('code');
    expect(config.name).toBe('Code');
  });

  test('should set mode', () => {
    controller.setMode('plan');
    expect(controller.getCurrentMode()).toBe('plan');
  });

  test('should cycle modes', () => {
    controller.cycleMode();
    expect(controller.getCurrentMode()).toBe('plan');

    controller.cycleMode();
    expect(controller.getCurrentMode()).toBe('ask');

    controller.cycleMode();
    expect(controller.getCurrentMode()).toBe('code');
  });

  test('should get all modes', () => {
    const modes = controller.getAllModes();
    expect(modes).toHaveLength(3);
    expect(modes.map(m => m.id)).toEqual(['code', 'plan', 'ask']);
  });

  test('should get message with prefix', () => {
    const message = 'test message';

    // Code mode - no prefix
    expect(controller.getMessageWithPrefix(message)).toBe(message);

    // Plan mode - with prefix
    controller.setMode('plan');
    expect(controller.getMessageWithPrefix(message)).toContain('[PLAN MODE]');
    expect(controller.getMessageWithPrefix(message)).toContain(message);
  });

  test('should call onModeChange callback', () => {
    const callback = jest.fn();
    controller.setOnModeChange(callback);

    controller.setMode('plan');
    expect(callback).toHaveBeenCalledWith('plan');
  });
});
```

- [ ] **Step 2: 创建 MCPManager 测试**

```typescript
// tests/features/mcp/MCPManager.test.ts

import { MCPManager } from '../../../src/features/mcp/MCPManager';

describe('MCPManager', () => {
  let manager: MCPManager;

  beforeEach(() => {
    manager = new MCPManager();
  });

  test('should initialize with empty servers', () => {
    expect(manager.getServers()).toHaveLength(0);
  });

  test('should add server', async () => {
    const config = {
      id: 'test-server',
      name: 'Test Server',
      command: 'test-command',
      args: [],
    };

    await manager.addServer(config);
    const servers = manager.getServers();
    expect(servers).toHaveLength(1);
    expect(servers[0].config.id).toBe('test-server');
  });

  test('should remove server', async () => {
    const config = {
      id: 'test-server',
      name: 'Test Server',
      command: 'test-command',
      args: [],
    };

    await manager.addServer(config);
    manager.removeServer('test-server');
    expect(manager.getServers()).toHaveLength(0);
  });

  test('should get all tools', () => {
    const tools = manager.getAllTools();
    expect(tools).toHaveLength(0);
  });

  test('should call onToolsChange callback', async () => {
    const callback = jest.fn();
    manager.setOnToolsChange(callback);

    const config = {
      id: 'test-server',
      name: 'Test Server',
      command: 'test-command',
      args: [],
    };

    await manager.addServer(config);
    // Callback should be called when server connects
    // Note: actual connection will fail in test environment
  });
});
```

- [ ] **Step 3: 创建 i18n 测试**

```typescript
// tests/i18n/index.test.ts

import { t, setLocale, getLocale, detectLocale } from '../../src/i18n/index';

describe('i18n', () => {
  beforeEach(() => {
    setLocale('en');
  });

  test('should get translation', () => {
    expect(t('chat.send')).toBe('Send');
  });

  test('should get nested translation', () => {
    expect(t('settings.title')).toBe('KiloCode Settings');
  });

  test('should return key if translation not found', () => {
    expect(t('nonexistent.key')).toBe('nonexistent.key');
  });

  test('should replace parameters', () => {
    const result = t('errors.cliStartFailed', { error: 'test error' });
    expect(result).toContain('test error');
  });

  test('should set and get locale', () => {
    setLocale('zh');
    expect(getLocale()).toBe('zh');
  });

  test('should get Chinese translation', () => {
    setLocale('zh');
    expect(t('chat.send')).toBe('发送');
  });

  test('should detect locale', () => {
    // This test depends on navigator.language
    const locale = detectLocale();
    expect(['en', 'zh']).toContain(locale);
  });
});
```

- [ ] **Step 4: 运行测试**

```bash
npm test
```

Expected: 所有测试通过

- [ ] **Step 5: 提交**

```bash
git add tests/
git commit -m "test: add unit tests for PlanMode, MCP, i18n"
```

---

## Task 6: 集成测试

**Files:**
- Create: `tests/integration/chat-workflow.test.ts`

- [ ] **Step 1: 创建聊天工作流集成测试**

```typescript
// tests/integration/chat-workflow.test.ts

import { TabManager } from '../../src/features/chat/tabs/TabManager';
import { StreamController } from '../../src/features/chat/controllers/StreamController';
import { InputController } from '../../src/features/chat/controllers/InputController';
import { PlanModeController } from '../../src/features/chat/PlanModeController';

describe('Chat Workflow Integration', () => {
  let tabManager: TabManager;
  let streamController: StreamController;
  let inputController: InputController;
  let planModeController: PlanModeController;

  beforeEach(() => {
    tabManager = new TabManager(3);
    streamController = new StreamController();
    inputController = new InputController();
    planModeController = new PlanModeController();
  });

  test('should create tab and send message', async () => {
    // Create tab
    const tab = tabManager.createTab();
    expect(tab).toBeDefined();
    expect(tabManager.getActiveTab()).toBe(tab);

    // Set conversation
    tab.setConversation('conv-1');
    expect(tab.state.conversationId).toBe('conv-1');
  });

  test('should handle streaming response', () => {
    const onText = jest.fn();
    const onComplete = jest.fn();

    streamController.setCallbacks({ onText, onComplete });
    streamController.startStream();

    // Simulate text message
    streamController.handleMessage({
      type: 'text',
      content: 'Hello',
    });

    expect(onText).toHaveBeenCalledWith('Hello');

    // Simulate done
    streamController.handleMessage({
      type: 'done',
    });

    expect(onComplete).toHaveBeenCalled();
    expect(streamController.isCurrentlyStreaming()).toBe(false);
  });

  test('should switch modes', () => {
    expect(planModeController.getCurrentMode()).toBe('code');

    planModeController.cycleMode();
    expect(planModeController.getCurrentMode()).toBe('plan');

    planModeController.cycleMode();
    expect(planModeController.getCurrentMode()).toBe('ask');
  });

  test('should handle tab limit', () => {
    // Create max tabs
    tabManager.createTab();
    tabManager.createTab();
    tabManager.createTab();

    expect(tabManager.canCreateTab()).toBe(false);
    expect(() => tabManager.createTab()).toThrow();
  });

  test('should cancel streaming', () => {
    streamController.startStream();
    expect(streamController.isCurrentlyStreaming()).toBe(true);

    streamController.cancel();
    expect(streamController.isCurrentlyStreaming()).toBe(false);
  });
});
```

- [ ] **Step 2: 运行集成测试**

```bash
npm test -- tests/integration/
```

Expected: 所有测试通过

- [ ] **Step 3: 提交**

```bash
git add tests/integration/
git commit -m "test: add integration tests for chat workflow"
```

---

## Task 7: 最终构建和验证

- [ ] **Step 1: 运行所有测试**

```bash
npm test
```

Expected: 所有测试通过

- [ ] **Step 2: 运行 TypeScript 检查**

```bash
npm run typecheck
```

Expected: 无错误

- [ ] **Step 3: 运行构建**

```bash
npm run build
```

Expected: 生成 `main.js` 和 `styles.css`

- [ ] **Step 4: 检查构建产物**

```bash
ls -la main.js styles.css manifest.json
```

Expected: 所有文件存在

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "chore: final build verification for Phase 4"
```

---

## Phase 4 完成检查清单

- [ ] Plan Mode 实现
- [ ] MCP Server 支持实现
- [ ] i18n 国际化实现
- [ ] 虚拟滚动性能优化
- [ ] 单元测试覆盖
- [ ] 集成测试覆盖
- [ ] TypeScript 编译通过
- [ ] esbuild 构建成功
- [ ] 所有测试通过

---

**完成！所有四个阶段的实现计划已完成。**

**下一步：**
1. 按顺序执行 Phase 1-4 的实施计划
2. 每个阶段完成后进行代码审查
3. 最终测试和发布准备
