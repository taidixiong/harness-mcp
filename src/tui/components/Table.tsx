import React from 'react';
import { Box, Text } from 'ink';

interface Column {
  header: string;
  width: number;
  align?: 'left' | 'right';
}

interface TableProps {
  columns: Column[];
  rows: string[][];
}

export function Table({ columns, rows }: TableProps) {
  return (
    <Box flexDirection="column">
      <Box>
        {columns.map((col, i) => (
          <Box key={i} width={col.width}>
            <Text bold underline>{col.header.padEnd(col.width)}</Text>
          </Box>
        ))}
      </Box>
      {rows.map((row, ri) => (
        <Box key={ri}>
          {row.map((cell, ci) => (
            <Box key={ci} width={columns[ci].width}>
              <Text>{cell.padEnd(columns[ci].width)}</Text>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  );
}
