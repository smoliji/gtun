import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import type { Config, ResolvedCommand, TunnelConfig } from './types.js';

export class ConfigError extends Error {}

export const DEFAULT_CONFIG_NAMES = [
  'gtun.config.yaml',
  'gtun.config.yml',
  'gtun.yaml',
  'gtun.yml',
];

interface ConfigLookup {
  cwd: string;
  /** Home config directory, e.g. ~/.config/gtun. */
  configHome: string;
}

/**
 * Find the config path from CLI args, falling back to default names in the
 * current directory and then the home config directory. Returns null when
 * nothing is found; throws ConfigError on a malformed `--config` flag.
 */
export function resolveConfigPath(argv: string[], lookup: ConfigLookup): string | null {
  const flagIdx = argv.findIndex((a) => a === '--config' || a === '-c');
  if (flagIdx !== -1) {
    const p = argv[flagIdx + 1];
    if (!p) throw new ConfigError('--config requires a path');
    return resolve(lookup.cwd, p);
  }

  const positional = argv.find((a) => !a.startsWith('-'));
  if (positional) return resolve(lookup.cwd, positional);

  for (const dir of [lookup.cwd, lookup.configHome]) {
    for (const name of DEFAULT_CONFIG_NAMES) {
      const candidate = resolve(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

export function loadConfig(path: string): Config {
  const raw = readFileSync(resolve(path), 'utf8');
  const parsed = parse(raw) as unknown;
  return validate(parsed);
}

export function validate(parsed: unknown): Config {
  if (!parsed || typeof parsed !== 'object') {
    throw new ConfigError('Config must be a YAML object.');
  }
  const tunnels = (parsed as { tunnels?: unknown }).tunnels;
  if (!Array.isArray(tunnels) || tunnels.length === 0) {
    throw new ConfigError('Config must define a non-empty `tunnels` list.');
  }

  const names = new Set<string>();
  return {
    tunnels: tunnels.map((t, i) => validateTunnel(t, i, names)),
  };
}

function validateTunnel(t: unknown, i: number, names: Set<string>): TunnelConfig {
  if (!t || typeof t !== 'object') {
    throw new ConfigError(`tunnels[${i}] must be an object.`);
  }
  const c = t as Record<string, unknown>;

  const name = c.name;
  if (typeof name !== 'string' || !name.trim()) {
    throw new ConfigError(`tunnels[${i}] is missing a \`name\`.`);
  }
  if (names.has(name)) {
    throw new ConfigError(`Duplicate tunnel name: ${name}.`);
  }
  names.add(name);

  if (typeof c.command !== 'string' || !c.command.trim()) {
    throw new ConfigError(`Tunnel "${name}" requires a \`command\`.`);
  }

  const port = Number(c.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError(`Tunnel "${name}" has invalid port: ${String(c.port)}.`);
  }

  return {
    name,
    port,
    command: c.command,
    readyPattern: typeof c.readyPattern === 'string' ? c.readyPattern : undefined,
    env: isStringRecord(c.env) ? c.env : undefined,
  };
}

function isStringRecord(v: unknown): v is Record<string, string> {
  return (
    !!v &&
    typeof v === 'object' &&
    Object.values(v as object).every((x) => typeof x === 'string')
  );
}

/** Build the spawnable command for a tunnel at the given (possibly edited) port. */
export function resolveCommand(cfg: TunnelConfig, port: number): ResolvedCommand {
  const command = cfg.command.replaceAll('${port}', String(port));
  return {
    // Run through a shell so users can write natural command lines.
    file: 'sh',
    args: ['-c', command],
    ready: cfg.readyPattern ? new RegExp(cfg.readyPattern, 'i') : undefined,
  };
}
