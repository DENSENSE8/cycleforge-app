# Handoff — Desk contract: dead-code removal session (ultracode)

**For:** a fresh Claude Code session
**Lane:** current checkout, no ad-hoc branch. Attach to `:3050`. User owns commits.
**Companions:** [`desk-contract-unification-CLAUDE-CODE-PROMPT.md`](desk-contract-unification-CLAUDE-CODE-PROMPT.md) (the port plan) · [`desk-contract-unification-ADDENDUM.md`](desk-contract-unification-ADDENDUM.md) (grounded recon — **§K is why this session exists and what it may not touch**)

---

## Paste this into a new Claude Code session

```
ultracode

Read docs/todo/desk-dead-code-HANDOFF.md end-to-end, then execute it in order.
Also read docs/todo/desk-contract-unification-ADDENDUM.md §I (per-surface recon),
§J (cross-cutting) and §K (why deletion is tiered) — do not re-derive them.

MISSION
Shrink the codebase ahead of the Desk contract port. Delete what is provably dead,
collapse duplicate forks onto one SoT, and retire one bookmark-only forked route.
Do NOT begin the Desk port — no new LedgerGrid, no new rail, no new saved-view surface.

THE ONE HARD RULE
Deadness must be PROVEN per file, never inherited from a list — including the lists in
this handoff. When the recon's "dead" claims were spot-checked, 2 of 4 were wrong
(MultiSkuBarcodeWizard is still rendered by a live ternary; useLabelRecents has live
consumers). Treat every candidate as guilty until a grep says otherwise.

PROOF PROTOCOL — a file is deletable only when ALL FOUR hold:
  1. grep -rn "<Name>" src   returns nothing outside the file itself and comments
  2. it is not referenced from tests/, scripts/, docs/security/route-permissions.json,
     knip.config.ts, or any *.guard.test.ts allowlist
  3. it is not reachable through a live branch (a ternary/default-param keeps a
     component statically alive even with one call site — trace the condition)
  4. deleting it does not remove the only implementation of a rendered feature
Record the four answers per file. A file failing #4 is PORT-GATED — leave it.

HARD LAWS
- AGENTS.md + .claude/rules/* . Never start/restart/kill the :3050 dev server.
- User owns commits; never git stash; stage only your own files.
- Ratchet baselines only SHRINK. Deleting hand-rolled shells LOWERS the counts in
  surface-box / spacing / typography / focus-ring / control-size guards — lower the
  baselines in the same commit or those guards fail for being too green.
- npm run verify green before claiming done. Never --no-verify.
- A concurrent session shares this checkout and reverted a completed Phase 0 today
  (ADDENDUM §H). git status before you start and before you commit.

Start at §3 Tier A. Use a Workflow fan-out for §4 (the proof sweep) — that is the
parallelizable part.
```

---

## 1. What this session is, in one sentence

**Delete the code that is dead _today_, on its own merits — not the code that will become
dead once the Desk port lands.**

That distinction is the whole design of this handoff. Of the ~40 deletion candidates the
recon produced, **24 carry a `delete` verdict totalling ~3,500 lines — but ~19 of those are
port-gated**: they die when their replacement renders, and deleting them first leaves a
blank page. See ADDENDUM §K.

## 2. Budget — be honest about the size

| Tier | What | Independent? | Rough lines |
|---|---|---|---|
| **A** | Provably dead now | ✅ | ~131 |
| **B** | Dead behind a reachability chain | ✅ once proven | ~200–300 |
| **C** | Duplicate forks → one SoT | ✅ | ~600–900 removed, ~150 added |
| **D** | Port-gated | ❌ **do not touch** | ~2,900 |

**Realistic haul: ~1,000–1,300 lines net.** Anyone promising 3,500 is counting Tier D, and
Tier D deletions break live pages.

---

## 3. Tier A — provably dead (start here, verified 2026-08-01)

Both re-verified during recon spot-checks. Still run the proof protocol; the tree moves.

| File | Lines | Evidence |
|---|---|---|
| `src/components/products/pairing/SkuPairingModal.tsx` | 83 | Zero code call sites. The only hit is a **comment** at `src/components/ui/dialog-shell.guard.test.ts:33`. Also a private `createPortal` + `fixed inset-0 z-modal` panel — the shape `source-of-truth.md` forbids |
| `src/app/api/sku-catalog/pairing-queue/count/route.ts` | 48 | Orphan endpoint — only self-references (its own docblock + an error log) |

**Fallout to handle in the same commit:**
- `dialog-shell.guard.test.ts:33` names `SkuPairingModal` in its docblock as one of "two
  shapes, one job" — update the comment, and re-check its baseline.
- Deleting an API route requires removing its entry from
  `docs/security/route-permissions.json` and re-running the route-auth drift + enforce gate.

---

## 4. Tier B — dead behind a reachability chain (fan this out)

These need an argument, not a grep, because a live ternary or a default parameter keeps a
component statically referenced while being unreachable at runtime. **This is the right
Workflow fan-out** — one agent per chain, each returning a proof or a refusal.

### B1 — the multi-SKU barcode chain (unwinds in order)

```
MultiSkuSnBarcode.tsx:24
  return b.isHorizontal ? <MultiSkuBarcodeWorkspace/> : <MultiSkuBarcodeWizard/>;
```

`MultiSkuBarcodeWizard` (97L) is *referenced*, so knip does not flag it. The claim is that
`isHorizontal` is always true. **Prove or refuse it**: find every writer of `isHorizontal`
in `useBarcodeMode` / `useBarcodeModeStep` and show no path sets it false. If proven:

1. delete `MultiSkuBarcodeWizard.tsx` (97L)
2. `useBarcodeModeStep`'s `isHorizontal` branch + `bottomAnchorRef` scroll effect collapse (~57L)
3. `MultiSkuSnBarcode.tsx` (25L) becomes a one-branch dispatcher — inline it into its caller
4. update the four docblocks that point at the wizard, or they become stale pointers

**If not proven, stop at step 0 and say so.** A wizard that renders on some viewport is a
feature, not dead code.

### B2 — `useLabelRecents` (77L)

The recon called it "write-only", which is **not** the same as dead — it has live consumers
at `useMultiSkuBarcode.ts:12,82`. The real question: does anything ever *read* what it
pushes? Trace the storage it writes and every reader. If nothing reads it, the deletion is
the hook **plus** its `pushRecent` call sites — and check
`useLabelPrintFeed.ts:28`, whose docblock claims the Printed rail superseded it.

### B3 — knip sweep (the candidates nobody listed)

Run knip and triage what it reports **inside these trees only**:
`src/components/labels`, `src/components/manuals`, `src/components/products/pairing`,
`src/components/barcode`, `src/components/warehouse`, `src/components/support`.

`knip.config.ts` has **no pairing entry today**, so pairing dead code may already be
reported and ignored. Anything knip flags still goes through the four-point protocol —
knip cannot see reachability through a ternary either.

---

## 5. Tier C — collapse duplicate forks onto one SoT

This is where the real line count is, and it is **behavior-preserving**, which makes it the
safest large change in the session. It also directly shrinks every later port: leave these
and each of the five surface ports copies a fourth or fifth version forward.

### C1 — badge/tone helpers (three verbatim copies)

`statusBadgeClass` / `typeBadgeClass` exist identically in:
- `src/components/manuals/library/manuals-tree.ts:29-45`
- `src/components/manuals/ManualLibrary.tsx:56-70`
- `src/components/manuals/library/manuals-library-shared.ts:31-45`

**Do:** promote **one** tone registry beside `src/lib/condition-tone.ts` (the house pattern
— see also `source-platform.ts`), point all consumers at it, delete the other two.

### C2 — `buildTree` (four copies)

`manuals-tree.ts`, `manuals-library-shared.ts`, `FolderPathPicker.tsx`, plus one more —
find them all. Consolidate onto one implementation. `FolderPathPicker` (402L) **stays** as a
component; only its private `buildTree` folds in.

### C3 — `STATUS_DOT` (two copies)

`SupportTicketRow.tsx:9` and `SupportTicketsRecentRail.tsx:22`. Promote into
`src/components/support/zendesk/badges.ts`, which already owns `statusBadge` /
`priorityBadge`.

### C4 — `/manuals/library` — the biggest honest win, but **ASK FIRST**

`src/components/manuals/ManualsLibrarySidebar.tsx` + `manuals-library-sidebar/*` (5 files,
**542 lines**) is a **verbatim second copy** of the manuals library: its own `buildTree`,
its own `getNodeAtPath`, its own badge helpers, `fuzzyMatch` instead of `smartMatch`, a
second `ManualRow` type, and a third icon set. Two shapes for one job.

The route is **not reachable from the spine** — `/manuals` redirects to `/products` and the
nav has no entry for it. It is a bookmark-only survivor.

**This is a route deletion, so it is ask-first.** Present it to the user with:
- the line count and the duplication evidence
- that it drags `src/app/manuals/library/page.tsx`, the `SidebarContextPanel` branch, and
  four lines of `sidebar-navigation.ts` (`:86,212,420,488`)
- the one real caveat: **`/manuals/library` mounts no `SurfaceParamHygiene`, which is why
  `?id=` still works there and appears broken on `/products`** (ADDENDUM §I.4). Deleting the
  fork before fixing the `?id=` declaration removes the only working manual-selection path.
  **Fix `?id=` first** (§6), then propose the deletion.

---

## 6. One-line defect fixes worth taking while you are here

Small, independent, and each de-risks a later port. **Each as its own commit.**

1. **Declare `?id=` on `/products`.** `SurfaceParamHygiene` rebuilds the query string from
   `declaredKeys(spec)` only, and `id` is in neither `PRODUCTS_ROUTE_PARAMS.owns` nor
   `WORKBENCH_CARRIES` — so manual selection writes `?id=123` and the hygiene effect strips
   it. Verify against `:3050` before and after. Note `route-params.test.ts` has three
   `PRODUCTS_ROUTE_PARAMS` assertions (lines 127, 135, 139/143) that re-parse the spec.

2. **`useBinsFilterParams` navigates to the wrong route.** `BinsFilterBar.tsx:123` does
   `router.replace('/inventory?…')`, so on `/warehouse?tab=bins` any status chip or room
   select throws the operator off the page. One-line fix; keep it out of the port.

3. **Make `useSavedViews` loud on an unresolved surface.** It currently `setViews([])` and
   makes save/remove no-ops with **no console error** — ADDENDUM §J.2 calls this the most
   likely way the left column ships broken unnoticed. One `console.error`.

**Explicitly NOT in this session** (raise them, do not fix them here):
- `/api/locations` GET+POST not behind `withAuth` — a tenant-isolation fix that needs its
  own change and its own verification.
- `sku_platform_ids` tenant-blind unique + the `contract`-sorts-before-`expand` migration
  ordering hazard — a data-integrity fix with expand/contract ordering to verify.
- `/api/product-manuals/search` being ungated — a permission change on a route the Testing
  bench reads; can 403 a floor operator.

---

## 7. Tier D — DO NOT TOUCH

Every file below carries a `delete` verdict **in the port plan** and is live today. Deleting
any of them now breaks a rendered surface.

| File | Why it must wait |
|---|---|
| `SupportTicketsBoard.tsx` · `SupportTicketRow.tsx` · `SupportTicketsRecentRail.tsx` | the `/support` middle + left, with nothing to replace them |
| `SupportTicketFocus.tsx` + `support-station-tabs.tsx` + `resolve-support-terminal.tsx` | the `?ticket=` open path; also drags two guards that `readFileSync` the file and would throw **ENOENT** |
| `BinsTable.tsx` · `LabelPrintWorkspace.tsx` · the six `bin-label-printer/*` builders | the `/warehouse` labels + bins tabs |
| `ProductCatalogList.tsx` | the labels picker; also the only dispatcher of the `sku:fill` window bridge |
| `LibraryBrowser.tsx` + the three navigation/tree/drag hooks + the five `library/*` view files | the manuals middle **and** the only drag-to-folder move gesture |
| `PairingQueueList.tsx` · `ProductsPairingShell.tsx` | the pairing left + shell |

And these are **`reduce-to-atoms`, never `delete`** — each has a live consumer *outside* the
surface being migrated: `ProductHubPanel` (Testing bench) · `BinDetailFlyout` (3 mounts) ·
`DocumentSlideOver` (3 consumers, 2 in Station Workbenches) · `SupportTicketComposerDock`
(TestingPanel) · `ManualLibrary` (`/manuals/library`) · `LabelRoomSidebar` +
`useLabelPrinterStore` (rack printer) · `AddOrPairSkuModal` (the only path that creates a
`sku_catalog` row).

---

## 8. Suggested ultracode shape

One workflow, one phase, then serial application. The parallelizable work is **proving
deadness**, not editing.

```
phase('Prove')
  parallel:
    · B1 multi-SKU chain  — trace isHorizontal, return PROVEN | REFUSED + evidence
    · B2 useLabelRecents  — find every reader of what it writes
    · B3 knip triage      — run knip, four-point protocol on each hit in the 6 trees
    · C1+C3 fork sweep    — locate every copy of the badge helpers + STATUS_DOT, propose the registry
    · C2 buildTree sweep  — locate all four, propose one implementation
    · C4 route audit      — prove /manuals/library is unreachable; enumerate everything it drags

then, SERIALLY (edits do not parallelise safely in one checkout):
  Tier A deletes → Tier B proven deletes → Tier C consolidations → §6 one-line fixes
  → lower ratchet baselines → npm run verify
```

Give each proof agent the four-point protocol verbatim and require it to return a
**refusal** when a file fails it. A proof agent that returns "yes, delete it" for everything
has not done the job.

---

## 9. Fallout checklist — run before claiming done

- [ ] `npm run verify` green. Never raise a baseline; **lower** the ones your deletions
      shrink (`surface-box`, `spacing`, `typography`, `focus-ring`, `control-size`).
- [ ] knip clean for the trees you touched — and add a `knip.config.ts` pairing entry if one
      is genuinely needed.
- [ ] `docs/security/route-permissions.json` regenerated if any route was deleted; route-auth
      drift + enforce green.
- [ ] Guard docblocks that **name** a deleted file are updated (`dialog-shell.guard.test.ts:33`
      names both `SkuPairingModal` and `BinDetailFlyout`).
- [ ] No guard `readFileSync`s a file you deleted — that is **ENOENT**, not an assertion
      failure, and it is how this trips.
- [ ] `git status` — you staged only your own files. A concurrent session shares this tree.
- [ ] Work-log entry: `pnpm worklog "<action>" --result <r>`, naming what was deleted and
      what was refused.

## 10. Stop rules

- **A file that fails the four-point protocol is not deleted** — report it as port-gated and
  move on. Partial credit is the correct outcome here.
- **If a Tier B chain cannot be proven, leave the whole chain.** Do not delete the leaf and
  leave a dangling branch.
- **If a consolidation would change rendered output**, it is not a consolidation — stop and
  report the behavioural difference.
- **Do not start the Desk port.** No `*GridView`, no descriptor, no `SAVED_VIEW_SURFACES`
  value, no rail. If deletion reveals that a surface needs its replacement to exist first,
  that is the correct finding — write it down and stop.

## 11. Definition of done

- [ ] Tier A deleted with the four-point proof recorded per file
- [ ] Every Tier B chain returns a written **PROVEN** or **REFUSED** with evidence
- [ ] Tier C forks collapsed onto one SoT each; copies deleted; no rendered change
- [ ] `/manuals/library` retirement **proposed to the user** (not executed unilaterally),
      with the `?id=` caveat stated
- [ ] The three one-line fixes in §6 landed as separate commits
- [ ] Ratchet baselines lowered to match
- [ ] `npm run verify` green
- [ ] A short report: lines removed, files deleted, candidates **refused and why** — the
      refusals are the most useful output of this session for whoever runs the port
