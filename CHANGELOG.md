# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning: [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `done` status for tunnels that exit cleanly (code 0), shown as a green `✓`.

### Fixed

- Terminal rendering and resize artifacts: render on the alternate screen, keep a
  line of headroom below the frame, and window the tunnel list so it never
  outgrows the terminal.

## [0.1.0] - 2026-06-22

### Added

- TUI to launch, stop, restart and watch tunnels from a YAML config.
- CI and release to GitHub Packages (`@smoliji/gtun`).

[Unreleased]: https://github.com/smoliji/gtun/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/smoliji/gtun/releases/tag/v0.1.0
