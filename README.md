# gtun

A two-panel terminal UI to launch, stop and watch tunnels from a single YAML
config. Each tunnel is just a command: `gcloud` IAP tunnels, `cloud-sql-proxy`,
SSH forwards, anything. Quitting shuts every tunnel down.

```
┌ Tunnels ──────────────────────┐┌ Log — orders-db ────────────────────┐
│ ● orders-db             :5432 ││ $ cloud-sql-proxy …:orders-db       │
│ ◐ analytics-pg          :5433 ││ Listening on 127.0.0.1:5432         │
│ ○ cache-redis           :6379 ││ ready for new connections           │
└───────────────────────────────┘└─────────────────────────────────────┘
 ↑↓/jk move · s start/stop · r restart · e port · a all · x stop all · q quit
```

Status: `○ off`, `◐ connecting`, `● up`, `✗ error`.

## Install

Published to GitHub Packages as `@smoliji/gtun`. Point the scope at the GitHub
registry and authenticate with a GitHub token (a classic PAT with `read:packages`
works), then install globally:

```sh
echo "@smoliji:registry=https://npm.pkg.github.com" >> ~/.npmrc
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" >> ~/.npmrc

npm install -g @smoliji/gtun   # puts `gtun` on your PATH
```

### From source

```sh
pnpm install
pnpm build
pnpm link --global   # optional: puts `gtun` on your PATH
```

Or run without building:

```sh
pnpm dev ./examples/gtun.config.yaml
```

## Usage

```sh
gtun [config]            # positional path
gtun --config <path>     # or explicit flag
gtun                     # auto-detect gtun.config.yaml / gtun.yaml in CWD
```

## Keys

| Key            | Action                              |
| -------------- | ----------------------------------- |
| `↑`/`↓` `j`/`k`| move selection                      |
| `s` / `Enter`  | start or stop the selected tunnel   |
| `r`            | restart the selected tunnel         |
| `e`            | edit local port (restarts if running; Enter confirm, Esc cancel) |
| `a`            | start all tunnels                   |
| `x`            | stop all tunnels                    |
| `q` / `Ctrl-C` | quit (stops every tunnel first)     |

## Config

See [`examples/gtun.config.yaml`](examples/gtun.config.yaml). Each tunnel has a
`name`, a `command` and a local `port`:

```yaml
tunnels:
  - name: orders-db
    command: cloud-sql-proxy acme-prod:europe-west1:orders-db --port ${port}
    port: 5432
    readyPattern: "Listening on|ready for new connections"
```

- `command` runs via `sh -c`; `${port}` is replaced with the current local port.
- `readyPattern` (optional regex, case-insensitive) is matched against each log
  line to flip the tunnel to `up`. Without it, the tunnel is `up` once it has
  stayed alive briefly.
- `env` (optional) adds environment variables for the process.

Tunnels spawn in their own process group, so child processes (e.g. gcloud's
helpers) are killed cleanly on stop/quit.
