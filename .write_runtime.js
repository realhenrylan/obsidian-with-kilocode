import type { ChatRuntime, MessageContext, StreamChunk, StreamChunkType } from '../../../core/providers/types';
import type { BinaryManager } from '../../../core/binary/BinaryManager';
import type { KiloCodeSettings } from '../../../core/types';
import { randomBytes } from 'crypto';

// Use the official @kilocode/sdk for server/client lifecycle
