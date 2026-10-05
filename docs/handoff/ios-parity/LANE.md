# The `ios-parity` lane

Phases 3–5 of `docs/handoff/PROMPT-ios-arrival-unbox-parity-2026-10-04.md` run here, not in `prod`.

| | |
|---|---|
| Worktree | `~/Projects/cycleforge-lanes/ios-parity` (detached at `0ff1acb44`, no branch) |
| Dev server | `cycleforge-lane@ios-parity` → `http://localhost:3077` (`pnpm lane up ios-parity`) |
| Database | same `.env` as the `prod` lane (the production Neon DB) — reads transaction-scoped only |
| Baseline | exact file tree of production `dpl_9eqYeJNt6BudBsbkNEddge22Nwcq` (Phase 2 shipped, 2026-10-04 15:44) |
| Frozen baseline copy | `~/.cache/cf-deploy/baseline-dpl_9eqY/` (no `node_modules`) |

## How the lane was built

1. `node scripts/lane.mjs new ios-parity --ref 0ff1acb44…` (the `prod` worktree's HEAD at the time).
2. The production tree (`~/.cache/cf-deploy/staging` = `dpl_HvFi` + the Phase 2 View-mode hunk, sha1-verified against the deployment) was copied over the worktree with `rsync --delete`, keeping dotfiles. `git status` against `0ff1acb44` therefore shows production's differences from that commit, not this run's work.
3. `.claude/`, `.gemini/` and the run's own `docs/handoff/ios-parity/**`, the PROMPT file and `scripts/ios/**` were copied from `prod`.
4. `.env` / `.env.local` copied from `prod`.

## Seeing this run's work

The working tree is shared with whoever else opens this lane, and git commits are not used to checkpoint phases. Compare against the frozen baseline instead:

```sh
cd ~/Projects/cycleforge-lanes/ios-parity
diff -rq --exclude node_modules --exclude .git --exclude '.next*' --exclude '.env*' \
  --exclude .claude --exclude .gemini ~/.cache/cf-deploy/baseline-dpl_9eqY . 
```

At each STOP GATE, copy the changed files to `~/.cache/cf-deploy/phase-<n>-lane/` so phases can be compared and rolled back one by one. That list is also the deploy overlay.

## Deploying from the lane

Same staging mechanism as Phases 1–2 (`~/.cache/cf-deploy/LAST-DEPLOY.md`): rebuild `staging/` as an exact copy of whatever production serves at that moment, overlay only this run's changed files, check, preview, smoke, promote. Never run `vercel` from a worktree.
