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
