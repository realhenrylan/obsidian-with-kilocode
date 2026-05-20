// src/providers/kilocode/models.ts

export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  contextWindow?: number;
}

export const KILOCODE_MODELS: ModelInfo[] = [
  {
    id: 'kilo-1',
    name: 'Kilo-1',
    description: 'Default KiloCode model',
    contextWindow: 128000,
  },
  {
    id: 'kilo-1-fast',
    name: 'Kilo-1 Fast',
    description: 'Faster, smaller context',
    contextWindow: 32000,
  },
];

export function getModelById(id: string): ModelInfo | undefined {
  return KILOCODE_MODELS.find(m => m.id === id);
}
