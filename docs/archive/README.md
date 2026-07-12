# Archive

Retired plan **files** are removed from `docs/` when shipped or abandoned; history lives in **git**. This folder is the **policy** home, not a dump of every old PDF.

## Policy

1. **Do not** fork docs into worktree-only trees. Plans stay in the main repo `docs/`.
2. When a plan is done: delete the open plan file (or empty it to a 3-line “shipped” stub only if something still links to the path).
3. Update [portfolio/INDEX.md](../portfolio/INDEX.md): phase `P6-done`, or remove the workstream row.
4. Re-run `pnpm portfolio:sot` so `DOC-CATALOG.md` drops the path.
5. Worktree: `git worktree remove ../cycleforge-<id>` after merge; delete local branch if desired.

## What was bulk-deleted (cleanup waves)

Large retired plan sets appear as `D docs/...` in git history (e.g. 2026-07-10/11 backlog burn-down, archive/plans, sellable-foundation drafts, ROI execution subfolder). Prefer `git log --diff-filter=D --summary -- docs/` over restoring them into the working tree.

## Not archived here

- Active plans under `docs/todo/`
- Living SoT under `docs/portfolio/`
- Staff connections under `docs/master-connections-and-refactor/`
