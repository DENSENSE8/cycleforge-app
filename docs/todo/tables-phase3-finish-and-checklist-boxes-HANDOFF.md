# HANDOFF — finish the table-SoT deliverable + checklist→boxes update

Two independent tracks. **Deliverable 1** (land the table Phase-3 work) is
blocked on repo health, not on code. **Deliverable 2** (checklist marks → flush
boxes) is a fresh UI-consistency change with one hard-rule caveat.

---

## Deliverable 1 — Land the table-definition-registry Phase-3 close-out

### Where it stands (all verified)
- The registry migration itself is **already in `main`** (merge `d825ef4af`,
  ancestor of main): every Workbench spreadsheet mounts through
  `NonlinearTableHost` + a Zod `TableDefinition`; 16 definitions; the SoT law is
  in `AGENTS.md` + `source-of-truth.md` → *Table definition registry (mount waist)*.
- The **Phase-3 anti-regrowth ratchet** is committed on branch `topic/tables`
  (worktree `../cycleforge-tables`) as **`3e522a690`**, on top of `a491291a8`
  (lane reg) and `6e11ddd04` (waves 4-5). It is **NOT yet in main**.
  - It adds a **shrink-only freeze** of the 14-file `*GridView.tsx` wrapper forest
    to `src/lib/tables/grid-surface-capabilities.guard.test.ts` (a new wrapper
    fails CI → "bind via the registry"; a deleted one shrinks the list).
  - Verified: **104/104 table guards green**, forest == main's committed
    `*GridView` set **exactly**, and the freeze **bites** (a probe file fails it).
  - Sweep done: **no ops-queue hand-rolled `<table>` twin survives**
    (Ready/Warranty render their GridView; ByUnitView = unit-detail sub-tables;
    PackingKpiSection = Monitor analytics; ScannedMode = Gmail reconcile).
  - `StationListTable` / `FbaBoardTable` stay **documented raw-mount exceptions**.

### The blocker (this is the whole reason it isn't landed)
`main`'s **committed** tree is RED under full `npm run verify` — **not from the
table work.** 21 tsc errors, all "committed CONSUMERS ahead of uncommitted
IMPLEMENTATIONS" from concurrent unbox/testing/FBA sessions:
- `LineEditPanel.tsx` / `TriagePanel.tsx` / `PhotosDisplayHost.tsx` import
  `./line-edit/UnboxDockHost`, `UnboxDockNotesEntry`, `UnboxProcedurePager`,
  `useUnboxProcedureArrowKeys`, `buildUnboxStepDock` — all present **untracked**
  in the app working tree, not committed.
- `TestingPanel.tsx` imports untracked `./testing-panel/testing-ticket-context`.
- FBA files import `normalizeFnsku`; the working tree renamed it to
  `normalizeTrackingCanonical` but only half-committed.
- **Proof it's not code to write:** the DIRTY app working tree typechecks
  **GREEN (0 errors)**. The fix is those sessions committing their impls.

### To finish (in order)
1. **Wait for main's committed CI to go green** (the concurrent sessions commit
   their pending implementation files). Confirm with a clean checkout:
   `git worktree add --detach /tmp/cf-verify <main-tip>` → symlink `node_modules`
   → `cp` the app checkout's `.env` in → `npm run verify`.
2. **Merge `topic/tables` → main.** You CANNOT `git merge` in the live `main`
   checkout (perpetually dirty; a plumbing `update-ref` leaves it showing new
   files as staged-DELETIONS). Use the proven recipe:
   - `git worktree add --detach /tmp/land <main-tip>` → `git merge topic/tables`
     there (object-clean — only `3e522a690` is new vs main; `a491291a8` lane-reg
     may overlap main's existing `d825ef4af` lane entry — reconcile, don't dup) →
     run the table guard set on the merged tree → `git update-ref refs/heads/main
     <M> <old>` (CAS; fails safe if main moved).
   - Reconcile the app checkout: `git checkout HEAD -- <clean merge paths>`;
     for `source-of-truth.md` (concurrently edited) do a 3-way
     `git merge-file <ours> <base=old-main> <theirs=HEAD>` so both survive.
   - `git worktree remove --force /tmp/land`.
3. **Push** from a CLEAN checkout at main's tip (the dirty main checkout can't
   pass the pre-push `verify` hook). **Never `--no-verify`** — that would publish
   red code to the shared remote and is forbidden by the repo's laws.

### Table guard set (the green signal — use these, not full verify)
```bash
cd ../cycleforge-tables && npx tsx --test \
  src/lib/tables/table-definition.test.ts \
  src/components/tables/table-definition-registry.guard.test.ts \
  src/lib/tables/grid-surface-capabilities.guard.test.ts \
  src/components/dashboard/dashboard-orders-sheet.guard.test.ts \
  src/design-system/components/grid/grid-view-plumbing.guard.test.ts \
  src/components/workbench-cohort-wave7-sheet.guard.test.ts \
  src/features/review/review-workspace-sheet.guard.test.ts
```

---

## Deliverable 2 — Checklist marks → flush-square boxes

**User request:** *"the checklist should be boxes to match the rest of the codebase."*
(Reference screenshot: a LedgerGrid select gutter — square checkboxes, `Order`
column, `Filter` search, age rail.)

### The inconsistency
The procedure checklist renders its step marks as **`rounded-full` circles**,
while the codebase's checkbox/box language is **flush-square** (Kinetic Ledger is
zero-radius industrial). Concrete:
- `src/design-system/components/procedure/ProcedureChecklist.tsx` (~line 66):
  done mark = `rounded-full bg-blue-600` + `<Check>`; pending/active are sibling
  `rounded-full` spans.
- `src/design-system/components/procedure/ProcedureDeck.tsx` (~lines 78, 85):
  same `rounded-full` step medallions.
- The house box style to match: `@/design-system/primitives` **`Checkbox`** and
  the grid gutter **`GridRowCheckbox`** (`src/components/ui/GridRowCheckbox.tsx`) /
  `GridClickSelectFace` — all flush-square.

### CONFIRM FIRST (the screenshot shows a grid, not the checklist)
The screenshot is the *reference* box style, not the surface to change. Confirm
"the checklist" = the **procedure checklist/deck** (most likely) vs some other
list before editing. If it's a different surface, adjust the file targets.

### HARD-RULE CAVEAT — read before you change the shape
Procedure steps are **evidence-derived, never hand-ticked** (`display/station.md`,
`display/instrument-panel.md`): `skipped` is a waiver, never a check; hand-ticked
checklists were deleted and stay deleted. Also `ui-design-system.md`:
`rounded-full` is *allowed* for **status dots** — a step mark can legitimately be
read as a status dot today.

So the change is **shape only, not interaction**:
- Make the mark a **flush-square** box (`cornerClass('flush')` / `rounded-none`),
  matching the grid checkbox footprint — NOT a `rounded-full` circle.
- It stays **READ-ONLY and evidence-driven** — it must NOT become an interactive,
  hand-clickable `Checkbox`. A square that clicks to toggle would reintroduce the
  banned hand-ticked checklist. Keep the done/active/pending/skipped vocabulary
  (`ProcedureStepRow` types); only the glyph container's radius changes.
- Keep `skipped` visually distinct from `done` (a waiver is not a check).

### Verify
- No browser-observable regression on the Unbox bench (procedure checklist +
  deck render, step states still evidence-derived).
- `npm run test:surface-box-guard` / DS ratchet guards stay green; if a guard
  pins the `rounded-full` step mark, migrate it (don't raise a baseline).
- Screenshot the before/after for the user.

---

## Guardrails (both tracks)
- The user manages commits; commit/push only when asked; stage only your files
  (`git commit -- <paths>`; never `git add -A` / `git stash` — 100+ concurrent
  dirty files).
- Stay on the checkout's branch; table work lives on `topic/tables`.
- `npm run verify` before "done"; never raise a ratchet baseline; never bypass hooks.
