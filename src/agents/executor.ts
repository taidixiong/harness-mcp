import { spawn } from 'node:child_process';
import type { AgentRunConfig, AgentResult, StreamEvent, ContentBlock } from './types.js';
import { extractVerdict } from '../pipeline/verdict.js';
import { eventBus } from '../state/events.js';

export function parseStreamLine(line: string): StreamEvent | null {
  if (!line.trim()) return null;
  try {
    return JSON.parse(line) as StreamEvent;
  } catch {
    return null;
  }
}

function extractText(events: StreamEvent[]): string {
  const texts: string[] = [];
  for (const ev of events) {
    if (ev.type === 'assistant' && ev.message?.content) {
      for (const block of ev.message.content) {
        if (block.type === 'text') texts.push(block.text);
      }
    }
    if (ev.type === 'result' && ev.result) {
      texts.push(ev.result);
    }
  }
  return texts.join('\n');
}

function extractToolCalls(events: StreamEvent[]): Array<{ name: string; input: Record<string, unknown> }> {
  const calls: Array<{ name: string; input: Record<string, unknown> }> = [];
  for (const ev of events) {
    if (ev.type === 'assistant' && ev.message?.content) {
      for (const block of ev.message.content) {
        if (block.type === 'tool_use') {
          calls.push({ name: block.name, input: block.input });
        }
      }
    }
  }
  return calls;
}

export function executeAgent(config: AgentRunConfig, prompt: string): Promise<AgentResult> {
  return new Promise((resolve, reject) => {
    const args = [
      '-p', prompt,
      '--model', config.model,
      '--system-prompt', config.systemPrompt,
      '--allowedTools', config.allowedTools.join(' '),
      '--output-format', 'stream-json',
      '--max-turns', String(config.maxTurns),
      '--no-session-persistence',
    ];

    const env = { ...process.env };
    delete env.CLAUDECODE;  // unset to allow nested invocation

    const proc = spawn('claude', args, {
      cwd: config.workdir,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const events: StreamEvent[] = [];
    let buffer = '';

    proc.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const event = parseStreamLine(line);
        if (event) {
          events.push(event);
          eventBus.emit('agent:event', { agent: config.role, data: event });
        }
      }
    });

    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      // Process remaining buffer
      if (buffer.trim()) {
        const event = parseStreamLine(buffer);
        if (event) events.push(event);
      }

      const output = extractText(events);
      const toolCalls = extractToolCalls(events);
      const verdictResult = extractVerdict(output);

      // Extract cost/duration from result event
      const resultEvent = events.find((e) => e.type === 'result');

      const result: AgentResult = {
        role: config.role,
        output,
        verdict: verdictResult?.verdict ?? null,
        verdictReason: verdictResult?.reason ?? '',
        events,
        toolCalls,
        costUsd: resultEvent?.cost_usd ?? 0,
        durationMs: resultEvent?.duration_ms ?? 0,
        numTurns: resultEvent?.num_turns ?? 0,
        exitCode: code ?? 1,
      };

      if (code !== 0 && events.length === 0) {
        eventBus.emit('agent:error', { agent: config.role, data: { stderr, code } });
      }

      eventBus.emit('agent:complete', { agent: config.role, data: result });
      resolve(result);
    });

    proc.on('error', (err) => {
      eventBus.emit('agent:error', { agent: config.role, data: { error: err.message } });
      reject(err);
    });

    eventBus.emit('agent:start', { agent: config.role, data: { prompt: prompt.slice(0, 200) } });
  });
}
