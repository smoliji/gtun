import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TunnelManager } from '../src/tunnel.js';
import type { TunnelConfig } from '../src/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const fake = join(here, 'fake-tunnel.cjs');

function waitFor(check: () => boolean, ms = 4000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (check()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > ms) {
        clearInterval(timer);
        reject(new Error('timeout'));
      }
    }, 20);
  });
}

function customCfg(command: string): TunnelConfig {
  return { name: 't', port: 5432, command, readyPattern: 'Listening on port' };
}

test('tunnel goes connecting -> up on ready line, then off on stop', async () => {
  const mgr = new TunnelManager([customCfg(`node ${fake} ready`)]);
  const t = mgr.tunnels[0]!;

  t.start();
  assert.equal(t.status, 'connecting');

  await waitFor(() => t.status === 'up');
  assert.equal(t.status, 'up');
  assert.ok(t.log.some((l) => l.text.includes('Listening on port')));

  t.stop();
  await waitFor(() => t.status === 'off');
  assert.equal(t.status, 'off');
});

test('non-zero exit marks tunnel as error', async () => {
  const mgr = new TunnelManager([customCfg(`node ${fake} crash`)]);
  const t = mgr.tunnels[0]!;
  t.start();
  await waitFor(() => t.status === 'error');
  assert.equal(t.status, 'error');
  assert.match(t.lastError ?? '', /code 2/);
});

test('editing port restarts a running tunnel on the new port', async () => {
  const mgr = new TunnelManager([customCfg(`node ${fake} ready`)]);
  const t = mgr.tunnels[0]!;
  t.start();
  await waitFor(() => t.status === 'up');

  t.setPort(6000);
  assert.equal(t.port, 6000);
  await waitFor(() => t.status === 'up');
  assert.equal(t.status, 'up');

  t.stop();
  await waitFor(() => t.status === 'off');
});

test('stopAll brings everything down', async () => {
  const mgr = new TunnelManager([
    customCfg(`node ${fake} ready`),
    customCfg(`node ${fake} ready`),
  ]);
  mgr.startAll();
  await waitFor(() => mgr.tunnels.every((t) => t.status === 'up'));
  mgr.stopAll();
  await waitFor(() => mgr.allStopped());
  assert.ok(mgr.allStopped());
});
