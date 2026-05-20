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
    const tab = tabManager.createTab();
    expect(tab).toBeDefined();
    expect(tabManager.getActiveTab()).toBe(tab);

    tab.setConversation('conv-1');
    expect(tab.state.conversationId).toBe('conv-1');
  });

  test('should handle streaming response', () => {
    const onText = jest.fn();
    const onComplete = jest.fn();

    streamController.setCallbacks({ onText, onComplete });
    streamController.startStream();

    streamController.handleMessage({
      type: 'text',
      content: 'Hello',
    });

    expect(onText).toHaveBeenCalledWith('Hello');

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
