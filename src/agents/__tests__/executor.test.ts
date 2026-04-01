import { describe, it, expect, vi } from 'vitest';
import { parseStreamLine } from '../executor.js';

describe('parseStreamLine', () => {
  it('parses assistant text event', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Hello world' }] },
    });
    const event = parseStreamLine(line);
    expect(event?.type).toBe('assistant');
  });

  it('parses result event', () => {
    const line = JSON.stringify({
      type: 'result',
      result: 'Final output',
      cost_usd: 0.05,
      duration_ms: 3000,
      num_turns: 5,
    });
    const event = parseStreamLine(line);
    expect(event?.type).toBe('result');
    expect(event?.cost_usd).toBe(0.05);
  });

  it('returns null for invalid JSON', () => {
    const event = parseStreamLine('not json');
    expect(event).toBeNull();
  });

  it('returns null for empty line', () => {
    const event = parseStreamLine('');
    expect(event).toBeNull();
  });
});
