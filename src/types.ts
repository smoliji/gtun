export type TunnelStatus = 'off' | 'connecting' | 'up' | 'error' | 'done';

/** Raw shape as written in the YAML config. */
export interface TunnelConfig {
  name: string;
  /** Local port; editable from the UI. */
  port: number;
  /** Command template. `${port}` is replaced with the (possibly edited) local port. */
  command: string;
  /** Regex that marks the tunnel as `up`, matched against each log line. */
  readyPattern?: string;
  /** Extra env vars passed to the spawned process. */
  env?: Record<string, string>;
}

export interface Config {
  tunnels: TunnelConfig[];
}

/** A spawnable command resolved from a TunnelConfig + current port. */
export interface ResolvedCommand {
  file: string;
  args: string[];
  ready?: RegExp;
}
