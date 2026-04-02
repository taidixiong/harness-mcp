import React, { memo } from 'react';
import { Box, Text } from 'ink';
import type { AgentResult } from '../agents/types.js';
import { AGENT_DISPLAY } from '../agents/registry.js';

interface AgentPanelProps {
  activeAgent: string | null;
  activeResult: AgentResult | null;
  turnCount: number;
  maxTurns: number;
  toolCallCounts: Record<string, number>;
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function AgentPanelInner({ activeAgent, activeResult, turnCount, maxTurns, toolCallCounts }: AgentPanelProps) {
  if (!activeAgent) {
    return (
      <Box padding={1}>
        <Text color="gray">No agent currently running.</Text>
      </Box>
    );
  }

  const display = AGENT_DISPLAY[activeAgent as keyof typeof AGENT_DISPLAY] ?? { label: activeAgent, color: 'white' };
  const maxCount = Math.max(1, ...Object.values(toolCallCounts));
  const frame = SPINNER_FRAMES[Math.floor(Date.now() / 1000) % SPINNER_FRAMES.length];

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text color="green">{frame} </Text>
        <Text bold color={display.color}>{display.label}</Text>
        <Text> — Turn {turnCount}/{maxTurns}</Text>
      </Box>

      <Text bold underline>Tool Calls:</Text>
      {Object.entries(toolCallCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([tool, count]) => {
          const barLen = Math.round((count / maxCount) * 20);
          return (
            <Box key={tool}>
              <Box width={10}><Text>{tool}</Text></Box>
              <Text color="green">{'█'.repeat(barLen)}{'░'.repeat(20 - barLen)}</Text>
              <Text> {count}</Text>
            </Box>
          );
        })}

      {activeResult && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold underline>Latest Output:</Text>
          <Text wrap="truncate-end">{activeResult.output.slice(-300)}</Text>
          <Box marginTop={1}>
            <Text color="gray">Cost: ${activeResult.costUsd.toFixed(3)}</Text>
            <Text color="gray">  Duration: {(activeResult.durationMs / 1000).toFixed(0)}s</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}

export const AgentPanel = memo(AgentPanelInner);
