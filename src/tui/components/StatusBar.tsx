import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

interface StatusBarProps {
  pipelineStatus: 'idle' | 'running' | 'complete' | 'error';
  currentTask: string | null;
  currentStage: string | null;
  elapsed: string;
}

export function StatusBar({ pipelineStatus, currentTask, currentStage, elapsed }: StatusBarProps) {
  const statusColor = {
    idle: 'gray',
    running: 'green',
    complete: 'cyan',
    error: 'red',
  }[pipelineStatus] as string;

  return (
    <Box flexDirection="row" borderStyle="single" borderTop paddingX={1}>
      <Box marginRight={2}>
        {pipelineStatus === 'running' && <Spinner type="dots" />}
        <Text color={statusColor}> Pipeline: {pipelineStatus}</Text>
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
