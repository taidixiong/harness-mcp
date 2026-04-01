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
