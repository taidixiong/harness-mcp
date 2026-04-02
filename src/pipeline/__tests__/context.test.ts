import { describe, it, expect, vi, beforeEach } from 'vitest';
import { gatherWorkspaceContext, formatContextSection } from '../context.js';
import { HarnessStore } from '../../state/store.js';
import type { WorkspaceContext } from '../context.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => 'abc1234 feat: initial commit\ndef5678 fix: something'),
}));

describe('gatherWorkspaceContext', () => {
  let store: HarnessStore;

  beforeEach(() => {
    store = new HarnessStore('test-project');
  });

  it('returns a WorkspaceContext with all required fields', () => {
    const ctx = gatherWorkspaceContext('.', store);
    expect(ctx).toHaveProperty('cwd');
    expect(ctx).toHaveProperty('directoryTree');
    expect(ctx).toHaveProperty('gitLog');
    expect(ctx).toHaveProperty('completedTasks');
    expect(typeof ctx.cwd).toBe('string');
    expect(typeof ctx.directoryTree).toBe('string');
    expect(typeof ctx.gitLog).toBe('string');
    expect(typeof ctx.completedTasks).toBe('string');
  });

  it('returns absolute cwd path', () => {
    const ctx = gatherWorkspaceContext('.', store);
    expect(ctx.cwd).toMatch(/^\//);
  });

  it('reports no completed tasks when store is empty', () => {
    const ctx = gatherWorkspaceContext('.', store);
    expect(ctx.completedTasks).toContain('no completed tasks');
  });
});

describe('formatContextSection', () => {
  it('formats context into a markdown section', () => {
    const ctx: WorkspaceContext = {
      cwd: '/tmp/project',
      directoryTree: '├── src/\n└── package.json',
      gitLog: 'abc1234 initial commit',
      completedTasks: '(no completed tasks yet)',
    };

    const result = formatContextSection(ctx);
    expect(result).toContain('## Workspace Context');
    expect(result).toContain('/tmp/project');
    expect(result).toContain('├── src/');
    expect(result).toContain('abc1234 initial commit');
    expect(result).toContain('no completed tasks');
  });
});
