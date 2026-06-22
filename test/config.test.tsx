import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigError, resolveCommand, validate } from '../src/config.js';

test('validate rejects empty config', () => {
  assert.throws(() => validate({}), ConfigError);
  assert.throws(() => validate({ tunnels: [] }), ConfigError);
});

test('validate rejects a tunnel without a command', () => {
  assert.throws(
    () => validate({ tunnels: [{ name: 'a', port: 5432 }] }),
    /requires a `command`/,
  );
});

test('validate rejects duplicate names and bad ports', () => {
  assert.throws(
    () =>
      validate({
        tunnels: [
          { name: 'a', command: 'x', port: 1 },
          { name: 'a', command: 'x', port: 2 },
        ],
      }),
    /Duplicate/,
  );
  assert.throws(
    () => validate({ tunnels: [{ name: 'a', command: 'x', port: 0 }] }),
    /invalid port/,
  );
});

test('resolveCommand substitutes ${port} and runs via sh', () => {
  const cfg = validate({
    tunnels: [{ name: 'a', command: 'ssh -L ${port}:x:1 h', port: 7000 }],
  }).tunnels[0]!;
  const cmd = resolveCommand(cfg, 9999);
  assert.equal(cmd.file, 'sh');
  assert.deepEqual(cmd.args, ['-c', 'ssh -L 9999:x:1 h']);
  assert.equal(cmd.ready, undefined);
});

test('resolveCommand compiles readyPattern into a case-insensitive regex', () => {
  const cfg = validate({
    tunnels: [{ name: 'a', command: 'x', port: 1, readyPattern: 'Listening on' }],
  }).tunnels[0]!;
  const cmd = resolveCommand(cfg, 1);
  assert.ok(cmd.ready?.test('LISTENING ON port 5432'));
});
