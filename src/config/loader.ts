import fs from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { HarnessConfigSchema, type HarnessConfig } from './schema.js';

export function loadConfig(filePath: string): HarnessConfig {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseYaml(raw);
  return HarnessConfigSchema.parse(parsed);
}
