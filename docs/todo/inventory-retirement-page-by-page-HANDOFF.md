# /inventory legacy retirement — page-by-page delete-old / import-new HANDOFF

**Status:** Waves 0–1 landed; Waves 2–8 not started.
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

## Landed (Wave 1) — the keystone push inspector

- **`InventoryInspectorRail`** (`src/components/inventory/InventoryInspectorRail.tsx`) — a
  non-modal `RightRailHost` occupant (`DetailStackRailRegistrar` `modal={false}`) keyed on
  `?open=<kind>:<ref>`; Desk chrome (`DeskRailChromeRow` + `PaneHeaderLabel`), never the
  hero-title `InventoryDetailPanelShell`. Bodies: `unit` → `ByUnitView`; `alert` / `count`
  → the existing panels in new **`chrome="bare"`** mode; **`sku` / `bin` → an honest deferred
  hint** (their real bodies compose `SkuDetailView` panel-mode / `LocationDetailView`, designed
  by W3 — rendering those full-page shells raw in a push rail double-headers, nests a scroll
  port, and `router.push('/inventory')` back into the retired shell on Back).
- **`useInventoryOpenParam`** (`src/components/inventory/useInventoryOpenParam.ts`) — optimistic
  `?open=` paint (`useOptimisticUrlParam`, the mount-gated hard law); canonicalizes to
  `INVENTORY_ROUTE_PARAMS` declared order so `SurfaceParamHygiene` fires no redundant replace.
  `open` was already owned by the `/inventory` prefix as `paramText`, so **no routing edit**.
- **`UnitsWorkspaceView`** row-click retargeted: `setOpen(serializeInventoryOpenKey('unit', ref))`
  instead of `router.push('/inventory?unit=')`. (This file was concurrently rewritten by the
  `topic/tables` GridView-burn session onto `NonlinearTableHost`; the Wave-1 wiring merged cleanly.)
- **Additive `chrome?: 'default' | 'bare'`** on `InventoryDetailPanelShell` + passthrough on
  `AlertDetailsPanel` / `CountCampaignDetailsPanel` — default preserves the legacy overlay
  byte-for-byte.
- Guard grown: `units-grid-sheet.guard` pins row-click ≠ `/inventory?unit=`, no `useRouter`, and
  the inspector is a `modal={false}` `DeskRailChromeRow` occupant.
- Verified: `tsc` 0 errors (Wave-1 files) · `units-grid-sheet.guard` 7/7 · `param-ownership.guard`
  7/7 · right-rail inspector/push/collapse + optimistic-url-param + route-params guards green ·
  ESLint clean. Adversarially reviewed (4 lenses + per-finding verify).
- **NEW surviving consumers Wave 1 introduced** (see deletion-order + carve-out updates below):
  `ByUnitView` (unit body), `AlertDetailsPanel` / `CountCampaignDetailsPanel` /
  `InventoryDetailPanelShell` (alert/count bodies via `chrome="bare"`).

---

## 🔑 KEYSTONE — RESOLVED (Wave 1)

~~`UnitsWorkspaceView.tsx` row-click does `router.push('/inventory?unit=…')` through
`InventoryShell → ByUnitView`.~~ **Done:** row-click now opens `InventoryInspectorRail`
(`?open=unit:<ref>`), so the units route routes no record through the retired shell. The
Waves 2–8 deletion cascade is unblocked.

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
| `/inventory/units` | **DONE (W0+W1)** `UnitsWorkspaceView`; row-click → `InventoryInspectorRail` (`?open=unit:`) | `ByUnitView` now the **surviving** unit inspector body (NOT freed) | — | `units-grid-sheet.guard` (grown) | this session |
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
**⚠ Wave-1 consumer (W6):** `AlertDetailsPanel` / `CountCampaignDetailsPanel` — and
transitively `InventoryDetailPanelShell` — gained a live consumer, `InventoryInspectorRail`'s
`case 'alert'` / `case 'count'` branches (`chrome="bare"`). Re-point those branches to a by-id
alert/count body **in the same change** that deletes the panels, or the ordered Tier-B teardown
(panels → shell → overlay) cannot complete. The additive `chrome` prop is deleted with the shell.

**Tier C — viewports:** `BySkuView`, `ByBinView`, `ByFilterResultList`. **`ByUnitView` is
NOT here anymore** — Wave 1 made it the **surviving** unit inspector body
(`InventoryInspectorRail` `case 'unit'`), exactly like `BySkuView`/`ByBinView` remain the
sku/bin bodies. W2 deletes only `UnitDetailsPanel` (+ retarget its `SearchDetailWorkspace`
`'unit'` consumer); `ByUnitView` survives until a richer unit body replaces it.
**⚠ `ByUnitView` internal link (W4/W8):** its SKU cell links to `/inventory?sku=` (the legacy
shell vocabulary). W4's `/inventory` root migration must bridge legacy `?sku`/`?bin` →
`?open=<kind>:<ref>`; W8 must audit the shared inspector bodies for internal hrefs into the
retired shell before deleting `InventoryShell`.

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
- `ByUnitView` — **now the surviving unit inspector body** (`InventoryInspectorRail` `case 'unit'`,
  Wave 1). Keep it exactly as `BySkuView`/`ByBinView` are kept for sku/bin; it leaves only when a
  richer unit body replaces it (not W2).
- `SkuIdentity` — **relocate, don't delete** (used by `app/m/(shell)/pick/**` +
  `useSkuIdentity`); move to `components/sku`/`components/identity` before `inventory/` folder removal.

---

## Wave sequence

- **W1 — push inspector** — ✅ **LANDED** (see *Landed (Wave 1)* above). `InventoryInspectorRail`
  (`modal={false}`, `DeskRailChromeRow`) keyed on `?open=<kind>:<ref>`; `unit`/`alert`/`count`
  bodies real, `sku`/`bin` deferred to W3 (honest hint — their full-page shells are unsafe raw in
  a push rail). `UnitsWorkspaceView` row-click retargeted. No deletions.
- **W2** — delete `UnitDetailsPanel` (coordinate its `SearchDetailWorkspace` `'unit'` consumer).
  **NOT `ByUnitView`** — Wave 1 made it the surviving unit inspector body (see Tier C).
- **W3** — `/inventory/skus` + `/inventory/bins`; build the **real** `sku`/`bin` inspector bodies
  (replace `InventoryInspectorRail`'s deferred hint — compose `SkuDetailView` panel-mode /
  `LocationDetailView` in a content-only mode: suppress their internal header + scroll port, route
  close through the rail's `onClose`, never `router.push('/inventory')`); delete `SkuDetailsPanel` /
  `BinDetailsPanel`. `BySkuView`/`ByBinView` stay the shared sku/bin bodies (keep their lazy-load).
- **W4** — `/inventory` root + `/activity` + `/pulse` → Operations Monitor; delete pulse cluster.
- **W5** — `/inventory/triage` → tracking-exceptions; delete `TriageWorkspace`.
- **W6** — `/alerts` + `/counts`; retire overlay/panels/`ByFilterResultList`; finish `UnitDetailsPanel`.
  **Re-point `InventoryInspectorRail`'s `alert`/`count` branches** off `AlertDetailsPanel` /
  `CountCampaignDetailsPanel` (`chrome="bare"`) to by-id bodies **before** deleting those panels +
  `InventoryDetailPanelShell` (Tier B ⚠).
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
