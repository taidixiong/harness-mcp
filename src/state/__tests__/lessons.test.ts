import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LessonStore, formatLessonsSection } from '../lessons.js';
import type { Lesson } from '../lessons.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('LessonStore', () => {
  let store: LessonStore;
  let tmpFile: string;

  beforeEach(() => {
    store = new LessonStore();
    tmpFile = path.join(os.tmpdir(), `harness-lessons-test-${Date.now()}.json`);
  });

  afterEach(() => {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  });

  describe('addLesson', () => {
    it('adds a lesson to the store', () => {
      const lesson: Lesson = {
        taskId: 'task-1',
        agent: 'code_reviewer',
        pattern: 'Missing null check on user input',
        fix: 'Added validation before accessing property',
        timestamp: new Date().toISOString(),
      };
      store.addLesson(lesson);
      expect(store.getAll()).toHaveLength(1);
      expect(store.getAll()[0]).toEqual(lesson);
    });
  });

  describe('save and load', () => {
    it('persists lessons to disk and loads them back', () => {
      store.addLesson({
        taskId: 'task-1',
        agent: 'qa_engineer',
        pattern: 'Tests fail due to missing mock',
        fix: 'Added vi.mock for dependency',
        timestamp: new Date().toISOString(),
      });

      store.save(tmpFile);
      expect(fs.existsSync(tmpFile)).toBe(true);

      const loaded = new LessonStore();
      loaded.load(tmpFile);
      expect(loaded.getAll()).toHaveLength(1);
      expect(loaded.getAll()[0].pattern).toBe('Tests fail due to missing mock');
    });

    it('creates parent directory if it does not exist', () => {
      const nested = path.join(os.tmpdir(), `harness-test-${Date.now()}`, 'sub', 'lessons.json');
      store.addLesson({
        taskId: 'task-1',
        agent: 'debugger',
        pattern: 'test',
        fix: 'test',
        timestamp: new Date().toISOString(),
      });
      store.save(nested);
      expect(fs.existsSync(nested)).toBe(true);
      // cleanup
      fs.rmSync(path.dirname(path.dirname(nested)), { recursive: true });
    });

    it('handles missing file gracefully', () => {
      const loaded = new LessonStore();
      loaded.load('/nonexistent/path/lessons.json');
      expect(loaded.getAll()).toHaveLength(0);
    });

    it('handles corrupted file gracefully', () => {
      fs.writeFileSync(tmpFile, 'not json', 'utf-8');
      const loaded = new LessonStore();
      loaded.load(tmpFile);
      expect(loaded.getAll()).toHaveLength(0);
    });
  });

  describe('findRelevant', () => {
    beforeEach(() => {
      store.addLesson({
        taskId: 'task-1',
        agent: 'code_reviewer',
        pattern: 'TypeScript build fails due to missing type annotation',
        fix: 'Added explicit return type to function',
        timestamp: '2024-01-01T00:00:00Z',
      });
      store.addLesson({
        taskId: 'task-2',
        agent: 'qa_engineer',
        pattern: 'Database connection timeout in tests',
        fix: 'Increased timeout and added retry logic',
        timestamp: '2024-01-02T00:00:00Z',
      });
      store.addLesson({
        taskId: 'task-3',
        agent: 'debugger',
        pattern: 'React component renders blank due to missing key prop',
        fix: 'Added unique key to list items',
        timestamp: '2024-01-03T00:00:00Z',
      });
    });

    it('finds lessons matching keywords in task description', () => {
      const results = store.findRelevant('fix TypeScript build error');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].pattern).toContain('TypeScript');
    });

    it('returns empty array for no matching keywords', () => {
      const results = store.findRelevant('xyz qqq');
      expect(results).toHaveLength(0);
    });

    it('respects the limit parameter', () => {
      const results = store.findRelevant('type annotation build function', 1);
      expect(results).toHaveLength(1);
    });

    it('returns empty for very short words (filtered out)', () => {
      const results = store.findRelevant('a b c');
      expect(results).toHaveLength(0);
    });
  });
});

describe('formatLessonsSection', () => {
  it('returns empty string for empty lessons', () => {
    expect(formatLessonsSection([])).toBe('');
  });

  it('formats lessons into markdown', () => {
    const lessons: Lesson[] = [
      {
        taskId: 'task-1',
        agent: 'code_reviewer',
        pattern: 'Null check missing',
        fix: 'Added guard clause',
        timestamp: '2024-01-01T00:00:00Z',
      },
    ];
    const result = formatLessonsSection(lessons);
    expect(result).toContain('## Lessons from Previous Runs');
    expect(result).toContain('Null check missing');
    expect(result).toContain('Added guard clause');
    expect(result).toContain('task-1');
  });
});
