import { describe, it, expect } from 'vitest';
import { extractVerdict } from '../verdict.js';

describe('extractVerdict', () => {
  it('extracts PASS', () => {
    const result = extractVerdict('All checks passed.\n\nVERDICT: PASS');
    expect(result).toEqual({ verdict: 'PASS', reason: 'All checks passed.' });
  });

  it('extracts FAIL with reason', () => {
    const result = extractVerdict(
      'Missing error handling in auth.go:42\nNo input validation\n\nVERDICT: FAIL'
    );
    expect(result).toEqual({
      verdict: 'FAIL',
      reason: 'Missing error handling in auth.go:42\nNo input validation',
    });
  });

  it('handles case insensitive', () => {
    const result = extractVerdict('ok\nverdict: pass');
    expect(result?.verdict).toBe('PASS');
  });

  it('returns null when no verdict found', () => {
    const result = extractVerdict('Some random output without verdict');
    expect(result).toBeNull();
  });

  it('takes last verdict if multiple exist', () => {
    const result = extractVerdict('VERDICT: FAIL\nAfter fixes:\nVERDICT: PASS');
    expect(result?.verdict).toBe('PASS');
  });
});
