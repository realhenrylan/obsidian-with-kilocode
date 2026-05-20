// tests/integration/chat-workflow.test.ts

import { TabManager } from '../../src/features/chat/tabs/TabManager';
import { StreamController } from '../../src/features/chat/controllers/StreamController';
import { InputController } from '../../src/features/chat/controllers/InputController';
import { PlanModeController } from '../../src/features/chat/PlanModeController';
import type { StreamChunk } from '../../src/core/providers/types';

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

  test('should handle streaming response', async () => {
    const onText = jest.fn();
    const onComplete = jest.fn();

    async function* generator() {
      yield { type: 'text' as const, content: 'Hello' };
      yield { type: 'done' as const };
    }

    const message = await streamController.consumeStream(generator(), { onText, onComplete });

    expect(onText).toHaveBeenCalledWith('Hello');
    expect(onComplete).toHaveBeenCalled();
    expect(message.content).toBe('Hello');
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

  test('should cancel streaming', async () => {
    const onText = jest.fn();

    async function* generator() {
      yield { type: 'text' as const, content: 'part1' };
      await new Promise(resolve => setTimeout(resolve, 100));
      yield { type: 'text' as const, content: 'part2' };
      yield { type: 'done' as const };
    }

    const promise = streamController.consumeStream(generator(), { onText });
    await new Promise(resolve => setTimeout(resolve, 10));

    streamController.cancel();

    const message = await promise;
    expect(message.content).toBe('part1');
    expect(onText).not.toHaveBeenCalledWith('part2');
  });
});
