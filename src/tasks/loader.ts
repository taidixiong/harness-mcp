import fs from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { TasksFileSchema, type TasksFile } from './schema.js';

export function loadTasks(filePath: string): TasksFile {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseYaml(raw);
  return TasksFileSchema.parse(parsed);
}
