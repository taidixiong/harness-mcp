import { spawn } from 'node:child_process';

export interface InvokeClaudeOptions {
  prompt: string;
  systemPrompt: string;
  model?: string;
  maxTurns?: number;
}

/**
 * Invoke `claude -p` as a subprocess and return the text output.
 * Used by CLI commands (plan, new, feature) that need a one-shot Claude call.
 */
export function invokeClaude(options: InvokeClaudeOptions): Promise<string> {
  const { prompt, systemPrompt, model = 'sonnet', maxTurns = 1 } = options;

  return new Promise((resolve, reject) => {
    const args = [
      '-p', prompt,
      '--model', model,
      '--system-prompt', systemPrompt,
      '--output-format', 'text',
      '--max-turns', String(maxTurns),
      '--no-session-persistence',
    ];

    const env = { ...process.env };
    delete env.CLAUDECODE;

    const proc = spawn('claude', args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      if (code !== 0 && !stdout.trim()) {
        reject(new Error(`Claude exited with code ${code}: ${stderr}`));
      } else {
        resolve(stdout);
      }
    });
    proc.on('error', reject);
  });
}

/** Strip markdown YAML fences from Claude output */
export function cleanYamlOutput(raw: string): string {
  return raw.trim().replace(/^```ya?ml\n?/i, '').replace(/\n?```$/i, '').trim();
}
