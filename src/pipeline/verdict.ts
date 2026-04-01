export interface VerdictResult {
  verdict: 'PASS' | 'FAIL';
  reason: string;
}

export function extractVerdict(output: string): VerdictResult | null {
  const matches = [...output.matchAll(/verdict:\s*(pass|fail)/gi)];
  if (matches.length === 0) return null;

  const last = matches[matches.length - 1];
  const verdict = last[1].toUpperCase() as 'PASS' | 'FAIL';

  // Reason is everything before the last VERDICT line
  const lastIdx = output.lastIndexOf(last[0]);
  const reason = output.slice(0, lastIdx).trim();

  return { verdict, reason };
}
