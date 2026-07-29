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

## Parallel lanes, own ports

- `pnpm dev` auto-resolves this lane's port (main `:3000`, others `:3010+`); lanes run concurrently.
- Tunnel is main-only (`pnpm dev:tunnel`, mobile testing).
- Map: [`docs/portfolio/WORKTREE-LANES.md`](../../docs/portfolio/WORKTREE-LANES.md).
- **Never start a dev server with a raw shell command** — it escapes the port resolver and collides
  with whatever lane already owns that port.

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
