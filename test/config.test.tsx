import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ConfigError, resolveCommand, resolveConfigPath, validate } from '../src/config.js';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'gtun-'));
}

test('resolveConfigPath honors --config, resolved against cwd', () => {
  const cwd = tmp();
  assert.equal(
    resolveConfigPath(['--config', 'my.yaml'], { cwd, configHome: tmp() }),
    resolve(cwd, 'my.yaml'),
  );
  assert.equal(
    resolveConfigPath(['-c', '/abs/my.yaml'], { cwd, configHome: tmp() }),
    '/abs/my.yaml',
  );
});

test('resolveConfigPath throws on a --config flag without a path', () => {
  assert.throws(
    () => resolveConfigPath(['--config'], { cwd: tmp(), configHome: tmp() }),
    ConfigError,
  );
});

test('resolveConfigPath takes a positional argument over defaults', () => {
  const cwd = tmp();
  writeFileSync(join(cwd, 'gtun.yaml'), 'tunnels: []');
  assert.equal(
    resolveConfigPath(['other.yaml'], { cwd, configHome: tmp() }),
    resolve(cwd, 'other.yaml'),
  );
});

test('resolveConfigPath finds a default name in cwd before home', () => {
  const cwd = tmp();
  const configHome = tmp();
  writeFileSync(join(cwd, 'gtun.yaml'), 'tunnels: []');
  writeFileSync(join(configHome, 'gtun.yaml'), 'tunnels: []');
  assert.equal(resolveConfigPath([], { cwd, configHome }), join(cwd, 'gtun.yaml'));
});

test('resolveConfigPath falls back to the home config dir', () => {
  const configHome = tmp();
  writeFileSync(join(configHome, 'gtun.config.yaml'), 'tunnels: []');
  assert.equal(
    resolveConfigPath([], { cwd: tmp(), configHome }),
    join(configHome, 'gtun.config.yaml'),
  );
});

test('resolveConfigPath returns null when nothing is found', () => {
  assert.equal(resolveConfigPath([], { cwd: tmp(), configHome: tmp() }), null);
});

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
