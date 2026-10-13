# done-pill

A Claude Code mod, not part of kanigami: a pill above the prompt that says
whether Claude is still working, done with nothing pending, or waiting on
you — and, once a turn ends, the reply in one line (TL;DR) and explained
simply (ELI5).

- **Working** while a turn runs; **Done · safe to close**, **Needs you**,
  **Running in the background**, **Stopped**, or **Ended · not confirmed
  done** after it.
- Claude reports through a `status` tool the mod adds. A turn that tries to
  end without reporting is refused once, so it reports; one that still does
  not is shown as unconfirmed, never as done.
- Background work is checked, not taken on trust: a turn that says done
  while a background task is still running shows as running in the
  background, naming it. An artifact's live-update watch is not counted.

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install done-pill --marketplace ksenousi/kanigami
```

Answer `y` to add the marketplace, then pick the user scope. Sessions the
desktop app starts load it too.

## Develop

```
claude plugin validate mods/done-pill
claude plugin test mods/done-pill
```
