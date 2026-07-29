# Workflow & safety — lanes, branches, ports, memory, commits

Hard process rules for every agent. Summarized in root [`AGENTS.md`](../../AGENTS.md); this file holds
the detail and rationale.

## One worktree lane per initiative

- A distinct addition/surface gets its own worktree (`../cycleforge-<id>` on `topic/<id>`), registered
  in [`docs/portfolio/WORKTREE-LANES.md`](../../docs/portfolio/WORKTREE-LANES.md) + `dev-worktrees.json`
  (`pnpm dev:switcher`). Prefer the matching lane over piling unrelated work onto one branch.
- `main` is the **integration / dogfood lane** (WS-DOGFOOD) — dogfood-surface fixes and integration,
  not large parked-surface builds (e.g. WS-HOME → the `home` worktree).
- Docs stay in this monorepo; worktrees are **code lanes only**.

## Stay on the checkout's branch

- **Don't create ad-hoc branches or switch a checkout's branch mid-session.** The worktree *is* the
  branch — a separate directory per lane is what keeps parallel agent work from colliding. A new
  branch inside an existing lane re-introduces exactly the collision the lanes exist to prevent.
- Verify with `git branch --show-current` before committing.

## The dev server — ATTACH, never start

**The user owns the dev server. An agent never starts, stops, restarts, or kills one.**

- **`main` lane dev server runs on `http://localhost:3050`.** It is already running. To look at the
  app, attach to that origin — `preview_start { url: "http://localhost:3050" }`, or the
  `cycleforge-dev` entry in `.claude/launch.json`, which is deliberately **command-less** so it
  attaches instead of spawning.
- **Never** run `pnpm dev`, `next dev`, or `preview_start { name }` for a config that carries a
  command. **Never** `kill` / `pkill` a `next dev` process, and never delete `.next` or
  `.next/dev/lock` to "fix" a server you did not start.
  *Rationale (learned 2026-07-29): an agent restarted the dev server to clear a stale Tailwind cache.
  That killed the server the user was working against, left a stale `.next/dev/lock` behind, and the
  replacement died on the lock — costing more than the original problem. The user's terminal owns
  that process's lifecycle; an agent that stops it takes away the one surface the user was watching.*
- **A dev server in a bad state is a REPORT, not a repair.** Stale Tailwind content-glob cache after
  a file move, a poisoned Turbopack transform, a port already bound — say what it is and ask the user
  to restart. That restart is one keystroke for them and a foot-gun for you.
- Other lanes/worktrees keep their own ports (`:3010+`); the same attach-only rule applies to each.
  Tunnel is main-only (`pnpm dev:tunnel`, mobile testing).
- Map: [`docs/portfolio/WORKTREE-LANES.md`](../../docs/portfolio/WORKTREE-LANES.md).

**Do** verify against the running server (`curl`, the Browser pane, Playwright pointed at `:3050`).
**Don't** conclude a surface is broken because *you* could not reach it — check the port first.

## Cross-session memory

- **Work-log.** Read the last ~10 entries before starting (`pnpm worklog:tail`); append one when you
  finish a unit of work (`pnpm worklog "<action>" --result <r>`). Contract:
  [`docs/agent-log/README.md`](../../docs/agent-log/README.md).
- **Shared-memory artifacts.** Record work in its typed home (tickets → `master-plan.mdx`, signals →
  `user_reported_issues` / `entity_signals`, logs → work-log, …); **never fork a markdown twin of an
  existing store.** Map: [`docs/agent-fs/README.md`](../../docs/agent-fs/README.md). A new autonomous
  loop needs a contract ([`docs/agent-fs/contracts/`](../../docs/agent-fs/contracts)).

## Commits and secrets

- **The user manages commits.** Leave in-flight working-tree changes untouched; commit/push only when
  asked. When you do commit, stage **only** the files you changed — other sessions are editing the
  same tree, and `git add -A` sweeps their half-finished work into your commit.
- **Never `git stash`.** It silently removes another session's uncommitted work from the tree.
- **Never commit `.env`.** The real `.env` is gitignored and holds live secrets; `.env.example` is the
  template. Hooks in `.claude/settings.json` block secret-path edits — do not bypass them.
