import React, { memo } from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
  pipelineStatus: 'idle' | 'running' | 'complete' | 'error';
  currentTask: string | null;
  currentStage: string | null;
  elapsed: string;
}

const SPINNER_FRAMES = ['\u280B', '\u2819', '\u2839', '\u2838', '\u283C', '\u2834', '\u2826', '\u2827', '\u2807', '\u280F'];

function StatusBarInner({ pipelineStatus, currentTask, currentStage, elapsed }: StatusBarProps) {
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

export const StatusBar = memo(StatusBarInner);
