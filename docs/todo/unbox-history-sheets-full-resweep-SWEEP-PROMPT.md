# Unbox History full workbench re-sweep — Claude Code prompt

**For:** the agent session that executes this initiative. Read this whole file
before touching code.
**Status:** handoff / execution prompt — write product code only in the session
that runs the waves below.
**Date:** 2026-08-05.
**Golden SoT:** Unbox History five-row Sheets stack (tabs · middle KPI · **Band 3
triage / third-header icons** · column header · data table). Closest already-ported
sibling: To-ship (`DashboardOrdersView`).
**Supersedes:** [`sheets-flush-workbench-cohort-SWEEP-PROMPT.md`](./sheets-flush-workbench-cohort-SWEEP-PROMPT.md)
(Waves 0–7 chrome flush — **done**; do **not** re-open those waves as written).
Cohort results live in [`sheets-flush-workbench-cohort-PLAN.md`](./sheets-flush-workbench-cohort-PLAN.md).

---

## Paste this into a new session

> Read `docs/todo/unbox-history-sheets-full-resweep-SWEEP-PROMPT.md` (this file)
> end to end before editing.
>
> **Job:** full **re-sweep** of every Workbench / ops data-table page against
> Unbox History’s **five-row Sheets SoT**, including **Band 3 (third header —
> triage icons)** above the column header. Re-audit surfaces already chrome-
> flushed in the 2026-08-04 cohort; fix residual debt (History Band-1 search,
> framed-default `LedgerGridSurface`, Ready body KPI, triage twins, Band-1
> search leftovers); **delete** dead twins; harden sheet guards to pin
> `surface="sheet"` + Band 3. Each wave: anatomy checklist · deletion `rg` ·
> guard · `npm run verify`. Attach to the user’s `:3050` — never start,
> restart, or kill the dev server.
>
> **Non-goals:** Station / Monitor / admin CLIP `DataTable` / mobile tables;
> second table engine; Orders `OrdersQueueColumnHeader` `min-h-11` fork;
> Photos entry-path search exception; LedgerGrid resize / Fields / drill
> upgrades (`ledgergrid-sheets-parity-UPGRADE-PROMPT.md`); station record
> overlays (`TestingPanel` / `PackOrderPanel` / `LineEditPanel`);
> `HistoryCartonTriagePanel` / `TriagePanel` right-rail editors (not Band 3);
> inventing KPIs or return-to-scan CTAs where honest absence is correct;
> raising DS ratchet baselines; re-executing cohort Waves 0–7 as written.

---

## 1. Mandatory vertical stack (non-negotiable)

Every Workbench ops page in this re-sweep **must** read as this exact five-row
plane. Reject any port that collapses bands, parks KPI in the body, drops Band 3,
or drops the column header row.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Band 1 — TOP ROW                                                        │
│   Lifecycle tabs (left) · solid CTAs only (right)                       │
│   WorkbenchChromeHeader density="band"                                  │
│   rounded-none border-l-0 border-t-0 · h-10                             │
│   NO search · NO display sort · NO filters on this row                  │
├─────────────────────────────────────────────────────────────────────────┤
│ Band 2 — MIDDLE KPI DISPLAY                                             │
│   WorkbenchKpiBand → *KpiStrip (attention metrics)                      │
│   Pinned in chrome — NEVER body mb-4 island                             │
│   Honest absence OK when the surface truly has no metrics               │
│   border-b border-r border-border-soft bg-surface-card px-3 py-2        │
├─────────────────────────────────────────────────────────────────────────┤
│ Band 3 — THIRD HEADER (triage / icon refine)                            │
│   Search left · refine / staff / filters / icon-sort / portal right     │
│   WorkbenchTriageBand · h-10 · border-r only (no border-t / border-b)   │
│   Optional kpiToggle = WorkbenchKpiCollapseToggle (view-toggle zone)    │
├───────────────────────────────── single hairline ───────────────────────┤
│ Column header row                                                       │
│   LedgerGridColumnHeader (or family adapter) · h-10                     │
│   Matches Band 1 / Band 3 height — select gutter · sort · frozen tip    │
│   Orders allowlist only: OrdersQueueColumnHeader min-h-11               │
├─────────────────────────────────────────────────────────────────────────┤
│ Data table                                                              │
│   LedgerGridSurface surface="sheet" inside WORKBENCH_SHEET_HOST         │
│   Body rows · day bands · empty state — flush, no WorkbenchTablePane    │
│   Flat leaves only — no in-grid PO / group summary rows                 │
└─────────────────────────────────────────────────────────────────────────┘
```

### Hosts

- Bands 1–3 → one non-scrolling `WORKBENCH_SHEET_CHROME` (`flex flex-col gap-0`).
- Column header + data table → `WORKBENCH_SHEET_HOST` immediately below.
- Sheet owns `border-t` against Band 3. KPI owns `border-b`. Triage is
  `border-r` only. **One hairline per joint** — never double borders.

### Band 3 = third header icons (explicit)

| Band 3 **is** | Band 3 **is not** |
|---|---|
| Find / refine chrome above the grid | `HistoryCartonTriagePanel` (History left-click push rail) |
| `WorkbenchTriageBand` (or Unbox-local twin until Wave R4) | `TriagePanel` (Arrival station editor) |
| `TechRailSearchBar variant="chrome"` left; staff / filters / icon-sort / `GridColumnDetailsTrigger` portal right | A second sticky Fields band / in-card `TableActionBar` |
| Optional `kpiToggle={WorkbenchKpiCollapseToggle}` (right view-toggle zone; search flush left) | Band 1 search or Band 1 display sort |

### Failures to reject (any wave)

- KPI still under tabs as a scrolling `mb-4` card (or a **second** KPI under an
  already-present Band 2).
- Search / sort / filters still on Band 1.
- Missing Band 3.
- Column header not `h-10` / not flush under triage (Orders fork excepted).
- `LedgerGridSurface` without `surface="sheet"` (default is framed CLIP).
- Framed CLIP card (`WorkbenchTablePane` / `WORKBENCH_*_COLUMN` /
  `WORKBENCH_TABLE_VIEWPORT` island) around the grid.
- In-grid PO / group title summary rows (`*GroupSummary` / `ReceivingPoSummary`).
- New hand-rolled Band 3 twin instead of composing `WorkbenchTriageBand`.

**CLIP stays** for admin `DataTable` and true framed islands. Target =
Workbench lifecycle / ops queue pages only.

---

## 2. Cite — do not reinvent

| Piece | Path |
|---|---|
| Recipe law | `.claude/rules/source-of-truth.md` → **Sheets flush mount recipe (Unbox golden)** |
| Chrome law | `.claude/rules/display/workbench-ops-queue.md` → Unbox / To-ship three-band flush |
| Hosts | `src/components/dashboard/workbench-shell.tsx` → `WORKBENCH_SHEET_CHROME` · `WORKBENCH_SHEET_HOST` · `WorkbenchTriageBand` |
| KPI collapse | `src/components/dashboard/workbench-kpi-collapse.tsx` → `WorkbenchKpiBand` · `WorkbenchKpiCollapseToggle` |
| Surface | `src/design-system/tokens/table-surface.ts` → `TABLE_SURFACE_SHEET_CLASS` via `LedgerGridSurface surface="sheet"` |
| Golden mounts | `UnboxWorkspaceView.tsx` · `UnboxWorkspaceHeader.tsx` · `ReceivingLinesTable.tsx` (History) · `ReceivingGridView.tsx` |
| Closest sibling | `DashboardOrdersView.tsx` + `OutboundWorkspaceHeader.tsx` (`OutboundTriageBand`) |
| Guard templates | `receiving-grid-sheet.guard.test.ts` · `dashboard-orders-sheet.guard.test.ts` |

Also cite (docs only — do not re-run as open cohort waves):

- `docs/todo/sheets-flush-workbench-cohort-PLAN.md` (Waves 2–7 ✅ done inventory).
- `docs/todo/ledgergrid-sheets-flush-display-FINISH-HANDOFF.md` (SoT / header height).
- `docs/todo/ledgergrid-sheets-parity-UPGRADE-PROMPT.md` (resize / Fields — **out of scope**).

---

## 3. Inventory (verified 2026-08-05)

### Chrome-ported — re-audit only (do not blind re-port)

| Surface | Guard |
|---|---|
| Unbox (golden) | `receiving-grid-sheet.guard.test.ts` |
| Incoming Pipeline | `incoming-grid-sheet.guard.test.ts` |
| To-ship | `dashboard-orders-sheet.guard.test.ts` |
| Testing / Pack / Shipping | `*-workspace-sheet.guard.test.ts` |
| Triage / Labels / Scan-out | colocated `*-sheet.guard.test.ts` |
| Review family | `review-workspace-sheet.guard.test.ts` |
| Support | `support-workspace-sheet.guard.test.ts` |
| Wave 7 long-tail chrome | `workbench-cohort-wave7-sheet.guard.test.ts` (**chrome only** — does not pin `surface="sheet"`) |
| My Day / Locations | `my-day-sheet.guard.test.ts` · `locations-sheet.guard.test.ts` |

### Residual debt (this re-sweep)

| Priority | Issue | Paths |
|---|---|---|
| P0 | Standalone History: Band 1 search + `WORKBENCH_CHROME_COLUMN` gutters | `HistoryWorkspaceHeader.tsx` · History branch in `ReceivingLinesTable.tsx` |
| P0 | Triage twins that do **not** compose `WorkbenchTriageBand` | `LocationsTriageBand.tsx` · local `UnboxTriageBand` in `UnboxWorkspaceHeader.tsx` |
| P0 | Ready KPI in body `mb-4` (double KPI under FBA Band 2) | `ReadyWorkspaceBody.tsx` · `FbaOutboundWorkspace.tsx` |
| P1 | `LedgerGridSurface` default framed (no `surface=`) | Pickup · Repair · Catalog · Review catalog-link · Warranty · Unfound · Tracking exceptions · Ready `*GridView.tsx` |
| P1 | Host padding residue on flush hosts | `ProductsCatalogWorkspace` (`gap-2 px-2 pt-2`) · Photos / Labels-products `px-3` · `LabelsQueueTable` `WORKBENCH_TABLE_VIEWPORT` |
| P1 | Band 1 search leftovers | My Day · Labels products; Photos = documented entry-path exception |
| P2 | No sheet guard | Warranty · Unfound · Tracking exceptions · Ready |
| P3 | Deleted group summaries — ban reintro only | `ReceivingGridGroupSummary` · `IncomingGridGroupSummary` · `OrderGroupSummary` · `ReceivingPoSummary` (files deleted; guards already ban) |

---

## 4. Per-surface checklist (copy into every wave)

1. **Band 1** — tabs (+ solid CTAs only). `WorkbenchChromeHeader density="band"` with
   `className="rounded-none border-l-0 border-t-0 shadow-sm"`. No search, sort, or
   filters on this row.
2. **Band 2** — middle KPI via `WorkbenchKpiBand`. Fold body `*KpiStrip` / `mb-4`.
   Honest absence only when the surface truly has no metrics.
3. **Band 3** — triage via `WorkbenchTriageBand` (Unbox-local twin only until Wave R4).
   Search left; staff / filters / icon-sort / controls portal right; optional
   `kpiToggle={WorkbenchKpiCollapseToggle}` (right of refine; left of inspector).
4. **Column header row** — family `LedgerGridColumnHeader` at `h-10`, flush under
   Band 3. Do not invent a second sticky header. Orders fork allowlisted.
5. **Data table** — `LedgerGridSurface surface="sheet"` inside
   `WORKBENCH_SHEET_HOST`. Strip `WorkbenchTablePane`, `WORKBENCH_CHROME_COLUMN`,
   `WORKBENCH_BODY_COLUMN`, framed `WORKBENCH_TABLE_VIEWPORT`.
6. **`surface="sheet"`** — every `LedgerGridSurface` under the host must set it
   explicitly (never rely on framed default).
7. **Flat leaves** — no in-grid PO / group summary. Drill owns parent rollups.
8. **Guard** — extend or add `*-sheet.guard.test.ts` (see §6).
9. **Deletion pass** — `rg` for the twin you replaced; delete the file if zero
   consumers; knip clean.
10. **Docs** — one-liner under Unbox / To-ship flush notes in
    `.claude/rules/display/workbench-ops-queue.md` when a residual lands.
11. **Verify** — `npm run verify` (full gate) before calling the wave done.
12. **Dev server** — attach `:3050`; never start / restart / kill.

---

## 5. Waves

Execute **one wave at a time**. Do not skip R0.

### Wave R0 — Audit (no product edits except stale doc status)

**Commands**

```bash
# All sheet guards
node --test --import tsx \
  src/components/**/**/*sheet*.guard.test.ts \
  src/features/**/**/*sheet*.guard.test.ts \
  src/components/workbench-cohort-wave7-sheet.guard.test.ts

# CLIP / gutter markers in live TSX (ignore *.guard.test.ts + comments)
rg 'WorkbenchTablePane|WORKBENCH_CHROME_COLUMN|WORKBENCH_BODY_COLUMN|WORKBENCH_TABLE_VIEWPORT|WORKBENCH_GUTTERS' \
  src/components src/features --glob '*.tsx'

# Band-1 search smell (manual: confirm search is on Band 1 vs Band 3)
rg 'TechRailSearchBar' src/components src/features --glob '*Header*.tsx' --glob '*Workspace*.tsx'

# Missing surface="sheet" on LedgerGrid mounts
rg 'LedgerGridSurface' src --glob '*.tsx' -A 5 | rg -n 'LedgerGridSurface|surface='
```

**Accept:** written residual list matches §3 (or update §3 in this file if the
tree drifted). Confirm cohort Waves 0–7 are **not** re-opened. If
`sheets-flush-workbench-cohort-SWEEP-PROMPT.md` still reads as open work, its
status line must already say **superseded** (this file owns new sessions).

---

### Wave R1 — History standalone → five-row flush

**Files**

- `src/components/sidebar/receiving/HistoryWorkspaceHeader.tsx`
- `src/components/station/ReceivingLinesTable.tsx` (non-embedded History branch
  ~`WORKBENCH_CHROME_COLUMN`)

**Do**

1. Move search / field / sort / week refine off Band 1 onto Band 3
   (`WorkbenchTriageBand` — mirror Unbox History embedded chrome).
2. Swap `WORKBENCH_CHROME_COLUMN` → `WORKBENCH_SHEET_CHROME` + body
   `WORKBENCH_SHEET_HOST`.
3. Prefer aligning standalone `/receiving/history` with Unbox-embedded History
   anatomy; do not invent a third History chrome.

**Guard:** extend `receiving-grid-sheet.guard.test.ts` (or colocated History
guard) to ban Band-1 `TechRailSearchBar` on `HistoryWorkspaceHeader` and ban
`WORKBENCH_CHROME_COLUMN` in the History host branch.

**Accept:** standalone History matches Unbox five-row stack @1440; no
`WORKBENCH_CHROME_COLUMN` call sites outside SoT export comments; verify green.

---

### Wave R2 — Pin `surface="sheet"` on residual GridViews

**Files (confirm with R0 `rg` — expect these eight)**

| Grid | Path |
|---|---|
| Pickup | `src/components/receiving/pickup/grid/PickupGridView.tsx` |
| Repair | `src/components/repair/repair-grid/RepairGridView.tsx` |
| Catalog | `src/components/products/catalog/catalog-grid/CatalogGridView.tsx` |
| Review catalog-link | `src/features/review/catalog-link/grid/ReviewCatalogLinkGridView.tsx` |
| Warranty | `src/components/warranty/grid/WarrantyGridView.tsx` (path confirm) |
| Unfound | `src/components/receiving/unfound/grid/UnfoundGridView.tsx` |
| Tracking exceptions | `src/components/tracking-exceptions/grid/TrackingExceptionsGridView.tsx` (path confirm) |
| Ready | `src/components/outbound/ready/grid/ReadyGridView.tsx` |

**Also strip host padding residue** where flush hosts still carry `p-4` /
`px-2 pt-2` / `WORKBENCH_TABLE_VIEWPORT` around these grids
(`ProductsCatalogWorkspace`, Warranty host, Tracking exceptions `FilterBar` +
`p-4`, `LabelsQueueTable` viewport if it wraps a sheet).

**Do:** add `surface="sheet"` to every `LedgerGridSurface`; extend
`workbench-cohort-wave7-sheet.guard.test.ts` and/or per-surface guards to
assert the string `surface="sheet"` (or `surface={'sheet'}`) in each GridView.

**Accept:** zero residual GridViews under Workbench hosts relying on framed
default; verify green.

---

### Wave R3 — Ready body KPI fold

**Files**

- `src/components/outbound/ready/ReadyWorkspaceBody.tsx`
- `src/components/fba/FbaOutboundWorkspace.tsx` (Band 2 already mounts
  `FbaKpiStrip` — do not double KPI)

**Do:** remove body `mb-4` KPI island. Ready metrics either fold into FBA Band 2
or honest absence on the Ready lane — never a second strip in the sheet body.

**Guard:** assert Ready body has no `\bmb-4\b` around KPI / no body
`*KpiStrip` mount.

**Accept:** one KPI band max under FBA Ready; verify green.

---

### Wave R4 — Triage twin collapse (master cleaner)

**Files**

- `src/components/warehouse/LocationsTriageBand.tsx` → **delete** after migrate
- `src/components/warehouse/LocationsWorkspace.tsx` (compose `WorkbenchTriageBand`)
- `src/components/receiving/unbox/UnboxWorkspaceHeader.tsx` (`UnboxTriageBand`)
- `src/components/dashboard/workbench-shell.tsx` (`WorkbenchTriageBand` — grow
  slots only if Unbox still needs compare/drill/portal beyond current SoT)

**Do**

1. Locations: replace `LocationsTriageBand` with `WorkbenchTriageBand`; delete
   `LocationsTriageBand.tsx`; update `locations-sheet.guard.test.ts`.
2. Unbox: prefer composing `WorkbenchTriageBand` with SoT slots (`leading`,
   children/portal). Keep Unbox capability (compare chrome · history drill ·
   controls portal) — kill **duplicate shell markup** only. If SoT cannot yet
   host a required Unbox slot without a third twin, document the single
   intentional Unbox twin in `workbench-ops-queue.md` and stop; **never** fork a
   third Band 3.

**Accept:** `rg LocationsTriageBand` = 0; Unbox either on SoT or one documented
twin; verify + knip green.

---

### Wave R5 — Band-1 search leftovers

**Files**

- `src/features/my-day/MyDayWorkspace.tsx`
- `src/components/labels/LabelsProductsWorkspaceHeader.tsx` (+ duplicate search
  wiring in `LabelsProductsWorkspace.tsx` if still present)

**Allowlist (do not “fix”):** `PhotoLibraryWorkspaceHeader.tsx` — documented
entry-path exception in SoT / `workbench-ops-queue.md`.

**Do:** move find onto Band 3 `WorkbenchTriageBand`; Band 1 keeps tabs + solid
CTAs only.

**Accept:** My Day + Labels products Band 1 have no `TechRailSearchBar`; Photos
exception remains documented; verify green.

---

### Wave R6 — Guard harden + dead export deletion

**Do**

1. Extend wave7 / per-surface guards for every R1–R5 touch:
   - `WORKBENCH_SHEET_CHROME` + `WORKBENCH_SHEET_HOST`
   - no gutter column / `WorkbenchTablePane` / body KPI `mb-4`
   - stack order tabs · KPI · triage
   - Band 1 function body has **no** `TechRailSearchBar`
   - GridView / `LedgerGridSurface` includes `surface="sheet"`
   - ban reintro of `ReceivingGridGroupSummary` / `IncomingGridGroupSummary` /
     `OrderGroupSummary` / `ReceivingPoSummary`
2. Add sheet guards for Warranty · Unfound · Tracking exceptions · Ready if
   still unguarded after R2/R3.
3. If History branch no longer uses `WORKBENCH_CHROME_COLUMN`, remove dead
   call sites; keep the SoT export only if another intentional consumer remains
   (prefer delete unused export + knip).
4. Update `TRAILING_CLUSTER_ADOPTERS` only when Band 1 honestly drops
   `WorkbenchTrailingCluster` (Testing pattern) — see cohort prompt §7 note.

**Accept:** all sheet guards green; `rg` lifecycle hosts clean of gutter
markers (documented CLIP escapes only); knip clean; verify green.

---

### Wave R7 — Doc hygiene

**Do**

1. Confirm this file remains the active execution prompt; cohort SWEEP-PROMPT
   status = superseded (already done at authoring — re-check).
2. One-liners in `.claude/rules/display/workbench-ops-queue.md` for residual
   lands (History standalone · sheet-surface pin · Locations twin delete ·
   Ready KPI).
3. Scrub stale `*GroupSummary` / `ReceivingPoSummary` paths in `docs/todo/`
   that still read as live files (pointer → “deleted; ban reintro in guards”).
4. `node scripts/portfolio-sot-sync.mjs` if catalog drift.

**Accept:** docs match tree; no essay retell of still-true SoT; verify
doc-catalog gate green.

---

## 6. Guard recipe

Clone `src/components/dashboard/dashboard-orders-sheet.guard.test.ts` and/or
`receiving-grid-sheet.guard.test.ts`. Every touched surface must assert:

1. `WORKBENCH_SHEET_CHROME` + `WORKBENCH_SHEET_HOST` present.
2. No `WORKBENCH_CHROME_COLUMN` / `WORKBENCH_BODY_COLUMN` / `WORKBENCH_GUTTERS`
   (strip block comments first so prose cannot trip bans).
3. Chrome stack order: tabs · KPI · triage (`*TriageBand` / `WorkbenchTriageBand`).
4. Band 1 function body has **no** `TechRailSearchBar` / display sort (those live
   on Band 3).
5. KPI JSX appears **above** body `WORKBENCH_SHEET_HOST` (search host **after**
   KPI JSX index — never first import).
6. No body `\bmb-4\b` around KPI.
7. Tab band flush face: `border-l-0` · `border-t-0` · `rounded-none` on the
   header mount.
8. KPI band owns `border-b border-r border-border-soft` when present.
9. Grid host does not wrap in `WorkbenchTablePane` (when applicable).
10. `surface="sheet"` (or `surface={'sheet'}`) on the family `*GridView` /
    `LedgerGridSurface` mount.
11. No `ReceivingGridGroupSummary` / `IncomingGridGroupSummary` /
    `OrderGroupSummary` / `ReceivingPoSummary` imports or JSX.

Run:

```bash
node --test --import tsx path/to/*-sheet.guard.test.ts
npm run verify
```

Never raise a DS ratchet baseline to pass.

---

## 7. Trailing-cluster note

When Band 1 loses display sort (moved to triage icon sort), remove that surface
from `TRAILING_CLUSTER_ADOPTERS` in
`workbench-trailing-cluster.guard.test.ts` **only if** Band 1 no longer mounts
`WorkbenchTrailingCluster` at all (honest absence — Testing pattern). Surfaces
that keep Import / Add / return-to-scan on Band 1 **stay** in the adopters list.

---

## 8. Done when

- Every Workbench / ops data-table page matches the **five-row stack**: top tabs
  · middle KPI (or honest absence) · **third triage / icon header** · column
  header · `surface="sheet"` data table.
- Zero live `WORKBENCH_CHROME_COLUMN` / `WorkbenchTablePane` on lifecycle hosts.
- Residual GridViews (Pickup · Repair · Catalog · Review catalog-link ·
  Warranty · Unfound · Tracking exceptions · Ready — plus any R0 finds) on
  `surface="sheet"`.
- `LocationsTriageBand` deleted; Unbox triage shell on SoT or one documented twin.
- Ready has no body KPI island under FBA.
- Band-1 search cleared on My Day + Labels products (Photos exception kept).
- All sheet guards green; `npm run verify` green.
- Cohort SWEEP-PROMPT remains marked superseded; this file is the active prompt.

---

## 9. Related

- Prior cohort (chrome flush ✅):
  [`sheets-flush-workbench-cohort-PLAN.md`](./sheets-flush-workbench-cohort-PLAN.md) ·
  [`sheets-flush-workbench-cohort-SWEEP-PROMPT.md`](./sheets-flush-workbench-cohort-SWEEP-PROMPT.md)
  (**superseded** for new sessions)
- SoT / header height:
  [`ledgergrid-sheets-flush-display-FINISH-HANDOFF.md`](./ledgergrid-sheets-flush-display-FINISH-HANDOFF.md)
- Resize / Fields (do **not** merge):
  [`ledgergrid-sheets-parity-UPGRADE-PROMPT.md`](./ledgergrid-sheets-parity-UPGRADE-PROMPT.md)
- Add-column track (separate):
  [`ledgergrid-add-column-track-HANDOFF.md`](./ledgergrid-add-column-track-HANDOFF.md)
