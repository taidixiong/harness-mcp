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
