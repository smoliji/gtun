import React from 'react';
import { Box, Text } from 'ink';
import type { Tunnel } from '../tunnel.js';
import type { TunnelStatus } from '../types.js';

const GLYPH: Record<TunnelStatus, string> = {
  off: '○',
  connecting: '◐',
  up: '●',
  error: '✗',
};

const COLOR: Record<TunnelStatus, string> = {
  off: 'gray',
  connecting: 'yellow',
  up: 'green',
  error: 'red',
};

interface Props {
  tunnels: Tunnel[];
  selected: number;
  editing: boolean;
  editBuffer: string;
  width: number;
}

export function TunnelList({ tunnels, selected, editing, editBuffer, width }: Props) {
  return (
    <Box flexDirection="column" width={width} borderStyle="round" paddingX={1} flexShrink={0}>
      <Text bold>Tunnels</Text>
      <Box flexDirection="column" marginTop={1}>
        {tunnels.map((t, i) => {
          const active = i === selected;
          const isEditing = active && editing;
          const port = isEditing ? `${editBuffer}_` : String(t.port);
          return (
            <Box key={t.name}>
              <Text color={COLOR[t.status]}>{GLYPH[t.status]} </Text>
              {/* Ink Boxes default to flexShrink:0, so the name needs an explicit
                  shrinking wrapper or a long name overflows and wraps the row. */}
              <Box flexGrow={1} flexShrink={1} minWidth={0}>
                <Text inverse={active} bold={active} wrap="truncate-end">
                  {t.name}
                </Text>
              </Box>
              <Text color={isEditing ? 'cyan' : 'gray'}> :{port}</Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
