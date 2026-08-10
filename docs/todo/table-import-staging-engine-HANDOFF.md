# Handoff — CSV import staging becomes a TABLE-ENGINE capability

**Status:** not started (the To-Ship instance is shipped + confirmed — see below)
**Date:** 2026-08-09
**Predecessor:** [`to-ship-csv-import-staging-HANDOFF.md`](to-ship-csv-import-staging-HANDOFF.md)

## One-sentence goal

Import stops being a To-Ship feature and becomes a **capability of the table
definition registry**: any Workbench spreadsheet can take a file, stage it in its
own grid with a triage state, correct it **inline like Sheets**, and commit —
with the chrome lean and every nuance on the right rail.

---

## Where this starts (confirmed 2026-08-09)

The To-Ship instance works end to end and is E2E-proven on the QA org.

| Piece | Path |
|---|---|
| Parse / auto-map / Ready-vs-Action SoT | `src/lib/orders/csv-order-import.ts` |
| Session draft store | `src/lib/orders/csv-import-staging-store.ts` |
| Staging surface | `src/components/outbound/orders/CsvImportStagingHost.tsx` |
| Staging grid (definition · columns · header · row) | `src/components/outbound/orders/import-staging/` |
| Row editor rail | `src/components/outbound/orders/CsvImportStagingRail.tsx` |
| `?import=csv` paint-pending | `src/hooks/useCsvImportStagingParam.ts` |
| Ingest | `POST /api/orders/import-csv` → `ingestCanonicalOrders` |
| Guards | `csv-import-staging.guard.test.ts` · `tests/e2e/csv-import-staging.spec.ts` |

Two things were fixed getting there, and both are load-bearing context:

- The staging grid **was a hand-rolled `<table>`**; it is now `NonlinearTableHost`
  over the `orders-import.staging` definition. That is what makes generalizing
  possible at all — there is already one registered definition to generalize FROM.
- The surface **could not open in a browser**: the store publishes a draft
  synchronously, so the desk's teardown effect destroyed it one frame before
  `?import=csv` landed. Every unit test and guard was green through that bug. **Any
  new mount-gated open in this work needs an E2E, not a guard.**

---

## The four asks

### A1 — The top is too busy; the rail is where nuance goes

Today's staging toolbar carries file name · All/Ready/Action-required chips · ▦ ·
Discard N · Confirm N · Clear selection · Map columns · Cancel import. That is a
toolbar, not ops chrome.

**Target — the house find-only shape** (`workbench-ops-queue.md` → Band 3, and the
2026-08-08 refine ruling):

```text
Band 1   shot.csv · 128 rows ……………………………………………  [ Confirm 96 ready ]
Band 3   🔍 find …………………………………… ▽ refine        [ ▦ ] [ ▥ inspector ]
         ── hairline ──
         data table
```

- **One** primary CTA (`Confirm N ready`) and one quiet exit. Discard / Clear
  selection are selection verbs — they belong to the selection plane, not Band 1.
- **Ready / Action-required moves INTO the find field** as
  `WorkbenchFilterPopover density="field"` in `trailingSuffix`
  (`src/components/dashboard/workbench-filter-popover.tsx`) — a facet that narrows
  ROWS rides in the field.
- **▦ is portal-or-nothing** (the card-corner float was deleted 2026-08-08): pass
  the Band-3 controls slot as `columnTriggerPortalTarget`, or paint no ▦.
- Everything else moves right (A2).

### A2 — The right rail carries the detail

Compose **`DeskInspectorIndexShell`** (`src/components/right-rail/`) → the shared
`DisplaysIndexLeafStage` waist. Never a page-local twin, never `PaneHeaderTabs` as
primary topic nav (`display/right-rail-inspector.md`).

Proposed leaves — the topic map is the deliverable, not these exact words:

| Leaf | Holds |
|---|---|
| **Row** | the current row's canonical fields (today's `CsvImportStagingRail`) |
| **Map columns** | the mapping panel, moved off the middle entirely |
| **Batch** | file name · row counts · Ready/Action split · duplicate + skip preview |
| **View** | ▦ column display, and any layout chrome |

Macro commit / destructive verbs dock on **`InspectorActionFloor`**
(`src/components/right-rail/`) — flush trailing Delete, never a labelled danger pill.

**The mapping panel stops owning the middle.** Today an unmapped `order_number`
replaces the whole surface. Once mapping is a rail leaf, the grid can paint
immediately with every row Action-required and the reason visible in the `status`
column — which is strictly more honest than a full-screen form. Keep the
**gate** (no commit without `order_number`); drop the takeover.

### A3 — Inline editing, Sheets-style

Flip the staging definition to `inCellEdit: true` and wire **`LedgerCellEditor`**
(`src/design-system/components/grid/LedgerCellEditor.tsx`) per editable track.
**Golden consumer already exists: Unfound** (`UnfoundGridRow.tsx`) — copy its
cell-trigger recipe (click / Enter / F2 opens, a printable char replaces, Escape
blurs, `stopPropagation` so the row's own click does not also fire).

Two facts that decide the design, both verified:

- **`order` is NOT an identity column.** The house floor is `select` + `title`
  only (`GRID_IDENTITY_COLUMN_KEYS`), and its own docblock says the check is "the
  floor, not the ceiling". A frozen `order` track may therefore mount an editor —
  no SoT change needed, and it matters because the missing order number is the
  single most common Action-required cause.
- **An edit must re-classify in place.** `updateCsvImportStagingRow` already
  writes back through the mapping; the row's triage state is derived on read, so a
  committed cell flips Ready/Action-required with no extra plumbing.

Once cells edit inline, the rail's **Row** leaf is the *nuanced* plane (all six
fields at once, with labels and the missing-field reason), not the only way to fix
a row.

### A4 — Import becomes first-class + SoT

Today the entry point is a `Button` inside the Sync popover's Sync tab, under a
"CSV file" subheading, hardcoded to `SHIPPING_ORDERS_PATH`. That cannot serve a
second family.

**Target:** one named module — suggested `src/lib/tables/import/` — owning:

1. **The import descriptor per family**, resolved from the table definition:
   canonical fields + aliases, the staging binding, the classify rule, and the
   commit endpoint. `csv-order-import.ts`'s six fields become the **orders**
   descriptor, not the universal vocabulary.
2. **One shared control** (`TableImportButton` / `useTableImport(binding)`) that a
   workbench chrome mounts — the same way `OutboundOrderChromeActions` mounts
   Import today, but sourced from the binding rather than the page.
3. **One staging store**, keyed by table id (today's module-singleton becomes a
   per-surface draft), with the `?import=` paint-pending param generalized off
   `useCsvImportStagingParam`.
4. **A live-surface allowlist**, mirroring `CUSTOM_FIELD_LIVE_ENTITY_TYPES` —
   storage vocabulary stays wider than what is mounted.

Pairs with the CSV **export** that just landed on the same two families
(`src/lib/receiving/history-export-csv.ts`, `src/lib/dashboard/order-export-csv.ts`) —
import is its counterpart and should land where export already is.

---

## Sequencing — read this before writing code

The ask is "propagate to the entire data table display engine as a whole". The
house law is **golden-first** (`pattern-evolution.md` → Never; `source-of-truth.md`
→ Table engine fan-out): a new spreadsheet capability lands on **Unbox History**
and is operator-verified before any other `entityFamily`, and porting N queues in
one pass is the named regression class (Orders + Receiving custom fields, 2026-08-09,
reverted).

**These are not in conflict, and the split is the ruling:**

- **Building the engine seam once is not a fan-out.** The registry, the shared
  control, the generic store, the param — build them once, properly.
- **MOUNTING it per family is the fan-out.** That goes one family at a time,
  History first, each with its host + commit endpoint wired in the same change.

So: seam → History (dogfood) → operator-verify → then the next family. A PR that
turns import on for five queues is the thing to refuse.

---

## Phases

| # | Phase | Ships |
|---|---|---|
| **A** | Lean the staging chrome; move mapping · batch · view to `DeskInspectorIndexShell` | To-Ship only, no engine change |
| **B** | `inCellEdit: true` + `LedgerCellEditor` on the staging grid | To-Ship only |
| **C** | Extract the import seam (descriptor · control · store · param) — Orders becomes its first consumer, behaviour unchanged | engine |
| **D** | Mount on **Unbox History** (`ReceivingGridHost`), commit endpoint + allowlist entry in the same change | golden |
| **E** | Operator-verify D, then one family at a time | fan-out |

A and B are worth doing first because they are the user-visible asks and they
harden the surface the seam will be extracted from.

---

## Guards to grow

- `csv-import-staging.guard.test.ts` — extend, don't fork: Band-1 holds one primary
  CTA; refine is in-field; mapping is a rail leaf; ▦ portal-only.
- `grid-surface-capabilities.guard.test.ts` — every new staging mount names a bag.
- `table-definition-registry.guard.test.ts` — every new staging definition parses.
- A fan-out guard modelled on `custom-fields-history-first.guard.test.ts` — a
  shrink-only live-surface allowlist, so turning a family on is a deliberate line.
- **E2E per mount.** The paint bug proves guards cannot see this class of failure.
  `tests/e2e/csv-import-staging.spec.ts` is the template.

## Non-goals

- Durable `pending_imports` quarantine (still session-only).
- A universal canonical-field vocabulary across families — each family declares
  its own; only the *mechanism* is shared.
- Touching Pattern E or the live-queue selection plane.

---

## Claude Code — prompt (paste as-is)

```text
Make CSV import a table-ENGINE capability (Cycle Forge).

Repo: cycleforge-app. Do NOT start/restart the dev server (user's is on :3050 —
attach only). Stay on the current branch. Do NOT commit unless asked. Read
AGENTS.md, .claude/rules/display/workbench-ops-queue.md,
.claude/rules/display/right-rail-inspector.md, and
docs/todo/table-import-staging-engine-HANDOFF.md first.

## Context
To-Ship CSV import staging works end to end (see the predecessor handoff). It
mounts NonlinearTableHost over the `orders-import.staging` table definition, with
the triage state in its own `status` column. Four changes are wanted.

## A1 — Lean the chrome
The staging toolbar is too busy (file name · filter chips · ▦ · Discard N ·
Confirm N · Clear selection · Map columns · Cancel import). Reduce Band 1 to
identity + ONE primary CTA (`Confirm N ready`) + a quiet exit. Move Ready /
Action-required INTO the find field as `WorkbenchFilterPopover density="field"`
(trailingSuffix). ▦ stays portal-only into the Band-3 controls slot. Selection
verbs (Discard / Clear) belong to the selection plane, not Band 1.

## A2 — Right rail carries the nuance
Compose DeskInspectorIndexShell (index→leaf, shared DisplaysIndexLeafStage waist)
with leaves: Row (today's CsvImportStagingRail) · Map columns · Batch · View.
Macro/destructive verbs dock on InspectorActionFloor. The mapping panel STOPS
taking over the middle: the grid paints immediately with rows Action-required and
the reason in the status column. Keep the commit gate (no order_number ⇒ no
Confirm); drop the full-screen takeover. No page-local inspector twin, no
PaneHeaderTabs as primary topic nav.

## A3 — Inline editing, Sheets-style
Flip the staging definition to `inCellEdit: true` and wire LedgerCellEditor per
editable track. Copy the Unfound recipe (UnfoundGridRow.tsx): click / Enter / F2
opens, a printable char replaces, Escape blurs, stopPropagation so the row click
does not also fire. `order` is NOT an identity column (the floor is select+title),
so the frozen order track MAY mount an editor — do it, that is the most common
Action-required cause. A committed cell must re-classify the row in place.

## A4 — Import becomes first-class + SoT
Extract the entry point out of OrdersSyncPopover into one named module (suggest
src/lib/tables/import/): per-family import descriptor resolved from the table
definition (canonical fields + aliases + staging binding + commit endpoint), ONE
shared control a workbench chrome mounts, ONE staging store keyed by table id, and
the `?import=` paint-pending param generalized off useCsvImportStagingParam. Add a
live-surface allowlist mirroring CUSTOM_FIELD_LIVE_ENTITY_TYPES. Orders is the
first consumer of the seam with behaviour unchanged.

## Sequencing — do not skip
Building the seam once is NOT a fan-out; MOUNTING it per family is. Golden-first
applies (pattern-evolution.md; source-of-truth.md → Table engine fan-out): after
the seam, land on **Unbox History** (ReceivingGridHost) with its commit endpoint +
allowlist entry in the SAME change, operator-verify, and only then the next
family. Do not turn import on for several queues in one pass — that is the named
regression class. Ask before going past History.

## Verify
- Every new grid mount names a capabilities bag; every new definition parses.
- Grow csv-import-staging.guard.test.ts (extend, do not fork) and add a
  fan-out guard modelled on custom-fields-history-first.guard.test.ts.
- E2E IS REQUIRED per mount — the predecessor's paint bug (a mount-gated URL open
  destroyed by a teardown effect one frame early) was invisible to every guard and
  unit test. Template: tests/e2e/csv-import-staging.spec.ts, --project=qa-desktop.
- `npm run verify` green before done; never raise a DS/knip baseline.

## Report back
1. What moved to the rail and what is left in Band 1, with file:line.
2. Which tracks edit inline, and how a commit re-triages the row.
3. The seam's public shape (descriptor / control / store / param) and Orders'
   diff against it.
4. Where the fan-out stopped and what the allowlist says.
```
