import { EventEmitter } from 'node:events';

export type HarnessEventType =
  | 'agent:start'
  | 'agent:event'
  | 'agent:complete'
  | 'agent:error'
  | 'task:status_change'
  | 'pipeline:start'
  | 'pipeline:complete'
  | 'pipeline:error';

export interface HarnessEvent {
  type: HarnessEventType;
  timestamp: string;
  agent?: string;
  taskId?: string;
  data: unknown;
}

class HarnessEventBus extends EventEmitter {
  emit(type: HarnessEventType, event: Omit<HarnessEvent, 'type' | 'timestamp'>): boolean {
    const full: HarnessEvent = {
      type,
      timestamp: new Date().toISOString(),
      ...event,
    };
    return super.emit(type, full) || super.emit('*', full);
  }
}

export const eventBus = new HarnessEventBus();
