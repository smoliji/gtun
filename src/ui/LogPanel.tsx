import React from 'react';
import { Box, Text } from 'ink';
import type { Tunnel } from '../tunnel.js';
import type { LogLine } from '../tunnel.js';

const STREAM_COLOR: Record<LogLine['stream'], string | undefined> = {
  sys: 'cyan',
  err: 'red',
  out: undefined,
};

interface Props {
  tunnel?: Tunnel;
  rows: number;
}

export function LogPanel({ tunnel, rows }: Props) {
  const visible = Math.max(1, rows);
  const lines = tunnel ? tunnel.log.slice(-visible) : [];

  return (
    <Box flexDirection="column" flexGrow={1} borderStyle="round" paddingX={1}>
      <Text bold wrap="truncate-end">
        {tunnel ? `Log — ${tunnel.name}` : 'Log'}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {lines.length === 0 ? (
          <Text color="gray">no output yet</Text>
        ) : (
          lines.map((l, i) => (
            <Text key={i} color={STREAM_COLOR[l.stream]} wrap="truncate-end">
              {l.text}
            </Text>
          ))
        )}
      </Box>
    </Box>
  );
}
