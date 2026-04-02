import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
  pipelineStatus: 'idle' | 'running' | 'complete' | 'error';
  currentTask: string | null;
  currentStage: string | null;
  elapsed: string;
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function StatusBar({ pipelineStatus, currentTask, currentStage, elapsed }: StatusBarProps) {
  const statusColor = {
    idle: 'gray',
    running: 'green',
    complete: 'cyan',
    error: 'red',
  }[pipelineStatus] as string;

  // Pick frame from elapsed seconds so spinner advances without its own timer
  const seconds = elapsed.split(':').reduce((acc, v) => acc * 60 + Number(v), 0);
  const frame = SPINNER_FRAMES[seconds % SPINNER_FRAMES.length];

  return (
    <Box flexDirection="row" borderStyle="single" borderTop paddingX={1}>
      <Box marginRight={2}>
        {pipelineStatus === 'running' && <Text color="green">{frame} </Text>}
        <Text color={statusColor}>Pipeline: {pipelineStatus}</Text>
      </Box>
      {currentTask && (
        <Box marginRight={2}>
          <Text>Task: {currentTask}</Text>
          {currentStage && <Text color="yellow"> ({currentStage})</Text>}
        </Box>
      )}
      <Text color="gray">T {elapsed}</Text>
    </Box>
  );
}
