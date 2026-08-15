# Product-updates popover

Staff-facing "What's new" panel. In-house only — no Beamer / Frill / third-party widget.

## Catalog vs `release-notes.json`

| File | Role |
|------|------|
| `src/data/product-updates.ts` | Curated SoT for the staff UI. Newest first. |
| `src/data/release-notes.json` | Git-log dump / changelog artifact. **Do not** feed it into the popover. |

The panel reads `PRODUCT_UPDATES` only. A git-log dump is too noisy for warehouse staff.

## Show-on-refresh rules

The host mounts **once** in `src/app/layout.tsx` (beside the toasters). First mount = full document load (hard refresh / new deploy). Client-side Next navigations do **not** remount the host and do **not** re-pop the panel.

Auto-open when prefs have loaded and the latest catalog entry is unseen:

- `lastSeenProductUpdateId !== latest.id`, or
- the entry has a `buildSha` and `lastSeenBuildSha` does not match.

Dismiss / **Got it** writes both keys onto `staff_preferences` (same bag as `onboardingDismissed`) via `useStaffPreferences().update`. The collapsed **What's new** chip stays so staff can reopen.

If a new deploy lands while a tab is open, the host polls `GET /api/version` every 120s. A sha change vs the page-load capture shows a quiet **New version — refresh** chip. It never force-reloads.

## How to add an update

1. Prepend a `ProductUpdate` to `PRODUCT_UPDATES` in `src/data/product-updates.ts` (newest first).
2. `id` must be stable and unique (`YYYY-MM-DD-slug`).
3. Set `buildSha` to the merge (or deploy) sha when you know it.
4. List `major` features (checkmark rows; click expands summary + video / "Demo coming").
5. List `minor` features under "Also in this update".
6. Omit `video` until a demo file exists. The UI already renders **Demo coming**.
7. Do not copy rows out of `release-notes.json`.

## How to cherry-pick

This work landed on local branch `wip/product-updates-popover` with **no remote tracking**. From the main worktree:

```bash
cd E:\cycleforge-app
git fetch --no-tags   # optional; not required — commits are local
git cherry-pick <commit-sha>
```

If the branch has two commits (feat + docs), cherry-pick both in order (oldest first):

```bash
git cherry-pick <feat-sha> <docs-sha>
```

Do not push this WIP branch. Do not open a PR from it.
