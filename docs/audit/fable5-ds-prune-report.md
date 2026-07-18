# Fable 5 — SoT DS Prune & Alignment audit report

**Date:** 2026-07-17 · **Run:** Phase A (read-only) of
[`fable5-ds-prune-alignment-plan.md`](../todo/fable5-ds-prune-alignment-plan.md)
· **Status:** IMPLEMENTED (P0-FBA + P1 + P3; approved scope). **Labels (P0) deferred —
a concurrent session was actively building `LabelsWorkspaceView`/`LabelsWorkspaceHeader`/
`LabelsKpiStrip` + rewiring `OutboundWorkspace` mid-run; this run stood down from that
surface (incl. the outbound mode-switch crossfade) to avoid a collision.** Outcome log:
[`display-convergence-log.md`](../todo/display-convergence-log.md) → 2026-07-17 entry.

Golden references verified intact: `DashboardOrdersView` (facet workbench),
`ShippingWorkspaceView` + `ShippingWorkspaceHeader` + `ShippingKpiStrip` (two-zone
shell), `UnboxWorkspaceView` / `TestingWorkspaceView` station browse+overlay.
`workbench-shell.tsx` (`WORKBENCH_*` columns + `WorkbenchChromeHeader` +
`WorkbenchTablePane`) is the shell SoT; `framerTransition.workbenchPaneSettle`
exists in `motion-framer.ts`.

**Concurrent-lane guard:** working tree has in-flight edits on
receiving/incoming (`UnboxWorkspaceHeader`, `IncomingSidebarPanel`,
`useIncomingSummary`, …) and kiosk-auth docs. P0 scope (`src/components/fba/`,
`src/components/outbound/`, `src/components/tech/shipping/`) does not overlap —
those files stay untouched.

---

## Findings table

| # | Path | Smell | SoT target | Priority | Blast radius |
|---|---|---|---|---|---|
| 1 | `src/components/fba/FbaBoardTable.tsx` L345–463 | Inline `KpiTile` grid + `PaneHeaderTabs` + week pill + select controls + raw search `<input>` all inside the table toolbar — a hand-rolled chrome+KPI band living *inside* the table component | Extract `FbaWorkspaceHeader` (`WorkbenchChromeHeader` + `TabSwitch`) + `FbaKpiStrip` (Monitor `KpiTile`s); table keeps rows only | **P0** | FBA board (plan+combine); combine overlay + selection events must keep working |
| 2 | `src/components/fba/FbaOutboundWorkspace.tsx` | Hand-rolled page shell (nested flex + `border-l` card) — no `DashboardScrollShell`, no `WORKBENCH_*` columns | Two-zone `DashboardScrollShell` + `WORKBENCH_CHROME_COLUMN`/`WORKBENCH_BODY_COLUMN` (mirror `ShippingWorkspaceView`) | **P0** | FBA mode only |
| 3 | `src/components/fba/sidebar/FbaWorkspaceSidebar.tsx` L95–107 | Sub-mode `HorizontalButtonSlider` gated on `!masterNavEnabled` — **dead**: `SidebarShell` renders `MasterNavProvider enabled` unconditionally, and the L2 `ModeRail` has no `fbaMode` entry. **There is currently no visible plan/combine/shipped switcher at all** — only deep links (`fbaOutboundHref`) reach non-default sub-modes | Plan/Combine/Shipped = lifecycle facets → content-chrome `TabSwitch` top-left (per plan's user correction); delete the dead sidebar pills | **P0** | FBA mode; also fixes a live UX hole |
| 4 | `src/components/fba/FbaBoardRegion.tsx` L52–60 + `FbaWorkspaceSidebar.tsx` L175–181 | Shipped sub-mode renders `FbaShippedTable` **in the sidebar** with the main pane showing only a teaching line ("managed from the sidebar table") — inverted sidebar | Shipped tab body renders the shipped table in the **main pane**; sidebar keeps search as ambient I/O | **P0** (part of FBA facet work) | Shipped sub-mode |
| 5 | `src/components/fba/FbaOutboundWorkspace.tsx` / `FbaBoardRegion.tsx` | No sub-mode body crossfade — instant branch swap on `activeMode` | `AnimatePresence mode="wait"` + `framerPresence.workbenchPaneSettle` via `useMotionPresence` (combine's existing overlay fade preserved) | **P0** | FBA mode |
| 6 | `src/components/fba/FbaBoardTable.tsx` L441–448 | Raw `<input type="search">` with hand-rolled focus recipe (`focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20`) | DS search field (`ToolbarSearchToggle` / `SearchField`) in chrome, or `focusRing('field','accent')` | **P0** | FBA board filter |
| 7 | `src/components/fba/FbaBoardTable.tsx` L450–459, L484–493 | Raw `<button>` elements (Reset/Clear filters) | `Button` variant or documented `ds-raw-button` escape | **P0** (ride-along) | Cosmetic |
| 8 | `src/components/outbound/OutboundWorkspace.tsx` L121–154 | Labels branch has queue↔print crossfade (good) but no content chrome header and no KPI strip; queue stats + `StatusLegend` live **sidebar-only** (`LabelsModeBody.tsx` L97–111) | New `LabelsWorkspaceHeader` (compose `WorkbenchChromeHeader`: single "Awaiting label · N" tab + search/sort/controls) + `LabelsKpiStrip` in `WORKBENCH_BODY_COLUMN`; wrap labels branch in `DashboardScrollShell` | **P0** | Labels mode; queue↔print crossfade must survive |
| 9 | `src/components/outbound/OutboundWorkspace.tsx` L80–118 | Outbound **mode** switch (labels↔ready↔fba↔scan-out) has no body crossfade — instant branch swap | Keyed `AnimatePresence` on `mode` around the branch render (sidebar `ModeRail` stays — do **not** add a top mode band, per Axis-5 correction #2) | **P0** | All four outbound modes |
| 10 | `src/components/tech/shipping/ShippingWorkspaceView.tsx` L79–103 | Tab body (`pending`/`fba`/`history`) instant conditional — no crossfade | `AnimatePresence mode="wait"` keyed on `shipTab`, `framerPresence.workbenchPane*` via hooks bridge | **P1** | `/test` Shipping |
| 11 | `src/components/tech/shipping/ShippingWorkspaceView.tsx` L81–88 | FBA tab = WIP note + `FbaShipmentsTable` (shipment-grain stub) | Already on `DataTable` SoT; align copy/links with Phase B outcome (link to `/outbound?mode=fba` chrome exists in header). Grain swap explicitly deferred per file header | **P1** | `/test` Shipping FBA tab |
| 12 | `src/components/sidebar/receiving/incoming/*` | `IncomingWorkspaceHeader` + `IncomingKpiStrip` exist but body not on `DashboardScrollShell` | Same two-zone transform | **P2 — defer** (files mid-edit in concurrent lane) | Receiving |
| 13 | `src/components/outbound/ready/ReadyQueueTable.tsx` | Self-guttered (`max-w-[1440px]` inline), no KPI strip, gutter string not from `WORKBENCH_GUTTERS` | Adopt shell constants + optional KPI strip | **P2** | Ready mode |
| 14 | Metrics duplication: `FbaBoardTable` `statusCounts` vs `ShippingKpiStrip`'s `ShippingFbaCounts` (`lib/tech/shipping-metrics.ts`) | Two independent FBA stage-count resolvers | New `src/lib/fba/fba-metrics.ts` (or grow `shipping-metrics.ts`) — one `ComputedMetric` resolver consumed by both `FbaKpiStrip` and `ShippingKpiStrip`; clickable KPI → status-tab filter behavior preserved | **P0** (FBA) / P1 (unify with `/test`) | Both FBA KPI surfaces |

## Dead code & import hygiene (P3)

Knip gate is green (current 3281 < baseline 3283). Dep-cruiser orphans +
knip-compact findings in the touched trees (grep-before-delete per
`knip-prune` skill):

**Orphan files (confirmed zero importers):**

- `src/components/dashboard/outbound-metrics.ts` — stale duplicate (Jul 12) of the live `src/lib/dashboard/outbound-metrics.ts` (Jul 16). Only the lib twin has importers/tests. **Delete.**
- `src/components/dashboard/OutboundQuickLegend.tsx` — no importers. **Delete after grep.**
- `src/components/dashboard/OutboundShippedLayoutTabs.tsx` — no importers. **Delete after grep.**

**Dead-after-refactor (Phase B/C outcomes):**

- `FbaWorkspaceSidebar` `!masterNavEnabled` pill block + its `FBA_MODE_ITEMS`/`modeItems` wiring (finding 3)
- `FBA_MODE_ITEMS` `HorizontalSliderItem` typing in `lib/fba/fba-modes.ts` → retarget to `TabSwitch` tab shape
- `PaneHeaderTabs` import in `FbaBoardTable` (check remaining consumers before touching the primitive itself)

**Unused exports (knip compact, touched trees — de-export, don't delete):**

- `src/components/fba/FbaStateShells.tsx`: `FbaLoadingState`, `FbaEmptyState`
- `src/components/fba/fba-scan-theme.ts`: `FBA_SCAN_FOCUS_RING`
- `src/components/fba/sidebar/FbaSidebarRails.tsx`: `FbaPlanRail`, `FbaCombineRail`
- `src/components/fba/sidebar/index.ts`: `AdminFbaSidebarPanel`, `FbaWorkspaceScanField`
- `src/lib/fba/fba-modes.ts`: `FBA_MODES`
- `src/lib/fba/status.ts`: `FBA_STATUS`, `FBA_LIFECYCLE`, `FBA_STATUS_PILL`, `FBA_ALLOWED_TRANSITIONS`, `canTransition`, `isTerminalFbaStatus`, `FBA_COMBINE_QUEUE_STATUSES`
- `src/lib/tech/shipping-metrics.ts`: `SHIPPING_METRICS`
- `src/utils/staff-colors.ts`: 8 unused staff-theme helpers (incl. `getPrintQueueTableUi`, `fbaFnskuChecklistChrome`)
- `src/components/dashboard/OutboundFilterStrip.tsx`: `OutboundFilterStrip` (named export; `OutboundExactFilters` is the live one)

No dangling `OutboundModeHeader` / `ScanOutStation` references found
(`ScanOutStationBar` / `useScanOutStation` are live, distinct symbols).

**Dead exports confirmed by sweep (0 importers, non-test):**

- `src/components/fba/sidebar/FbaSidebarRails.tsx`: `FbaPlanRail` (L129), `FbaCombineRail` (L180) — consumers import the `*Pills`/`*Body` halves directly; the composed wrappers are unused
- `src/components/fba/FbaStateShells.tsx`: `FbaLoadingState` (L8), `FbaEmptyState` (L58) — only `FbaErrorState` is live
- `src/components/fba/shared/FbaStatusBadge.tsx`: `FBA_STATUS_TOKENS` (L126)

No dead exports in `src/components/tech/shipping/` or `src/components/outbound/`.

## Full-sweep results (repo-wide heuristics)

- **`PaneHeaderTabs`** — 10 other consumers are canonical detail-panel/wizard section tabs (ShippedDetailsHeader, ReceivingDetailsStack, UnfoundMatchStrip, claim wizard, IncomingDetailsPanel, RepairDetailsPanel, …); only two flags: `FbaBoardTable.tsx:393` (lifecycle facets in a main pane — finding 1) and `OutboundShippedLayoutTabs.tsx:33` (borderline lens tabs — also an orphan file above, so deletion resolves it).
- **`HorizontalButtonSlider`** — zero main-pane violations in fba/outbound/tech (all sidebar rails = correct). Secondary out-of-scope candidates for a later pass: `studio/CatalogWorkspace.tsx:66`, `search/SearchResultsSurface.tsx:169`, `search/SearchHistoryWorkspace.tsx:87`, `walk-in/WalkInJobSwitcher.tsx:39`, `support/zendesk/queue/SupportTicketQueue.tsx:108`, `support/issues/IssuesQueue.tsx:160`, two mobile panes — each needs a facet-vs-filter judgment; not touched in this run.
- **Inline `KpiTile` grid** — `FbaBoardTable.tsx:349–388` is the *sole* violation repo-wide; every other consumer is a dedicated `*KpiStrip`.
- **Raw toolbar search `<input>`** — `FbaBoardTable.tsx:441` is the sole toolbar-search violation in the audited dirs.
- **Hand-rolled `rounded-2xl border` wrappers** (all count toward the surface-box ratchet baseline): `FbaBoardTable.tsx:510` (table shell), `ReadyQueueTable.tsx:130` (table shell), `outbound/labels/OutboundDocumentsPrintView.tsx:26` (page wrapper); lower-priority modal panels `FbaQuickAddFnskuModal.tsx:95`, `FbaCreatePlanModal.tsx:100`, `shipment-editor/FnskuSearchModal.tsx:65`, `AddTrackingPopover.tsx:167`. P0 work migrates the first two onto DS shell constants (ratchet goes down); modals deferred.

## Promotion candidates

- **`fba-metrics` resolver** — promote FBA stage counts to one `ComputedMetric` registry (2 consumers: FBA outbound strip + `/test` Shipping FBA tiles).
- **`workbench-shell.tsx` relocation** to `design-system/components/workbench/` — already flagged in the convergence log (cross-domain imports from station/repair); low priority, do during Phase E only if cheap.
- **Tab-body crossfade recipe** — after Phases B–D the keyed `AnimatePresence` + `workbenchPane*` pattern will exist on Dashboard/Shipping/Outbound/FBA; capture as a one-liner rule in `.claude/rules/display/workbench.md` (Phase E log entry).

## Risk notes (carried from plan + confirmed in code)

- `FbaBoardTable` selection is **window-event driven** (`FBA_BOARD_*` CustomEvents consumed by `StationFbaInput` + sidebar rails) — extracting the toolbar must not move `emitSelection` timing; keep the table owning selection state.
- Combine overlay (`FbaBoardRegion` L107–126) crossfades over the board at `absolute inset-0` — the new scroll shell must keep a `relative` ancestor with the same bounds.
- `contentClassName={showCombineBar ? 'pb-28' : undefined}` reserves space for the floating combine pill — preserve.
- Labels queue↔print crossfade (`OutboundWorkspace` L124–146) and the `LabelsOrderWorkspace` side panel must survive the shell wrap.
- Labels virtualization: `OrdersQueueTable` default shell inside `WorkbenchTablePane` today; full `DashboardScrollShell` grow-mode (`scrollParentRef`) is convergence-log increment 2 — do the shell wrap without breaking the boxed-table scroll, defer grow-mode if it blocks.
