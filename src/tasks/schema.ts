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
