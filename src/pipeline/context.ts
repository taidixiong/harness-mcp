import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import type { HarnessStore } from '../state/store.js';

export interface WorkspaceContext {
  cwd: string;
  directoryTree: string;
  gitLog: string;
  completedTasks: string;
}

const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'vendor', '.harness',
  '__pycache__', '.next', '.turbo', 'coverage',
]);

function buildDirectoryTree(dir: string, depth: number, prefix = ''): string {
  if (depth < 0) return '';

  const lines: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return '';
  }

  const filtered = entries
    .filter((e) => !e.name.startsWith('.') || e.name === '.env.example')
    .filter((e) => !EXCLUDED_DIRS.has(e.name))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  for (let i = 0; i < filtered.length; i++) {
    const entry = filtered[i];
    const isLast = i === filtered.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';

    if (entry.isDirectory()) {
      lines.push(`${prefix}${connector}${entry.name}/`);
      if (depth > 0) {
        const subtree = buildDirectoryTree(
          path.join(dir, entry.name),
          depth - 1,
          `${prefix}${childPrefix}`,
        );
        if (subtree) lines.push(subtree);
      }
    } else {
      lines.push(`${prefix}${connector}${entry.name}`);
    }
  }

  return lines.join('\n');
}

function getGitLog(workdir: string, count = 10): string {
  try {
    return execSync(`git log --oneline -${count}`, {
      cwd: workdir,
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
  } catch {
    return '(no git history available)';
  }
}

function getCompletedTasksSummary(store: HarnessStore): string {
  const state = store.getState();
  const done = state.tasks.filter((t) => t.status === 'done');
  if (done.length === 0) return '(no completed tasks yet)';

  return done
    .map((t) => `- [${t.id}] ${t.name} (attempts: ${t.attempt})`)
    .join('\n');
}

export function gatherWorkspaceContext(
  workdir: string,
  store: HarnessStore,
): WorkspaceContext {
  const resolvedDir = path.resolve(workdir);
  return {
    cwd: resolvedDir,
    directoryTree: buildDirectoryTree(resolvedDir, 3),
    gitLog: getGitLog(resolvedDir),
    completedTasks: getCompletedTasksSummary(store),
  };
}

export function formatContextSection(ctx: WorkspaceContext): string {
  return `## Workspace Context

### Working Directory
\`${ctx.cwd}\`

### Directory Structure
\`\`\`
${ctx.directoryTree}
\`\`\`

### Recent Git History
\`\`\`
${ctx.gitLog}
\`\`\`

### Completed Tasks
${ctx.completedTasks}
`;
}
