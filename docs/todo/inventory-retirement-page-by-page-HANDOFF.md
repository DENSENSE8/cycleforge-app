# /inventory legacy retirement — page-by-page delete-old / import-new HANDOFF

**Status:** plan only (verified). Wave 0 landed; Waves 1–8 not started.
**Date:** 2026-08-08.
**Parent:** [`sot-page-violation-audit-migrate-CLAUDE-CODE-PROMPT.md`](./sot-page-violation-audit-migrate-CLAUDE-CODE-PROMPT.md) (this is its /inventory Wave-0→teardown detail).
**Why this doc:** finishing the migrate means **deleting** the legacy `InventoryShell`
tree, not leaving old + new side by side (that is the banned fork + the context/knip
bloat). `pattern-evolution.md` → Always #6: *a retirement is not done until the old
path is DELETED, or a guard names the surviving call sites.* This plan does that,
safely ordered, collision-aware.

**Payoff:** ~29 legacy files retired from `src/components/inventory/**`.

---

## Landed so far (Wave 0)

- `/inventory/units` mounts **`UnitsWorkspaceView`** + `src/components/inventory/units-grid/*`
  (sheet golden), **composing** the parallel session's `src/hooks/useUnitsOverview`
  feed (no fork). Registry binding `inventory.units`, `TableId 'inventory-units'`,
  entity family `units`, `unitStatusDotClass` added to `@/lib/unit-status`.
- Verified: `tsc` 0 errors · `units-grid-sheet.guard` 5/5 · `grid-surface-capabilities.guard`
  13/13 · `grid-column-tier.guard` 124/124 · `table-definition(.registry).guard/test` green
  · parallel `table-definition-registry.test.ts` still green.

---

## 🔑 KEYSTONE — nothing in the shell tree deletes until this ships

`UnitsWorkspaceView.tsx` row-click does `router.push('/inventory?unit=…')`, which renders
the unit record **through** `InventoryShell → ByUnitView`. The migrated units route is
still coupled to the legacy shell. **The whole deletion cascade is gated on Wave 1: a
`RightRailHost` (`modal={false}`) push inspector + retargeting that navigation to it.**

---

## Collision quarantine (parallel `inventory-displays-zoho-trust` session)

Do **not** edit/delete these until that session lands (all quarantined to **Wave 8**):

- `src/components/inventory/useInventoryUrlState.ts` (rewritten for `useOptimisticUrlParam`)
- `src/components/inventory/sidebar/InventorySidebar.tsx`
- `src/components/inventory/sidebar/InventoryTriageSidebar.tsx`
- `src/components/inventory/sidebar/InventoryPulseSidebar.tsx`

Also off-limits: `src/components/receiving/inventory/**`, `line-edit/InventoryDisplayHost.tsx`.

---

## Route → new surface (retirement table)

| Route | New surface | Legacy freed | Deletable after | Guard | Collision |
|---|---|---|---|---|---|
| `/inventory` | Operations Monitor default (or redirect); `?open/unit/sku/bin` → push inspector; `?section=replenish` → `ReplenishWorkspace`; `?view=by-filter` → `/inventory/units` | `InventoryShell`, `PulseView`, `ByFilterResultList`, `InventoryDetailsOverlay` | shell LAST | `inventory-root-monitor.guard` | shell clean; sidebar path blocked |
| `/inventory/units` | **DONE** `UnitsWorkspaceView`; W1: retarget row-click to inspector | frees `ByUnitView` via shell | retarget unblocks `ByUnitView` | extend `units-grid-sheet.guard` | this session |
| `/inventory/skus` | `SkusWorkspaceView` + saved-views; row → push inspector → `@/components/sku/SkuDetailView` | `BySkuView`, `SkuDetailsPanel` | both (thin adapters) | `skus-workspace-sheet.guard` | sidebar blocked |
| `/inventory/bins` | fold into `/inventory/locations` (green) or thin `BinsWorkspaceView`; row → `LocationDetailView` | `ByBinView`, `BinDetailsPanel` | both | `bins-fold.guard` | sidebar blocked |
| `/inventory/activity` | Operations Monitor via `EventTimeline` (`inventoryEventsToTimeline`) | `PulseView`, `EventRow` | after root+pulse too | `inventory-activity-monitor.guard` | sidebar blocked |
| `/inventory/alerts` | `AlertsWorkspaceView` (`/api/inventory/alerts`); row → inspector | `AlertDetailsPanel` | yes | `alerts-workspace-sheet.guard` | sidebar blocked |
| `/inventory/counts` | `CountsWorkspaceView` (`/api/inventory/counts`); row → inspector | `CountCampaignDetailsPanel` | yes | `counts-workspace-sheet.guard` | sidebar blocked |
| `/inventory/triage` | repoint to tracking-exceptions ops-queue (`app/tracking-exceptions`) + saved-views | `TriageWorkspace`, `InventoryTriageSidebar` | `TriageWorkspace` yes; sidebar blocked | `inventory-triage-redirect.guard` | `InventoryTriageSidebar` blocked |
| `/inventory/pulse` | fold into unit record plane (inspector chain-of-custody + `EventTimeline`) | `PulseWorkspace`, `PulseView`, `EventRow`, `InventoryPulseSidebar` | `PulseWorkspace` yes; sidebar blocked | `inventory-pulse-fold.guard` | `InventoryPulseSidebar` blocked |
| `/inventory/graph` | **KEEP** Canvas carve-out (`InventoryGraphRouter`) | — | — | — | — |
| `/inventory/locations` (+ `/warehouse`) | **KEEP** green (`LocationsWorkspace` / `bins-grid`) | — | — | — | — |
| `/inventory/location/[barcode]`, `/sku/[sku]` | retarget redirect to inspector deep-link once `?bin`/`?sku` leaves shell | thin stubs | keep/delete | covered by bins/skus guards | — |
| `/warehouse/replenishment`, `/warehouse/rma` | **independent** ops-queues (own track) | — | — | own | — |
| `/warehouse/rma/disposition` | **KEEP** Station carve-out | — | — | — | — |
| `/admin/inventory/**` | **KEEP** admin CLIP carve-out (same-named types are local, not imports) | — | — | — | — |

---

## Deletion order (topological — leaves first, shared roots last)

**Tier A — sidebar-map leaves:** `InventoryResultCard` → `InventoryResultList` →
`inventory-sidebar-metadata` → `InventorySidebarFilters` → `InventorySidebarFooter` →
`InventorySidebarTabs`. Gate: `InventorySidebar` stops rendering them (prune
`legacy-pill-deprecation.guard.test.ts:28`).

**Tier B — record panels:** `SkuDetailsPanel`, `BinDetailsPanel`, `AlertDetailsPanel`,
`CountCampaignDetailsPanel`, then `InventoryDetailPanelShell`, then
`InventoryDetailsOverlay`. **`UnitDetailsPanel` is CROSS-FEATURE** — also consumed by
`src/components/search/SearchDetailWorkspace.tsx` (case `'unit'`); retarget search in
the same change or defer to W6.

**Tier C — viewports:** `BySkuView`, `ByBinView`, `ByFilterResultList`, `ByUnitView`
(the keystone coupling — deletes only after inspector retarget + `UnitDetailsPanel`).

**Tier D — pulse:** `EventRow` (only consumers `PulseView`+`PulseWorkspace`) → `PulseView`
→ `PulseWorkspace`.

**Tier E — triage:** `TriageWorkspace` (one consumer `InventoryShell`; the `useTriageWorkspaceTab`
/ `inventory-triage-status` / `ReceivingSidebarPanel` refs are the *receiving* Arrival triage — different, confirm before delete).

**Tier F 🚫 (blocked):** `InventoryPulseSidebar`, `InventoryTriageSidebar` — W8.

**Tier G 🚫 (roots, last):** `InventorySidebar` → `useInventorySearch` → `InventoryShell`
→ `useInventoryUrlState` (blocked). Update `optimistic-url-param.guard.test.ts`,
`query-mode-routes.ts` (`INVENTORY_ROUTE_PARAMS`), `route-params.test.ts` in the same change.

**Tier H — shrink/split (not outright delete):**
- `src/components/sidebar/InventorySidebarPanel.tsx` — **shrinks**; keeps dispatching
  survivors `WarehouseSidebarPanel`, `ReplenishSidebarPanel`, `InventoryGraphSidebar`.
  Prune `header-mode.guard.test.ts:66`, `param-ownership.guard.test.ts:85` on removals.
- `src/components/inventory/types.ts` — **split first**: relocate `SERIAL_STATUS_VALUES`
  + `CONDITION_GRADE_VALUES` to a lib home (non-UI consumers: `src/lib/inventory-search.ts`,
  `src/app/api/serial-units/[id]/grade/route.ts`). (Note: `units-grid` does **not** import
  from here — it uses `@/lib/unit-status`.)

---

## Carve-outs — NEVER deleted

- `src/components/inventory/graph/**` + `InventoryGraphSidebar` — Canvas. (External:
  `components/labels/unit-detail/popovers.tsx` imports `useSkuParents/useSkuChildren` +
  `SkuRelationshipEdgeView` — re-home before any hypothetical graph teardown.)
- `/admin/inventory/**` — CLIP; the `AllocationRow`/`AlertRow`/`EventRow`/`TriageWorkspace`
  name-matches there are **locally-declared**, not imports.
- `LocationsWorkspace` + `bins-grid` — green; `LocationDetailView` is the shared bin record.
- `ByUnitView` — load-bearing until the push inspector exists (Tier C keystone).
- `SkuIdentity` — **relocate, don't delete** (used by `app/m/(shell)/pick/**` +
  `useSkuIdentity`); move to `components/sku`/`components/identity` before `inventory/` folder removal.

---

## Wave sequence

- **W1 — push inspector** (collision-free keystone): `RightRailHost modal={false}`,
  per-kind bodies (unit/sku/bin/alert/count) keyed on `?open=<kind>:<ref>` via
  `PaneHeader`/`DeskRailChromeRow`; retarget `UnitsWorkspaceView` row-click. No deletions.
- **W2** — delete `ByUnitView` (coordinate `UnitDetailsPanel` search consumer).
- **W3** — `/inventory/skus` + `/inventory/bins`; delete their views/panels.
- **W4** — `/inventory` root + `/activity` + `/pulse` → Operations Monitor; delete pulse cluster.
- **W5** — `/inventory/triage` → tracking-exceptions; delete `TriageWorkspace`.
- **W6** — `/alerts` + `/counts`; retire overlay/panels/`ByFilterResultList`; finish `UnitDetailsPanel`.
- **W7** — relocate enums out of `types.ts` (independent of collision; anytime).
- **W8 — final teardown** (AFTER the zoho-trust session lands): re-verify the 4 blocked
  files are clean, then delete `InventorySidebar`/`useInventorySearch`/`InventoryShell`/
  `useInventoryUrlState` + the 3 blocked sidebars; shrink `InventorySidebarPanel` to survivors.

**Guardrail:** W1–W7 must not touch the 4 collision-quarantined files.

---

## Verification (adversarial pass — 2026-08-08)

Independent re-grep of every consumer + git-status flag + cross-boundary ref:
- **No false-safes** (no file marked deletable retains a live consumer).
- **No missed collisions** (exactly the 4 blocked files).
- **No forgotten legacy files** (all 29 accounted for).
- Every retirement is guarded (Always #6). Run `npm run verify` before each wave is "done";
  never raise a ratchet/knip baseline to pass.
