import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render } from 'ink-testing-library';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { App } from '../src/ui/App.js';
import { TunnelManager } from '../src/tunnel.js';
import type { TunnelConfig } from '../src/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const fake = join(here, 'fake-tunnel.cjs');

const cfgs: TunnelConfig[] = [
  { name: 'alpha', port: 5432, command: `node ${fake} ready`, readyPattern: 'Listening on port' },
  { name: 'beta', port: 6379, command: `node ${fake} ready`, readyPattern: 'Listening on port' },
];

const tick = () => new Promise((r) => setTimeout(r, 60));

const widths = (frame: string) =>
  frame
    .split('\n')
    .filter((l) => l.includes('│'))
    .map((l) => [...l].length);

test('a long tunnel name is truncated, not wrapped, and the port stays on its row', async () => {
  const longName = 'analytics-postgres-replica-eu-west-1-very-long-overflowing-name';
  const mgr = new TunnelManager([
    { name: longName, port: 5432, command: 'sleep 99' },
    { name: 'short', port: 6379, command: 'sleep 99' },
  ]);
  const { lastFrame, unmount } = render(<App manager={mgr} />);
  await tick();
  const frame = lastFrame() ?? '';

  // Every bordered row has the same display width => nothing wrapped onto a new line.
  const w = widths(frame);
  assert.equal(new Set(w).size, 1, `rows have inconsistent widths: ${w}`);
  // Truncated with an ellipsis; the full name must not appear verbatim.
  assert.ok(frame.includes('…'), 'expected an ellipsis from truncation');
  assert.ok(!frame.includes(longName), 'long name should not appear in full');
  // The first tunnel's port is still rendered.
  assert.match(frame, /:5432/);

  unmount();
  mgr.stopAll();
});

test('renders both panels with tunnel names, ports and hints', async () => {
  const mgr = new TunnelManager(cfgs);
  const { lastFrame, unmount } = render(<App manager={mgr} />);
  await tick();
  const frame = lastFrame() ?? '';
  assert.match(frame, /Tunnels/);
  assert.match(frame, /alpha/);
  assert.match(frame, /beta/);
  assert.match(frame, /:5432/);
  assert.match(frame, /start\/stop/);
  unmount();
  mgr.stopAll();
});

test('pressing s starts the selected tunnel and the log panel shows its name', async () => {
  const mgr = new TunnelManager(cfgs);
  const { lastFrame, stdin, unmount } = render(<App manager={mgr} />);
  await tick();

  stdin.write('s'); // start alpha
  await new Promise((r) => setTimeout(r, 200));

  assert.equal(mgr.tunnels[0]!.status, 'up');
  assert.match(lastFrame() ?? '', /Log — alpha/);

  unmount();
  mgr.stopAll();
  await tick();
});

test('vim "j" navigates down and "k" back up', async () => {
  const mgr = new TunnelManager(cfgs);
  const { lastFrame, stdin, unmount } = render(<App manager={mgr} />);
  await tick();
  stdin.write('j');
  await tick();
  assert.match(lastFrame() ?? '', /Log — beta/);
  stdin.write('k');
  await tick();
  assert.match(lastFrame() ?? '', /Log — alpha/);
  unmount();
  mgr.stopAll();
});

test('arrow navigation moves the log panel to the other tunnel', async () => {
  const mgr = new TunnelManager(cfgs);
  const { lastFrame, stdin, unmount } = render(<App manager={mgr} />);
  await tick();
  stdin.write('[B'); // down arrow
  await tick();
  assert.match(lastFrame() ?? '', /Log — beta/);
  unmount();
  mgr.stopAll();
});
