import React from 'react';
import { Box, Text } from 'ink';
import { Table } from './components/Table.js';
import { AGENT_DISPLAY } from '../agents/registry.js';
import type { HarnessStore } from '../state/store.js';
import type { HarnessEvent } from '../state/events.js';

interface DashboardProps {
  store: HarnessStore;
  recentEvents: HarnessEvent[];
}

export function Dashboard({ store, recentEvents }: DashboardProps) {
  const state = store.getState();
  const counts = {
    total: state.tasks.length,
    inProgress: state.tasks.filter((t) => !['inbox', 'done', 'failed'].includes(t.status)).length,
    done: state.tasks.filter((t) => t.status === 'done').length,
    failed: state.tasks.filter((t) => t.status === 'failed').length,
  };

  const agentRows = (Object.keys(AGENT_DISPLAY) as Array<keyof typeof AGENT_DISPLAY>).map((role) => {
    const display = AGENT_DISPLAY[role];
    const stats = state.stats.agents[role];
    return [
      display.label,
      state.tasks.find((t) => t.current_agent === role) ? 'running' : 'idle',
      String(stats?.tasks_done ?? 0),
      String(stats?.total_turns ?? 0),
    ];
  });

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Box marginRight={3}><Text bold>TOTAL </Text><Text>{counts.total}</Text></Box>
        <Box marginRight={3}><Text bold color="yellow">ACTIVE </Text><Text>{counts.inProgress}</Text></Box>
        <Box marginRight={3}><Text bold color="green">DONE </Text><Text>{counts.done}</Text></Box>
        <Box><Text bold color="red">FAILED </Text><Text>{counts.failed}</Text></Box>
      </Box>
      <Table
        columns={[
          { header: 'Agent', width: 16 },
          { header: 'Status', width: 10 },
          { header: 'Done', width: 6 },
          { header: 'Turns', width: 8 },
        ]}
        rows={agentRows}
      />
      <Box flexDirection="column" marginTop={1}>
        <Text bold underline>Recent Activity</Text>
        {recentEvents.slice(-5).reverse().map((ev, i) => (
          <Text key={i} color="gray">
            {ev.timestamp.slice(11, 19)} [{ev.agent ?? 'system'}] {ev.type}
          </Text>
        ))}
      </Box>
    </Box>
  );
}
