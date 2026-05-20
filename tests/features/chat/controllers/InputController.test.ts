import { InputController } from '../../../../src/features/chat/controllers/InputController';
import type { ChatRuntime } from '../../../../src/core/providers/types';

function createMockRuntime(): ChatRuntime & {
  _onCompleteCb: (() => void) | null;
  _onErrorCb: ((error: Error) => void) | null;
} {
  const mock = {
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn().mockResolvedValue(undefined),
    sendMessage: jest.fn().mockResolvedValue(undefined),
    cancel: jest.fn(),
    resetSession: jest.fn(),
    isStreaming: jest.fn().mockReturnValue(false),
    onMessage: jest.fn(),
    onError: jest.fn(),
    onComplete: jest.fn(),
    _onCompleteCb: null as (() => void) | null,
    _onErrorCb: null as ((error: Error) => void) | null,
  };

  mock.onComplete.mockImplementation((cb: () => void) => {
    mock._onCompleteCb = cb;
  });
  mock.onError.mockImplementation((cb: (error: Error) => void) => {
    mock._onErrorCb = cb;
  });

  return mock;
}

describe('InputController', () => {
  let controller: InputController;

  beforeEach(() => {
    controller = new InputController();
  });

  describe('setRuntime', () => {
    test('binds runtime and wires onComplete callback', () => {
      const mock = createMockRuntime();
      controller.setRuntime(mock);
      expect(mock.onComplete).toHaveBeenCalled();
      expect(mock.onError).toHaveBeenCalled();
    });

    test('onComplete callback resets streaming state', async () => {
      const mock = createMockRuntime();
      controller.setRuntime(mock);

      await controller.sendMessage('hi');
      expect(controller.isCurrentlyStreaming()).toBe(true);

      mock._onCompleteCb!();
      expect(controller.isCurrentlyStreaming()).toBe(false);
    });

    test('onError callback resets streaming state', async () => {
      const mock = createMockRuntime();
      controller.setRuntime(mock);

      await controller.sendMessage('hi');
      expect(controller.isCurrentlyStreaming()).toBe(true);

      mock._onErrorCb!(new Error('test'));
      expect(controller.isCurrentlyStreaming()).toBe(false);
    });
  });

  describe('sendMessage', () => {
    test('throws if no runtime set', async () => {
      await expect(controller.sendMessage('hi')).rejects.toThrow('Runtime not set');
    });

    test('calls runtime.sendMessage and onSend callback', async () => {
      const mock = createMockRuntime();
      const onSend = jest.fn();
      controller.setRuntime(mock);
      controller.setCallbacks({ onSend });

      await controller.sendMessage('hello');

      expect(mock.sendMessage).toHaveBeenCalledWith('hello');
      expect(onSend).toHaveBeenCalledWith('hello');
      expect(controller.isCurrentlyStreaming()).toBe(true);
    });

    test('skips if already streaming', async () => {
      const mock = createMockRuntime();
      controller.setRuntime(mock);

      await controller.sendMessage('first');
      await controller.sendMessage('second');

      expect(mock.sendMessage).toHaveBeenCalledTimes(1);
    });

    test('rethrows error and resets streaming', async () => {
      const mock = createMockRuntime();
      mock.sendMessage.mockRejectedValueOnce(new Error('network error'));
      controller.setRuntime(mock);

      await expect(controller.sendMessage('hi')).rejects.toThrow('network error');
      expect(controller.isCurrentlyStreaming()).toBe(false);
    });
  });

  describe('cancel', () => {
    test('calls runtime.cancel when streaming', async () => {
      const mock = createMockRuntime();
      const onCancel = jest.fn();
      controller.setRuntime(mock);
      controller.setCallbacks({ onCancel });

      await controller.sendMessage('hi');
      controller.cancel();

      expect(mock.cancel).toHaveBeenCalled();
      expect(controller.isCurrentlyStreaming()).toBe(false);
      expect(onCancel).toHaveBeenCalled();
    });

    test('does nothing when not streaming', () => {
      const mock = createMockRuntime();
      controller.setRuntime(mock);

      controller.cancel();
      expect(mock.cancel).not.toHaveBeenCalled();
    });

    test('does nothing when no runtime', () => {
      controller.cancel();
      // should not throw
    });
  });

  describe('isCurrentlyStreaming', () => {
    test('returns false initially', () => {
      expect(controller.isCurrentlyStreaming()).toBe(false);
    });

    test('returns true after sendMessage', async () => {
      const mock = createMockRuntime();
      controller.setRuntime(mock);
      await controller.sendMessage('hi');
      expect(controller.isCurrentlyStreaming()).toBe(true);
    });
  });

  describe('setCallbacks', () => {
    test('merges callbacks', async () => {
      const mock = createMockRuntime();
      const onSend1 = jest.fn();
      const onSend2 = jest.fn();
      controller.setRuntime(mock);

      controller.setCallbacks({ onSend: onSend1 });
      controller.setCallbacks({ onSend: onSend2 });

      await controller.sendMessage('hi');

      expect(onSend1).not.toHaveBeenCalled();
      expect(onSend2).toHaveBeenCalledWith('hi');
    });
  });
});
