import { describe, it, expect, beforeEach } from 'vitest';
import { LoopDetector } from '../loop-detect.js';

describe('LoopDetector', () => {
  let detector: LoopDetector;

  beforeEach(() => {
    detector = new LoopDetector();
  });

  describe('recordAttempt', () => {
    it('returns false on first occurrence of an output', () => {
      const result = detector.recordAttempt('task-1', 'some output');
      expect(result).toBe(false);
    });

    it('returns true when the same task+output is repeated', () => {
      detector.recordAttempt('task-1', 'some output');
      const result = detector.recordAttempt('task-1', 'some output');
      expect(result).toBe(true);
    });

    it('returns false for different outputs', () => {
      detector.recordAttempt('task-1', 'output A');
      const result = detector.recordAttempt('task-1', 'output B');
      expect(result).toBe(false);
    });

    it('differentiates by task id', () => {
      detector.recordAttempt('task-1', 'same output');
      const result = detector.recordAttempt('task-2', 'same output');
      expect(result).toBe(false);
    });
  });

  describe('recordFileEdit', () => {
    it('returns 1 on first edit', () => {
      expect(detector.recordFileEdit('src/foo.ts')).toBe(1);
    });

    it('increments count on subsequent edits', () => {
      detector.recordFileEdit('src/foo.ts');
      detector.recordFileEdit('src/foo.ts');
      expect(detector.recordFileEdit('src/foo.ts')).toBe(3);
    });

    it('tracks different files independently', () => {
      detector.recordFileEdit('src/a.ts');
      detector.recordFileEdit('src/a.ts');
      expect(detector.recordFileEdit('src/b.ts')).toBe(1);
    });
  });

  describe('getWarning', () => {
    it('returns null when no file exceeds threshold', () => {
      detector.recordFileEdit('src/foo.ts');
      detector.recordFileEdit('src/foo.ts');
      expect(detector.getWarning()).toBeNull();
    });

    it('returns warning when a file reaches 3 edits', () => {
      detector.recordFileEdit('src/foo.ts');
      detector.recordFileEdit('src/foo.ts');
      detector.recordFileEdit('src/foo.ts');
      const warning = detector.getWarning();
      expect(warning).toContain('Loop Detection Warning');
      expect(warning).toContain('src/foo.ts');
      expect(warning).toContain('3 edits');
    });
  });

  describe('extractFileEditsFromToolCalls', () => {
    it('records Write and Edit tool calls', () => {
      detector.extractFileEditsFromToolCalls([
        { name: 'Write', input: { file_path: 'src/a.ts', content: '...' } },
        { name: 'Edit', input: { file_path: 'src/b.ts', old_string: '', new_string: '' } },
        { name: 'Read', input: { file_path: 'src/c.ts' } },
      ]);

      // Write and Edit are tracked, Read is not
      expect(detector.recordFileEdit('src/a.ts')).toBe(2);
      expect(detector.recordFileEdit('src/b.ts')).toBe(2);
      expect(detector.recordFileEdit('src/c.ts')).toBe(1);
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      detector.recordAttempt('task-1', 'output');
      detector.recordFileEdit('src/foo.ts');
      detector.reset();
      expect(detector.recordAttempt('task-1', 'output')).toBe(false);
      expect(detector.recordFileEdit('src/foo.ts')).toBe(1);
    });
  });
});
