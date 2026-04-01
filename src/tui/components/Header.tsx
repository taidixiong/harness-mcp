import React from 'react';
import { Box, Text } from 'ink';

interface HeaderProps {
  activeTab: number;
  projectName: string;
}

const TABS = ['Dashboard', 'Board', 'Agent', 'Feed'];

export function Header({ activeTab, projectName }: HeaderProps) {
  return (
    <Box flexDirection="row" borderStyle="single" borderBottom paddingX={1}>
      <Text bold color="cyan">{projectName}</Text>
      <Text> | </Text>
      {TABS.map((tab, i) => (
        <React.Fragment key={tab}>
          <Text bold={i === activeTab} color={i === activeTab ? 'green' : 'gray'}>
            [{i + 1}] {tab}
          </Text>
          {i < TABS.length - 1 && <Text>  </Text>}
        </React.Fragment>
      ))}
      <Text>  </Text>
      <Text color="gray">[q] Quit</Text>
    </Box>
  );
}
