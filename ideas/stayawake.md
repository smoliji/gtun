# Stay awake with the lid closed

## User story

As someone who runs long downloads, builds and syncs on a MacBook, I want to
keep the machine awake for a bounded period (an hour, two hours) and then have
it go back to normal on its own. I always set a limit up front; I never want
"awake forever". When the time is up — or when I stop it myself — closing the
lid should put the Mac to sleep exactly as it did before.

## Background

gtun already runs arbitrary commands from YAML and substitutes `${port}` into
the command line. A `caffeinate -u -t ${port}` entry (port read as seconds)
already covers the easy case: it keeps the machine awake while the lid is
*open*. That is bending the meaning of `port`, but it costs no code and works.

The thing it does not do is survive a closed lid. `caffeinate` only blocks idle
sleep; the lid-close path is a separate mechanism it has no say over. With the
lid shut and no external display, the Mac sleeps regardless.

## What actually controls lid-close sleep

On macOS the only knob for this is the kernel's `SleepDisabled` flag, set via:

```
sudo pmset -a disablesleep 1   # stay awake, including lid closed
sudo pmset -a disablesleep 0   # back to normal
```

Worth recording, because there is conflicting information online: this still
works on Apple Silicon with no external display, on battery. Verified on an M3,
macOS 26.5. The flag is **not** persistent — a reboot clears it back to 0. That
single fact is what makes the cleanup story tolerable: the worst case is "until
the next reboot", not "forever".

Two real downsides of the raw flag, independent of how we drive it:

- It needs root.
- It is global state, not tied to a process. Nothing reverts it for you. If the
  thing that set it dies without resetting, the Mac stays awake.

This is also why `caffeinate` wrappers like KeepingYouAwake do not help here
(they inherit `caffeinate`'s limitation), and why Amphetamine / Sleepless exist:
the value they add is safe lifecycle management around `disablesleep`, not the
flag itself.

## Options considered

1. **Off-the-shelf app (Amphetamine, Sleepless).** Both wrap `disablesleep`
   with an auto-off timer and a battery floor. Sleepless is the closer match —
   MIT, and it scopes its sudo grant to exactly the two `pmset` invocations.
   Downside: it is a menu-bar app. It lives outside gtun, so the "one Enter to
   toggle, same as my tunnels" workflow is lost.

2. **gtun config entry, no code.** A wrapper command that sets the flag, arms a
   `trap` to clear it, then runs `caffeinate -t` as the timer. Fits the existing
   model with zero changes to gtun. The bounded timer doubles as the safety
   net — the assertion can only outlive its window if the wrapper is hard-killed.

3. **First-class feature in gtun.** Teach gtun about `disablesleep`: clear it on
   startup and on exit, maybe a battery floor. More robust against `kill -9`,
   but it bakes a macOS power-management concern into a generic command runner,
   and would shell out to `sudo` even for users who never touch this entry.

## Proposed solution

Go with option 2. It matches the actual requirement (bounded windows, clean
return to default) and keeps gtun generic.

### Config entry

```yaml
# Keep the machine awake, lid open or closed, for `port` seconds.
# disablesleep is always reset to 0 on exit/stop via the trap.
- name: stay awake (lid)
  command: >
    sudo -n pmset -a disablesleep 1;
    trap 'sudo -n pmset -a disablesleep 0' EXIT INT TERM;
    caffeinate -u -t ${port}
  port: 3600
```

- `sudo -n` is non-interactive: without the sudoers grant below it fails
  immediately rather than blocking on a password prompt that gtun (running the
  command through `sh -c`, no TTY) could never answer.
- The `trap` clears the flag on normal exit (`EXIT`), Ctrl-C (`INT`) and
  `SIGTERM` — which is what gtun sends on stop, quit and its own SIGTERM handler.
- `caffeinate -t ${port}` is the timer. When it expires the script falls through
  to the `EXIT` trap and resets. `port` is the duration in seconds.

### Sudoers grant (one-off)

Via `sudo visudo -f /etc/sudoers.d/gtun-caffeinate`:

```
smoliji ALL=(root) NOPASSWD: /usr/bin/pmset -a disablesleep 1, /usr/bin/pmset -a disablesleep 0
```

Passwordless for those two literal commands only, no wildcards. Same approach
Sleepless takes.

### Changes to gtun

None. `cli.tsx` already calls `manager.stopAll()` on SIGTERM, SIGHUP and normal
quit, and `stopAll()` signals the whole process group, so the wrapper's `trap`
fires on every path gtun controls. The startup/exit reset from option 3 would
only buy us the narrow `kill -9`-the-wrapper case, at the cost of putting `pmset`
into the core.

## Failure modes

| Event | Recovers? |
|---|---|
| `caffeinate` reaches its `-t` limit | yes, `EXIT` trap |
| Stop in gtun (`s` / `x`) | yes, `TERM` trap; resets before the 4s SIGKILL escalation |
| Quit / Ctrl-C / SIGTERM to gtun | yes, `stopAll` → `TERM` trap |
| `kill -9` on gtun | yes — `caffeinate` is orphaned but keeps its timer; resets when `-t` expires |
| `kill -9` on the wrapper shell itself | no — flag stays at 1, cleared on next reboot |
| Crash / power loss / reboot | yes, the flag is not persistent |

The only case that leaves the flag set is a direct hard-kill of the wrapper,
which is not something normal operation produces, and a reboot clears it anyway.

## Known tradeoffs

- When `caffeinate` exits cleanly after `-t`, gtun marks the tunnel red
  (`error: exited with code 0`) because its model treats any process exit as a
  failure. Cosmetic. Accepted for now; the clean fix is an `exitOk`/`oneshot`
  flag in the tunnel model, tracked separately.
- With the lid shut the internal display stays powered, which costs battery.
  `caffeinate` does not turn it off. Negligible over a one- to two-hour window.
- `port` caps at 65535 (~18h), which is well beyond any window we care about.

## Possible follow-up

A couple of fixed entries (`stay awake 1h`, `stay awake 2h`) so the common
durations are one keystroke and don't need editing the port each time.
