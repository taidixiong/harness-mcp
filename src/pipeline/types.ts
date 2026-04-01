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
