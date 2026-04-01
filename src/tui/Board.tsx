import React from 'react';
import { Box, Text } from 'ink';
import type { HarnessStore } from '../state/store.js';

interface BoardProps {
  store: HarnessStore;
}

const COLUMNS = [
  { label: 'INBOX', statuses: ['inbox'] },
  { label: 'IN PROGRESS', statuses: ['planning', 'generating', 'debugging'] },
  { label: 'IN REVIEW', statuses: ['reviewing', 'qa_testing'] },
  { label: 'DONE', statuses: ['done', 'failed'] },
] as const;

export function Board({ store }: BoardProps) {
  const state = store.getState();

  return (
    <Box flexDirection="row" padding={1}>
      {COLUMNS.map((col) => {
        const tasks = state.tasks.filter((t) => (col.statuses as readonly string[]).includes(t.status));
        return (
          <Box key={col.label} flexDirection="column" width="25%" paddingRight={1}>
            <Text bold underline>{col.label}</Text>
            {tasks.map((t) => (
              <Box key={t.id} flexDirection="column" marginTop={1}>
                <Text>{t.id} {t.name}</Text>
                <Text color="gray">  {t.status}{t.attempt > 0 ? ` (attempt ${t.attempt})` : ''}</Text>
                {t.status === 'failed' && <Text color="red">  FAILED</Text>}
                {t.status === 'done' && <Text color="green">  PASS</Text>}
              </Box>
            ))}
            {tasks.length === 0 && <Text color="gray">  (empty)</Text>}
          </Box>
        );
      })}
    </Box>
  );
}
