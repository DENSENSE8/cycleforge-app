# Workbench branch `ops-queue` — Desk collection recipe

The **tabular queue** branch of Workbench: operator browses a dense ledger, refines with
**saved views** + lifecycle tabs, and peeks/edits via a **pushing right rail**. Default for Sales /
Fulfillment desk queues / Inbound pointer triage / Labels unification targets.

**Inherits:** [`workbench.md`](workbench.md) (contract). Support conversation-first is **not** this
branch — see [`workbench-service.md`](workbench-service.md).

---

## Composition

```text
┌──────────────────────┬────────────────────────────────┬─────────────────────────────┐
│ LEFT                 │ MIDDLE                         │ RIGHT                       │
│ ContextPanelLayout   │ WorkbenchChromeHeader (band)   │ RightRailHost               │
│ + SidebarShell       │ + primary Add / Print CTA      │ modal={false}               │
│ SAVED VIEWS list     │ + KPI strip (in scroll body)   │ scrollable form / inspector │
│ (useSavedViews)      │ + LedgerGridSurface            │ opened by row select OR Add │
│ optional filter map  │   URL selection                │                             │
└──────────────────────┴────────────────────────────────┴─────────────────────────────┘
```

| Slot | Must | Must not |
|---|---|---|
| **Left** | `useSavedViews` list (compose `OutboundSavedViewsList`). Optional thin filter facets *below* views. | Recent/MRU rails, room pickers, library trees as the **primary** left map |
| **Middle** | `LedgerGrid` / `LedgerGridSurface` + `GridSurfaceDescriptor` + `GridSurfaceCapabilities` + URL row selection | Hand-rolled boards / raw `<table>` as the collection map |
| **Right** | Non-modal `RightRailHost` form/inspector | Full-pane Station column shell replacing the grid; modal-by-default detail |
| **Top Add** | Chrome CTA opens empty/create on the **right rail** | Modal-only create when a rail form exists |

Scan Stations keep Station + sibling Workbench map — do not force this three-pane onto the scan column.
Hybrid multi-region exits: [`workbench.md`](workbench.md) → Multi-region pages.

Reference: `DashboardOrdersView`, `OutboundSavedViewsList`, `docs/todo/desk-contract-unification-CLAUDE-CODE-PROMPT.md`.

---

## The top axis is DIRECTION (+ front-desk commerce)

Ratified 2026-07-29 (`docs/todo/dashboard-ia-rework-PLAN.md` §10.2 rows H + I); Sales domain
amended 2026-07-30 (`docs/todo/sales-into-dashboard-PLAN.md`).

A multi-domain Workbench page's top axis splits by **physical direction of flow**
(`?mode=inbound` | bare outbound) **plus** front-desk commerce history when that collection has no
other L1 home (`?mode=sales` | `?mode=pickup`). Never by entity type
(`Orders · FBA · Repair · Sales` as peers of each other).

**The predicate for what earns a top-axis slot** — all three, or it is not a slot:

1. It **owns a distinct collection surface** (its own `LedgerGrid`/`GridSurfaceDescriptor` / feed),
   not a filtered view of a sibling's.
2. It is a **Workbench / Monitor browse region** — pointer-driven pick+edit or observe. A
   scanner-driven Station fails here.
3. It has **no home elsewhere**. A domain that already owns a page or an L2 mode does not get a
   second front door.

Worked verdicts: **Orders** passes. **Receiving** fails (2) — it is a scanner-driven Station at
`/unbox`; the dashboard's `inbound` domain is its pointer-driven *counterpart*, not the Station
itself, and merging them is the anti-mix regression this whole doc opens with. **FBA** and **Repair**
fail (3) — FBA lives at `/shipping/fba` (legacy `/shipping?mode=fba` redirects there), Repair is a
Receiving mode. **Sales** passes after its L1 `/walk-in` home is deleted — it owns the walk-in
transaction feed, is Monitor browse, and lands as the dashboard `sales` domain
(`?mode=sales` / `?mode=pickup`); counter intake stays on `/pickup` + `/repair`.

**Why direction (+ commerce) beats a full entity axis.** An entity axis reads cleaner on a nav
diagram and is the right default for a *catalog* console (Shopify, Linear), where every top-level
value is the same kind of thing: a pointer-driven list you filter. This app's entities are not the
same kind of thing — one of them is a scan bench. Direction matches what a 1–15 person floor
physically switches between (the dock vs. the ship station); commerce history is the third browse
collection that shared the Sales L1 page and now shares the dashboard shell without widening to
FBA/Repair (they keep their homes).

**Consequence — an axis value that stops owning a table is a deletion candidate, not a tab.**
The vestigial `'fba'` member of `DashboardOrderView` was deleted 2026-07-29 (IA row L): FBA owns
`/shipping/fba`, and no nav entry constructs `?fba`.

## Tabs vs. saved views — the boundary rule

Both ship, and they are not two ways to do one thing. The line is **who defines the set**:

| | Hardcoded tabs | Saved views |
|---|---|---|
| Defined by | the **system** | the **operator** |
| Represents | a mutually-exclusive lifecycle **state transition** | a named **facet combination** |
| Example | Pending → Tested → Packed → Shipped | "late eBay units, oldest first" |
| Cardinality | fixed, 3–5, same for every staffer | open-ended, per staffer |
| Lives in | the lifecycle strip (`WorkbenchChromeHeader` left) | the sidebar filter map / table ⋮ menu |

**The test:** if adding one more of them would require a **migration or a status-machine change**, it
is a tab. If it is just a different combination of params the surface already reads, it is a saved
view.

- **Never ship a saved view that reproduces one lifecycle tab** ("all Packed orders") — that is the
  duplication this rule exists to prevent, and it desyncs the moment the tab's query changes.
- **Never grow the tab strip to hold a filter** ("Late", "eBay only"). A tab that is a filter is a
  saved view wearing tab chrome, and it costs every staffer strip width to serve one workflow.
- **One core, many faces.** `useSavedViews` (`src/hooks/useSavedViews.ts`) is the single
  storage + URL-apply implementation; a surface supplies only `storageKey` + `paramKeys` and its own
  UI. Exactly two consumers: `OutboundSavedViewsList` (dashboard sidebar) and `TableOptionsMenu`
  (station + testing history ⋮). Never fork the apply-to-URL logic for a new surface.
- **One store, three faces (the split-brain is CLOSED — 2026-07-29).** Every saved view, on every
  surface, lives in the polymorphic **`saved_views`** table (org-scoped, `staff_id`-owned,
  `is_shared`). `2026-07-29g_saved_views.sql` created it; `2026-07-29h` dropped the
  `operations_saved_views` / `media_library_saved_views` duplicates. `useSavedViews` writes it
  through `/api/saved-views` and **no longer touches localStorage** — a dashboard view now follows
  a staffer to a second device.
  - The `storageKey` prop kept its name for call-site stability; it resolves to a DB `surface`
    discriminator via **`src/lib/saved-views/surfaces.ts`**. That module is the SoT for the
    discriminator: **keep `SAVED_VIEW_SURFACES` in lockstep with the `saved_views_surface_chk`
    CHECK** in the birth migration, or a new surface fails its first insert.
  - Ops and Media Library keep their own hooks/routes (`useOperationsSavedViews`,
    `useMediaLibrarySavedViews`) because their UIs differ. **Three client hooks over one store is
    not a fork** — the thing that must never be duplicated is the storage and the apply-to-URL
    logic, and there is exactly one of each. Do not "consolidate" the hooks for symmetry.

---

---

## Sticky docking — one sticky layer per scroll port

**Never stack two `sticky top-*` bands inside the same scroll port.** The lower band has to know the upper band's height to dock beneath it, and a hardcoded offset (`top-[var(--x,72px)]`, a guessed px) drifts the moment the upper band's real height differs — the seam/overlap bug. z-index orders *front-to-back*; it says nothing about *vertical docking*, so a second sticky band is never made safe by a higher `z-`.

**House pattern (the fix): pinned chrome OUTSIDE the scroll port.** The single always-visible top bar (lifecycle tabs + filters) renders in a non-scrolling slot **above** the `overflow-y-auto` body; the body then has exactly one sticky layer — the day-band `DateGroupHeader`s at `top-0` — which docks directly under the chrome with **no offset math**.

- Reference: `DashboardScrollShell`'s `chrome` prop (`src/components/dashboard/DashboardScrollShell.tsx`) — the chrome slot owns the `z-header` band as a non-scrolling sibling; To-ship / Shipping / Testing / Pack pin tabs · KPI · triage there and mount the grid in `WORKBENCH_SHEET_HOST` (never a body `mb-4` KPI island).
- Anything that is not always-visible chrome (KPI strips, banners) belongs in the body, never the chrome — **default rule; Unbox carries a scoped, documented exception below.**
- **In the body ≠ scrolls away.** On a lane whose table is a **bounded host**
  (`workbenchTableViewportClass` → `h-[calc(100dvh-13rem)]`), the grid owns Y
  scroll internally, so the body never grows with row count and an in-body KPI
  strip effectively stays put. That is deliberate — an unbounded card grows past
  the fold and loses the bottom edge that sells its elevation
  (`WORKBENCH_TABLE_VIEWPORT` docblock). Do not "fix" a KPI that does not scroll
  away on such a lane; the sticky layers that matter there live inside the
  **grid's** port (column header at `top-0`, day bands), not the page's.
  Pinned by `to-ship-pending-grid.spec.ts` → "the bounded host keeps the KPI
  pinned and the card fully on screen".
- Only reach for a **measured** offset (ResizeObserver → CSS var per layer) if a port genuinely needs 3+ dynamic-height sticky bars — the two-zone shell removes the need in every current surface. A fixed px offset is never the answer.
- z bands stay from the SoT (`src/design-system/tokens/z-index.ts`): chrome/top bar = `z-header`, in-body pins = `z-raised`/`z-sticky`. Never hardcode `z-[NNN]`.

**Scoped exception — Unbox flush sheet chrome (tabs · KPI · triage) + Sheets grid (shipped 2026-08-03; flush 2026-08-04).**
Unbox (`UnboxWorkspaceHeader.tsx`) is a **three-band pinned chrome** — static siblings inside the SAME non-scrolling `WORKBENCH_SHEET_CHROME` slot (`flex flex-col gap-0`). This is still "one sticky layer per scroll port," because no band is independently `position: sticky`; the stack reads as one taller pinned block, not competing bands. Hosts + sheet token: [`source-of-truth.md`](../source-of-truth.md) → Ops table / spreadsheet surface shell.

```text
Band 1  [ Inbound · Queue · Recent · History ]                    [ Check | Unbox ]   ← PRIMARY_CHROME_ROW_FACE, border-l-0
Band 2  [ KPI canvas — WorkbenchKpiBand ]  (snap-collapsible)                        ← owns border-b seam
Band 3  [ 🔍 find ……………………………… ▽ refine ]              [ ^ KPI ] [ ▥ inspector ]   ← the LEAN row, border-r only
        ── single hairline ── sheet border-t ── LedgerGridColumnHeader PRIMARY_CHROME_ROW_FACE ──

        Band 3 has NO right slot and NO controls portal. Compare panes, zoom,
        ▦ column display and the week pill live on the inspector View cluster
        that [ ▥ ] opens. Pinned Inbound renders no Band 3 at all.
```

- **Flush, not islands.** Chrome uses `WORKBENCH_SHEET_CHROME` (rail-abutting — no `WORKBENCH_CHROME_COLUMN` gutters). Tab band: `WorkbenchChromeHeader density="band"` with `rounded-none border-l-0 border-t-0` (GlobalHeader owns the top seam). Triage and KPI: `border-r` / `border-b border-r` against the sheet plane — **never** `cornerClass('card')` islands floating on sunken ground.
- **Band 1 = tabs + return-to-scan CTAs** (`WorkbenchTrailingCluster.actions`). The optional `middle` prop on `WorkbenchChromeHeader` remains available for other surfaces that need a single-line readout in the 40px face; Unbox no longer parks KPIs there. **Unbox Band-1 (2026-08-04):** Urgent|Recent|Queue|All|History — Urgent owns `?priority_only=1` on `view=scanned`; All → `TechAllTriageTable scope="unbox"` (inbound-typed triage; repair/pickup deep-link). KPI canvas for Urgent/All reuses Queue feed metrics via `unboxKpiFeedTab`.
- **Band 2 = KPI row** — `WorkbenchKpiBand` wraps `UnboxChromeKpiCluster` → `UnboxKpiCanvas`: a **compact Usage strip** (`text-role-micro` quiet `?urange=` / stage / lane text · `KpiChartCard density="compact"` with tiny spark only — no solid TabSwitch, no Tile/Bars/Pie/Line switch, no `GaugeDonut` / high-line). Clickable `?ukpi=` still filters the table. **No LedgerGrid inside Band 2.** **Snap-collapsible** (binary open/closed): drag the bottom hairline past a threshold, or use Band 3’s **`kpiToggle`**. Persist `staff_preferences.kpiCollapsed[surface]` via `useWorkbenchKpiCollapsed` (`WORKBENCH_KPI_SURFACE.unbox`). Closed → height 0 + thin residual grab; sheet host flexes. Cohort ports compose the same SoT — never a page-local collapse twin. Guard: `workbench-kpi-collapse.guard.test.ts`. Data: `GET /api/receiving/unbox-kpi` + `unbox-metrics` series.
- **Band 3 = data-table triage / command row** — compose SoT `WorkbenchTriageBand` (`PRIMARY_CHROME_ROW_FACE`, `border-r` only — **no** `border-t` / `border-b`; the sheet owns the seam below). **Left = scanner ingestion** (`search` flush to the sheet edge — never indented by a utility toggle). **Right = `kpiToggle` → `trailing` inspector, and nothing else on Unbox** (the generic band still allows pagination · display sort · controls portal). Shows on every Unbox **sheet** tab — Queue · Recent · All · History; pinned Inbound renders no band (honest absence: no search, no KPI band, no desk peek). Shared SoT slot: `WorkbenchTriageBand.kpiToggle`.
  **Refine left the right zone codebase-wide 2026-08-08** — a facet that narrows the ROWS (staff · staging · source · search field · attention · week) rides **in the find field** (`trailingSuffix`, `density="field"`), so the dominant find carries the row and refine stays adjacent to the query it refines. A control that changes how the same rows are LAID OUT stays right. Three documented residents keep the right zone because they are not a single field-density glyph: `OutboundExactFilters` (Urgent + Filters pair — Shipping / Pack / Labels queue tabs), Incoming's pagination + sort, and My Day's due-horizon chips (live counts per horizon — `trailingSuffix` is a one-glyph slot). A tab with **no find field at all** (Shipping / Pack History) keeps its staff facet on the right — there is no in-field slot to move into, and inventing a find bar to host one would be worse; those two are the `RIGHT_ZONE_FACET_RESIDENTS` allowlist. **A raw `<select>` is never a resident** — it is a second filter grammar beside `WorkbenchFilterPopover` *and* soft radius on ops chrome. Locations' room facet shipped one in `right` until 2026-08-08; it is now `WorkbenchFilterPopover density="field"` in the find field's `trailingSuffix`. **The ▦ card-corner hover-reveal float is deleted (2026-08-08)** — column display is portal-or-nothing (Band-3 controls slot or inspector View cluster); a surface with neither paints no ▦ and owes a host.
  **Honest absence states its reason.** `NO_DESK_PEEK_SURFACES` carries one line per surface saying why no peek exists, so the next agent reads the reason before calling an empty right edge a bug. **Testing (incl. the Returns queue) is the ruled case (2026-08-08):** rows claim the bench — `dispatchSelectLine` → `TestingPanel` covers this whole browse, so Band 3 leaves the screen the moment a row opens — and the one reusable peek (`HistoryCartonTriagePanel` @ `detail:history`) mounts `HistoryViewChromeBridge` + `HistoryViewTopicsCluster`, i.e. Unbox History's sheet layout chrome for a sheet Testing does not have. A Testing peek therefore means a NEW occupant + panel + topic map plus a changed selection semantic on a live floor queue: a product decision, not a wiring line. Never mount the toggle first.
  Guard: `band3-find-only.guard.test.ts` (walks every band mount — dominant find, in-field staff refine, no raw `<select>`, inspector copy, one toggle implementation, three shrink-only lists) + `receiving-grid-sheet.guard.test.ts` + `workbench-kpi-collapse.guard.test.ts`.
- **Unbox Band 3 = the LEAN row, every sheet tab (2026-08-08; Refine funnel 2026-08-05).** Dominant `TechRailSearchBar` (`flex-1`) with in-field `WorkbenchFilterPopover density="field"` **Refine** funnel — top labeled facet tabs (`HISTORY_REFINE_FACETS`: Staff · Source · Field · Week) showing **one** option body at a time; query facets wire `staff` · `rh_scope` · `rh_field` · `weekOffset` — **no** Band 3 refine icon cluster. Sheet **layout** chrome (paint · Drill|List · compare · zoom · ▦) lives on the `detail:history` inspector **View** topic cluster (`history-inspector-topics.ts` + `HistoryCartonTriagePanel`), reachable from **every** sheet tab since 2026-08-08 — on the non-History tabs the cluster is always `viewOnly`, so it renders compare · zoom · ▦ only (paint + Drill need a picked carton). **KPI collapse is NOT in that cluster** — it is the Band 3 `kpiToggle`, one door, because Band 3 is on screen while the inspector is parked. Far-right **inspector toggle** (`trailing`) parks/reopens via `DETAIL_STACK_COLLAPSE` and opens a View-only shell when no row is selected — which is now the only path to compare/zoom/▦, so it is `enabled` on every sheet tab (gating it to History would strand an operator in `?clayout=split` with no way back to one pane). Four amendments are load-bearing: the View cluster publishes a **null** ▦ portal target while hidden or parked (else ▦ vanishes into an inert node — and there is no fallback behind it; parked simply means no ▦ until the operator unparks from Band 3); the ⌘+/⌘-/⌘0 zoom chords live in `HistoryViewChromeProvider`, not in `UnboxCompareChrome` (which now unmounts with the rail); the View-only shell must **not** feed `ReceivingLineRailShell.inspectOpen` (it owns no row selection, so it would silently kill multi-select print / claim / copy); and it clears on `receiving-workspace-open` / `receiving-select-line`, or it sits beside `LineEditPanel` as a banned second right column. Operator copy: **Show / Hide inspector** — **not** Station pane **Open displays** (`StationDisplaysEdgeToggle` opens the Displays column on `LineEditPanel`). The inspector is **`HistoryCartonTriagePanel`** (RightRailHost push) — **not** Band 3, **not** Arrival `TriagePanel`, and **not** Station Displays. Wedge find writes the same `?rh_q=` bag (`classifyHistoryCommandScan`). Law: source-of-truth.md → Displays vs inspector. Guard: `receiving-grid-sheet.guard.test.ts` + `history-carton-triage.guard.test.ts` + `workbench-kpi-collapse.guard.test.ts`.
- **Why this doesn't reopen the "never stack two sticky bands" hazard:** bands are fixed siblings in one non-scrolling chrome slot, not independently sticky layers that must infer each other's height. The grid column header shares `PRIMARY_CHROME_ROW_FACE` with bands 1 and 3.
- **Three-band shape** — History query facets (staff · scope · field · week) stay in-field on Band 3 find; View cluster owns layout chrome only. Never invent an Unbox-only triage-band twin. Do not invent twins for surfaces that already park search/filters on Band 1 — except when matching the flush Sheets recipe.
- **Incoming three-band flush (2026-08-04; find-only 2026-08-08).** `/incoming` (`IncomingWorkspaceHeader`): Band 1 Pipeline|Docked + labeled Check/Import/Add · Facet All|Zoho|eBay · Band 2 `IncomingKpiStrip` · Band 3 `WorkbenchTriageBand` — **flex-1 find** with source + attention/date + search-field refine **in-field**; right = icon pagination · icon sort · ▦ · KPI; far-right **Show / Hide inspector**. `IncomingDetailsPanel` dropped `edgeCollapse={false}` and took `collapsedStrip={false}` in the same change (To-ship twin): Band 3 owns park / reopen, the header `→|` still closes. KPI owns `border-b`; triage `border-r` only. Column headers icon-only (`headerGlyphOnly`). Click-select on Pipeline. Guard: `incoming-grid-sheet.guard.test.ts`.
- **To-ship three-band flush (2026-08-04; find-only Band 3 + View topics 2026-08-05).** `/shipping/orders` (`DashboardOrdersView`): Band 1 tabs + Import/Add only · Band 2 `OutboundKpiStrip` · Band 3 `OutboundTriageBand` (`WorkbenchTriageBand` — **flex-1 find** + far-right **Show / Hide inspector** only; **no** Band 3 refine icon cluster). Sheet layout / refine (paint · List|Drill · compare · filters · icon Priority · staff · ▦ · KPI collapse) lives on the pushing right inspector **View** topic cluster (`OrdersViewTopicsCluster` via `orders-view-chrome-context` bridge) — mounted on `detail:order` / `detail:order-compare` / `detail:order-batch` and View-only `detail:orders-view` when no row is selected. Inspector park: `edgeCollapse` + `collapsedStrip={false}` (Band 3 owns reopen). **▦ is portal-only** — house-wide since 2026-08-08, so the `columnTriggerPortalOnly` opt-out prop no longer exists; no View host means no ▦. Tab band: `rounded-none border-l-0 border-t-0`. KPI: `border-b border-r`. Triage: `border-r` only (sheet owns `border-t`). **Sheets click-select** when `railSelection`: row click toggles bulk, double-click opens; select track keeps the painted `'always'` checkbox gutter (header select-all + every leftmost row cell via `GridRowCheckbox`). Condition on Product is a dot-led `GridStatusCellValue` chip (not bare caption text). Body may be list, `OrdersDrillHost` (`olayout=drill`), or `OrdersCompareHost` (`clayout=split|quad`) — mutually exclusive. Guards: `dashboard-orders-sheet.guard.test.ts`.
- **Testing three-band flush (2026-08-04).** `/test` (`TestingWorkspaceView`): Band 1 Urgent|Returns|Pending|All|History · Band 2 `WorkbenchKpiBand` → `TestingKpiStrip` · Band 3 `TestingTriageBand` (`WorkbenchTriageBand` + `WorkbenchKpiCollapseToggle` — search left; right = staff · icon Priority · controls portal). All → `TechAllTriageTable` (typed triage). No `WorkbenchTablePane`. Guard: `testing-workspace-sheet.guard.test.ts`.
- **Pack three-band flush (2026-08-04).** `/pack` (`PackWorkspaceView`): Band 1 Queue|History + New Order · Band 2 `WorkbenchKpiBand` → `PackKpiStrip` · Band 3 `PackTriageBand` (`WorkbenchTriageBand` + KPI collapse — search/filters on Queue; staff on History · controls portal). Guard: `pack-workspace-sheet.guard.test.ts`.
- **Shipping three-band flush (2026-08-04).** `/test` Shipping (`ShippingWorkspaceView`): Band 1 Urgent|Pending|All|History + New Order · Band 2 `WorkbenchKpiBand` → `ShippingKpiStrip` · Band 3 `ShippingTriageBand` (`WorkbenchTriageBand` + KPI collapse — search/filters on Pending/Urgent; staff on History · controls portal). Urgent owns `?attention=1`. All → `TechAllTriageTable`. No `WORKBENCH_TABLE_VIEWPORT` / gutter columns. Guard: `shipping-workspace-sheet.guard.test.ts`.
- **Cohort sweep flush (2026-08-04).** The remaining guttered lifecycle workspaces were pinned to the same flush stack (Band 1 tabs + solid CTAs · optional Band 2 KPI · Band 3 `WorkbenchTriageBand` find/refine · flush `WORKBENCH_SHEET_HOST` body):
  - **Triage / Arrival** (`TriageWorkspaceView` + `TriageTriageBand`): Band 2 `WorkbenchKpiBand` → `TriageKpiStrip`; Band 3 `?triq=` filter + staff. Guard: `triage-workspace-sheet.guard.test.ts`.
  - **Labels station** (`LabelsWorkspaceView` + `LabelsTriageBand`): Band 2 `WorkbenchKpiBand` → `LabelsKpiStrip`; Band 3 search + `OutboundExactFilters` + icon sort; Band 1 keeps Import/Add. Guard: `labels-workspace-sheet.guard.test.ts`.
  - **Scan-out** (`ScanOutWorkspace`): single-lane (scan bar is in the sidebar) → honest absence of tabs/KPI; staged queue flush in the sheet host. Guard: `scan-out-workspace-sheet.guard.test.ts`.
  - **Review family** (`ReviewPackingTable` · `ReviewPairingTable` · `ReviewCatalogLinkTable`): no KPI (honest absence); Band 3 search (+ staff on Packing/Pairing). Guard: `review-workspace-sheet.guard.test.ts`.
  - **Support** (`SupportTicketsBoard`): ticket board is a flush spreadsheet plane (no monitor card); Band 3 search + refresh + sort; the `SupportTicketFocus` THREAD (service-workspace) stays flush but keeps its PaneHeader + glass conversation (not a grid). Guard: `support-workspace-sheet.guard.test.ts`.
  - **Pickup · Repair · Catalog · FBA** (grid) and **Photos · Labels products · Walk-In hub + feed** (tool / media / feed — flush only, no forced grid stack). Guard: `workbench-cohort-wave7-sheet.guard.test.ts`.
- **Full re-sweep residual (2026-08-05).** Closing the last gaps against the five-row Unbox History SoT: (a) **standalone `/receiving/history`** now flushes — `HistoryWorkspaceHeader` is Band 1 tabs only, find/refine/week moved to a Band-3 `HistoryTriageBand` (`WorkbenchTriageBand`), host swapped `WORKBENCH_CHROME_COLUMN` → `WORKBENCH_SHEET_CHROME` (that export + `WORKBENCH_GUTTERS` are **deleted**; the framed-gutter chrome recipe is retired). (b) **`surface="sheet"` pinned** on the 8 residual GridViews (Pickup · Repair · Catalog · Review catalog-link · Warranty · Unfound · Tracking exceptions · Ready) — a `LedgerGridSurface` with no `surface=` fell back to the framed CLIP default. (c) **Ready KPI folded into FBA Band 2** — `ReadyWorkspaceBody` no longer parks an `mb-4` `ReadyKpiStrip` island; the disposition tiles are `ReadyKpiBand` in the pinned chrome (deduped query). (d) **Triage twins collapsed** — `LocationsTriageBand` **deleted**, and Unbox composes the SoT `WorkbenchTriageBand` (grown one `controlsSlotClassName` prop for the `contents` portal); no page-local Band-3 twin remains. (e) **Band-1 search cleared** on My Day + Labels products → Band-3 `WorkbenchTriageBand` (Photos entry-path search stays a documented exception). Guards: `receiving-grid-sheet` (History) · `workbench-cohort-wave7-sheet` (residual grid pins + Labels viewport) · `review-workspace-sheet` (catalog-link pins) · `ready-workspace-sheet` (KPI fold) · `locations-sheet` (SoT triage) · `my-day-sheet` (Band-1 no search). **Documented follow-ups (grid pinned, host chrome not yet migrated):** Warranty (bare padded host) · Unfound (plain host) · Tracking exceptions (bespoke `FilterBar`) — the grid is a sheet; a full three-band chrome migration is a separate port.

**Chrome face density (`WorkbenchChromeHeader`).** Two densities on one SoT — never a page-local twin tab band. `default` is the content-driven raised card (`gap-2 p-1.5` + md solid-hug tabs with their own rail) — escape only when a surface cannot use the band face. **`density="band"` is the house standard** for every lifecycle `WorkbenchChromeHeader` consumer (Outbound, Incoming, History, Unbox, Triage, Pack, Testing, Shipping, Labels, Ready, FBA, Walk-In, Repair, Support, Review, …): compose **`WORKBENCH_CHROME_BAND_FACE`** (`PRIMARY_CHROME_ROW_FACE` + **`gap-0 p-0`**) + `TabSwitch size="sm"` on a **flat** rail (`border-0 p-0`). **Leading boxed cubes abut the tab rail** (Unbox pin-list | Inbound — same flush grammar as carton Exit / classify `gap-0`); **never** host `gap-2` or `p-0.5` air between pin and first tab. Active pill may use `nestedCornerClass('card', 0.5)` on the TabSwitch track itself — inset lives on the rail, not the band host. No nested bordered TabSwitch card, no `rounded-full` mismatch. Lifecycle tabs are **text-only** (no leading icons for Queue · Viewed · History-style states). When beside a floated context panel / scan dock, wrap with `WORKBENCH_CHROME_BESIDE_SCAN` (`py-2` = panel `m-2`) so the band face shares a Y row with `receivingScanBandClass` — never flush with `py-0`. Guard: `workbench-chrome-band.guard.test.ts`.

**Trailing Display & Actions (`WorkbenchTrailingCluster`).** Display sort (`QueueSortSwitch`) lives in the **pinned page chrome trailing cluster** on most workbenches — not an in-card Sheets-like action bar (that would stack a second sticky band — forbidden above) and not GlobalHeader. **Incoming exception:** icon-only sort + pagination live on Band 3 triage; Band 1 trailing is solid CTAs only. **To-ship exception (Unbox History twin):** icon Priority + sheet refine live on the right inspector **View** cluster — Band 1 trailing is solid CTAs only (Import/Add); Band 3 is find + inspector park only. Compose `WorkbenchTrailingCluster` as `WorkbenchChromeHeader`’s `trailing` prop with honest absence: **Sort → actions** (`before` / `after` escapes for pagination / refresh only); a surface with neither passes no `trailing` at all. `actions` holds solid CTAs — Import / Add on desk queues, and on **hybrid scan stations** the mandatory **return-to-scan** primary (every strip tab, top-right of the pinned chrome — same row as or above any KPI display, never below it — [`workbench.md`](workbench.md) → Multi-region). Filters / refine stay in `right` on Band 1 **or** Band 3 triage when the surface uses the three-band Sheets recipe (query ≠ display) — **except** Unbox History + To-ship, where refine lives on the inspector View cluster. Leading hairline only when `actions` are present. Solid CTAs (and the Unbox History week calendar beside that hairline) use `WORKBENCH_CHROME_PILL_CLASS` — the band History tab radius on **all** sides (`… quiet rail [Calendar]|[CTA] …`); never square-flat against the hairline. Law: `source-of-truth.md` → Workbench chrome pill. Multi-select triage stays on `ContextualSelectionBar` (bottom) — never morph the top bar. Guard: `workbench-trailing-cluster.guard.test.ts`.

**Column display is NOT chrome — it belongs to the grid, and it reserves nothing** (ratified 2026-08-02). `WorkbenchTrailingCluster` has **no `fields` slot**, and `GridFieldsMenu` is deleted. The single operator entry is `GridColumnGutter` — mounted by `LedgerGridSurface` (`columnDetails={{ open, onOpen }}`), or hand-wrapped by a view that composes `LedgerGrid` directly (Orders) — and it opens the non-modal **pushing** `GridColumnDetailsPanel` rail (`detail:grid-column-details`, `PaneHeaderCloseButton` `→|`): visibility · any-color highlight · chip · **Reset to default** (widths included). **The `▦` trigger portals into the surface's Band-3 `WorkbenchTriageBand` controls slot (the norm, generalized 2026-08-06 — pass the slot as the grid's `columnTriggerPortalTarget`), sitting resident among the refine icons (staff / filter / week / sort);** **Unbox History + To-ship exception:** ▦ portals into the inspector **View** topics controls host instead. It hover-reveals over the card's top-right corner only as a fallback for a surface that has no Band-3 / View host.

- **Why it left page chrome.** Fields mutates the column set of the card it sits on, so a page-chrome control acting on that card is an altitude mismatch — the thing that reads as "internal tool" even when the atoms are right. The migration also *removed a fork*: seven surfaces shipped **both** doors onto the same rail id, because `GridFieldsMenu` mounted `GridColumnDetailsPanel` itself and so did every grid view.
- **Why it is not resident anywhere.** Three placements were tried in one day and two were paid for twice over. A permanent `w-9` track plus `pr-9` on the header row charged every ROW of every grid; dropping that padding let the control **cover the last column's label** (`TRACKING`); and a page gutter beside the card charged every PAGE — the same standing rent in a different budget, visible as dead canvas in every queue screenshot. Hover-reveal costs neither, which is why it wins. The reveal is `group-hover` **plus** `focus-within` (hover alone is keyboard-unreachable) **plus** `open` (a trigger that left with the pointer would strand the rail it opened). `pointer-events` follows visibility, or an invisible box eats the header cell's clicks. The E2E asserts invisible-and-inert at rest — the one thing every resident version would have sailed through.
- **Band-3 eliminates the discoverability cost (2026-08-06), and the float is gone (2026-08-08).** When the surface has a Band-3, the trigger is a **resident** icon there beside staff / filter / week / sort — no hover to discover — and it reserves nothing new, because the Band-3 is an existing band, not a new header track or page gutter. **The card-corner hover-reveal is deleted, and the Notion / Airtable argument for it is explicitly reversed:** "table chrome materialises on the table you are pointing at" is the grammar of a pointer-precise authoring tool, and it was never paid for here — the float overlapped the first column header, and an operator who does not know the control exists cannot hover a corner to find it. A surface with no host paints no ▦ and owes one.
- **Neither header may mount it.** `LedgerGridColumnHeader` and `OrdersQueueColumnHeader` take no `onOpenColumnDetails`; the guard bans the prop, the marker, and `pr-9` in both.
- **This does not weaken "one sticky layer per scroll port".** What that law bans is a **second sticky band above the grid** — a `TableActionBar` — and that ban is unchanged and still guarded. The gutter is outside the port entirely, so it cannot add one.
- **The trigger is icon-only** (`ColumnsThree` + `HoverTooltip` "Column display"), `aria-haspopup="dialog"`, filled while the rail is open, muted at rest. Never a numeric badge on the glyph.

---

## Collection layouts — list vs drill vs compare

Three jobs, three SoTs — never conflate them on any LedgerGrid family:

| Mode | What it is | SoT |
|---|---|---|
| **List** | One flat leaf sheet — no in-grid PO/order summary headers | Domain group row renders leaves only (e.g. `ReceivingGridGroupRow`, `QueueGroupRow`, `PickupGridGroupRow`) |
| **Drill** | Linked dual panes — left **parents drive** right children; **parent rollups live only here** | `@/design-system/components/grid` `LedgerDrillHost` + `LedgerDrillParentMap` + `ledger-drill-layout` |
| **Compare** | Independent multi-pane — each pane owns its own query | Domain compare host (e.g. `UnboxCompareHost`) |

**Drill is WMS-wide**, not receiving-only. Any table that needs parent→child expansion
(orders→lines, PO→items, shipment→parcels, …) composes `LedgerDrillHost` with a thin
domain adapter that supplies parent titles/meta, the child `LedgerGridSurface`, and a
URL contract (`layoutParam` / `parentParam` via `LedgerDrillUrlContract`). Resize
persists under a **surface-unique** `storageKey` (e.g. `cf.receivingDrill.splitRatio`).
Narrow viewports use list-OR-detail — never two crushed grids.

### Receiving History binding

| Mode | Where |
|---|---|
| List | History default (omit `hlayout` or `hlayout=list`) · Recent / Queue always — flat leaves |
| Drill | `?hlayout=drill` + `?drillPo=` → thin `ReceivingDrillHost` (parent map = PO rollups) |
| Compare | `?clayout=split\|quad` + `c0`…`c3` |

### To-ship Orders binding

| Mode | Where |
|---|---|
| List | Default (omit `olayout` or `olayout=list`) — flat product lines |
| Drill | `?olayout=drill` + `?drillOrder=` → thin `OrdersDrillHost` (parent map = order rollups) |
| Compare | `?clayout=split\|quad` + `c0`…`c3` |

**Drill find:** parent-map footer pins `TechRailSearchBar` `variant="rail"` bound to `?rh_q=` (same server filter as List chrome search). Chrome triage search is omitted in drill so there is one find surface — rail anatomy matches the Unboxed recent rail, including **`RailFilterCollapseButton` in `trailingAction`** (parks the parent map via `LedgerDrillHost` / `useLedgerDrillCollapse`). List mode keeps the chrome search.

Do not overload `clayout` for drill. Do not put parent→child linkage into compare panes.
Do not fork a page-local dual-pane shell — compose `LedgerDrillHost`.
Do not mount in-grid PO/order summary headers on the list sheet — those parent
summaries belong on the drill parent map only.

---

## Row anatomy — a fact belongs to its own COLUMN

Ratified 2026-08-02. Seven rulings, one idea: **a column is the only address at which a fact can be
sorted, hidden, resized, highlighted and aligned with its own kind.** A fact parked in a neighbour's
cell has none of that, and it spends that neighbour's width to say something twice. Applies to every
LedgerGrid family.

1. **No status dot in the identity cell.** The title column shows the title. A dot there cannot be
   turned off by the operator who does not want it, moves when the *title* is resized, and repeats
   what the status column already says. Removed from receiving (leaf + fold), incoming (leaf +
   fold), pickup (leaf + group) and Today. *This is where the grid families deliberately diverge
   from list/accordion rows, whose `META_COL` dot track is correct precisely because a list has no
   columns — see `ui-design-system.md` → One row anatomy. Both rules are live.*
2. **The status column is a dot INSIDE the house chip** — `GridStatusCellValue`
   (`@/components/ui/grid-cells`), tone from the surface's lifecycle registry, never a page-local
   chip (four surfaces had grown one). Rationale in `ui-design-system.md` → Eyebrow headers + chips.
3. **A civil day and its stamp share ONE column.** Split apart, the stamps stop aligning down the
   axis an eye runs, the pair sorts and resizes as one thing, and both tracks have to be sized for
   the worst case of the other. Receiving's `date` shows the civil day; full
   stamp lives on hover — **audited 2026-08-02,
   no other family splits them** — and a column left holding only the other column's value is a
   deletion, not an opt-in (receiving's `stage` went that way).
4. **Freeze is per-surface — see Grid identity pane.** **Orders** freeze
   `select · order · sla · title` (order + ship-by urgency + product; Product is
   the sole flex / resize track). **Unbox / History / Testing** freeze
   **`select · order`** (PO identity); Date and Product scroll with the sheet
   (ruled 2026-08-05). **Incoming Pipeline** freezes **`select` only**. Frozen
   columns remain structural ⇒ no `hideKey`, no `tier`; the pane must stay a
   **contiguous leading prefix**. Column order is pinned to each surface's
   layout SoT (no staff drag-reorder). Catalog /
   Repair / Pickup keep their own panes. Full table:
   [`source-of-truth.md`](../source-of-truth.md) → Grid identity pane. Operator-editable freeze
   (pin any column) is future.
   **Tiny / sparse Product demotions (Orders):** note · OOS corners live on
   Product rather than earning their own tracks. **Cond** is its own column
   after Product (Unbox adjacency) with the Unbox flush grade face
   (`conditionGradeTextClass` + table label) — hideable via Fields.
5. **Qty / column header labels — per surface.** Declare glyph-only with
   **`headerGlyphOnly: true`** (keeps the full `label` as `sr-only`) — never
   `gridLabel: '#'` (draws `# #`) and never by starving `labelFitRem`.
   - **Orders** (order still frozen): Qty may be `#` alone — frozen PO and
     scrolling `#` sit on opposite sides of the identity pane.
   - **Unbox / Receiving** (order frozen as identity): keep the **word**
     `Qty` so `# Order` and bare `#` do not share one scan path (`number` and
     `id` both map to Hash).
   - **Incoming Pipeline (2026-08-04):** every data column is
     `headerGlyphOnly` (icon-only headers). `order` + `qty` both Hash — distinguish
     by column position; a11y keeps “Order” / “Qty”. Band 3 triage refine
     (filter · pagination · sort) is icon-only; Band 1 Check / Import / Add stay
     **labeled** solid pills (Unbox CTA altitude).
   - **Not by starving `labelFitRem`** into the glyph fallback — that makes the
     intent depend on geometry, so it flips back to the word the moment someone
     widens the track or changes density.
6. **A tracking number reads LEFT; a date reads RIGHT** (location start 2026-08-02; date end
   2026-08-03). `ALIGN_BY_TYPE.location` is `start`: end-alignment is for a **magnitude** you
   compare down a column, and a tracking last-8 is a **label you read**. An 8-character face in an
   8rem track was leaving ~3rem of empty track on the LEFT of every row, so the eye could not run
   a straight line down the identifiers. Same distinction already ruled for the order number in 4.
   `ALIGN_BY_TYPE.date` is `end`: a civil day or duration (`Aug 3` / `12d`) is compared down the
   column (“which line is sooner / overdue?”) with qty — reversing the date half of the 2026-08-02
   pass that had moved both types to start.
   Full table: [`source-of-truth.md`](../source-of-truth.md) → Grid column justification.
7. **A chip value starts at the same x as a plain-text value.** `CopyChip`'s wrapper carries its own
   `px-1.5`, which is right in a rail and wrong in a ruled column — it stacks on the cell's `px-2`,
   so every chip sat 6px inside its column's content edge and no chip lined up with the cells above
   or below it. The **cell** answers this, not each call site: `[data-cf-grid] [data-chip-face]`
   zeroes it in `styles/globals.css`, which reaches all 14 families and the next one. Do not reach
   for `outerPad="flush"` inside a grid — a prop ~12 chip call sites must each remember is the shape
   that drifts.

---

**Column WIDTH is a drag, on every family, from one handle.** `ColumnResizeHandle` (`@/design-system/components/grid`) mounts on each resizable header cell; the drag mutates only the surface's `--cf-col-<key>` CSS var, so header, rows, group summaries **and the frozen pane's sticky-left `calc()`** all reflow together with zero React render, and the width is committed once on drop to `staff_preferences.tableColumns[tableId].widths` (`useGridColumnWidths`). Keyboard: ←/→ nudge, Enter = resize-to-fit; double-click = resize-to-fit.

- **Which columns get a grip is one rule** — `isGridColumnResizable`. Variable-content tracks yes; the `select` gutter and the **fixed-format types** (`number` · `id` · `location`) no, because those cells render a last-8 `CopyChip` or a short tabular numeral run, so a drag only moves whitespace beside the same eight characters. A genuine exception sets `resizable` on the column model, where the column is declared.
- **Never re-derive the resizable set per surface.** `ORDERS_QUEUE_RESIZABLE_KEYS` composes `isGridColumnResizable` from the model. **Orders / To Ship (2026-08-05):** Product-only resize — same contract as Receiving / Unbox History (`resizable: true` on `title` only; Order · Ship by · Qty · Tracking locked). Do not reintroduce multi-column Orders grips.

---

Indexed by [`workbench.md`](workbench.md) · ../contextual-display.md
