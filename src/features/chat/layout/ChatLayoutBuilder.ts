// src/features/chat/layout/ChatLayoutBuilder.ts
// 聊天视图布局构建器
// 职责：一次性创建视图 DOM 骨架，返回关键元素引用。
// 事件注册由调用方（KiloCodeView）负责——registerDomEvent 是 ItemView 方法，
// 不能移出；builder 保持纯 DOM 创建，仅依赖 i18n 按钮文本。

export interface ChatLayoutRefs {
  viewContainerEl: HTMLElement;
  modeToggleEl: HTMLElement;
  tabBarEl: HTMLElement;
  messagesEl: HTMLElement;
  toolbarContainer: HTMLElement;
  inputContainerEl: HTMLElement;
  textareaEl: HTMLTextAreaElement;
  actionBarEl: HTMLElement;
  sendBtnEl: HTMLButtonElement;
  cancelBtnEl: HTMLButtonElement;
}

import { t } from '../../../i18n';

export class ChatLayoutBuilder {
  /** 构建整个视图骨架（幂等：调用方负责只调一次） */
  static build(container: HTMLElement): ChatLayoutRefs {
    container.empty();
    container.addClass('kilo-code-view');

    // 模式切换
    const modeToggleEl = container.createDiv({ cls: 'kilo-mode-toggle' });
    const modeBtn = modeToggleEl.createEl('button', { cls: 'kilo-mode-btn' });
    modeBtn.createSpan({ cls: 'kilo-mode-hint', text: ' (Shift+Tab)' });

    // 标签栏
    const tabBarEl = container.createDiv({ cls: 'kilo-tab-bar' });

    // 消息区域（持久化）
    const messagesEl = container.createDiv({ cls: 'kilo-messages' });

    // 工具栏容器（InputToolbar 实例化由调用方完成）
    const toolbarContainer = container.createDiv({ cls: 'kilo-toolbar-container' });

    // 输入区域（图片预览区由 ImageContext 渲染）
    const inputContainerEl = container.createDiv({ cls: 'kilo-input-container' });
    const textareaEl = inputContainerEl.createEl('textarea', { cls: 'kilo-input' });

    // 操作栏
    const actionBarEl = container.createDiv({ cls: 'kilo-action-bar' });
    const sendBtnEl = actionBarEl.createEl('button', {
      cls: 'kilo-btn kilo-btn-primary',
      text: t('chat.send'),
    });
    const cancelBtnEl = actionBarEl.createEl('button', {
      cls: 'kilo-btn kilo-btn-cancel',
      text: t('chat.cancel'),
    });
    cancelBtnEl.style.display = 'none';

    return {
      viewContainerEl: container,
      modeToggleEl,
      tabBarEl,
      messagesEl,
      toolbarContainer,
      inputContainerEl,
      textareaEl,
      actionBarEl,
      sendBtnEl,
      cancelBtnEl,
    };
  }
}
