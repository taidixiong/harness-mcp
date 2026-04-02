import { describe, it, expect, vi } from 'vitest';
import { runDeterministicChecks, formatCheckResults } from '../checks.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn((cmd: string) => {
    if (cmd.includes('fail')) {
      const err = new Error('Command failed') as Error & { stdout: string; stderr: string };
      err.stdout = '';
      err.stderr = 'Error: something broke';
      throw err;
    }
    return 'OK';
  }),
}));

describe('runDeterministicChecks', () => {
  it('returns passed for successful commands', async () => {
    const results = await runDeterministicChecks('/tmp', ['echo ok']);
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true);
    expect(results[0].command).toBe('echo ok');
    expect(results[0].output).toBe('OK');
  });

  it('returns failed for failing commands', async () => {
    const results = await runDeterministicChecks('/tmp', ['fail-cmd']);
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(false);
    expect(results[0].output).toContain('something broke');
  });

  it('handles multiple commands', async () => {
    const results = await runDeterministicChecks('/tmp', ['echo ok', 'fail-cmd']);
    expect(results).toHaveLength(2);
    expect(results[0].passed).toBe(true);
    expect(results[1].passed).toBe(false);
  });

  it('returns empty array for no commands', async () => {
    const results = await runDeterministicChecks('/tmp', []);
    expect(results).toEqual([]);
  });
});

describe('formatCheckResults', () => {
  it('returns empty string for no results', () => {
    expect(formatCheckResults([])).toBe('');
  });

  it('formats all-pass results', () => {
    const result = formatCheckResults([
      { passed: true, output: 'OK', command: 'npm test' },
    ]);
    expect(result).toContain('all passed');
    expect(result).toContain('npm test');
    expect(result).toContain('PASS');
  });

  it('formats mixed results', () => {
    const result = formatCheckResults([
      { passed: true, output: 'OK', command: 'npm run build' },
      { passed: false, output: 'Error: type mismatch', command: 'npx tsc --noEmit' },
    ]);
    expect(result).toContain('FAILURES detected');
    expect(result).toContain('PASS');
    expect(result).toContain('FAIL');
  });

  it('truncates long output', () => {
    const longOutput = 'x'.repeat(600);
    const result = formatCheckResults([
      { passed: true, output: longOutput, command: 'test' },
    ]);
    expect(result).toContain('truncated');
  });
});
