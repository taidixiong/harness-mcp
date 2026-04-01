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
