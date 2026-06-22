import React, { useEffect, useReducer, useState } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import type { TunnelManager } from '../tunnel.js';
import { TunnelList } from './TunnelList.js';
import { LogPanel } from './LogPanel.js';

interface Props {
  manager: TunnelManager;
}

export function App({ manager }: Props) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  const [selected, setSelected] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editBuffer, setEditBuffer] = useState('');
  const [quitting, setQuitting] = useState(false);

  // Re-render whenever a tunnel changes state or logs.
  useEffect(() => {
    manager.on('change', forceRender);
    manager.on('log', forceRender);
    return () => {
      manager.off('change', forceRender);
      manager.off('log', forceRender);
    };
  }, [manager]);

  // Shutdown sequence: stop all, then exit once every process is gone.
  useEffect(() => {
    if (!quitting) return;
    const tryExit = () => {
      if (manager.allStopped()) exit();
    };
    manager.on('change', tryExit);
    const timer = setTimeout(exit, 6000); // hard cap
    tryExit();
    return () => {
      manager.off('change', tryExit);
      clearTimeout(timer);
    };
  }, [quitting, manager, exit]);

  const tunnels = manager.tunnels;
  const current = tunnels[selected];

  const beginQuit = () => {
    setEditing(false);
    setQuitting(true);
    manager.stopAll();
  };

  useInput((input, key) => {
    if (quitting) return;

    if (editing) {
      if (key.escape) {
        setEditing(false);
      } else if (key.return) {
        const port = Number(editBuffer);
        if (Number.isInteger(port) && port >= 1 && port <= 65535) current?.setPort(port);
        setEditing(false);
      } else if (key.backspace || key.delete) {
        setEditBuffer((b) => b.slice(0, -1));
      } else if (/^\d$/.test(input) && editBuffer.length < 5) {
        setEditBuffer((b) => b + input);
      }
      return;
    }

    if (key.ctrl && input === 'c') return beginQuit();
    if (input === 'q') return beginQuit();

    if (key.upArrow || input === 'k') {
      setSelected((s) => (s - 1 + tunnels.length) % tunnels.length);
    } else if (key.downArrow || input === 'j') {
      setSelected((s) => (s + 1) % tunnels.length);
    } else if (key.return || input === 's') {
      if (current?.status === 'up' || current?.status === 'connecting') current.stop();
      else current?.start();
    } else if (input === 'r') {
      current?.restart();
    } else if (input === 'a') {
      manager.startAll();
    } else if (input === 'x') {
      manager.stopAll();
    } else if (input === 'e') {
      if (current) {
        setEditBuffer(String(current.port));
        setEditing(true);
      }
    }
  });

  const logRows = Math.max(3, (stdout?.rows ?? 24) - 6);
  const listWidth = computeListWidth(tunnels, stdout?.columns ?? 80);

  if (quitting) {
    return (
      <Box padding={1}>
        <Text color="yellow">Shutting down tunnels…</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box>
        <TunnelList
          tunnels={tunnels}
          selected={selected}
          editing={editing}
          editBuffer={editBuffer}
          width={listWidth}
        />
        <LogPanel tunnel={current} rows={logRows} />
      </Box>
      <StatusBar editing={editing} />
    </Box>
  );
}

/**
 * Width of the left list: wide enough for the longest name (+ glyph, port,
 * border/padding), but never more than half the terminal so the log keeps room.
 * Names longer than the cap are truncated by the list itself.
 */
function computeListWidth(tunnels: { name: string }[], columns: number): number {
  const longest = tunnels.reduce((m, t) => Math.max(m, t.name.length), 0);
  const desired = longest + 13; // glyph(2) + " :65535"(7) + border+padding(4)
  const cap = Math.max(24, Math.floor(columns * 0.5));
  return Math.min(Math.max(24, desired), cap);
}

function StatusBar({ editing }: { editing: boolean }) {
  return (
    <Box paddingX={1}>
      <Text color="gray">
        {editing
          ? 'type port · enter confirm · esc cancel'
          : '↑↓/jk move · s start/stop · r restart · e port · a all · x stop all · q quit'}
      </Text>
    </Box>
  );
}
