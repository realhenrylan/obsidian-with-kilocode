import { InputController } from '../../../../src/features/chat/controllers/InputController';
import type { ChatRuntime } from '../../../../src/core/providers/types';

describe('InputController', () => {
  let controller: InputController;
  let mockRuntime: ChatRuntime;

  beforeEach(() => {
    controller = new InputController();
    mockRuntime = {
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      sendMessage: jest.fn(),
      cancel: jest.fn(),
      resetSession: jest.fn(),
      isStreaming: jest.fn().mockReturnValue(false),
    };
  });

  describe('setRuntime / getRuntime', () => {
    test('设置和获取 runtime', () => {
      expect(controller.getRuntime()).toBeNull();
      controller.setRuntime(mockRuntime);
      expect(controller.getRuntime()).toBe(mockRuntime);
    });
  });

  describe('cancel', () => {
    test('调用 runtime.cancel()', () => {
      controller.setRuntime(mockRuntime);
      controller.cancel();
      expect(mockRuntime.cancel).toHaveBeenCalled();
    });

    test('runtime 未设置时不抛错', () => {
      expect(() => controller.cancel()).not.toThrow();
    });
  });
});
