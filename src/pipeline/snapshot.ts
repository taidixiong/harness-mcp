import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

export interface FileSnapshot {
  path: string;
  size: number;
  mtimeMs: number;
}

export interface SnapshotDiff {
  added: string[];
  modified: string[];
  deleted: string[];
}

export function takeSnapshot(workdir: string, extensions = ['.ts', '.js', '.go', '.py', '.rs', '.java']): FileSnapshot[] {
  const results: FileSnapshot[] = [];

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'vendor', '.harness'].includes(entry.name)) continue;
        walk(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.length === 0 || extensions.includes(ext)) {
          const stat = fs.statSync(full);
          results.push({
            path: path.relative(workdir, full),
            size: stat.size,
            mtimeMs: stat.mtimeMs,
          });
        }
      }
    }
  }

  walk(workdir);
  return results.sort((a, b) => a.path.localeCompare(b.path));
}

export function computeSnapshotDiff(before: FileSnapshot[], after: FileSnapshot[]): SnapshotDiff {
  const beforeMap = new Map(before.map((f) => [f.path, f]));
  const afterMap = new Map(after.map((f) => [f.path, f]));

  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  for (const [p, snap] of afterMap) {
    const prev = beforeMap.get(p);
    if (!prev) {
      added.push(p);
    } else if (prev.size !== snap.size || prev.mtimeMs !== snap.mtimeMs) {
      modified.push(p);
    }
  }

  for (const p of beforeMap.keys()) {
    if (!afterMap.has(p)) {
      deleted.push(p);
    }
  }

  return { added, modified, deleted };
}

export function getGitDiff(workdir: string, files: string[]): string {
  if (files.length === 0) return '';
  try {
    return execSync(`git diff -- ${files.join(' ')}`, { cwd: workdir, encoding: 'utf-8' });
  } catch {
    return '';
  }
}
