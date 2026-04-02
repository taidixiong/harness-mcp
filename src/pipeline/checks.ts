import { execSync } from 'node:child_process';

export interface CheckResult {
  passed: boolean;
  output: string;
  command: string;
}

export async function runDeterministicChecks(
  workdir: string,
  commands: readonly string[],
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  for (const command of commands) {
    try {
      const output = execSync(command, {
        cwd: workdir,
        encoding: 'utf-8',
        timeout: 120_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      results.push({ passed: true, output: output.trim(), command });
    } catch (err: unknown) {
      const error = err as { stdout?: string; stderr?: string; message?: string };
      const output = [error.stdout, error.stderr].filter(Boolean).join('\n').trim()
        || error.message
        || 'Command failed with no output';
      results.push({ passed: false, output, command });
    }
  }

  return results;
}

export function formatCheckResults(results: readonly CheckResult[]): string {
  if (results.length === 0) return '';

  const allPassed = results.every((r) => r.passed);

  const lines = results.map((r) => {
    const status = r.passed ? 'PASS' : 'FAIL';
    const outputSnippet = r.output.length > 500
      ? `${r.output.slice(0, 500)}...(truncated)`
      : r.output;
    return `### \`${r.command}\` — ${status}\n\`\`\`\n${outputSnippet}\n\`\`\``;
  });

  const header = allPassed
    ? '## Deterministic Checks (all passed)'
    : '## Deterministic Checks (FAILURES detected)';

  return `${header}\n\n${lines.join('\n\n')}`;
}
