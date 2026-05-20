// src/features/chat/PlanModeController.ts

export type ChatMode = 'code' | 'plan' | 'ask';

export interface ModeConfig {
  id: ChatMode;
  name: string;
  description: string;
  icon: string;
  promptPrefix: string;
}

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

export class PlanModeController {
  private currentMode: ChatMode = 'code';
  private onModeChange?: (mode: ChatMode) => void;

  getCurrentMode(): ChatMode {
    return this.currentMode;
  }

  getCurrentModeConfig(): ModeConfig {
    return MODES[this.currentMode];
  }

  getAllModes(): ModeConfig[] {
    return Object.values(MODES);
  }

  setMode(mode: ChatMode): void {
    this.currentMode = mode;
    this.onModeChange?.(mode);
  }

  cycleMode(): void {
    const modes: ChatMode[] = ['code', 'plan', 'ask'];
    const currentIndex = modes.indexOf(this.currentMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    this.setMode(modes[nextIndex]);
  }

  setOnModeChange(callback: (mode: ChatMode) => void): void {
    this.onModeChange = callback;
  }

  getMessageWithPrefix(message: string): string {
    return this.getCurrentModeConfig().promptPrefix + message;
  }
}
