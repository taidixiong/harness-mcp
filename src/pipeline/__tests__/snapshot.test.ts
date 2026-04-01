import { describe, it, expect } from 'vitest';
import { computeSnapshotDiff, type FileSnapshot } from '../snapshot.js';

describe('computeSnapshotDiff', () => {
  it('detects added files', () => {
    const before: FileSnapshot[] = [
      { path: 'a.go', size: 100, mtimeMs: 1000 },
    ];
    const after: FileSnapshot[] = [
      { path: 'a.go', size: 100, mtimeMs: 1000 },
      { path: 'b.go', size: 200, mtimeMs: 2000 },
    ];
    const diff = computeSnapshotDiff(before, after);
    expect(diff.added).toEqual(['b.go']);
    expect(diff.modified).toEqual([]);
    expect(diff.deleted).toEqual([]);
  });

  it('detects modified files', () => {
    const before: FileSnapshot[] = [
      { path: 'a.go', size: 100, mtimeMs: 1000 },
    ];
    const after: FileSnapshot[] = [
      { path: 'a.go', size: 150, mtimeMs: 2000 },
    ];
    const diff = computeSnapshotDiff(before, after);
    expect(diff.modified).toEqual(['a.go']);
  });

  it('detects deleted files', () => {
    const before: FileSnapshot[] = [
      { path: 'a.go', size: 100, mtimeMs: 1000 },
      { path: 'b.go', size: 200, mtimeMs: 1000 },
    ];
    const after: FileSnapshot[] = [
      { path: 'a.go', size: 100, mtimeMs: 1000 },
    ];
    const diff = computeSnapshotDiff(before, after);
    expect(diff.deleted).toEqual(['b.go']);
  });
});
