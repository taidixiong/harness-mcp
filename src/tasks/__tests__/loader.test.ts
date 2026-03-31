import { describe, it, expect, vi } from 'vitest';
import { loadTasks } from '../loader.js';
import fs from 'node:fs';

vi.mock('node:fs');

describe('loadTasks', () => {
  it('parses valid tasks YAML', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(`
tasks:
  - id: T001
    name: "Build login"
    description: "Implement login endpoint"
    priority: high
  - id: T002
    name: "Build register"
    description: "Implement register endpoint"
`);
    const result = loadTasks('tasks.yaml');
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[0].id).toBe('T001');
    expect(result.tasks[1].priority).toBe('medium'); // default
  });

  it('throws on empty tasks', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('tasks: []');
    expect(() => loadTasks('tasks.yaml')).toThrow();
  });
});
