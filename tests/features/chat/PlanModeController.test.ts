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

    expect(controller.getMessageWithPrefix(message)).toBe(message);

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
