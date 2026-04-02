# Claude Harness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a generic multi-agent harness CLI tool that orchestrates six Claude Code agents in a pipeline, with Terminal TUI for real-time monitoring.

**Architecture:** Standalone TypeScript/Node.js project. Each agent is a `claude -p` subprocess producing stream-json events. Pipeline Runner orchestrates the agent sequence with VERDICT protocol, retry logic, and file snapshot diffs. Ink renders a 4-tab TUI. State persists to local JSON files.

**Tech Stack:** TypeScript 5.4, Node.js 20+, Ink 5, React 18, Commander 12, Zod 3, YAML 2

**Design Doc:** `docs/plans/2026-03-31-claude-harness-design.md`

---

## Phase 1: Project Scaffolding

### Task 1: Initialize project

**Files:**
- Create: `claude-harness/package.json`
- Create: `claude-harness/tsconfig.json`
- Create: `claude-harness/.gitignore`

**Step 1: Create project directory**

```bash
mkdir -p ~/Desktop/code/dp/claude-harness
cd ~/Desktop/code/dp/claude-harness
git init
```

**Step 2: Create package.json**

```json
{
  "name": "claude-harness",
  "version": "0.1.0",
  "description": "Multi-agent harness for Claude Code CLI",
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "harness": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "ink": "^5.1.0",
    "ink-spinner": "^5.0.0",
    "react": "^18.3.1",
    "chalk": "^5.4.1",
    "commander": "^13.1.0",
    "zod": "^3.24.0",
    "yaml": "^2.7.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/react": "^18.3.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "vitest": "^3.0.0"
  }
}
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "jsx": "react-jsx",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

**Step 4: Create .gitignore**

```
node_modules/
dist/
.harness/
*.log
```

**Step 5: Install dependencies and verify**

```bash
npm install
npx tsc --noEmit  # should pass (no source files yet)
```

**Step 6: Commit**

```bash
git add package.json tsconfig.json .gitignore package-lock.json
git commit -m "chore: init claude-harness project"
```

---

## Phase 2: Config & Task Schema

### Task 2: Config schema and loader

**Files:**
- Create: `claude-harness/src/config/schema.ts`
- Create: `claude-harness/src/config/loader.ts`
- Create: `claude-harness/src/config/__tests__/loader.test.ts`

**Step 1: Write config Zod schema**

`src/config/schema.ts`:

```typescript
import { z } from 'zod';

export const AgentConfigSchema = z.object({
  model: z.string().default('sonnet'),
  system_prompt: z.string(),
  max_turns: z.number().int().positive().default(20),
  allowed_tools: z.array(z.string()).default(['Read', 'Glob', 'Grep']),
});

export const PipelineConfigSchema = z.object({
  max_retry: z.number().int().min(0).default(2),
  auto_commit: z.boolean().default(false),
  snapshot_enabled: z.boolean().default(true),
});

export const HarnessConfigSchema = z.object({
  project: z.object({
    name: z.string(),
    workdir: z.string().default('.'),
  }),
  agents: z.object({
    planner: AgentConfigSchema,
    generator: AgentConfigSchema,
    code_reviewer: AgentConfigSchema,
    security_reviewer: AgentConfigSchema,
    qa_engineer: AgentConfigSchema,
    debugger: AgentConfigSchema,
  }),
  pipeline: PipelineConfigSchema.default({}),
  tasks_file: z.string().default('./tasks.yaml'),
  state_file: z.string().default('./.harness/state.json'),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;
export type HarnessConfig = z.infer<typeof HarnessConfigSchema>;
```

**Step 2: Write failing test for loader**

`src/config/__tests__/loader.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadConfig } from '../loader.js';
import fs from 'node:fs';

vi.mock('node:fs');

const VALID_YAML = `
project:
  name: test-project
  workdir: "."
agents:
  planner:
    model: opus
    system_prompt: "Plan tasks"
    max_turns: 20
    allowed_tools: ["Read", "Glob", "Grep"]
  generator:
    model: sonnet
    system_prompt: "Generate code"
    max_turns: 40
    allowed_tools: ["Read", "Write", "Edit", "Bash"]
  code_reviewer:
    model: opus
    system_prompt: "Review code"
  security_reviewer:
    model: opus
    system_prompt: "Review security"
  qa_engineer:
    model: sonnet
    system_prompt: "Test code"
  debugger:
    model: sonnet
    system_prompt: "Debug code"
`;

describe('loadConfig', () => {
  it('parses valid YAML config', () => {
    vi.mocked(fs.readFileSync).mockReturnValue(VALID_YAML);
    const config = loadConfig('harness.yaml');
    expect(config.project.name).toBe('test-project');
    expect(config.agents.planner.model).toBe('opus');
    expect(config.pipeline.max_retry).toBe(2); // default
  });

  it('throws on missing file', () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });
    expect(() => loadConfig('missing.yaml')).toThrow();
  });

  it('throws on invalid schema', () => {
    vi.mocked(fs.readFileSync).mockReturnValue('project:\n  name: 123');
    expect(() => loadConfig('bad.yaml')).toThrow();
  });
});
```

**Step 3: Run test to verify it fails**

```bash
npx vitest run src/config/__tests__/loader.test.ts
# Expected: FAIL - module not found
```

**Step 4: Implement loader**

`src/config/loader.ts`:

```typescript
import fs from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { HarnessConfigSchema, type HarnessConfig } from './schema.js';

export function loadConfig(filePath: string): HarnessConfig {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseYaml(raw);
  return HarnessConfigSchema.parse(parsed);
}
```

**Step 5: Run test to verify it passes**

```bash
npx vitest run src/config/__tests__/loader.test.ts
# Expected: PASS
```

**Step 6: Commit**

```bash
git add src/config/
git commit -m "feat: add config schema and loader with Zod validation"
```

---

### Task 3: Task file schema and loader

**Files:**
- Create: `claude-harness/src/tasks/schema.ts`
- Create: `claude-harness/src/tasks/loader.ts`
- Create: `claude-harness/src/tasks/__tests__/loader.test.ts`

**Step 1: Write task schema**

`src/tasks/schema.ts`:

```typescript
import { z } from 'zod';

export const TaskStatus = z.enum([
  'inbox', 'planning', 'generating', 'reviewing',
  'qa_testing', 'debugging', 'done', 'failed',
]);

export const TaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
});

export const TasksFileSchema = z.object({
  tasks: z.array(TaskSchema).min(1),
});

export type TaskStatus = z.infer<typeof TaskStatus>;
export type Task = z.infer<typeof TaskSchema>;
export type TasksFile = z.infer<typeof TasksFileSchema>;
```

**Step 2: Write failing test**

`src/tasks/__tests__/loader.test.ts`:

```typescript
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
```

**Step 3: Run test → FAIL**

```bash
npx vitest run src/tasks/__tests__/loader.test.ts
```

**Step 4: Implement loader**

`src/tasks/loader.ts`:

```typescript
import fs from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { TasksFileSchema, type TasksFile } from './schema.js';

export function loadTasks(filePath: string): TasksFile {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseYaml(raw);
  return TasksFileSchema.parse(parsed);
}
```

**Step 5: Run test → PASS**

```bash
npx vitest run src/tasks/__tests__/loader.test.ts
```

**Step 6: Commit**

```bash
git add src/tasks/
git commit -m "feat: add task file schema and loader"
```

---

## Phase 3: State & Events

### Task 4: Event bus

**Files:**
- Create: `claude-harness/src/state/events.ts`

**Step 1: Implement event bus**

`src/state/events.ts`:

```typescript
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
```

**Step 2: Commit**

```bash
git add src/state/events.ts
git commit -m "feat: add event bus for inter-module communication"
```

---

### Task 5: State store with persistence

**Files:**
- Create: `claude-harness/src/state/store.ts`
- Create: `claude-harness/src/state/__tests__/store.test.ts`

**Step 1: Write failing test**

`src/state/__tests__/store.test.ts`:

```typescript
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
```

**Step 2: Run test → FAIL**

```bash
npx vitest run src/state/__tests__/store.test.ts
```

**Step 3: Implement store**

`src/state/store.ts`:

```typescript
import fs from 'node:fs';
import path from 'node:path';
import type { Task, TaskStatus } from '../tasks/schema.js';
import { eventBus } from './events.js';

interface TaskState {
  id: string;
  name: string;
  description: string;
  priority: string;
  status: TaskStatus;
  attempt: number;
  current_agent: string | null;
  started_at: string | null;
  completed_at: string | null;
  verdict_history: Array<{ agent: string; verdict: 'PASS' | 'FAIL'; reason: string }>;
}

interface AgentStats {
  tasks_done: number;
  total_turns: number;
  total_cost_usd: number;
  total_duration_ms: number;
}

interface HarnessState {
  project: string;
  started_at: string;
  tasks: TaskState[];
  stats: {
    total_cost_usd: number;
    total_duration_ms: number;
    total_tool_calls: number;
    agents: Record<string, AgentStats>;
  };
}

export class HarnessStore {
  private state: HarnessState;

  constructor(projectName = '') {
    this.state = {
      project: projectName,
      started_at: new Date().toISOString(),
      tasks: [],
      stats: {
        total_cost_usd: 0,
        total_duration_ms: 0,
        total_tool_calls: 0,
        agents: {},
      },
    };
  }

  getState(): Readonly<HarnessState> {
    return this.state;
  }

  loadTasks(tasks: Task[]): void {
    this.state = {
      ...this.state,
      tasks: tasks.map((t) => ({
        ...t,
        status: 'inbox' as TaskStatus,
        attempt: 0,
        current_agent: null,
        started_at: null,
        completed_at: null,
        verdict_history: [],
      })),
    };
  }

  updateTaskStatus(taskId: string, status: TaskStatus, agent?: string): void {
    this.state = {
      ...this.state,
      tasks: this.state.tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status,
              current_agent: agent ?? null,
              started_at: t.started_at ?? new Date().toISOString(),
              completed_at: status === 'done' || status === 'failed' ? new Date().toISOString() : t.completed_at,
            }
          : t
      ),
    };
    eventBus.emit('task:status_change', { taskId, data: { status } });
  }

  incrementAttempt(taskId: string): void {
    this.state = {
      ...this.state,
      tasks: this.state.tasks.map((t) =>
        t.id === taskId ? { ...t, attempt: t.attempt + 1 } : t
      ),
    };
  }

  addVerdict(taskId: string, agent: string, verdict: 'PASS' | 'FAIL', reason: string): void {
    this.state = {
      ...this.state,
      tasks: this.state.tasks.map((t) =>
        t.id === taskId
          ? { ...t, verdict_history: [...t.verdict_history, { agent, verdict, reason }] }
          : t
      ),
    };
  }

  recordAgentRun(agent: string, turns: number, costUsd: number, durationMs: number): void {
    const prev = this.state.stats.agents[agent] ?? {
      tasks_done: 0, total_turns: 0, total_cost_usd: 0, total_duration_ms: 0,
    };
    this.state = {
      ...this.state,
      stats: {
        ...this.state.stats,
        total_cost_usd: this.state.stats.total_cost_usd + costUsd,
        total_duration_ms: this.state.stats.total_duration_ms + durationMs,
        agents: {
          ...this.state.stats.agents,
          [agent]: {
            tasks_done: prev.tasks_done + 1,
            total_turns: prev.total_turns + turns,
            total_cost_usd: prev.total_cost_usd + costUsd,
            total_duration_ms: prev.total_duration_ms + durationMs,
          },
        },
      },
    };
  }

  getNextPendingTask(): TaskState | undefined {
    return this.state.tasks.find((t) => t.status === 'inbox');
  }

  getTask(taskId: string): TaskState | undefined {
    return this.state.tasks.find((t) => t.id === taskId);
  }

  serialize(): string {
    return JSON.stringify(this.state, null, 2);
  }

  static deserialize(json: string): HarnessStore {
    const data = JSON.parse(json) as HarnessState;
    const store = new HarnessStore();
    store.state = data;
    return store;
  }

  saveTo(filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, this.serialize(), 'utf-8');
  }

  static loadFrom(filePath: string): HarnessStore {
    const json = fs.readFileSync(filePath, 'utf-8');
    return HarnessStore.deserialize(json);
  }
}
```

**Step 4: Run test → PASS**

```bash
npx vitest run src/state/__tests__/store.test.ts
```

**Step 5: Commit**

```bash
git add src/state/
git commit -m "feat: add state store with persistence and event bus"
```

---

## Phase 4: Agent Execution Engine

### Task 6: Agent types and registry

**Files:**
- Create: `claude-harness/src/agents/types.ts`
- Create: `claude-harness/src/agents/registry.ts`

**Step 1: Define types**

`src/agents/types.ts`:

```typescript
export type AgentRole =
  | 'planner'
  | 'generator'
  | 'code_reviewer'
  | 'security_reviewer'
  | 'qa_engineer'
  | 'debugger';

export interface AgentRunConfig {
  role: AgentRole;
  model: string;
  systemPrompt: string;
  maxTurns: number;
  allowedTools: string[];
  workdir: string;
}

export interface StreamEvent {
  type: 'system' | 'assistant' | 'result';
  subtype?: string;
  message?: {
    content: ContentBlock[];
  };
  result?: string;
  cost_usd?: number;
  duration_ms?: number;
  duration_api_ms?: number;
  num_turns?: number;
  session_id?: string;
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

export interface AgentResult {
  role: AgentRole;
  output: string;
  verdict: 'PASS' | 'FAIL' | null;
  verdictReason: string;
  events: StreamEvent[];
  toolCalls: Array<{ name: string; input: Record<string, unknown> }>;
  costUsd: number;
  durationMs: number;
  numTurns: number;
  exitCode: number;
}
```

**Step 2: Define agent registry**

`src/agents/registry.ts`:

```typescript
import type { AgentRole } from './types.js';
import type { HarnessConfig } from '../config/schema.js';
import type { AgentRunConfig } from './types.js';

export function buildAgentRunConfig(
  role: AgentRole,
  config: HarnessConfig,
): AgentRunConfig {
  const agentConf = config.agents[role];
  return {
    role,
    model: agentConf.model,
    systemPrompt: agentConf.system_prompt,
    maxTurns: agentConf.max_turns,
    allowedTools: agentConf.allowed_tools,
    workdir: config.project.workdir,
  };
}

export const AGENT_DISPLAY: Record<AgentRole, { label: string; color: string }> = {
  planner: { label: 'Planner', color: 'blue' },
  generator: { label: 'Generator', color: 'green' },
  code_reviewer: { label: 'Code Reviewer', color: 'yellow' },
  security_reviewer: { label: 'Sec Reviewer', color: 'red' },
  qa_engineer: { label: 'QA Engineer', color: 'magenta' },
  debugger: { label: 'Debugger', color: 'cyan' },
};
```

**Step 3: Commit**

```bash
git add src/agents/types.ts src/agents/registry.ts
git commit -m "feat: add agent types and registry"
```

---

### Task 7: VERDICT protocol parser

**Files:**
- Create: `claude-harness/src/pipeline/verdict.ts`
- Create: `claude-harness/src/pipeline/__tests__/verdict.test.ts`

**Step 1: Write failing test**

`src/pipeline/__tests__/verdict.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { extractVerdict } from '../verdict.js';

describe('extractVerdict', () => {
  it('extracts PASS', () => {
    const result = extractVerdict('All checks passed.\n\nVERDICT: PASS');
    expect(result).toEqual({ verdict: 'PASS', reason: 'All checks passed.' });
  });

  it('extracts FAIL with reason', () => {
    const result = extractVerdict(
      'Missing error handling in auth.go:42\nNo input validation\n\nVERDICT: FAIL'
    );
    expect(result).toEqual({
      verdict: 'FAIL',
      reason: 'Missing error handling in auth.go:42\nNo input validation',
    });
  });

  it('handles case insensitive', () => {
    const result = extractVerdict('ok\nverdict: pass');
    expect(result?.verdict).toBe('PASS');
  });

  it('returns null when no verdict found', () => {
    const result = extractVerdict('Some random output without verdict');
    expect(result).toBeNull();
  });

  it('takes last verdict if multiple exist', () => {
    const result = extractVerdict('VERDICT: FAIL\nAfter fixes:\nVERDICT: PASS');
    expect(result?.verdict).toBe('PASS');
  });
});
```

**Step 2: Run test → FAIL**

```bash
npx vitest run src/pipeline/__tests__/verdict.test.ts
```

**Step 3: Implement**

`src/pipeline/verdict.ts`:

```typescript
export interface VerdictResult {
  verdict: 'PASS' | 'FAIL';
  reason: string;
}

export function extractVerdict(output: string): VerdictResult | null {
  const matches = [...output.matchAll(/verdict:\s*(pass|fail)/gi)];
  if (matches.length === 0) return null;

  const last = matches[matches.length - 1];
  const verdict = last[1].toUpperCase() as 'PASS' | 'FAIL';

  // Reason is everything before the last VERDICT line
  const lastIdx = output.lastIndexOf(last[0]);
  const reason = output.slice(0, lastIdx).trim();

  return { verdict, reason };
}
```

**Step 4: Run test → PASS**

```bash
npx vitest run src/pipeline/__tests__/verdict.test.ts
```

**Step 5: Commit**

```bash
git add src/pipeline/verdict.ts src/pipeline/__tests__/
git commit -m "feat: add VERDICT protocol parser"
```

---

### Task 8: File snapshot and diff

**Files:**
- Create: `claude-harness/src/pipeline/snapshot.ts`
- Create: `claude-harness/src/pipeline/__tests__/snapshot.test.ts`

**Step 1: Write failing test**

`src/pipeline/__tests__/snapshot.test.ts`:

```typescript
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
```

**Step 2: Run test → FAIL**

**Step 3: Implement**

`src/pipeline/snapshot.ts`:

```typescript
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
```

**Step 4: Run test → PASS**

**Step 5: Commit**

```bash
git add src/pipeline/snapshot.ts src/pipeline/__tests__/snapshot.test.ts
git commit -m "feat: add file snapshot and diff mechanism"
```

---

### Task 9: Agent executor (spawn claude -p)

**Files:**
- Create: `claude-harness/src/agents/executor.ts`
- Create: `claude-harness/src/agents/__tests__/executor.test.ts`

**Step 1: Write test (integration-style, mocking spawn)**

`src/agents/__tests__/executor.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { parseStreamLine } from '../executor.js';

describe('parseStreamLine', () => {
  it('parses assistant text event', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Hello world' }] },
    });
    const event = parseStreamLine(line);
    expect(event?.type).toBe('assistant');
  });

  it('parses result event', () => {
    const line = JSON.stringify({
      type: 'result',
      result: 'Final output',
      cost_usd: 0.05,
      duration_ms: 3000,
      num_turns: 5,
    });
    const event = parseStreamLine(line);
    expect(event?.type).toBe('result');
    expect(event?.cost_usd).toBe(0.05);
  });

  it('returns null for invalid JSON', () => {
    const event = parseStreamLine('not json');
    expect(event).toBeNull();
  });

  it('returns null for empty line', () => {
    const event = parseStreamLine('');
    expect(event).toBeNull();
  });
});
```

**Step 2: Run test → FAIL**

**Step 3: Implement executor**

`src/agents/executor.ts`:

```typescript
import { spawn } from 'node:child_process';
import type { AgentRunConfig, AgentResult, StreamEvent, ContentBlock } from './types.js';
import { extractVerdict } from '../pipeline/verdict.js';
import { eventBus } from '../state/events.js';

export function parseStreamLine(line: string): StreamEvent | null {
  if (!line.trim()) return null;
  try {
    return JSON.parse(line) as StreamEvent;
  } catch {
    return null;
  }
}

function extractText(events: StreamEvent[]): string {
  const texts: string[] = [];
  for (const ev of events) {
    if (ev.type === 'assistant' && ev.message?.content) {
      for (const block of ev.message.content) {
        if (block.type === 'text') texts.push(block.text);
      }
    }
    if (ev.type === 'result' && ev.result) {
      texts.push(ev.result);
    }
  }
  return texts.join('\n');
}

function extractToolCalls(events: StreamEvent[]): Array<{ name: string; input: Record<string, unknown> }> {
  const calls: Array<{ name: string; input: Record<string, unknown> }> = [];
  for (const ev of events) {
    if (ev.type === 'assistant' && ev.message?.content) {
      for (const block of ev.message.content) {
        if (block.type === 'tool_use') {
          calls.push({ name: block.name, input: block.input });
        }
      }
    }
  }
  return calls;
}

export function executeAgent(config: AgentRunConfig, prompt: string): Promise<AgentResult> {
  return new Promise((resolve, reject) => {
    const args = [
      '-p', prompt,
      '--model', config.model,
      '--system-prompt', config.systemPrompt,
      '--allowedTools', config.allowedTools.join(' '),
      '--output-format', 'stream-json',
      '--max-turns', String(config.maxTurns),
      '--no-session-persistence',
    ];

    const env = { ...process.env };
    delete env.CLAUDECODE;  // unset to allow nested invocation

    const proc = spawn('claude', args, {
      cwd: config.workdir,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const events: StreamEvent[] = [];
    let buffer = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const event = parseStreamLine(line);
        if (event) {
          events.push(event);
          eventBus.emit('agent:event', { agent: config.role, data: event });
        }
      }
    });

    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      // Process remaining buffer
      if (buffer.trim()) {
        const event = parseStreamLine(buffer);
        if (event) events.push(event);
      }

      const output = extractText(events);
      const toolCalls = extractToolCalls(events);
      const verdictResult = extractVerdict(output);

      // Extract cost/duration from result event
      const resultEvent = events.find((e) => e.type === 'result');

      const result: AgentResult = {
        role: config.role,
        output,
        verdict: verdictResult?.verdict ?? null,
        verdictReason: verdictResult?.reason ?? '',
        events,
        toolCalls,
        costUsd: resultEvent?.cost_usd ?? 0,
        durationMs: resultEvent?.duration_ms ?? 0,
        numTurns: resultEvent?.num_turns ?? 0,
        exitCode: code ?? 1,
      };

      if (code !== 0 && events.length === 0) {
        eventBus.emit('agent:error', { agent: config.role, data: { stderr, code } });
      }

      eventBus.emit('agent:complete', { agent: config.role, data: result });
      resolve(result);
    });

    proc.on('error', (err) => {
      eventBus.emit('agent:error', { agent: config.role, data: { error: err.message } });
      reject(err);
    });

    eventBus.emit('agent:start', { agent: config.role, data: { prompt: prompt.slice(0, 200) } });
  });
}
```

**Step 4: Run test → PASS (the parseStreamLine unit tests)**

```bash
npx vitest run src/agents/__tests__/executor.test.ts
```

**Step 5: Commit**

```bash
git add src/agents/
git commit -m "feat: add agent executor with stream-json parsing"
```

---

## Phase 5: Pipeline

### Task 10: Prompt builders

**Files:**
- Create: `claude-harness/src/pipeline/prompts.ts`

**Step 1: Implement prompt builders**

`src/pipeline/prompts.ts`:

```typescript
import type { SnapshotDiff } from './snapshot.js';

interface TaskInfo {
  id: string;
  name: string;
  description: string;
}

export function buildPlannerPrompt(task: TaskInfo): string {
  return `You are planning the implementation of a task.

## Task
- ID: ${task.id}
- Name: ${task.name}
- Description: ${task.description}

## Instructions
1. Read the relevant codebase to understand the current architecture
2. Break the task into concrete implementation steps
3. Identify files to create or modify
4. Define acceptance criteria

## Output Format
Respond with a structured plan in this JSON format:
\`\`\`json
{
  "steps": [
    { "order": 1, "description": "...", "files": ["path/to/file.ts"] }
  ],
  "acceptance_criteria": ["criterion 1", "criterion 2"],
  "risks": ["risk 1"]
}
\`\`\`
`;
}

export function buildGeneratorPrompt(
  task: TaskInfo,
  plan: string,
  debugFeedback?: string,
): string {
  let prompt = `You are implementing a task according to a plan.

## Task
- ID: ${task.id}
- Name: ${task.name}
- Description: ${task.description}

## Plan
${plan}

## Instructions
- Implement the code changes described in the plan
- Write tests for new functionality
- Ensure the code builds and tests pass
- Follow existing code conventions in the project
`;

  if (debugFeedback) {
    prompt += `
## Previous Attempt Failed
The previous implementation had issues. Here is the feedback:
${debugFeedback}

Fix these issues while maintaining the original plan.
`;
  }

  return prompt;
}

export function buildCodeReviewPrompt(
  task: TaskInfo,
  plan: string,
  diff: SnapshotDiff,
  gitDiff: string,
): string {
  return `You are reviewing code changes for a task.

## Task
- ID: ${task.id}
- Name: ${task.name}

## Plan
${plan}

## Changed Files
- Added: ${diff.added.join(', ') || 'none'}
- Modified: ${diff.modified.join(', ') || 'none'}
- Deleted: ${diff.deleted.join(', ') || 'none'}

## Diff
\`\`\`diff
${gitDiff}
\`\`\`

## Review Checklist
1. Code correctness - does it implement the plan?
2. Error handling - are edge cases covered?
3. Code style - consistent with existing codebase?
4. Architecture - proper separation of concerns?
5. Tests - adequate coverage?

## Required Output
End your review with exactly one of:
- VERDICT: PASS (if all checks pass)
- VERDICT: FAIL (if any critical issue found)

If FAIL, explain: what file, what issue, and why.
`;
}

export function buildSecurityReviewPrompt(
  diff: SnapshotDiff,
  gitDiff: string,
): string {
  return `You are performing a security review on code changes.

## Changed Files
- Added: ${diff.added.join(', ') || 'none'}
- Modified: ${diff.modified.join(', ') || 'none'}

## Diff
\`\`\`diff
${gitDiff}
\`\`\`

## Security Checklist (OWASP Top 10)
1. Injection (SQL, command, LDAP)
2. Broken authentication
3. Sensitive data exposure (hardcoded secrets, API keys)
4. XXE / XML external entities
5. Broken access control
6. Security misconfiguration
7. XSS
8. Insecure deserialization
9. Using components with known vulnerabilities
10. Insufficient logging

## Required Output
End your review with exactly one of:
- VERDICT: PASS
- VERDICT: FAIL

If FAIL, specify: file path, line, vulnerability type, and remediation.
`;
}

export function buildQAPrompt(
  task: TaskInfo,
  plan: string,
  diff: SnapshotDiff,
): string {
  return `You are a QA engineer verifying a completed task.

## Task
- ID: ${task.id}
- Name: ${task.name}
- Description: ${task.description}

## Plan
${plan}

## Changed Files
- Added: ${diff.added.join(', ') || 'none'}
- Modified: ${diff.modified.join(', ') || 'none'}

## Instructions
1. Read the changed files
2. Run the build command to verify compilation
3. Run the test suite
4. Verify each acceptance criterion from the plan
5. Check for regressions

## Required Output
End your verification with exactly one of:
- VERDICT: PASS (all criteria met, tests pass)
- VERDICT: FAIL (with specific failure details: file, expected vs actual, root cause)
`;
}

export function buildDebuggerPrompt(
  task: TaskInfo,
  plan: string,
  diff: SnapshotDiff,
  failureFeedback: string,
): string {
  return `You are debugging a failed code review or QA check.

## Task
- ID: ${task.id}
- Name: ${task.name}

## Plan
${plan}

## Changed Files
- Added: ${diff.added.join(', ') || 'none'}
- Modified: ${diff.modified.join(', ') || 'none'}

## Failure Report
${failureFeedback}

## Instructions
- Make MINIMAL fixes to address the reported issues
- Do NOT refactor or add features beyond the fix
- Ensure the build passes after your changes
- Run relevant tests to verify the fix
`;
}
```

**Step 2: Commit**

```bash
git add src/pipeline/prompts.ts
git commit -m "feat: add prompt builders for all 6 agent roles"
```

---

### Task 11: Pipeline runner

**Files:**
- Create: `claude-harness/src/pipeline/types.ts`
- Create: `claude-harness/src/pipeline/runner.ts`

**Step 1: Define pipeline types**

`src/pipeline/types.ts`:

```typescript
import type { AgentResult } from '../agents/types.js';

export type PipelineStatus = 'idle' | 'running' | 'complete' | 'error';

export interface TaskResult {
  taskId: string;
  status: 'done' | 'failed';
  plan?: string;
  agentResults: Record<string, AgentResult>;
  securityWarnings: string[];
  attempts: number;
}

export interface PipelineCallbacks {
  onTaskStart?: (taskId: string) => void;
  onTaskComplete?: (result: TaskResult) => void;
  onAgentStart?: (taskId: string, agent: string) => void;
  onAgentComplete?: (taskId: string, agent: string, result: AgentResult) => void;
}
```

**Step 2: Implement pipeline runner**

`src/pipeline/runner.ts`:

```typescript
import type { HarnessConfig } from '../config/schema.js';
import type { Task } from '../tasks/schema.js';
import type { TaskResult, PipelineCallbacks } from './types.js';
import type { AgentResult } from '../agents/types.js';
import { buildAgentRunConfig } from '../agents/registry.js';
import { executeAgent } from '../agents/executor.js';
import { takeSnapshot, computeSnapshotDiff, getGitDiff } from './snapshot.js';
import {
  buildPlannerPrompt,
  buildGeneratorPrompt,
  buildCodeReviewPrompt,
  buildSecurityReviewPrompt,
  buildQAPrompt,
  buildDebuggerPrompt,
} from './prompts.js';
import { HarnessStore } from '../state/store.js';
import { eventBus } from '../state/events.js';
import fs from 'node:fs';
import path from 'node:path';

export class PipelineRunner {
  private config: HarnessConfig;
  private store: HarnessStore;
  private callbacks: PipelineCallbacks;
  private aborted = false;

  constructor(config: HarnessConfig, store: HarnessStore, callbacks: PipelineCallbacks = {}) {
    this.config = config;
    this.store = store;
    this.callbacks = callbacks;
  }

  abort(): void {
    this.aborted = true;
  }

  async runAll(tasks: Task[]): Promise<TaskResult[]> {
    const results: TaskResult[] = [];
    eventBus.emit('pipeline:start', { data: { taskCount: tasks.length } });

    for (const task of tasks) {
      if (this.aborted) break;
      const existing = this.store.getTask(task.id);
      if (existing && (existing.status === 'done' || existing.status === 'failed')) continue;

      const result = await this.runTask(task);
      results.push(result);
    }

    eventBus.emit('pipeline:complete', { data: { results: results.length } });
    return results;
  }

  async runTask(task: Task): Promise<TaskResult> {
    this.callbacks.onTaskStart?.(task.id);
    const agentResults: Record<string, AgentResult> = {};
    const securityWarnings: string[] = [];
    const workdir = path.resolve(this.config.project.workdir);
    const historyDir = path.join(path.dirname(this.config.state_file), 'history', task.id);
    if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });

    // 1. Planning
    this.store.updateTaskStatus(task.id, 'planning', 'planner');
    this.callbacks.onAgentStart?.(task.id, 'planner');
    const planResult = await this.runAgent('planner', buildPlannerPrompt(task));
    agentResults['planner'] = planResult;
    this.callbacks.onAgentComplete?.(task.id, 'planner', planResult);
    this.saveHistory(historyDir, 'plan.json', planResult);
    const plan = planResult.output;

    // 2. Generate → Review → QA loop
    for (let attempt = 0; attempt <= this.config.pipeline.max_retry; attempt++) {
      if (this.aborted) return { taskId: task.id, status: 'failed', plan, agentResults, securityWarnings, attempts: attempt };

      this.store.incrementAttempt(task.id);

      // Generate
      this.store.updateTaskStatus(task.id, 'generating', 'generator');
      this.callbacks.onAgentStart?.(task.id, 'generator');
      const snapshotBefore = this.config.pipeline.snapshot_enabled ? takeSnapshot(workdir) : [];
      const debugFeedback = attempt > 0 ? agentResults['debugger']?.output : undefined;
      const genResult = await this.runAgent('generator', buildGeneratorPrompt(task, plan, debugFeedback));
      agentResults['generator'] = genResult;
      this.callbacks.onAgentComplete?.(task.id, 'generator', genResult);
      this.saveHistory(historyDir, 'generator.json', genResult);

      const snapshotAfter = this.config.pipeline.snapshot_enabled ? takeSnapshot(workdir) : [];
      const diff = computeSnapshotDiff(snapshotBefore, snapshotAfter);
      const changedFiles = [...diff.added, ...diff.modified];
      const gitDiff = getGitDiff(workdir, changedFiles);

      this.saveHistory(historyDir, 'snapshot_before.json', snapshotBefore);
      this.saveHistory(historyDir, 'snapshot_after.json', snapshotAfter);

      // Code Review
      this.store.updateTaskStatus(task.id, 'reviewing', 'code_reviewer');
      this.callbacks.onAgentStart?.(task.id, 'code_reviewer');
      const reviewResult = await this.runAgent('code_reviewer', buildCodeReviewPrompt(task, plan, diff, gitDiff));
      agentResults['code_reviewer'] = reviewResult;
      this.callbacks.onAgentComplete?.(task.id, 'code_reviewer', reviewResult);
      this.saveHistory(historyDir, 'code_review.json', reviewResult);
      this.store.addVerdict(task.id, 'code_reviewer', reviewResult.verdict ?? 'FAIL', reviewResult.verdictReason);

      if (reviewResult.verdict === 'FAIL') {
        // Debug and retry
        this.store.updateTaskStatus(task.id, 'debugging', 'debugger');
        const dbgResult = await this.runAgent('debugger', buildDebuggerPrompt(task, plan, diff, reviewResult.output));
        agentResults['debugger'] = dbgResult;
        this.saveHistory(historyDir, `debug_attempt_${attempt}.json`, dbgResult);
        continue;
      }

      // Security Review (non-blocking)
      this.store.updateTaskStatus(task.id, 'reviewing', 'security_reviewer');
      this.callbacks.onAgentStart?.(task.id, 'security_reviewer');
      try {
        const secResult = await this.runAgent('security_reviewer', buildSecurityReviewPrompt(diff, gitDiff));
        agentResults['security_reviewer'] = secResult;
        this.callbacks.onAgentComplete?.(task.id, 'security_reviewer', secResult);
        this.saveHistory(historyDir, 'security_review.json', secResult);
        if (secResult.verdict === 'FAIL') {
          securityWarnings.push(secResult.verdictReason);
        }
      } catch {
        securityWarnings.push('Security reviewer failed to execute');
      }

      // QA Testing
      this.store.updateTaskStatus(task.id, 'qa_testing', 'qa_engineer');
      this.callbacks.onAgentStart?.(task.id, 'qa_engineer');
      const qaResult = await this.runAgent('qa_engineer', buildQAPrompt(task, plan, diff));
      agentResults['qa_engineer'] = qaResult;
      this.callbacks.onAgentComplete?.(task.id, 'qa_engineer', qaResult);
      this.saveHistory(historyDir, 'qa.json', qaResult);
      this.store.addVerdict(task.id, 'qa_engineer', qaResult.verdict ?? 'FAIL', qaResult.verdictReason);

      if (qaResult.verdict === 'FAIL') {
        this.store.updateTaskStatus(task.id, 'debugging', 'debugger');
        const dbgResult = await this.runAgent('debugger', buildDebuggerPrompt(task, plan, diff, qaResult.output));
        agentResults['debugger'] = dbgResult;
        this.saveHistory(historyDir, `debug_qa_attempt_${attempt}.json`, dbgResult);
        continue;
      }

      // All passed
      this.store.updateTaskStatus(task.id, 'done');

      const taskResult: TaskResult = { taskId: task.id, status: 'done', plan, agentResults, securityWarnings, attempts: attempt + 1 };
      this.saveHistory(historyDir, 'summary.json', taskResult);
      this.callbacks.onTaskComplete?.(taskResult);
      return taskResult;
    }

    // Exceeded retries
    this.store.updateTaskStatus(task.id, 'failed');
    const taskResult: TaskResult = {
      taskId: task.id, status: 'failed', plan, agentResults, securityWarnings,
      attempts: this.config.pipeline.max_retry + 1,
    };
    this.saveHistory(historyDir, 'summary.json', taskResult);
    this.callbacks.onTaskComplete?.(taskResult);
    return taskResult;
  }

  private async runAgent(role: string, prompt: string): Promise<AgentResult> {
    const runConfig = buildAgentRunConfig(role as any, this.config);
    const result = await executeAgent(runConfig, prompt);
    this.store.recordAgentRun(role, result.numTurns, result.costUsd, result.durationMs);
    return result;
  }

  private saveHistory(dir: string, filename: string, data: unknown): void {
    fs.writeFileSync(path.join(dir, filename), JSON.stringify(data, null, 2), 'utf-8');
  }
}
```

**Step 3: Commit**

```bash
git add src/pipeline/
git commit -m "feat: add pipeline runner with retry, snapshot, and VERDICT flow"
```

---

## Phase 6: TUI

### Task 12: Shared TUI components

**Files:**
- Create: `claude-harness/src/tui/components/Header.tsx`
- Create: `claude-harness/src/tui/components/StatusBar.tsx`
- Create: `claude-harness/src/tui/components/Table.tsx`

**Step 1: Implement components**

`src/tui/components/Header.tsx`:

```tsx
import React from 'react';
import { Box, Text } from 'ink';

interface HeaderProps {
  activeTab: number;
  projectName: string;
}

const TABS = ['Dashboard', 'Board', 'Agent', 'Feed'];

export function Header({ activeTab, projectName }: HeaderProps) {
  return (
    <Box flexDirection="row" borderStyle="single" borderBottom paddingX={1}>
      <Text bold color="cyan">{projectName}</Text>
      <Text> | </Text>
      {TABS.map((tab, i) => (
        <React.Fragment key={tab}>
          <Text bold={i === activeTab} color={i === activeTab ? 'green' : 'gray'}>
            [{i + 1}] {tab}
          </Text>
          {i < TABS.length - 1 && <Text>  </Text>}
        </React.Fragment>
      ))}
      <Text>  </Text>
      <Text color="gray">[q] Quit</Text>
    </Box>
  );
}
```

`src/tui/components/StatusBar.tsx`:

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

interface StatusBarProps {
  pipelineStatus: 'idle' | 'running' | 'complete' | 'error';
  currentTask: string | null;
  currentStage: string | null;
  elapsed: string;
}

export function StatusBar({ pipelineStatus, currentTask, currentStage, elapsed }: StatusBarProps) {
  const statusColor = {
    idle: 'gray',
    running: 'green',
    complete: 'cyan',
    error: 'red',
  }[pipelineStatus] as string;

  return (
    <Box flexDirection="row" borderStyle="single" borderTop paddingX={1}>
      <Box marginRight={2}>
        {pipelineStatus === 'running' && <Spinner type="dots" />}
        <Text color={statusColor}> Pipeline: {pipelineStatus}</Text>
      </Box>
      {currentTask && (
        <Box marginRight={2}>
          <Text>Task: {currentTask}</Text>
          {currentStage && <Text color="yellow"> ({currentStage})</Text>}
        </Box>
      )}
      <Text color="gray">T {elapsed}</Text>
    </Box>
  );
}
```

`src/tui/components/Table.tsx`:

```tsx
import React from 'react';
import { Box, Text } from 'ink';

interface Column {
  header: string;
  width: number;
  align?: 'left' | 'right';
}

interface TableProps {
  columns: Column[];
  rows: string[][];
}

export function Table({ columns, rows }: TableProps) {
  return (
    <Box flexDirection="column">
      <Box>
        {columns.map((col, i) => (
          <Box key={i} width={col.width}>
            <Text bold underline>{col.header.padEnd(col.width)}</Text>
          </Box>
        ))}
      </Box>
      {rows.map((row, ri) => (
        <Box key={ri}>
          {row.map((cell, ci) => (
            <Box key={ci} width={columns[ci].width}>
              <Text>{cell.padEnd(columns[ci].width)}</Text>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}
```

**Step 2: Commit**

```bash
git add src/tui/components/
git commit -m "feat: add shared TUI components (Header, StatusBar, Table)"
```

---

### Task 13: Dashboard, Board, AgentPanel, LiveFeed tabs

**Files:**
- Create: `claude-harness/src/tui/Dashboard.tsx`
- Create: `claude-harness/src/tui/Board.tsx`
- Create: `claude-harness/src/tui/AgentPanel.tsx`
- Create: `claude-harness/src/tui/LiveFeed.tsx`

**Step 1: Implement Dashboard**

`src/tui/Dashboard.tsx`:

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import { Table } from './components/Table.js';
import { AGENT_DISPLAY } from '../agents/registry.js';
import type { HarnessStore } from '../state/store.js';
import type { HarnessEvent } from '../state/events.js';

interface DashboardProps {
  store: HarnessStore;
  recentEvents: HarnessEvent[];
}

export function Dashboard({ store, recentEvents }: DashboardProps) {
  const state = store.getState();
  const counts = {
    total: state.tasks.length,
    inProgress: state.tasks.filter((t) => !['inbox', 'done', 'failed'].includes(t.status)).length,
    done: state.tasks.filter((t) => t.status === 'done').length,
    failed: state.tasks.filter((t) => t.status === 'failed').length,
  };

  const agentRows = (Object.keys(AGENT_DISPLAY) as Array<keyof typeof AGENT_DISPLAY>).map((role) => {
    const display = AGENT_DISPLAY[role];
    const stats = state.stats.agents[role];
    const task = state.tasks.find((t) => t.current_agent === role);
    return [
      display.label,
      state.tasks.find((t) => t.current_agent === role) ? 'running' : 'idle',
      String(stats?.tasks_done ?? 0),
      String(stats?.total_turns ?? 0),
    ];
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Box marginRight={3}><Text bold>TOTAL </Text><Text>{counts.total}</Text></Box>
        <Box marginRight={3}><Text bold color="yellow">ACTIVE </Text><Text>{counts.inProgress}</Text></Box>
        <Box marginRight={3}><Text bold color="green">DONE </Text><Text>{counts.done}</Text></Box>
        <Box><Text bold color="red">FAILED </Text><Text>{counts.failed}</Text></Box>
      </Box>
      <Table
        columns={[
          { header: 'Agent', width: 16 },
          { header: 'Status', width: 10 },
          { header: 'Done', width: 6 },
          { header: 'Turns', width: 8 },
        ]}
        rows={agentRows}
      />
      <Box flexDirection="column" marginTop={1}>
        <Text bold underline>Recent Activity</Text>
        {recentEvents.slice(-5).reverse().map((ev, i) => (
          <Text key={i} color="gray">
            {ev.timestamp.slice(11, 19)} [{ev.agent ?? 'system'}] {ev.type}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
```

**Step 2: Implement Board**

`src/tui/Board.tsx`:

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { HarnessStore } from '../state/store.js';

interface BoardProps {
  store: HarnessStore;
}

const COLUMNS = [
  { label: 'INBOX', statuses: ['inbox'] },
  { label: 'IN PROGRESS', statuses: ['planning', 'generating', 'debugging'] },
  { label: 'IN REVIEW', statuses: ['reviewing', 'qa_testing'] },
  { label: 'DONE', statuses: ['done', 'failed'] },
] as const;

export function Board({ store }: BoardProps) {
  const state = store.getState();

  return (
    <Box flexDirection="row" padding={1}>
      {COLUMNS.map((col) => {
        const tasks = state.tasks.filter((t) => (col.statuses as readonly string[]).includes(t.status));
        return (
          <Box key={col.label} flexDirection="column" width="25%" paddingRight={1}>
            <Text bold underline>{col.label}</Text>
            {tasks.map((t) => (
              <Box key={t.id} flexDirection="column" marginTop={1}>
                <Text>{t.id} {t.name}</Text>
                <Text color="gray">  {t.status}{t.attempt > 0 ? ` (attempt ${t.attempt})` : ''}</Text>
                {t.status === 'failed' && <Text color="red">  FAILED</Text>}
                {t.status === 'done' && <Text color="green">  PASS</Text>}
              </Box>
            ))}
            {tasks.length === 0 && <Text color="gray">  (empty)</Text>}
          </Box>
        );
      })}
    </Box>
  );
}
```

**Step 3: Implement AgentPanel**

`src/tui/AgentPanel.tsx`:

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { AgentResult } from '../agents/types.js';
import { AGENT_DISPLAY } from '../agents/registry.js';

interface AgentPanelProps {
  activeAgent: string | null;
  activeResult: AgentResult | null;
  turnCount: number;
  maxTurns: number;
  toolCallCounts: Record<string, number>;
}

export function AgentPanel({ activeAgent, activeResult, turnCount, maxTurns, toolCallCounts }: AgentPanelProps) {
  if (!activeAgent) {
    return (
      <Box padding={1}>
        <Text color="gray">No agent currently running.</Text>
      </Box>
    );
  }

  const display = AGENT_DISPLAY[activeAgent as keyof typeof AGENT_DISPLAY] ?? { label: activeAgent, color: 'white' };
  const maxCount = Math.max(1, ...Object.values(toolCallCounts));

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Spinner type="dots" />
        <Text bold color={display.color}> {display.label}</Text>
        <Text> — Turn {turnCount}/{maxTurns}</Text>
      </Box>

      <Text bold underline>Tool Calls:</Text>
      {Object.entries(toolCallCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([tool, count]) => {
          const barLen = Math.round((count / maxCount) * 20);
          return (
            <Box key={tool}>
              <Box width={10}><Text>{tool}</Text></Box>
              <Text color="green">{'█'.repeat(barLen)}{'░'.repeat(20 - barLen)}</Text>
              <Text> {count}</Text>
            </Box>
          );
        })}

      {activeResult && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold underline>Latest Output:</Text>
          <Text wrap="truncate-end">{activeResult.output.slice(-300)}</Text>
          <Box marginTop={1}>
            <Text color="gray">Cost: ${activeResult.costUsd.toFixed(3)}</Text>
            <Text color="gray">  Duration: {(activeResult.durationMs / 1000).toFixed(0)}s</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
```

**Step 4: Implement LiveFeed**

`src/tui/LiveFeed.tsx`:

```tsx
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { HarnessEvent } from '../state/events.js';

interface LiveFeedProps {
  events: HarnessEvent[];
}

type Filter = 'all' | 'agent' | 'system' | 'tool' | 'error';

const FILTERS: Filter[] = ['all', 'agent', 'system', 'tool', 'error'];

function matchesFilter(event: HarnessEvent, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'agent') return event.type.startsWith('agent:');
  if (filter === 'system') return event.type.startsWith('pipeline:');
  if (filter === 'tool') return event.type === 'agent:event';
  if (filter === 'error') return event.type.includes('error');
  return true;
}

export function LiveFeed({ events }: LiveFeedProps) {
  const [filter, setFilter] = useState<Filter>('all');

  useInput((input) => {
    const idx = FILTERS.indexOf(filter);
    if (input === 'f') {
      setFilter(FILTERS[(idx + 1) % FILTERS.length]);
    }
  });

  const filtered = events.filter((e) => matchesFilter(e, filter));
  const visible = filtered.slice(-20);

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text>Filter [f]: </Text>
        {FILTERS.map((f) => (
          <Text key={f} bold={f === filter} color={f === filter ? 'green' : 'gray'}>
            {f}
          </Text>
        ))}
        <Text color="gray"> ({filtered.length} events)</Text>
      </Box>
      {visible.map((ev, i) => (
        <Text key={i} wrap="truncate-end">
          <Text color="gray">{ev.timestamp.slice(11, 19)}</Text>
          <Text color="cyan"> [{ev.agent ?? 'sys'}]</Text>
          <Text color="yellow"> {ev.type}</Text>
          <Text> {typeof ev.data === 'string' ? ev.data : ''}</Text>
        </Text>
      ))}
    </Box>
  );
}
```

**Step 5: Commit**

```bash
git add src/tui/Dashboard.tsx src/tui/Board.tsx src/tui/AgentPanel.tsx src/tui/LiveFeed.tsx
git commit -m "feat: add 4 TUI tab views (Dashboard, Board, Agent, LiveFeed)"
```

---

### Task 14: App root component

**Files:**
- Create: `claude-harness/src/tui/App.tsx`

**Step 1: Implement App root**

`src/tui/App.tsx`:

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import { Box, useApp, useInput } from 'ink';
import { Header } from './components/Header.js';
import { StatusBar } from './components/StatusBar.js';
import { Dashboard } from './Dashboard.js';
import { Board } from './Board.js';
import { AgentPanel } from './AgentPanel.js';
import { LiveFeed } from './LiveFeed.js';
import type { HarnessStore } from '../state/store.js';
import type { HarnessEvent } from '../state/events.js';
import { eventBus } from '../state/events.js';

interface AppProps {
  store: HarnessStore;
  projectName: string;
  pipelineStatus: 'idle' | 'running' | 'complete' | 'error';
}

export function App({ store, projectName, pipelineStatus }: AppProps) {
  const { exit } = useApp();
  const [activeTab, setActiveTab] = useState(0);
  const [events, setEvents] = useState<HarnessEvent[]>([]);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [toolCallCounts, setToolCallCounts] = useState<Record<string, number>>({});
  const [tick, setTick] = useState(0);
  const [startTime] = useState(Date.now());

  useInput((input) => {
    if (input === '1') setActiveTab(0);
    if (input === '2') setActiveTab(1);
    if (input === '3') setActiveTab(2);
    if (input === '4') setActiveTab(3);
    if (input === 'q') exit();
  });

  useEffect(() => {
    const handler = (_type: string, event: HarnessEvent) => {
      setEvents((prev) => [...prev.slice(-500), event]);
      if (event.type === 'agent:start') setActiveAgent(event.agent ?? null);
      if (event.type === 'agent:complete') setActiveAgent(null);
      if (event.type === 'agent:event' && event.data) {
        const data = event.data as any;
        if (data.type === 'assistant' && data.message?.content) {
          for (const block of data.message.content) {
            if (block.type === 'tool_use') {
              setToolCallCounts((prev) => ({
                ...prev,
                [block.name]: (prev[block.name] ?? 0) + 1,
              }));
            }
          }
        }
      }
    };
    eventBus.on('*', handler);
    return () => { eventBus.off('*', handler); };
  }, []);

  // Tick for elapsed time
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const elapsed = formatElapsed(Date.now() - startTime);
  const state = store.getState();
  const currentTask = state.tasks.find((t) => !['inbox', 'done', 'failed'].includes(t.status));

  return (
    <Box flexDirection="column" height={process.stdout.rows}>
      <Header activeTab={activeTab} projectName={projectName} />
      <Box flexGrow={1}>
        {activeTab === 0 && <Dashboard store={store} recentEvents={events} />}
        {activeTab === 1 && <Board store={store} />}
        {activeTab === 2 && (
          <AgentPanel
            activeAgent={activeAgent}
            activeResult={null}
            turnCount={0}
            maxTurns={40}
            toolCallCounts={toolCallCounts}
          />
        )}
        {activeTab === 3 && <LiveFeed events={events} />}
      </Box>
      <StatusBar
        pipelineStatus={pipelineStatus}
        currentTask={currentTask?.id ?? null}
        currentStage={currentTask?.status ?? null}
        elapsed={elapsed}
      />
    </Box>
  );
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
```

**Step 2: Commit**

```bash
git add src/tui/App.tsx
git commit -m "feat: add App root component with tab routing and event wiring"
```

---

## Phase 7: CLI Entry Point

### Task 15: CLI commands

**Files:**
- Create: `claude-harness/src/index.ts`
- Create: `claude-harness/templates/harness.yaml`
- Create: `claude-harness/templates/tasks.yaml`

**Step 1: Create templates**

`templates/harness.yaml`:

```yaml
project:
  name: "my-project"
  workdir: "."

agents:
  planner:
    model: "opus"
    system_prompt: |
      You are an ambitious technical planner. Analyze the codebase and create
      a detailed, structured implementation plan. Output JSON with steps,
      files to modify, and acceptance criteria.
    max_turns: 20
    allowed_tools: ["Read", "Glob", "Grep"]

  generator:
    model: "sonnet"
    system_prompt: |
      You are an incremental, testable code generator. Implement code changes
      step by step, ensuring each step builds and tests pass. Follow existing
      code conventions in the project.
    max_turns: 40
    allowed_tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"]

  code_reviewer:
    model: "opus"
    system_prompt: |
      You are a critical and skeptical code reviewer. Examine changes for
      correctness, edge cases, error handling, architecture, and test coverage.
      End with VERDICT: PASS or VERDICT: FAIL.
    max_turns: 15
    allowed_tools: ["Read", "Bash", "Glob", "Grep"]

  security_reviewer:
    model: "opus"
    system_prompt: |
      You are a security expert. Review code for OWASP Top 10 vulnerabilities,
      hardcoded secrets, injection risks, and authentication issues.
      End with VERDICT: PASS or VERDICT: FAIL.
    max_turns: 15
    allowed_tools: ["Read", "Bash", "Glob", "Grep"]

  qa_engineer:
    model: "sonnet"
    system_prompt: |
      You are a QA engineer. Run builds, execute tests, and verify acceptance
      criteria. Report specific failures with file, expected vs actual, and root cause.
      End with VERDICT: PASS or VERDICT: FAIL.
    max_turns: 20
    allowed_tools: ["Read", "Bash", "Glob", "Grep"]

  debugger:
    model: "sonnet"
    system_prompt: |
      You are a minimal-fix debugger. Given failure feedback, make the smallest
      possible changes to fix the issues. Do not refactor or add features.
    max_turns: 25
    allowed_tools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"]

pipeline:
  max_retry: 2
  auto_commit: false
  snapshot_enabled: true

tasks_file: "./tasks.yaml"
state_file: "./.harness/state.json"
```

`templates/tasks.yaml`:

```yaml
tasks:
  - id: "T001"
    name: "Example task"
    description: "Describe what needs to be implemented"
    priority: high
```

**Step 2: Implement CLI entry**

`src/index.ts`:

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { render } from 'ink';
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config/loader.js';
import { loadTasks } from './tasks/loader.js';
import { HarnessStore } from './state/store.js';
import { PipelineRunner } from './pipeline/runner.js';
import { App } from './tui/App.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const program = new Command();

program
  .name('harness')
  .description('Multi-agent harness for Claude Code CLI')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize harness config and task files')
  .action(() => {
    const templatesDir = path.join(__dirname, '..', 'templates');
    const harnessTemplate = fs.readFileSync(path.join(templatesDir, 'harness.yaml'), 'utf-8');
    const tasksTemplate = fs.readFileSync(path.join(templatesDir, 'tasks.yaml'), 'utf-8');

    if (!fs.existsSync('harness.yaml')) {
      fs.writeFileSync('harness.yaml', harnessTemplate);
      console.log('Created harness.yaml');
    } else {
      console.log('harness.yaml already exists, skipping');
    }

    if (!fs.existsSync('tasks.yaml')) {
      fs.writeFileSync('tasks.yaml', tasksTemplate);
      console.log('Created tasks.yaml');
    } else {
      console.log('tasks.yaml already exists, skipping');
    }

    fs.mkdirSync('.harness', { recursive: true });
    console.log('Initialized .harness/ directory');
  });

program
  .command('run')
  .description('Run the pipeline')
  .option('-t, --task <id>', 'Run a specific task only')
  .option('--no-tui', 'Disable TUI, use plain log output')
  .action(async (opts) => {
    const config = loadConfig('harness.yaml');
    const tasksFile = loadTasks(config.tasks_file);
    const store = new HarnessStore(config.project.name);
    store.loadTasks(tasksFile.tasks);

    const tasks = opts.task
      ? tasksFile.tasks.filter((t) => t.id === opts.task)
      : tasksFile.tasks;

    if (tasks.length === 0) {
      console.error(`No tasks found${opts.task ? ` with id ${opts.task}` : ''}`);
      process.exit(1);
    }

    let pipelineStatus: 'idle' | 'running' | 'complete' | 'error' = 'running';
    let inkInstance: ReturnType<typeof render> | null = null;

    if (opts.tui !== false) {
      inkInstance = render(
        React.createElement(App, {
          store,
          projectName: config.project.name,
          pipelineStatus,
        })
      );
    }

    const runner = new PipelineRunner(config, store, {
      onTaskStart: (taskId) => console.log(`[pipeline] Starting task ${taskId}`),
      onAgentStart: (taskId, agent) => console.log(`[pipeline] ${agent} starting for ${taskId}`),
      onAgentComplete: (taskId, agent, result) => {
        console.log(`[pipeline] ${agent} complete for ${taskId} (verdict: ${result.verdict ?? 'N/A'})`);
      },
      onTaskComplete: (result) => {
        console.log(`[pipeline] Task ${result.taskId} ${result.status} (${result.attempts} attempts)`);
      },
    });

    // Auto-save state every 30 seconds
    const saveInterval = setInterval(() => store.saveTo(config.state_file), 30000);

    // Graceful shutdown
    process.on('SIGINT', () => {
      runner.abort();
      store.saveTo(config.state_file);
      clearInterval(saveInterval);
      inkInstance?.unmount();
      process.exit(0);
    });

    try {
      const results = await runner.runAll(tasks);
      pipelineStatus = results.every((r) => r.status === 'done') ? 'complete' : 'error';
    } catch (err) {
      pipelineStatus = 'error';
      console.error('Pipeline error:', err);
    } finally {
      store.saveTo(config.state_file);
      clearInterval(saveInterval);
      if (inkInstance) {
        // Keep TUI alive for a moment to show final state
        setTimeout(() => {
          inkInstance?.unmount();
          process.exit(0);
        }, 3000);
      }
    }
  });

program
  .command('resume')
  .description('Resume from last interruption')
  .action(async () => {
    const config = loadConfig('harness.yaml');
    if (!fs.existsSync(config.state_file)) {
      console.error('No state file found. Run `harness run` first.');
      process.exit(1);
    }
    const store = HarnessStore.loadFrom(config.state_file);
    const state = store.getState();
    const pending = state.tasks.filter((t) => !['done', 'failed'].includes(t.status));
    if (pending.length === 0) {
      console.log('All tasks are already done or failed.');
      return;
    }
    console.log(`Resuming ${pending.length} tasks...`);
    const tasksFile = loadTasks(config.tasks_file);
    const tasks = tasksFile.tasks.filter((t) => pending.some((p) => p.id === t.id));
    const runner = new PipelineRunner(config, store);
    await runner.runAll(tasks);
    store.saveTo(config.state_file);
  });

program
  .command('status')
  .description('Print current status')
  .action(() => {
    const config = loadConfig('harness.yaml');
    if (!fs.existsSync(config.state_file)) {
      console.log('No state file found. Run `harness run` first.');
      return;
    }
    const store = HarnessStore.loadFrom(config.state_file);
    const state = store.getState();
    console.log(`Project: ${state.project}`);
    console.log(`Tasks: ${state.tasks.length}`);
    for (const t of state.tasks) {
      const icon = t.status === 'done' ? 'V' : t.status === 'failed' ? 'X' : '-';
      console.log(`  ${icon} ${t.id} ${t.name} [${t.status}]`);
    }
    console.log(`Total cost: $${state.stats.total_cost_usd.toFixed(3)}`);
  });

program
  .command('report <taskId>')
  .description('Print execution report for a task')
  .action((taskId: string) => {
    const config = loadConfig('harness.yaml');
    const historyDir = path.join(path.dirname(config.state_file), 'history', taskId);
    if (!fs.existsSync(historyDir)) {
      console.error(`No history found for task ${taskId}`);
      process.exit(1);
    }
    const summaryPath = path.join(historyDir, 'summary.json');
    if (fs.existsSync(summaryPath)) {
      const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
      console.log(JSON.stringify(summary, null, 2));
    } else {
      console.log('Available files:');
      for (const f of fs.readdirSync(historyDir)) {
        console.log(`  ${f}`);
      }
    }
  });

program.parse();
```

**Step 3: Verify build**

```bash
npx tsc --noEmit
```

**Step 4: Commit**

```bash
git add src/index.ts templates/
git commit -m "feat: add CLI entry point with init/run/resume/status/report commands"
```

---

## Phase 8: Final Integration

### Task 16: Build, link, and smoke test

**Step 1: Build the project**

```bash
npm run build
```

**Step 2: Add bin shebang and make executable**

Verify `dist/index.js` has the `#!/usr/bin/env node` shebang.

**Step 3: Link globally for testing**

```bash
npm link
```

**Step 4: Smoke test in a temp directory**

```bash
cd /tmp && mkdir harness-test && cd harness-test
git init
harness init          # should create harness.yaml and tasks.yaml
harness status        # should print "No state file found"
cat harness.yaml      # verify config template
cat tasks.yaml        # verify task template
```

**Step 5: Run all tests**

```bash
cd ~/Desktop/code/dp/claude-harness
npm test
```

**Step 6: Commit**

```bash
git add -A
git commit -m "chore: final build verification and smoke test"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1 | Project scaffolding |
| 2 | 2-3 | Config & task schema with Zod |
| 3 | 4-5 | Event bus & state store |
| 4 | 6-9 | Agent types, registry, executor, verdict, snapshot |
| 5 | 10-11 | Prompt builders & pipeline runner |
| 6 | 12-14 | TUI components & tab views |
| 7 | 15 | CLI entry point with all commands |
| 8 | 16 | Build, link, smoke test |

**Total: 16 tasks, estimated ~80 files**

Each task produces a working, committable increment. No task depends on unreachable external services — the claude CLI integration is the only external dependency.
