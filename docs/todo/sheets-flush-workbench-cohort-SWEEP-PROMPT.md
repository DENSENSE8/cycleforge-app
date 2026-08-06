# Sheets-flush workbench cohort — Claude Code sweep prompt

**For:** historical reference only. Waves 0–7 chrome flush are **done**
(see [`sheets-flush-workbench-cohort-PLAN.md`](./sheets-flush-workbench-cohort-PLAN.md)).
**Status:** ⛔ **SUPERSEDED 2026-08-05** — new sessions execute
[`unbox-history-sheets-full-resweep-SWEEP-PROMPT.md`](./unbox-history-sheets-full-resweep-SWEEP-PROMPT.md)
(full re-sweep: Band 3 + `surface="sheet"` + twin deletion). Do **not** re-open
Waves 0–7 as written below.
**Date:** 2026-08-04 (authored) · superseded 2026-08-05.
**Golden SoT:** Unbox History five-row Sheets stack (tabs · middle KPI · triage ·
column header · data table). Closest already-ported sibling: To-ship
(`DashboardOrdersView`).

---

## Paste this into a new session

> **STOP.** This file is superseded. Read and execute
> `docs/todo/unbox-history-sheets-full-resweep-SWEEP-PROMPT.md` instead.
>
> ~~Read `docs/todo/sheets-flush-workbench-cohort-SWEEP-PROMPT.md` (this file) end
> to end before editing.~~
>
> ~~**Job:** pin Unbox History’s **five-row Sheets stack** (Band 1 tabs · Band 2
> middle KPI · Band 3 triage · column header row · data table) across every
> remaining guttered Workbench ops page. Finish Testing + Pack first (Wave 0),
> then sweep Shipping → Triage → Labels → Scan-out → Review → Support → the
> long tail. Each wave: five-row anatomy, flush hosts, sheet guard, one-liner
> in `workbench-ops-queue.md`, `npm run verify`. Attach to the user’s `:3050`
> — never start, restart, or kill the dev server.~~
>
> **Non-goals:** second table engine; Orders header fork; admin `DataTable` →
> SHEET; LedgerGrid resize / Fields / drill upgrades; station record overlays
> (`TestingPanel` / `PackOrderPanel` / `LineEditPanel`); raising DS ratchet
> baselines; inventing return-to-scan CTAs where none exist today.

---

## 1. Mandatory vertical stack (non-negotiable)

Every Workbench ops page in this sweep **must** read as this exact five-row
plane. Reject any port that collapses bands, parks KPI in the body, or drops
the column header row.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Band 1 — TOP ROW                                                        │
│   Lifecycle tabs (left) · solid CTAs only (right)                       │
│   WorkbenchChromeHeader density="band"                                  │
│   rounded-none border-l-0 border-t-0 · h-10                             │
├─────────────────────────────────────────────────────────────────────────┤
│ Band 2 — MIDDLE KPI DISPLAY                                             │
│   Full KpiTile / OpsKpiBand strip (attention metrics)                   │
│   Pinned in chrome — NEVER body mb-4 island                             │
│   border-b border-r border-border-soft bg-surface-card px-3 py-2        │
├─────────────────────────────────────────────────────────────────────────┤
│ Band 3 — THIRD ROW (triage)                                             │
│   Search left · refine / staff / filters / icon-sort / portal right     │
│   WorkbenchTriageBand · h-10 · border-r only (no border-t / border-b)   │
├───────────────────────────────── single hairline ───────────────────────┤
│ Column header row                                                       │
│   LedgerGridColumnHeader (or family adapter) · h-10                     │
│   Matches Band 1 / Band 3 height — select gutter · sort · frozen tip    │
├─────────────────────────────────────────────────────────────────────────┤
│ Data table                                                              │
│   LedgerGridSurface surface="sheet" inside WORKBENCH_SHEET_HOST         │
│   Body rows · day bands · empty state — flush, no WorkbenchTablePane    │
└─────────────────────────────────────────────────────────────────────────┘
```

**Hosts**

- Bands 1–3 → one non-scrolling `WORKBENCH_SHEET_CHROME` (`flex flex-col gap-0`).
- Column header + data table → `WORKBENCH_SHEET_HOST` immediately below.
- Sheet owns `border-t` against Band 3. KPI owns `border-b`. Triage is
  `border-r` only. One hairline per joint — never double borders.

**Failures to reject (any wave)**

- KPI still under tabs as a scrolling `mb-4` card.
- Search / sort / filters still on Band 1.
- Missing Band 3.
- Column header not `h-10` / not flush under triage.
- Framed CLIP card (`WorkbenchTablePane` / `WORKBENCH_*_COLUMN` /
  `WORKBENCH_TABLE_VIEWPORT` island) around the grid.

**CLIP stays** for admin `DataTable` and true framed islands. Target =
Workbench lifecycle / ops queue pages only.

---

## 2. Cite — do not reinvent

| Piece | Path |
|---|---|
| Recipe law | `.claude/rules/source-of-truth.md` → **Sheets flush mount recipe (Unbox golden)** |
| Chrome law | `.claude/rules/display/workbench-ops-queue.md` → Unbox / To-ship three-band flush |
| Hosts | `src/components/dashboard/workbench-shell.tsx` → `WORKBENCH_SHEET_CHROME` · `WORKBENCH_SHEET_HOST` · `WorkbenchTriageBand` |
| Surface | `src/design-system/tokens/table-surface.ts` → `TABLE_SURFACE_SHEET_CLASS` via `LedgerGridSurface surface="sheet"` |
| Golden mounts | `UnboxWorkspaceView.tsx` · `UnboxWorkspaceHeader.tsx` · `ReceivingLinesTable.tsx` (History) |
| Closest sibling | `DashboardOrdersView.tsx` + `OutboundWorkspaceHeader.tsx` (`OutboundTriageBand`) |
| Guard template | `src/components/dashboard/dashboard-orders-sheet.guard.test.ts` |
| Testing / Pack (in progress) | `TestingWorkspaceView.tsx` · `PackWorkspaceView.tsx` + their `*-sheet.guard.test.ts` |

Also cite (docs only — do not re-run):

- `docs/todo/ledgergrid-sheets-flush-display-FINISH-HANDOFF.md` (SoT / header height).
- `docs/todo/ledgergrid-sheets-parity-UPGRADE-PROMPT.md` (resize / Fields — **out of scope**).

---

## 3. Inventory

### Already green (do not re-port)

| Surface | Notes |
|---|---|
| Unbox | Major SoT — five-row stack live |
| Incoming Pipeline | Three-band flush + sheet guard |
| To-ship (`DashboardOrdersView`) | Three-band flush + sheet guard |
| My Day | Sheet hosts + guard |
| Locations | Sheet hosts + guard |
| Testing (`/test`) | Three-band flush + `WorkbenchKpiBand` + sheet guard |
| Pack (`/pack`) | Three-band flush + `WorkbenchKpiBand` + sheet guard |
| Shipping on `/test` | Three-band flush + `WorkbenchKpiBand` + sheet guard |

### Remaining cohort

| Wave | Surface | Still on gutters / islands |
|---|---|---|
| 2 | Triage / Arrival | `TriageWorkspaceView.tsx` · header — `TriageKpiStrip` body island |
| 3 | Labels station | `LabelsWorkspaceView.tsx` · header — body KPI island |
| 4 | Scan-out / staged | `ScanOutWorkspace.tsx` — `WorkbenchTablePane` |
| 5 | Review family | `ReviewPackingTable.tsx` · `ReviewPairingTable.tsx` · `ReviewCatalogLinkTable.tsx` |
| 6 | Support | `SupportTicketsBoard.tsx` · `SupportTicketFocus.tsx` |
| 7 | Long tail | `PickupWorkspace.tsx` · `ProductsCatalogWorkspace.tsx` · `FbaOutboundWorkspace.tsx` · `PhotoLibraryPage.tsx` · `LabelsProductsWorkspace.tsx` · `WalkInHistoryHub.tsx` / `WalkInFeedPane.tsx` · `RepairTable.tsx` |

---

## 4. Per-surface checklist (copy into every wave)

1. **Band 1** — tabs (+ solid CTAs only). `WorkbenchChromeHeader density="band"` with
   `className="rounded-none border-l-0 border-t-0 shadow-sm"`. No search, sort, or
   filters on this row.
2. **Band 2** — **middle KPI display**. Fold existing `*KpiStrip` into
   `border-b border-r border-border-soft bg-surface-card px-3 py-2`. Delete body
   `mb-4`.
3. **Band 3** — triage via `WorkbenchTriageBand` (or Unbox-local twin only when
   needed). Search left; staff / filters / icon-sort / controls portal right.
4. **Column header row** — family `LedgerGridColumnHeader` (or Orders allowlisted
   fork) at `h-10`, flush under Band 3. Do not invent a second sticky header.
5. **Data table** — `LedgerGridSurface surface="sheet"` inside
   `WORKBENCH_SHEET_HOST`. Strip `WorkbenchTablePane`, `WORKBENCH_CHROME_COLUMN`,
   `WORKBENCH_BODY_COLUMN`, framed `WORKBENCH_TABLE_VIEWPORT`.
6. **Guard** — add `*-sheet.guard.test.ts` cloned from
   `dashboard-orders-sheet.guard.test.ts` (see §6).
7. **Docs** — one-liner under Unbox / To-ship flush notes in
   `.claude/rules/display/workbench-ops-queue.md`.
8. **Verify** — `npm run verify` (full gate) before calling the wave done.
9. **Dev server** — attach `:3050`; never start / restart / kill.

---

## 5. Waves

### Wave 0 — Finish Testing + Pack

**Files**

- `src/components/tech/testing/TestingWorkspaceView.tsx`
- `src/components/tech/testing/TestingWorkspaceHeader.tsx` (`TestingTriageBand`)
- `src/components/tech/TestingHistoryList.tsx` (no `WorkbenchTablePane`)
- `src/components/tech/testing/testing-workspace-sheet.guard.test.ts`
- `src/components/packer/PackWorkspaceView.tsx`
- `src/components/packer/PackWorkspaceHeader.tsx` (`PackTriageBand`)
- `src/components/packer/pack-workspace-sheet.guard.test.ts`

**Fix the KPI-above-host guard false-positive**

To-ship does this correctly: search for body `WORKBENCH_SHEET_HOST` **after**
chrome JSX, not the first import occurrence.

```ts
// BAD — matches the import line before <TestingKpiStrip>
const bodyUsage = src.indexOf('WORKBENCH_SHEET_HOST');

// GOOD — find host usage in the body className after KPI (or after chrome open)
const kpiJsx = src.indexOf('<TestingKpiStrip'); // or <PackKpiStrip>
const bodyUsage = src.indexOf('WORKBENCH_SHEET_HOST', kpiJsx);
// assert kpiJsx < bodyUsage
```

Mirror `dashboard-orders-sheet.guard.test.ts` (“KPI sits in pinned chrome stack”).

**Accept:** both sheet guards green; five-row stack on `/test` Returns and `/pack`
Queue @1440; `npm run verify` green.

---

### Wave 1 — Shipping on `/test`

**Files:** `ShippingWorkspaceView.tsx` · `ShippingWorkspaceHeader.tsx` ·
`ShippingKpiStrip.tsx` (mount only — fold into Band 2).

Same shape as Pack: Band 1 tabs + New Order trailing; Band 2 `ShippingKpiStrip`;
Band 3 triage (search / filters / staff / portal); sheet host body; drop History
`WORKBENCH_TABLE_VIEWPORT` frame.

**Guard:** `src/components/tech/shipping/shipping-workspace-sheet.guard.test.ts`

**Accept:** five-row stack on Shipping Pending + History; guard + verify green.

---

### Wave 2 — Triage / Arrival

**Files:** `TriageWorkspaceView.tsx` · `TriageWorkspaceHeader.tsx` ·
`TriageKpiStrip.tsx`.

Fold KPI into Band 2. Move find/refine onto Band 3. Feed / list mounts flush in
`WORKBENCH_SHEET_HOST` — no second card well inside the elevated host.

**Guard:** `src/components/receiving/triage/triage-workspace-sheet.guard.test.ts`

---

### Wave 3 — Labels station

**Files:** `LabelsWorkspaceView.tsx` · `LabelsWorkspaceHeader.tsx` ·
`LabelsKpiStrip.tsx`.

`LabelsQueueTable` / `StagedQueueTable` already use sheet hosts internally —
outer view must stop wrapping them in `WORKBENCH_*_COLUMN` + body KPI.

**Guard:** `src/components/outbound/labels/labels-workspace-sheet.guard.test.ts`

---

### Wave 4 — Scan-out / staged

**Files:** `ScanOutWorkspace.tsx` (and any chrome sibling).

Remove `WorkbenchTablePane`. Mount staged queue flush under the five-row chrome
(or under the station’s existing sheet chrome if Labels already owns bands —
compose, don’t double-wrap).

**Guard:** colocated `*-sheet.guard.test.ts` next to the host.

---

### Wave 5 — Review family

**Files:** `ReviewPackingTable.tsx` · `ReviewPairingTable.tsx` ·
`ReviewCatalogLinkTable.tsx`.

Each still uses `WORKBENCH_CHROME_COLUMN` + `WORKBENCH_BODY_COLUMN` +
`WORKBENCH_TABLE_VIEWPORT_NO_KPI`. Port to five-row sheet stack (KPI band may be
thin / honest absence only when the surface truly has no metrics — prefer a real
Band 2 when a strip already exists).

**Guards:** one per host or one family guard that pins all three.

---

### Wave 6 — Support

**Files:** `SupportTicketsBoard.tsx` · `SupportTicketFocus.tsx`.

Same host swap. Ticket board stays a spreadsheet plane, not a padded card column.

---

### Wave 7 — Long tail

Pickup · Catalog · FBA · Photos · Labels products · Walk-In · Repair chrome —
same five-row checklist. Walk-In `WorkbenchTablePane` feeds are CLIP debt; convert
or document as intentional CLIP escape with a comment + guard allowlist (prefer
convert).

After Wave 7:

```bash
rg 'WORKBENCH_CHROME_COLUMN|WORKBENCH_BODY_COLUMN|WorkbenchTablePane' \
  src/components src/features --glob '*.tsx'
```

Lifecycle workspaces should be empty (or only documented CLIP escapes).

---

## 6. Guard recipe

Clone `src/components/dashboard/dashboard-orders-sheet.guard.test.ts`. Every new
guard must assert:

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
8. KPI band owns `border-b border-r border-border-soft`.
9. Grid host does not wrap in `WorkbenchTablePane` (when applicable).

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
`WorkbenchTrailingCluster` at all (honest absence — Testing pattern). Pack /
Shipping that keep New Order / Import on Band 1 **stay** in the adopters list.

---

## 8. Done when

- Every cohort page shows the **five-row stack**: top tabs · middle KPI · third
  triage · column header · data table.
- Zero gutter between context rail and sheet (`border-l-0`, no `WORKBENCH_GUTTERS`).
- All new + Wave 0 sheet guards green.
- `rg` for gutter hosts on lifecycle workspaces is clean (or documented CLIP
  escapes only).
- `npm run verify` green.
- `workbench-ops-queue.md` lists each finished surface next to To-ship / Testing /
  Pack flush notes.

---

## 9. Related

- Prior SoT/docs finish:
  [`ledgergrid-sheets-flush-display-FINISH-HANDOFF.md`](./ledgergrid-sheets-flush-display-FINISH-HANDOFF.md)
- Resize / Fields (do **not** merge into this sweep):
  [`ledgergrid-sheets-parity-UPGRADE-PROMPT.md`](./ledgergrid-sheets-parity-UPGRADE-PROMPT.md)
- Add-column track (separate):
  [`ledgergrid-add-column-track-HANDOFF.md`](./ledgergrid-add-column-track-HANDOFF.md)
