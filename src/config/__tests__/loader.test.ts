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
