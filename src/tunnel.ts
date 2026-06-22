import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { resolveCommand } from './config.js';
import type { TunnelConfig, TunnelStatus } from './types.js';

const MAX_LOG_LINES = 500;
/** A tunnel with no readyPattern is considered `up` after staying alive this long. */
const UP_DELAY = 1500;
/** Grace period between SIGTERM and SIGKILL when stopping. */
const KILL_TIMEOUT = 4000;

export interface LogLine {
  text: string;
  stream: 'out' | 'err' | 'sys';
}

export class Tunnel {
  readonly name: string;
  port: number;
  status: TunnelStatus = 'off';
  readonly log: LogLine[] = [];

  /** Set when the process exits/errors while connecting or up. */
  lastError?: string;

  private proc?: ChildProcess;
  private upTimer?: NodeJS.Timeout;
  /** True between an intentional stop() and the process actually exiting. */
  private stopping = false;

  constructor(
    private readonly cfg: TunnelConfig,
    private readonly emitter: EventEmitter,
  ) {
    this.name = cfg.name;
    this.port = cfg.port;
  }

  start(): void {
    if (this.status === 'connecting' || this.status === 'up') return;

    const { file, args, ready } = resolveCommand(this.cfg, this.port);
    this.lastError = undefined;
    this.setStatus('connecting');
    this.append('sys', `$ ${file} ${args.join(' ')}`);

    let proc: ChildProcess;
    try {
      proc = spawn(file, args, {
        // Own process group so we can kill children (gcloud spawns helpers).
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, ...this.cfg.env },
      });
    } catch (err) {
      this.fail(`spawn failed: ${(err as Error).message}`);
      return;
    }
    this.proc = proc;

    proc.stdout?.on('data', (d) => this.onData(d, 'out', ready));
    proc.stderr?.on('data', (d) => this.onData(d, 'err', ready));

    proc.on('error', (err) => {
      this.clearUpTimer();
      this.fail(err.message);
    });

    proc.on('exit', (code, signal) => {
      this.clearUpTimer();
      this.proc = undefined;
      if (this.stopping) {
        this.stopping = false;
        this.setStatus('off');
        this.append('sys', 'stopped');
        return;
      }
      const reason = signal ? `killed by ${signal}` : `exited with code ${code}`;
      this.fail(reason);
    });

    // Without a readyPattern there's no line to wait for: treat "still alive" as up.
    if (!ready) {
      this.upTimer = setTimeout(() => {
        if (this.status === 'connecting') this.setStatus('up');
      }, UP_DELAY);
    }
  }

  stop(): void {
    const proc = this.proc;
    if (!proc || proc.pid == null) {
      this.setStatus('off');
      return;
    }
    this.stopping = true;
    this.clearUpTimer();
    this.killGroup(proc, 'SIGTERM');
    setTimeout(() => {
      if (this.proc === proc) this.killGroup(proc, 'SIGKILL');
    }, KILL_TIMEOUT);
  }

  restart(): void {
    if (this.proc) {
      this.once('off', () => this.start());
      this.stop();
    } else {
      this.start();
    }
  }

  setPort(port: number): void {
    if (port === this.port) return;
    this.port = port;
    this.emitter.emit('change', this);
    if (this.status === 'connecting' || this.status === 'up') {
      this.append('sys', `port changed to ${port}, restarting`);
      this.restart();
    }
  }

  private once(status: TunnelStatus, fn: () => void): void {
    const handler = (t: Tunnel) => {
      if (t === this && t.status === status) {
        this.emitter.off('change', handler);
        fn();
      }
    };
    this.emitter.on('change', handler);
  }

  private onData(chunk: Buffer, stream: 'out' | 'err', ready?: RegExp): void {
    for (const line of chunk.toString('utf8').split(/\r?\n/)) {
      if (line.length === 0) continue;
      this.append(stream, line);
      if (ready && this.status === 'connecting' && ready.test(line)) {
        this.clearUpTimer();
        this.setStatus('up');
      }
    }
  }

  private killGroup(proc: ChildProcess, signal: NodeJS.Signals): void {
    if (proc.pid == null) return;
    try {
      process.kill(-proc.pid, signal);
    } catch {
      try {
        proc.kill(signal);
      } catch {
        /* already dead */
      }
    }
  }

  private fail(reason: string): void {
    this.lastError = reason;
    this.append('sys', `error: ${reason}`);
    this.setStatus('error');
  }

  private append(stream: LogLine['stream'], text: string): void {
    this.log.push({ stream, text });
    if (this.log.length > MAX_LOG_LINES) this.log.splice(0, this.log.length - MAX_LOG_LINES);
    this.emitter.emit('log', this);
  }

  private setStatus(status: TunnelStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emitter.emit('change', this);
  }

  private clearUpTimer(): void {
    if (this.upTimer) {
      clearTimeout(this.upTimer);
      this.upTimer = undefined;
    }
  }
}

export class TunnelManager extends EventEmitter {
  readonly tunnels: Tunnel[];

  constructor(configs: TunnelConfig[]) {
    super();
    this.tunnels = configs.map((c) => new Tunnel(c, this));
  }

  startAll(): void {
    for (const t of this.tunnels) t.start();
  }

  /** Stop everything. Used on quit. */
  stopAll(): void {
    for (const t of this.tunnels) t.stop();
  }

  /** True once no tunnel still holds a running process. */
  allStopped(): boolean {
    return this.tunnels.every((t) => t.status === 'off' || t.status === 'error');
  }
}
