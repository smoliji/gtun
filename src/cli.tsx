#!/usr/bin/env node
import React from 'react';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from 'ink';
import { ConfigError, loadConfig } from './config.js';
import { TunnelManager } from './tunnel.js';
import { App } from './ui/App.js';

const HELP = `gtun — launch, stop and watch GCP tunnels from a YAML config

Usage:
  gtun [config]
  gtun --config <path>

Defaults: looks for gtun.config.yaml or gtun.yaml in the current directory.

Keys:
  ↑↓ / j k   move        s   start/stop selected
  e          edit port   r   restart selected
  a          start all   x   stop all
  q / Ctrl-C quit (stops every tunnel first)
`;

const DEFAULT_NAMES = ['gtun.config.yaml', 'gtun.config.yml', 'gtun.yaml', 'gtun.yml'];

function resolveConfigPath(argv: string[]): string {
  const flagIdx = argv.findIndex((a) => a === '--config' || a === '-c');
  if (flagIdx !== -1) {
    const p = argv[flagIdx + 1];
    if (!p) fail('--config requires a path');
    return resolve(p!);
  }
  const positional = argv.find((a) => !a.startsWith('-'));
  if (positional) return resolve(positional);

  for (const name of DEFAULT_NAMES) {
    if (existsSync(name)) return resolve(name);
  }
  fail(`No config given and none of ${DEFAULT_NAMES.join(', ')} found in ${process.cwd()}.`);
}

function fail(msg: string): never {
  process.stderr.write(`gtun: ${msg}\n`);
  process.exit(1);
}

// Run the TUI on the terminal's alternate screen so Ink owns a clean,
// full-height canvas. Without this, anything already on screen (e.g. the
// `pnpm start` banner) pushes the frame past the bottom row; the terminal
// scrolls, Ink's in-place redraw lands off by a line, and every re-render
// cascades a fresh copy down the screen.
function enterAltScreen(): void {
  if (process.stdout.isTTY) process.stdout.write('\x1b[?1049h\x1b[H');
}

function leaveAltScreen(): void {
  if (process.stdout.isTTY) process.stdout.write('\x1b[?1049l');
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(HELP);
    return;
  }

  const path = resolveConfigPath(argv);
  let manager: TunnelManager;
  try {
    const config = loadConfig(path);
    manager = new TunnelManager(config.tunnels);
  } catch (err) {
    if (err instanceof ConfigError) fail(err.message);
    fail(`failed to load ${path}: ${(err as Error).message}`);
  }

  enterAltScreen();
  const { waitUntilExit } = render(<App manager={manager} />, { exitOnCtrlC: false });

  // Last-resort cleanup if the process is terminated outside the TUI.
  const hardStop = () => {
    manager.stopAll();
    leaveAltScreen();
    process.exit(0);
  };
  process.on('SIGTERM', hardStop);
  process.on('SIGHUP', hardStop);

  waitUntilExit().then(() => {
    manager.stopAll();
    leaveAltScreen();
    process.exit(0);
  });
}

main();
