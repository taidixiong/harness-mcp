import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HarnessStore } from '../store.js';

describe('HarnessStore', () => {
  let store: HarnessStore;

  beforeEach(() => {
    store = new HarnessStore();
  });

  it('initializes with empty tasks', () => {
    expect(store.getState().tasks).toEqual([]);
  });

  it('loads tasks from task file data', () => {
    store.loadTasks([
      { id: 'T001', name: 'Test', description: 'Desc', priority: 'high' as const },
    ]);
    expect(store.getState().tasks).toHaveLength(1);
    expect(store.getState().tasks[0].status).toBe('inbox');
  });

  it('updates task status', () => {
    store.loadTasks([
      { id: 'T001', name: 'Test', description: 'Desc', priority: 'high' as const },
    ]);
    store.updateTaskStatus('T001', 'planning');
    expect(store.getState().tasks[0].status).toBe('planning');
  });

  it('records agent stats', () => {
    store.recordAgentRun('planner', 5, 0.01, 1000);
    const stats = store.getState().stats.agents['planner'];
    expect(stats.tasks_done).toBe(1);
    expect(stats.total_turns).toBe(5);
  });

  it('serializes and deserializes', () => {
    store.loadTasks([
      { id: 'T001', name: 'Test', description: 'Desc', priority: 'high' as const },
    ]);
    store.updateTaskStatus('T001', 'done');
    const json = store.serialize();
    const store2 = HarnessStore.deserialize(json);
    expect(store2.getState().tasks[0].status).toBe('done');
  });
});
