import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { HarnessEvent } from '../state/events.js';

interface LiveFeedProps {
  events: HarnessEvent[];
}

type Filter = 'all' | 'agent' | 'system' | 'tool' | 'error';

const FILTERS: Filter[] = ['all', 'agent', 'system', 'tool', 'error'];

function matchesFilter(event: HarnessEvent, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'agent') return event.type.startsWith('agent:');
  if (filter === 'system') return event.type.startsWith('pipeline:');
  if (filter === 'tool') return event.type === 'agent:event';
  if (filter === 'error') return event.type.includes('error');
  return true;
}

export function LiveFeed({ events }: LiveFeedProps) {
  const [filter, setFilter] = useState<Filter>('all');

  useInput((input) => {
    const idx = FILTERS.indexOf(filter);
    if (input === 'f') {
      setFilter(FILTERS[(idx + 1) % FILTERS.length]);
    }
  });

  const filtered = events.filter((e) => matchesFilter(e, filter));
  const visible = filtered.slice(-20);

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text>Filter [f]: </Text>
        {FILTERS.map((f) => (
          <Text key={f} bold={f === filter} color={f === filter ? 'green' : 'gray'}>
            {f}
          </Text>
        ))}
        <Text color="gray"> ({filtered.length} events)</Text>
      </Box>
      {visible.map((ev, i) => (
        <Text key={i} wrap="truncate-end">
          <Text color="gray">{ev.timestamp.slice(11, 19)}</Text>
          <Text color="cyan"> [{ev.agent ?? 'sys'}]</Text>
          <Text color="yellow"> {ev.type}</Text>
          <Text> {typeof ev.data === 'string' ? ev.data : ''}</Text>
        </Text>
      ))}
    </Box>
  );
}
