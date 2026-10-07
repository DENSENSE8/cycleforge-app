# PARITY — per-page inventory of what the old UI provides (stage 0)

Written 2026-09-26 by the sidebar backend session (Phase 0). One table per `SIDEBAR_PAGE_NAV` page: every view/tab, filter (URL param + allowed values), action, recents list, scan input, saved-views key and count the old UI provides today, with source file:line. **This is each page's definition of done** for the contextual-sidebar port: a page may flip to `contextual` only when its `NavContext` covers every row. The machine-checked subset lives in `src/lib/nav/context/parity.ts` and is enforced by `src/lib/nav/context/resolve.test.ts`.

Evidence notes: rows come from static reading at the cited file:line unless marked otherwise; `[INFERENCE]` marks unexecuted claims. File:line refs are as of commit `b0dbf544f`.


## Inbound


Scope: the `SIDEBAR_PAGE_NAV` entries `incoming` (Deliveries), `sourcing` (Sourcing, including the Models and Compatibility tabs) and the legacy `receiving` family entry.
All refs are `file:line` in `/home/michaelgarisek/Projects/cycleforge-lanes/prod` as of 2026-09-26. The code was read only; nothing was built or edited.
The hygiene claims marked **(verified)** come from running `parseRouteParams(routeParamsFor(path), …)` through `node_modules/.bin/tsx`.

---

### incoming — Deliveries

Frame: `src/app/incoming/page.tsx:9-25` → `SurfaceParamHygiene` (:12) → `ModeRegion mode="triage"` (:14) → `DeskPageLayout` (:15) → `IncomingBrowseShell` (:16) → `SurfaceGate surfaceKey="incoming"` (:17) → `ReceivingSurfacePage` (:18) → `RouteShell actions=<ReceivingSidebarPanel/> history=<ReceivingDashboard/>` (`src/components/receiving/ReceivingSurfacePage.tsx:16-19`) → `ReceivingRightPane` → `ReceivingLedgers` (`src/components/receiving/ReceivingRightPane.tsx:122`) → ledger host (`src/components/receiving/ReceivingLedgers.tsx`).
Route key: `receiving` (`src/lib/sidebar-navigation.ts:480`). Page id: `incoming` (`src/lib/sidebar-navigation.ts:530`). Nav entry: `src/lib/sidebar-navigation.ts:956-974`, with `railless: true` (:961) and `deskChrome: true` (:962). Permission: `receiving.view` (:958, :715). Route spec: `INCOMING_ROUTE_PARAMS` (`src/lib/routing/receiving-routes.ts:170-215`).

| Kind | Item | Detail / allowed values | Store / endpoint | Ref |
|---|---|---|---|---|
| View/tab | On the way (`pipeline`) | Default. Omits `lane`; the target sets `lane:null, view:null` | URL | `src/lib/sidebar-navigation.ts:964` |
| View/tab | History (`docked`) | `?lane=docked` | URL | `src/lib/sidebar-navigation.ts:965` |
| View/tab | Tab resolver | Returns `null` off `/incoming`; `parseInboundLane(lane)==='docked'` → `docked`, else `pipeline` | — | `src/lib/sidebar-navigation.ts:967-973`; `src/lib/receiving/inbound-lane.ts:38-40` |
| View/tab | Tab row renderer | `DeskPageChrome` tabs from nav children. A switch goes through `applyChildTarget`, which **constructs** the params and carries only `staff` | URL | `src/components/desk/useDeskPageChromeTabs.ts:66-79`; `src/lib/sidebar-navigation.ts:1383-1403` |
| View/tab | Lane → table mode | `/incoming` → `incoming`; `lane=docked` → `history` | — | `src/lib/surface-isolation.ts:63-66`; `src/components/station/useReceivingModeContext.ts:48-60` |
| View/tab | Pipeline body | `IncomingDeliveriesLedger` (RecordLedger) | — | `src/components/receiving/ReceivingLedgers.tsx` |
| View/tab | Docked body | `DockedReceiptsLedger` (RecordLedger) | — | `src/components/receiving/ReceivingLedgers.tsx` |
| View/tab | Inbound order form | Add purchase / return navigates to its own page (the ledger is not replaced) | URL `/purchasing/new?type=PO\|RETURN` (`?id=` fixes a landed order) | `src/app/purchasing/new/page.tsx`; `inboundOrderFormHref` in `src/lib/inbound/inbound-order-compose.ts` |
| View/tab | Inbound order import | Its own page, not a ledger takeover: `/purchasing/import` (desk) and `/m/receiving/import-csv` (phone) → `POST /api/receiving/inbound/import-po-csv`; each upload opens its upload check `/purchasing/import/[batchId]` | route | `src/app/purchasing/import/page.tsx`; `src/lib/inbound/po-columns.ts` |
| View/tab | First-paint stand-in | SSR shows `IncomingFirstPaint` until mount | — | `src/components/receiving/incoming/IncomingBrowseShell.tsx:15-17` |
| Filter | `lane` | `pipeline` (omitted) \| `docked` | URL | `src/lib/routing/receiving-routes.ts:174` |
| Filter | `state` (delivery state) | `DELIVERED_UNOPENED`, `DELIVERED_NOT_UNBOXED`, `ARRIVING_TODAY`, `STALLED`, `WRONG_DESTINATION`, `IN_TRANSIT`, `PENDING_CARRIER`, `TRACKING_UNAVAILABLE`, `CARRIER_MISMATCH`, `AWAITING_TRACKING` (uppercase only; lowercase is stripped **(verified)**) | URL → API `delivery_state` | spec `src/lib/routing/receiving-routes.ts:184`; vocab `src/lib/receiving/incoming-delivery-state-face.ts:153-164,187-190`; writer (filter menu "Delivery" group) `src/components/station/incoming-grid/useIncomingTableChrome.ts:47-52,72-73`; reader `src/components/station/useReceivingModeContext.ts:86-99`; API `src/lib/receiving/receiving-modes.ts:399` |
| Filter | `state` sub-feeds | `DELIVERED_UNOPENED` → `GET /api/receiving-lines/incoming/delivered-unscanned`; `DELIVERED_NOT_UNBOXED` → `GET /api/receiving-lines/incoming/delivered-not-unboxed` (60s poll). The main list query is disabled | server | `src/components/station/useReceivingLinesData.ts:67-114`; `src/components/station/useReceivingModeContext.ts:128-132` |
| Filter | `inbound` (source) | Spec: `all\|zoho\|ebay\|amazon\|manual`. UI offers only Zoho / eBay. The client honours only `zoho\|ebay`; anything else is treated as `all` | URL → API `inbound` | spec `src/lib/routing/receiving-routes.ts:186`; writer `src/components/station/incoming-grid/useIncomingTableChrome.ts:14-17,53-58,66-70`; reader `src/components/station/useReceivingModeContext.ts:116-120`; API `src/lib/receiving/receiving-modes.ts:405` |
| Filter | Clear all | Deletes `state` and `inbound`. Every filter write also deletes `page` | URL | `src/components/station/incoming-grid/useIncomingTableChrome.ts:31-41,79-84` |
| Filter | `inkind` | Spec: `all\|purchase\|return`. **No writer, no client reader, and it is not forwarded to the API** (its only writer, the returns staging host, is deleted 2026-10-06) | URL (dead) | spec `src/lib/routing/receiving-routes.ts:188`; API parser (unreached) `src/lib/receiving/lines/query.ts:223-225` |
| Filter | `tracking_in` (bulk tracking paste) | Comma-joined canonical keys, max 100. Relaxes the lane predicate and suppresses `state`. **The writer panel is not mounted on `/incoming`**, and the `filter` action is never opened anywhere | URL (deep-link only) → API `tracking_in` | spec `src/lib/routing/receiving-routes.ts:182`; reader `src/components/station/useReceivingModeContext.ts:136`; API `src/lib/receiving/receiving-modes.ts:204-206,406`; writer `src/components/sidebar/receiving/incoming/IncomingBulkTrackingPanel.tsx` (mounted only by `src/components/receiving/unbox/UnboxDeskActions.tsx:100` with `checkOnly`, :29-32; the panel registers its own `detail:incoming-bulk-tracking` rail occupant) |
| Filter | `sort` (server ORDER BY) | Pipeline: `zoho_newest\|zoho_oldest\|expected_soonest\|recently_added`. Docked: `unboxed_newest\|scanned_newest`. Spec accepts the union. **No UI writer on `/incoming`** | URL → API `sort` | spec `src/lib/routing/receiving-routes.ts:196`; vocab `src/lib/receiving/inbound-lane.ts:13-20,59-64`, `src/lib/receiving/receiving-modes.ts:62-65`; readers `src/components/station/useReceivingModeContext.ts:103,107`; API `src/lib/receiving/receiving-modes.ts:347,400` |
| Filter | `po_from` / `po_to` | `YYYY-MM-DD` PO date range, Pipeline only. **No UI writer** (the comment names `IncomingWorkspaceHeader`, which no longer exists) | URL → API | spec `src/lib/routing/receiving-routes.ts:198-199`; reader `src/components/station/useReceivingModeContext.ts:100-112`; API `src/lib/receiving/receiving-modes.ts:401-402` |
| Filter | `page` | 1-based, 50 rows (`INCOMING_PAGE_SIZE`), Pipeline only. Written by the ledger's Previous/Next; stripped when past the last page | URL → API `limit/offset` | spec `src/lib/routing/receiving-routes.ts:201`; writer `src/components/receiving/ReceivingLedgers.tsx`; guard `src/components/station/useReceivingLinesData.ts:130-140`; size `src/lib/receiving/receiving-modes.ts:13,387-390` |
| Filter | `rh_q` / `rh_field` / `rh_scope` | Server search (`rh_q` → Pipeline `search` + `search_field=po`; Docked `search/search_field/search_scope`). **No writer on `/incoming`** (arrives only via the proxy redirect from `/receiving/history` or `/dashboard?mode=inbound`) | URL → API | spec `src/lib/routing/receiving-routes.ts:203-206`; readers `src/components/station/useReceivingModeContext.ts:72-85`; API `src/lib/receiving/receiving-modes.ts:342-344,395-398`; redirects `src/proxy.ts:205-225` |
| Filter | Toolbar find field | "Filter incoming…" (Pipeline) and "Filter docked records…" (Docked). **Session-local `useState`; never writes the URL.** Client-side match via `receivingLineMatchesQuery` | component state | `src/components/receiving/ReceivingLedgers.tsx`; `src/components/receiving/incoming/IncomingDeliveriesLedger.tsx:252-260`; `src/components/receiving/history/DockedReceiptsLedger.tsx:138-146` |
| Filter | Docked "State" menu | Client-side state filter over the loaded rows (`dockedReceivingState`); options are derived from the rows | component state (not URL) | `src/components/receiving/history/DockedReceiptsLedger.tsx:61,66-72,147-161` |
| Filter | Column sort `colsort` / `coldir` | Pipeline sort menu: `order,title,date,age,status,tracking,qty,condition,platform,zoho`. Docked: `date,order,title,qty,tracking` + "Default order" | URL (ambient carries) | Pipeline `src/components/receiving/ReceivingLedgers.tsx`, `src/components/receiving/incoming/IncomingDeliveriesLedger.tsx:38-49,262-268`; Docked `src/components/receiving/history/DockedReceiptsLedger.tsx:24-30,62-65,162-176`; ambient `src/lib/routing/route-params.ts:90-93` |
| Filter | `weekOffset` (Docked week pill) | Positive int; prev/next week. `DateRangePickerPill` with a count, shown on the Docked toolbar | URL (ambient) | `src/components/receiving/ReceivingLedgers.tsx` |
| Filter | `staff` / `staffId` | Ambient staff filter; carried across tab switches. No writer on this desk | URL | `src/lib/routing/receiving-routes.ts:55`; `src/components/station/useReceivingModeContext.ts:139-141` |
| Filter | `openLine` | Open record (`receiving_line` id) on either lane. Reload restores it | URL | spec `src/lib/routing/receiving-routes.ts:212`; writer `src/components/receiving/ReceivingLedgers.tsx` |
| Filter | `incview` | Retired; only the `pos` token is accepted, and hygiene strips leftovers | URL | `src/lib/routing/receiving-routes.ts:176` |
| Filter | Hygiene-stripped | `view` (retired mailbox) **(verified)**; `dir`, which the `/receiving/history` redirect preserves but `/incoming` does not own **(verified)** | — | `src/proxy.ts:201-211`; `src/lib/routing/route-params.test.ts:123-126` |
| Action | Header **Add** (split, primary) | Opens the purchase composer | module store | `src/components/receiving/incoming/IncomingDeskAddAction.tsx:69-71,144-150,201` |
| Action | Add ▸ Add return | Opens the return composer → `POST /api/receiving/inbound/import-purchase` (kind=return) | server | `src/components/receiving/incoming/IncomingDeskAddAction.tsx:73-75,153-157`; `src/lib/inbound/inbound-import-client.ts:15` |
| Action | Add ▸ Import orders | Opens `/purchasing/import` (`RECEIVING_PATHS.purchaseImport`) — every file format (Amazon / FBA / eBay returns, Goodwill, our template) | route | `src/components/receiving/incoming/IncomingDeskAddAction.tsx` |
| Action | Add ▸ Import Zoho POs | `POST /api/receiving-lines/incoming/inventory-refresh` plus `IncomingSyncDialog` | server | `src/components/receiving/incoming/IncomingDeskAddAction.tsx:81-83,167-172,202-209`; `src/components/sidebar/receiving/incoming/useIncomingSyncActions.ts:55` |
| Action | Add ▸ Import eBay purchases | `POST /api/receiving-lines/incoming/marketplace-refresh` | server | `src/components/receiving/incoming/IncomingDeskAddAction.tsx:85-87,173-179`; `src/components/sidebar/receiving/incoming/useIncomingSyncActions.ts:128` |
| Action | Global Add intents | `incoming-add` (leaf `add-return` / `import-returns`), `incoming-import-zoho`, `incoming-import-ebay`. Consumed on mount and via window event; pushes `/incoming` when fired elsewhere | window event + parked intent | `src/components/receiving/incoming/IncomingDeskAddAction.tsx:29-60,93-139` |
| Action | Pipeline record verbs | Record HEADER (`RecordActionStrip face="header"`, owner 2026-09-29): Pair to PO (orange, unpaired only) · Attach tracking (yellow, no tracking) · Open in Unbox (blue) · File/Update claim · Sync; ⋮ Timeline · Email · Seller & account (marketplace) · Carton notes · PO note · Zoho receive sync · Copy details · Add task / Send to staff as task (disabled when there is no carton) · Remove from Incoming (danger, last). Panel verbs swap the record body (Back returns) | `sync-one` `POST /api/receiving-lines/incoming/sync-one`; remove `DELETE /api/receiving-lines?…` | `src/components/receiving/record/inbound-record-verbs.tsx` (`buildInboundDeliveryVerbs`); `src/components/receiving/record/useInboundRecord.tsx`; `src/components/sidebar/receiving/incoming-details/useIncomingDetails.ts:98,164-171` |
| Action | Docked record verbs | Record HEADER: Resolve unfound / Open in Unbox / Print labels (lead by carton state) · Claim; ⋮ Timeline · Carton notes · PO note · Zoho receive sync · Move photos · Copy details · tasks · Delete carton (danger, last) | server | `src/components/receiving/record/inbound-record-verbs.tsx` (`useInboundCartonVerbs`); `src/components/receiving/history/DockedReceiptsLedger.tsx`; `src/components/receiving/docked/DockedPackagesLedger.tsx` |
| Action | Pagination | Previous / Next | URL `page` | `src/components/receiving/incoming/IncomingDeliveriesLedger.tsx:297-305` |
| Action | Bulk (gutter checks → right rail) | Copy details, Print labels, Create support ticket (1 only), Send to staff (disabled), Send to phone (disabled) | client / server | `src/hooks/useReceivingLineBulkSelection.tsx:71-109`; publish `src/hooks/useReceivingLineRailSelection.tsx:48-63`; host `src/components/ReceivingDashboard.tsx:39-49` |
| Action | Dead: History CSV export | Listens for `receiving-export-history` on Docked; **nothing emits it** | — | `src/components/receiving/ReceivingLedgers.tsx`; `src/components/receiving/receiving-events.ts:72` |
| Action | Retry (degraded) | `GridDegradedBox onRetry` | server | `src/components/receiving/ReceivingLedgers.tsx` |
| Recents | — | **None.** The ledger open goes through `setOpenLine`, not `handleOpenRow`, so no `POST /api/receiving-lines/view` stamp. The GlobalHeader has no Recents switcher (only Page, Pins, Daily tasks) | — | `src/components/receiving/ReceivingLedgers.tsx`; `src/components/station/useReceivingRowSelection.ts:127-139`; `src/components/layout/header-chrome-menu.tsx:4` |
| Scan input | — | **None.** The rail is suppressed; `ReceivingSidebarPanel` renders `null` for mode `incoming` | — | `src/components/sidebar/ReceivingSidebarPanel.tsx:453-455` |
| Saved views | — | **None.** No `views`/`savedViewsStorageKey` on either ledger | — | `src/components/receiving/incoming/IncomingDeliveriesLedger.tsx:237-307`; `src/components/receiving/history/DockedReceiptsLedger.tsx:120-211` |
| Count/badge | Pipeline footer | "X–Y of total" + "page / pageCount" (`total` = server `total`, or the row count on the delivered facets) | server `/api/receiving-lines` `total` | `src/components/receiving/incoming/IncomingDeliveriesLedger.tsx:231-233,299-302`; `src/components/receiving/ReceivingLedgers.tsx` |
| Count/badge | Pipeline summary | "Lines" plus per-`delivery_state` counts, **computed from the loaded page only** | client | `src/components/receiving/incoming/incoming-delivery-state.ts` (`incomingDeliverySummary`); `src/components/receiving/incoming/IncomingDeliveriesLedger.tsx` |
| Count/badge | Docked | "Visible records" summary + "N docked records" footer + week-pill count | client | `src/components/receiving/history/DockedReceiptsLedger.tsx:198-202,210`; `src/components/receiving/ReceivingLedgers.tsx` |
| Count/badge | Tab badges | **None.** `DeskPageLayout` gets no `decorateTabs` | — | `src/app/incoming/page.tsx:15`; `src/components/desk/DeskPageLayout.tsx:35-36` |
| Count/badge | Delivery-state counts | The sidebar's "Delivery status" facet (`incoming.pipeline`, `?state=`): Delivered · not scanned / Arriving today / In transit / Awaiting tracking, counted per purchase by `getIncomingSummary` via `GET /api/nav/facets` (the body chip rail is gone; ⌥1–⌥3 still press the first three — `segment-chords.ts` binds Digit1–3 only) | server | `src/lib/nav/facets/incoming-pipeline.ts`; `src/lib/receiving/incoming-summary.ts`; `src/components/receiving/incoming/IncomingStatusChips.tsx` |
| Context panel | Left rail | **Not mounted on desktop** (railless). `SidebarContextPanel` would pick `ReceivingSidebarPanel`, which returns `null` for `incoming` and renders the returns banner for Docked (`history`). On mobile the RouteShell "Actions" pane mounts the same panel | — | `src/lib/sidebar-navigation.ts:396-408,961`; `src/components/sidebar/SidebarContextPanel.tsx:60`; `src/components/sidebar/ReceivingSidebarPanel.tsx:453-455,489-492`; `src/design-system/components/RouteShell.tsx:24-25,112-121` |
| Context panel | Record plane | ONE inbound record, `InboundRecordView` (owner 2026-09-29, the order record's anatomy): Pipeline delivery (`GET /api/receiving-lines/incoming/details`), Docked / Unboxed carton (`GET /api/receiving/:id`, lines, `GET /api/receiving/:id/carrier-events`), pasted number (the Check's answer) | server | `src/components/receiving/record/InboundRecordView.tsx`; `src/components/receiving/record/inbound-record-model.tsx`; `src/components/receiving/record/useInboundRecord.tsx`; `src/components/sidebar/receiving/incoming-details/useIncomingDetails.ts` |
| Context panel | Right rail: batch | `detail:receiving-line-batch` (`ReceivingLineRailShell surface="incoming"`), active when 2+ lines are selected | — | `src/components/receiving/ReceivingRightPane.tsx:126-128`; `src/components/receiving/rail/ReceivingLineRailShell.tsx:82-129` |
| Data | Main list | `GET /api/receiving-lines?view=incoming\|activity…` (15s timeout; spine-first for history) | server | `src/lib/queries/receiving-queries.ts:944-968`; `src/components/station/useReceivingLinesQuery.ts:17-21,41-83`; `src/lib/receiving/receiving-modes.ts:323-350,379-425` |
| Data | Realtime | `useRealtimeInvalidation({receiving:true})`, `useRealtimeToasts('receiving')`, `receiving.lines` refresh signal, `receiving-entry-added` event | Ably | `src/components/ReceivingDashboard.tsx:20-21`; `src/components/station/useReceivingLinesData.ts:143-152` |
| Nav | Command code | `CMD-GO-INBOUND` → page `incoming` | — | `src/lib/stations/nav-command-codes.ts:35` |

Findings (incoming):
1. Lane switching drops every filter. `applyChildTarget` constructs the URL (`src/lib/sidebar-navigation.ts:1395-1402`). `applyInboundLane` / `clearCrossLaneParams` (`src/lib/receiving/inbound-lane.ts:69-102`) have **no production caller**; only tests use them.
2. `inkind`, `sort`, `po_from`, `po_to`, `rh_*` and `tracking_in` are owned by the spec but have no writer on the desk. `inkind` is not read by the client either.
3. `inbound` enum drift: the spec accepts `amazon|manual`, the client coerces them to `all`, and the menu offers only Zoho/eBay.
4. The find field is session-local, so it is lost on reload. `rh_q` is the URL search, but no UI writes it.
5. Docked: the CSV export listener has no emitter.

---

### sourcing — Sourcing

Frame: `src/app/sourcing/layout.tsx:5-7` (`DeskPageLayout`) → `src/app/sourcing/page.tsx:11-31` (`SurfaceParamHygiene` :25; `RouteShell actions=<SourcingSidebarPanel/> history=<SourcingWorkspace/>` :13-18). On desktop, the left rail is `SidebarContextPanel` → `SourcingSidebarPanel` (`src/components/sidebar/SidebarContextPanel.tsx:65`; context-panel key `src/lib/sidebar-navigation.ts:452`).
Route key / page id: `sourcing` (`src/lib/sidebar-navigation.ts:494`). Nav entry: `src/lib/sidebar-navigation.ts:1002-1028` (`deskChrome: true` :1005, no `railless`). Permission: `sourcing.view` (:1003, :734). Route spec: `SOURCING_ROUTE_PARAMS` (`src/lib/routing/query-mode-routes.ts:239-268`, registered :584).

| Kind | Item | Detail / allowed values | Store / endpoint | Ref |
|---|---|---|---|---|
| View/tab | Queue | Default; `mode:null` | URL | `src/lib/sidebar-navigation.ts:1008` |
| View/tab | Scout | `?mode=scout` (legacy `lookup` → scout) | URL | `src/lib/sidebar-navigation.ts:1009`; `src/components/sourcing/sourcing-shared.ts:28` |
| View/tab | Watchlist | `?mode=watchlist` | URL | `src/lib/sidebar-navigation.ts:1010` |
| View/tab | Searches | `?mode=searches` | URL | `src/lib/sidebar-navigation.ts:1011` |
| View/tab | Suppliers | `?mode=suppliers` | URL | `src/lib/sidebar-navigation.ts:1012` |
| View/tab | Models | `?mode=models` (requires `sourcing.view`) | URL | `src/lib/sidebar-navigation.ts:1015` |
| View/tab | Compatibility | `?mode=compatibility` (requires `sourcing.view`) | URL | `src/lib/sidebar-navigation.ts:1016` |
| View/tab | Analytics (hidden) | `?mode=analytics` has a body and a sidebar but **no nav child**. The resolver falls to `queue`, so the **Queue tab is lit while Analytics shows** | URL | body `src/components/sourcing/SourcingWorkspace.tsx:39-40`; sidebar `src/components/sidebar/SourcingSidebarPanel.tsx:108-116`; resolver `src/lib/sidebar-navigation.ts:1018-1027` |
| View/tab | Mode vocab / aliases | `queue,scout,watchlist,searches,suppliers,analytics,models,compatibility` + legacy `lookup`, `alerts` (→ queue) | — | `src/components/sourcing/sourcing-shared.ts:5-46` |
| View/tab | Body switch | Scout / Queue / Searches / Suppliers (`?supplier=` → CRUD card) / Models / Compatibility / Analytics / Watchlist (fallback) | — | `src/components/sourcing/SourcingWorkspace.tsx:17-46` |
| View/tab | Tab row | `DeskPageChrome`. A switch constructs the params (drops `q/by/status/type/range/supplier/model`; carries `staff`) | URL | `src/components/desk/useDeskPageChromeTabs.ts:66-79`; `src/lib/sidebar-navigation.ts:1383-1403` |
| Filter | `q` | Scout query (model or serial) and Suppliers name filter. Written per keystroke by `router.replace('/sourcing?…')` | URL → `GET /api/product-models/lookup?{by}=q`; `GET /api/suppliers?stats=1&q=` | spec `src/lib/routing/query-mode-routes.ts:249`; writer `src/components/sidebar/SourcingSidebarPanel.tsx:44-71`; readers `src/components/sourcing/workspace/ScoutPane.tsx:17-24`, `src/components/sourcing/workspace/SuppliersPane.tsx:15-25` |
| Filter | `by` (Scout) | `model` (default) \| `serial` | URL | spec `src/lib/routing/query-mode-routes.ts:251`; slider `src/components/sidebar/SourcingSidebarPanel.tsx:16-19,78-88` |
| Filter | `status` (Queue) | `live` (default, omitted) \| `resolved` \| `dismissed` | URL → `GET /api/sourcing/alerts?status=` | spec `src/lib/routing/query-mode-routes.ts:253`; items `src/components/sidebar/SourcingSidebarPanel.tsx:20-24,148-166`; reader `src/components/sourcing/workspace/QueuePane.tsx:23-29` |
| Filter | `status` (Watchlist) | `all` (default, omitted) \| `watching` \| `ordered` \| `imported` | URL → `GET /api/sourcing/candidates?status=` | items `src/components/sidebar/SourcingSidebarPanel.tsx:25-30,148-166`; reader `src/components/sourcing/workspace/WatchlistPane.tsx:15-21` |
| Filter | `type` (Suppliers) | `all` (omitted) \| `ebay_seller` \| `distributor` \| `salvage` \| `oem` | URL → `GET /api/suppliers?type=` | spec `src/lib/routing/query-mode-routes.ts:255`; slider `src/components/sidebar/SourcingSidebarPanel.tsx:31-37,118-135`; reader `src/components/sourcing/workspace/SuppliersPane.tsx:16-24` |
| Filter | `range` (Analytics) | `30d` \| `90d` (default) \| `1y` | URL → `GET /api/sourcing/analytics?range=` | spec `src/lib/routing/query-mode-routes.ts:257`; parser `src/components/sourcing/sourcing-shared.ts:49-57`; writer/buttons `src/components/sourcing/workspace/AnalyticsPane.tsx:53-67,122-131` |
| Filter | `supplier` | `<id>` \| `new`: the Suppliers CRUD door | URL | spec `src/lib/routing/query-mode-routes.ts:263`; `src/components/sourcing/workspace/SuppliersPane.tsx:31-36`; `src/components/admin/sourcing/SuppliersManagementTab.tsx:44-48` |
| Filter | `model` (Models) | `<id>` \| `new`: the Models CRUD door | URL | spec `src/lib/routing/query-mode-routes.ts:265`; writer `src/components/admin/sourcing/BoseModelsSidebarPanel.tsx:50,89`; reader `src/components/admin/sourcing/BoseModelsManagementTab.tsx:62-75` |
| Filter | `search` (Models + Compatibility picker filter) | Free text. **Not owned by the spec, so SurfaceParamHygiene strips it on every change (verified)**: the picker search box is broken | URL (stripped) → `GET /api/bose-models?q=` | writers `src/components/admin/sourcing/BoseModelsSidebarPanel.tsx:27,64-77`, `src/components/admin/sourcing/CompatibilitySidebarPanel.tsx:25,44-57`; hygiene `src/hooks/useSurfaceParamHygiene.ts:15-24`; `src/lib/routing/route-params.ts:197-209` |
| Filter | `boseModelId` (Compatibility) | Model id or empty for "All edges". **Not owned, so stripped (verified)**: the model picker never narrows the edge table | URL (stripped) → `GET /api/part-compatibility?boseModelId=` | writer `src/components/admin/sourcing/CompatibilitySidebarPanel.tsx:26,60-83`; reader `src/components/admin/sourcing/CompatibilityManagementTab.tsx:27-38` |
| Action | Queue row | Set target / Target $ (replenish; `PATCH /api/sku-catalog/:id`), Research (`POST /api/sourcing/research`), Start sourcing (PATCH status), Resolve / Dismiss (`PATCH /api/sourcing/alerts`, reason prompt), Save candidate (`POST /api/sourcing/candidates`) | server | `src/components/sourcing/workspace/QueuePane.tsx:31-60,91-109,127-149` |
| Action | Scout part row | Find on eBay (`POST /api/sourcing/search`), Research, Source (`POST /api/sourcing/alerts`), Watch (`POST /api/sourcing/saved-searches`), Save (`POST /api/sourcing/candidates`) | server | `src/components/sourcing/workspace/ScoutPane.tsx:60-91,108-113,131`; `src/components/sourcing/SourceThisButton.tsx:30-31,40-63`; `src/components/sourcing/WatchSearchButton.tsx:26-27,36-54` |
| Action | Watchlist row | Import (`POST /api/sourcing/candidates/:id/import`, reason prompt), Reject (PATCH) | server | `src/components/sourcing/workspace/WatchlistPane.tsx:23-33,58-59` |
| Action | Searches | Add (query + cadence Daily/Weekly/Manual; POST), Run now (`POST …/:id/run`), Pause / Resume (PATCH), Remove (DELETE) | server `/api/sourcing/saved-searches` | `src/components/sourcing/workspace/SearchesPane.tsx:20-43,52-67,86-92` |
| Action | Suppliers | Add supplier (link `?supplier=new`), row → `?supplier=<id>`; CRUD Create / Save changes / Cancel / Deactivate | server `/api/suppliers` | `src/components/sourcing/workspace/SuppliersPane.tsx:47-51,61-67,72-73`; `src/components/admin/sourcing/SuppliersManagementTab.tsx:96-113,137-140` |
| Action | Models | Add model (sidebar → `?model=new`); Create / Cancel; Save changes; Deactivate; Remove part; Add part (+ SKU search `GET /api/sku-catalog?q=&limit=8`) | server `/api/bose-models`, `/api/part-compatibility` | `src/components/admin/sourcing/BoseModelsSidebarPanel.tsx:44-61`; `src/components/admin/sourcing/BoseModelsManagementTab.tsx:88-127,175-216,232-295,311-315` |
| Action | Compatibility | Row Remove → confirm plane (Cancel / Remove) → `DELETE /api/part-compatibility/:id` | server | `src/components/admin/sourcing/CompatibilityManagementTab.tsx:40-57,97-104`; `src/components/admin/sourcing/PartCompatibilityRemovePlane.tsx:45-51` |
| Action | Analytics | Range buttons 30 days / 90 days / 1 year | URL `range` | `src/components/sourcing/workspace/AnalyticsPane.tsx:122-131,159` |
| Recents | — | **None** | — | `src/components/sidebar/SourcingSidebarPanel.tsx:39-175` |
| Scan input | Scout serial | Sidebar `SearchBar` ("Scan or type a serial…" when `by=serial`). No station scan bar | URL `q` | `src/components/sidebar/SourcingSidebarPanel.tsx:60-71,77` |
| Saved views | — | **None** on the desk. "Standing searches" are server saved searches (`/api/sourcing/saved-searches`), not saved views | server | `src/components/sourcing/workspace/SearchesPane.tsx:20-23` |
| Count/badge | Pane headers | Queue "(N)", Watchlist "(N)", Searches "(N)", Suppliers "(N)", Compatibility "(N)" | client from the fetch | `src/components/sourcing/workspace/QueuePane.tsx:64`; `src/components/sourcing/workspace/WatchlistPane.tsx:47`; `src/components/sourcing/workspace/SearchesPane.tsx:49`; `src/components/sourcing/workspace/SuppliersPane.tsx:61`; `src/components/admin/sourcing/CompatibilityManagementTab.tsx:73-76,81` |
| Count/badge | Row facts | Supplier watch/acq/spend; model `compat_count` chip in both pickers; part "N in stock" / lifecycle badge | server | `src/components/sourcing/workspace/SuppliersPane.tsx:86-90`; `src/components/admin/sourcing/BoseModelsSidebarPanel.tsx:92-102`; `src/components/admin/sourcing/CompatibilitySidebarPanel.tsx:78-82`; `src/components/admin/sourcing/BoseModelsManagementTab.tsx:383-394` |
| Count/badge | Tab badges | **None.** No `decorateTabs` | — | `src/app/sourcing/layout.tsx:6` |
| Context panel | Sidebar per mode | scout: search + `by` slider; searches: copy; analytics: copy; suppliers: search + `type` slider; models: `BoseModelsSidebarPanel`; compatibility: `CompatibilitySidebarPanel`; queue / watchlist: `status` slider | — | `src/components/sidebar/SourcingSidebarPanel.tsx:73-174` |
| Context panel | BoseModelsSidebarPanel | `AdminSidebarShell` with Add model, `search` box and model picker rows (`?model=`) | `GET /api/bose-models[?q=]`, `qk.boseModels.list` | `src/components/admin/sourcing/BoseModelsSidebarPanel.tsx:25-110` |
| Context panel | CompatibilitySidebarPanel | "All edges" row + model picker (`?boseModelId=`) + `search` box | `GET /api/bose-models[?q=]` | `src/components/admin/sourcing/CompatibilitySidebarPanel.tsx:23-90` |
| Context panel | Mobile | `RouteShell` Actions pane ("Sourcing") mounts the same `SourcingSidebarPanel` | — | `src/app/sourcing/page.tsx:13-18` |

Findings (sourcing):
1. `search` and `boseModelId` are missing from `SOURCING_ROUTE_PARAMS`, so the Models/Compatibility picker search and the Compatibility model filter are stripped **(verified)**.
2. Analytics has no tab, and the Queue tab is lit when it shows.
3. Filters are wiped on every tab switch (constructed target).

---

### receiving — Receiving (legacy family entry)

Nav entry: `src/lib/sidebar-navigation.ts:975-1000`. `href` = `/unbox` (:979); `kind:'station'`, `stationGroup:'floor'`, `stationSubgroup:'receiving'`; no `deskChrome`.
**It is never the active page id.** `/receiving*` resolves to page id `receive` (`src/lib/sidebar-navigation.ts:533-534`); `/incoming` resolves to `incoming` (:530). Production consumers: `getSidebarHref`/`resolveSidebarChild` keyed by page id, so in practice only tests reach it (`src/lib/sidebar-navigation.test.ts:495-509`).
Route key `receiving` (`src/lib/sidebar-navigation.ts:476-490`) is what actually matters. It mounts `ReceivingSidebarPanel` (`src/components/sidebar/SidebarContextPanel.tsx:60`) and puts the surface in `STATION_SURFACE_ROUTE_KEYS` (`src/lib/sidebar-navigation.ts:379-381`).
Per-station parity (Unbox / Arrival / Pickup / Repair) belongs to the Stations inventory; below are only the family-level mappings.

| Kind | Item | Detail / allowed values | Store / endpoint | Ref |
|---|---|---|---|---|
| View/tab | `incoming` child | "Deliveries" → `/incoming` (params `{}`) | URL | `src/lib/sidebar-navigation.ts:981` |
| View/tab | `triage` child | "Arrival" → `/triage` | URL | `src/lib/sidebar-navigation.ts:982` |
| View/tab | `receive` child | "Unbox" → `/unbox` | URL | `src/lib/sidebar-navigation.ts:983` |
| View/tab | `pickup` child | "Local Pickup" → `/pickup` | URL | `src/lib/sidebar-navigation.ts:984` |
| View/tab | `repair` child | "Repair Service" → `/repair` | URL | `src/lib/sidebar-navigation.ts:985` |
| View/tab | Resolver | Path first (`/unbox`→receive, `/triage`, `/incoming`, `/pickup`, `/repair`), then legacy `?mode=pickup\|repair\|incoming\|triage`, default `receive` | — | `src/lib/sidebar-navigation.ts:987-999` |
| View/tab | Standalone rows (live) | APP_SIDEBAR_NAV floor rows for triage / receive / pickup / repair, plus the domain row `incoming` | — | `src/lib/sidebar-navigation.ts:302-305,320` |
| View/tab | `/receiving` legacy redirects | `mode` null\|receive → `/unbox`; triage → `/triage`; incoming → `/incoming`; pickup → `/pickup`; repair → `/repair`; history → `/incoming?lane=docked`; `mode` is deleted | proxy 308 | `src/proxy.ts:176-199` |
| View/tab | `/receiving/history` | → `/incoming?lane=docked`; the page itself (SurfaceGate `history`) is kept for the mobile UA rewrite | proxy | `src/proxy.ts:201-211`; `src/app/receiving/history/page.tsx:9-15` |
| View/tab | `/dashboard?mode=inbound\|receiving` | → `/incoming?lane=docked` (page id → `incoming`) | proxy | `src/proxy.ts:213-225`; `src/lib/sidebar-navigation.ts:537-539` |
| View/tab | `/receiving` page body | `ReceivingSurfacePage` (reached only with an unknown `?mode`); no `DeskPageLayout`; loading shell "Loading receiving" | — | `src/app/receiving/page.tsx:4-6`; `src/app/receiving/layout.tsx:5-11`; `src/app/receiving/loading.tsx` |
| View/tab | `/receiving/unfound[/kind/id]` | Redirects to `/incoming`; `unmatched_receiving/<id>` → `/receiving?id=<id>` | server redirect | `src/app/receiving/unfound/page.tsx`; `src/app/receiving/unfound/[kind]/[id]/page.tsx` |
| Filter | Mode → route spec map | receive→UNBOX, triage→TRIAGE, incoming→INCOMING, pickup→PICKUP, repair→REPAIR, history→HISTORY | — | `src/lib/routing/receiving-routes.ts:282-289` |
| Filter | Bare `/receiving` | Un-owned: no route spec (`routeParamsFor('/receiving') === null`), so hygiene falls back to `stripCrossSurfaceParams` | — | `src/lib/routing/route-params.test.ts:406-407`; `src/hooks/useSurfaceParamHygiene.ts:17-20` |
| Filter | `/receiving/history` spec | `sort` (`unboxed_newest\|scanned_newest`), `dir`, `rh_q/rh_field/rh_scope`, `page` + browse carries | URL | `src/lib/routing/receiving-routes.ts:250-265` |
| Action | — | No family-level actions; each station owns its own | — | — |
| Recents | Station rails (per mode, not family) | Unbox: `ReceivingFeedRail` / `GET /api/receiving-lines?view=unboxRecent`; first paint from the Unbox shell seed. Pickup: `PickupSidebarRail`. Incoming / Repair: none | server | `src/components/sidebar/ReceivingSidebarPanel.tsx:459-488,578-592`; cf. `docs/refactors/sidebar/current-sidebar-inventory.md:84-86` |
| Scan input | Per mode | Triage `TriageScanBand`, Unbox `UnboxScanBand`, Pickup `PickupScanBand`; none for incoming / repair / history | — | `src/components/sidebar/ReceivingSidebarPanel.tsx:453-458,463-481,502-523,526-554` |
| Saved views | — | None at family level | — | — |
| Count/badge | — | None at family level (no `decorateTabs`, no nav badge) | — | `src/lib/sidebar-navigation.ts:975-1000` |
| Context panel | `ReceivingSidebarPanel` | Mounted for route key `receiving` on desktop when not railless; mobile via `RouteShell` actions. Branches: incoming → null, repair → null, pickup → scan band + rail, history → `ReceivingReturnBanner` only, triage / receive → scan band + banner + picker + rail + bulk bar | — | `src/components/sidebar/SidebarContextPanel.tsx:60`; `src/components/receiving/ReceivingSurfacePage.tsx:12-17`; `src/components/sidebar/ReceivingSidebarPanel.tsx:65,440-609` |
| Context panel | Right pane | `ReceivingDashboard` → `ReceivingRightPane` (repair → `RepairCardList` + `RepairIntakeHost`; pickup → `PickupWorkspace`; receive → `UnboxLineWorkspace`; triage → `TriageLineWorkspace`; else `ReceivingLedgers`) | — | `src/components/ReceivingDashboard.tsx`; `src/components/receiving/ReceivingRightPane.tsx` |

Findings (receiving):
1. The `receiving` SIDEBAR_PAGE_NAV entry is dead in production. No page id resolves to it, and its `?mode=` fallback branch (:993-998) is unreachable because the proxy 308s `/receiving?mode=*` first. Removing it touches only `src/lib/sidebar-navigation.test.ts:495-509`.

---

### Corrections to `docs/refactors/sidebar/current-sidebar-inventory.md`

| Doc line | Claim | Actual |
|---|---|---|
| :77 | `ReceivingSidebarPanel.tsx:66` | Declared at `src/components/sidebar/ReceivingSidebarPanel.tsx:65` |
| :77-82 | Omits `incoming` and `history` branches | incoming → `null` (:453-455); history → returns banner only (:489-492) |
| :99 | `SourcingSidebarPanel.tsx:50` | Declared at `src/components/sidebar/SourcingSidebarPanel.tsx:39` |
| :100-106 | Mode list | Missing `queue` status `live\|resolved\|dismissed` (:20-24), `searches` / `analytics` copy (:98-116) |
| :107 | "Pure URL-state writer" | Models / Compatibility sub-panels fetch `GET /api/bose-models` (`BoseModelsSidebarPanel.tsx:30-39`, `CompatibilitySidebarPanel.tsx:28-37`) |
| :108 | Params written `q, by, type, status` | Also `search`, `model`, `boseModelId` (sub-panels); `search` / `boseModelId` are stripped by hygiene |
| :152 | Sourcing 7 children | Correct, but `analytics` is an 8th, hidden mode (`SourcingWorkspace.tsx:39-40`) |


## Outbound


### outbound — Shipping

The Shipping desk (`id: 'outbound'`) is governed by `SIDEBAR_PAGE_NAV:1049-1123`, `src/app/shipping/(desk)/layout.tsx:1-85`, and `src/lib/outbound/desk-views.ts:1-140`. It encompasses four sub-pages / tabs: **To ship** (`/shipping/orders`), **Picking** (formerly **Pending**, `/shipping/shortage`), **Exceptions** (`/shipping/exceptions`), and **Shipped** (`/shipping/shipped`).

> **2026-09-29 (owner):** `DESK_VIEWS` is FBM's one view definition — Allocate (`/shipping/orders`, the landing view, painted first) · Exceptions · Shipped. The **Pick list** (`?queue=pick`) is REMOVED (its lens, count and `queue` param are gone; the `/pick` station and `/m/pick` stay). **PO paired** (`/shipping/shortage?pair=po`) is PARKED: no nav row, reachable by URL only, for the PO pairing build. Out-of-stock orders point at FBM › Exceptions, which lists every one. The rows below for those two views are history.

| Element Type | Name / Key | URL Param / Store / Target | Allowed / Expected Values | Source file:line |
|---|---|---|---|---|
| **View / Tab** | Exceptions | `/shipping/exceptions` | — | `src/lib/sidebar-navigation.ts:1059`<br>`src/lib/outbound/desk-views.ts:40-47` |
| **View / Tab** | Picking *(formerly Pending)* | `/shipping/shortage` | `?pair=po` | `src/lib/sidebar-navigation.ts:1062`<br>`src/lib/outbound/desk-views.ts:48-57` |
| **View / Tab** | To ship *(Action list)* | `/shipping/orders` | — | `src/lib/sidebar-navigation.ts:1063`<br>`src/lib/outbound/desk-views.ts:68-76` |
| **View / Tab** | To ship *(Pick list)* | `/shipping/orders` | `?queue=pick` | `src/lib/outbound/desk-views.ts:58-67` |
| **View / Tab** | Shipped | `/shipping/shipped` | — | `src/lib/sidebar-navigation.ts:1067`<br>`src/lib/outbound/desk-views.ts:77-85` |
| **Filter** | Pairing Lens | `pair` | `po` | `src/lib/outbound/desk-views.ts:22`<br>`src/lib/orders/desk-view-filters.ts:14-17` |
| **Filter** | Queue Lens | `queue` | `pick` | `src/lib/outbound/desk-views.ts:24`<br>`src/lib/orders/desk-view-filters.ts:19-22` |
| **Filter** | Search Query | `q` / `search` | free text string | `src/components/unshipped/useToShipChrome.ts:51, 169-173`<br>`src/hooks/useDashboardSearchController.ts:39` |
| **Filter** | Must Ship (Needs attention) | `late` | `1` | `src/utils/dashboard-search-state.ts:127-142`<br>`src/components/unshipped/useToShipChrome.ts:23-29, 90-95` |
| **Filter** | Urgent (Needs attention) | `attention` | `1` / `urgent` | `src/utils/dashboard-search-state.ts:121-140`<br>`src/components/unshipped/useToShipChrome.ts:24, 93-94` |
| **Filter** | Out of Stock (Needs attention) | `ustatus` | `BLOCKED` | `src/utils/dashboard-search-state.ts:117-145`<br>`src/components/unshipped/useToShipChrome.ts:25, 95-96` |
| **Filter** | Awaiting Customer | `rowFlag` | `awaiting_customer` | `src/utils/dashboard-search-state.ts:115-147`<br>`src/components/unshipped/useToShipChrome.ts:26` |
| **Filter** | Caged / Held | `cage` | `1` | `src/utils/dashboard-search-state.ts:111-150`<br>`src/components/unshipped/useToShipChrome.ts:27, 97-98` |
| **Filter** | Lifecycle Stage | `stage` | `pending` \| `tested` \| `packed` | `src/components/unshipped/useToShipChrome.ts:31-35, 100-111` |
| **Filter** | Ship-by Age | `aging` | `overdue` \| `today` \| `upcoming` \| `unscheduled` | `src/components/unshipped/useToShipChrome.ts:36-41, 112-117` |
| **Filter** | Staff Assignment | `staff` | Staff ID string / integer | `src/hooks/useStaffFilter.ts:1-77`<br>`src/components/unshipped/useToShipChrome.ts:53` |
| **Filter** | Exception Category | `category` | `all` \| `unpaired_sku` \| `bad_address` \| `buyer_hold` \| `customs` \| `inventory_sync` \| `fraud` \| `carrier_exception` | `src/components/outbound/orders/exceptions/OrderExceptionsWorkbench.tsx:254-282`<br>`src/app/api/orders/exceptions/route.ts:20-40` |
| **Filter** | Shipped Type | `shipped` | `all` \| `store` \| `direct` \| `wholesale` | `src/components/shipped/ledger/ShippedLedgerToolbar.tsx:89-104` |
| **Filter** | Shipped Carrier | `carrier` | `USPS` \| `UPS` \| `FedEx` | `src/components/shipped/ledger/ShippedLedgerToolbar.tsx:105-117` |
| **Filter** | Shipped Status | `statusCategory` | `delivered` \| `in_transit` \| `exception` | `src/components/shipped/ledger/ShippedLedgerToolbar.tsx:118-130` |
| **Filter** | Shipped Date Range | `start` / `end` / `period` | ISO date strings / period tokens | `src/components/shipped/ledger/ShippedLedgerToolbar.tsx:74-88` |
| **Filter** | Shipped Exceptions Only | `exceptionsOnly` | `1` | `src/components/shipped/ledger/ShippedLedgerToolbar.tsx:131-140` |
| **Filter** | Column Sort | `sort` / `dir` | col identifier / `asc` \| `desc` | `src/hooks/useUrlColumnSort.ts:1-80` |
| **Action** | Add Order (Triage hand-entry) | `?triage=new` | modal open | `e7dc59d^:src/components/outbound/orders/OrdersDeskAddAction.tsx:32-150` |
| **Action** | Sync Latest Orders | `syncRun` | triggers orders sync transfer | `e7dc59d^:src/components/outbound/orders/OrdersDeskAddAction.tsx:60-70` |
| **Action** | Import CSV Orders | `?import=csv` | opens file picker & staging view | `e7dc59d^:src/components/outbound/orders/OrdersDeskAddAction.tsx:71-85` |
| **Action** | Past Imports History | `openPastImports` | modal open | `e7dc59d^:src/components/outbound/orders/OrdersDeskPastImportsAction.tsx:28-60` |
| **Action** | Print Paperwork Packet | `?paperwork=<orderId>` | batch paperwork modal open | `e7dc59d^:src/components/outbound/orders/paperwork/OrdersDeskLabelsAction.tsx:42-100` |
| **Action** | Export Orders CSV | `exportCsv` | browser download trigger | `src/components/unshipped/UnshippedTable.tsx:1120-1130` |
| **Action** | Resolve Exception | `?order=<orderId>` | opens catalog pairing editor | `src/components/outbound/orders/exceptions/OrderExceptionsWorkbench.tsx:227-238` |
| **Action** | Pair Zoho Catalog SKU | mutation POST `/api/orders/[id]/pair-catalog` | un-cages order | `src/components/outbound/orders/exceptions/ExceptionCatalogPairing.tsx:40-90` |
| **Action** | Bulk Assign Pick/Pack | mutation POST `/api/orders/assign` | updates `work_assignments` | `src/hooks/useDashboardBulkSelection.tsx:45-130` |
| **Action** | Row Record Inspection | `?openOrderId=<id>` / `?order=<id>` / `?shipment=<id>` | opens `DeskRecordPlane` | `src/design-system/components/DeskRecordPlane.tsx:1-120`<br>`src/components/outbound/orders/OutboundOrdersLedger.tsx:390-420` |
| **Recents List** | Recent Detail Stacks | localStorage `cycleforge:detail-stacks:history:v1` | array of `{ id, type, title, openedAt }` | `src/lib/detail-stacks/history-store.ts:1-60` |
| **Recents List** | In-Memory Record Cursor | `useRecordCursor` state | `{ position, total, onPrev, onNext }` | `src/lib/record-cursor/useRecordCursor.ts:1-75` |
| **Scan Input** | Order / Tracking Scanner | `/api/scan/resolve` | tracking #, serial, order # | `src/hooks/useTrackingScan.ts:1-100`<br>`src/app/api/scan/resolve/route.ts:1-120` |
| **Saved Views** | Orders Saved Views Preset | localStorage `orders:views` | array of saved filter states | `src/components/tables/WorkbenchViewsMenu.tsx:1-90` |
| **Saved Views** | Server Saved Views | API `GET /api/saved-views?surface=orders` | `GENERIC_SAVED_VIEW_SURFACES` | `src/app/api/saved-views/route.ts:1-75`<br>`src/lib/saved-views/index.ts:1-60` |
| **Count / Badge** | Exceptions Desk Tab Badge | `GET /api/orders/desk-counts` (`exceptions`) | integer count | `src/app/shipping/(desk)/layout.tsx:45-55`<br>`src/lib/orders/desk-view-filters.ts:9` |
| **Count / Badge** | PO Paired Desk Count | `GET /api/orders/desk-counts` (`po`) | integer count | `src/lib/orders/desk-view-filters.ts:10` |
| **Count / Badge** | Pick List Desk Count | `GET /api/orders/desk-counts` (`pick`) | integer count | `src/lib/orders/desk-view-filters.ts:11` |
| **Count / Badge** | Action List Desk Count | `GET /api/orders/desk-counts` (`triage`) | integer count | `src/lib/orders/desk-view-filters.ts:12` |
| **Count / Badge** | Shipped Today Desk Count | `GET /api/orders/desk-counts` (`shippedToday`) | integer count | `src/lib/orders/desk-view-filters.ts:13` |
| **Count / Badge** | Live Unshipped Queue Counts | `GET /api/orders/queue-counts` | `{ total, byStage, urgent, mustShip }` | `src/lib/queries/dashboard-queries.ts:25-80` |
| **Count / Badge** | Caged Orders Count | `GET /api/orders/caged-count` | `{ count }` | `src/lib/queries/caged-orders-queries.ts:10-40` |

---

### fba — FBA

Governed by `SIDEBAR_PAGE_NAV:1030-1043`, `src/app/shipping/(desk)/fba/page.tsx:1-10`, and `src/components/fba/FbaOutboundWorkspace.tsx:1-244`.

| Element Type | Name / Key | URL Param / Store / Target | Allowed / Expected Values | Source file:line |
|---|---|---|---|---|
| **View / Tab** | Plan | `fbaMode` | `plan` | `src/lib/sidebar-navigation.ts:1034`<br>`src/components/fba/FbaOutboundWorkspace.tsx:45` |
| **View / Tab** | Combine *(Default)* | `fbaMode` | `combine` (omitted from URL) | `src/lib/sidebar-navigation.ts:1035`<br>`src/components/fba/FbaOutboundWorkspace.tsx:43-51` |
| **View / Tab** | Shipped | `fbaMode` | `shipped` | `src/lib/sidebar-navigation.ts:1036`<br>`src/components/fba/FbaOutboundWorkspace.tsx:46` |
| **View / Tab** | Ready *(Pre-pack readiness)* | `fbaMode` | `ready` | `src/components/fba/FbaOutboundWorkspace.tsx:44` |
| **View / Tab** | Catalog *(FNSKU Master)* | `fbaMode` | `catalog` | `src/components/fba/FbaOutboundWorkspace.tsx:48` |
| **Filter** | Active Sub-Mode | `fbaMode` (or `mode`) | `plan` \| `combine` \| `shipped` \| `ready` \| `catalog` | `src/components/fba/sidebar/fba-workspace-hooks.ts:44-55`<br>`src/lib/fba/fba-modes.ts:1-40` |
| **Filter** | Search Query | `q` | FNSKU, title, SKU, tracking string | `src/components/fba/sidebar/fba-workspace-hooks.ts:46-49`<br>`src/components/admin/FBAManagementTab.tsx:30` |
| **Filter** | Active Draft Plan | `draft` | draft identifier string | `src/components/fba/sidebar/fba-workspace-hooks.ts:56-59` |
| **Filter** | Selected Plan ID | `plan` | numeric plan ID string | `src/components/fba/sidebar/fba-workspace-hooks.ts:60-67` |
| **Filter** | Main View Toggle | `main` | `print` \| `plan` | `src/components/fba/sidebar/fba-workspace-hooks.ts:68-72` |
| **Filter** | Details Overlay | `details` | `catalog` | `src/components/fba/sidebar/fba-workspace-hooks.ts:73-76` |
| **Filter** | Refresh Token | `r` | timestamp string | `src/components/fba/sidebar/fba-workspace-hooks.ts:55` |
| **Filter** | Ready Disposition Tab | `rtab` | disposition facet string | `src/components/fba/sidebar/fba-workspace-hooks.ts:53` |
| **Filter** | Open Shipment ID | `openShipmentId` | numeric shipment ID | `src/components/fba/FbaOutboundWorkspace.tsx:109-122` |
| **Action** | Combine Selected Items | bottom `SlicedActionDock` | launches `FbaCombineWorkspace` overlay | `src/components/fba/FbaOutboundWorkspace.tsx:185-205` |
| **Action** | Clear Selection | `FBA_BOARD_TOGGLE_ALL` ('none') | unchecks all board rows | `src/components/fba/FbaOutboundWorkspace.tsx:196-203` |
| **Action** | Quick Add FNSKU | modal button | opens `FbaQuickAddFnskuModal` | `src/components/fba/FbaOutboundWorkspace.tsx:227` |
| **Action** | Create FBA Plan | modal button | opens `FbaCreatePlanModal` | `src/components/fba/FbaOutboundWorkspace.tsx:228` |
| **Action** | Detail Panel Inspect | `setDetailItem(match)` | opens `FbaBoardDetailPanel` | `src/components/fba/FbaOutboundWorkspace.tsx:232-242` |
| **Recents List** | Active Plans & Tracking Bundles | API `GET /api/fba/active-with-details` | `{ active: FbaPlan[], shipped: FbaShipment[] }` | `src/components/fba/sidebar/FbaSidebarRails.tsx:50-120`<br>`src/lib/fba/api-paths.ts:20` |
| **Recents List** | Unallocated FBA Buckets | component state in `FbaUnallocatedBucket` | unassigned item lines | `src/components/fba/sidebar/FbaUnallocatedBucket.tsx:1-80` |
| **Scan Input** | FNSKU Scanner (Sidebar) | `FbaWorkspaceScanField` | FNSKU barcode | `src/components/fba/sidebar/FbaWorkspaceScanField.tsx:1-90` |
| **Scan Input** | Floor FBA Station Scanner | `StationFbaInput` | FNSKU / SKU barcode | `src/components/fba/StationFbaInput.tsx:1-120` |
| **Saved Views** | FBA Board Filter Presets | None *(transient URL state)* | — | `src/components/fba/FbaOutboundWorkspace.tsx:64-95` |
| **Count / Badge** | Stage Counts API | `GET /api/fba/stage-counts` | `{ counts: Record<string, number> }` | `src/app/api/fba/stage-counts/route.ts:1-50` |
| **Count / Badge** | Selection Total Badge | `boardSelection.length` / `selectedUnits` | `Combine N items · M units` | `src/components/fba/FbaOutboundWorkspace.tsx:187` |

---

### label-intake — Labels & docs (contextual since 2026-09-27)

Governed by `SIDEBAR_PAGE_NAV` (`label-intake`, children `allocate` / `uploads` / `orders`, bare keys 1 · 2 · 3), `NAV_PAGE_DECLS['label-intake']`, the route spec `/shipping/label-intake` (`src/lib/routing/outbound-routes.ts`), `src/app/shipping/(desk)/label-intake/page.tsx` and `src/features/labels-docs/LabelsDocsDesk.tsx`. The old `LabelIntakeLedger` is deleted; Shipping labels (`?view=labels`) and Paperwork (`?view=paperwork`) merged into Orders (`?view=orders`, 2026-10-05). The machine-checked rows live in `parity.ts` (`'label-intake'`).

| Element Type | Name / Key | URL Param / Store / Target | Allowed / Expected Values | Source |
|---|---|---|---|---|
| **View** | Bulk *(Default)* | sidebar child `uploads`, bare route | a file explorer (operator 2026-10-06): one row per uploaded PDF, day headers by the active sort's date, a Printed badge (Printed · Printed x/y · none); a row click previews the original PDF in the right pane, checkboxes print several files | `src/features/labels-docs/files/FilesDesk.tsx` |
| **View** | Orders | sidebar child `orders`, `?view=orders` | one row per open order with its slot strip (Shipping label · Packing slip · Product paperwork), lines under the chevron; the open order in the right pane | `src/features/labels-docs/orders/OrdersDesk.tsx` |
| **Sort** | Sort (Bulk) | `?sort=` | `newest` *(default: Newest uploaded)* · `oldest` · `last-printed` (never-printed files last, under "Not printed") | `NAV_PAGE_DECLS['label-intake'].items.uploads` (`FILES_CONTROLS`) |
| **Filter** | Print status (Bulk) | `?printing=` (facet `label-intake.uploads`, painted between Sort and the date windows) | `not-printed` · `partly` · `printed` (All = none); counts under every other filter | `src/lib/nav/facets/label-intake-files.ts` |
| **Filter** | Uploaded (Bulk) | `?from=` · `?to=` (sidebar date control) | `YYYY-MM-DD`, inclusive; unset = any date | `FILES_CONTROLS` |
| **Filter** | Printed (Bulk) | `?printedFrom=` · `?printedTo=` (sidebar date control) | `YYYY-MM-DD`, inclusive; unset = any date | same |
| **Search** | Find files (Bulk) | `?q=` (sidebar Find, server-side) | file name, tracking on any page, order number of any matched page | `src/lib/label-prints/print-files.ts` |
| **Search** | Find orders (Orders) | `?q=` (sidebar Find, server-side) | order number (full or last 8), tracking, SKU, item number, product title | `src/lib/label-prints/order-packets.ts` |
| **Filter** | Status (Orders) | `?status=` (facet `label-intake.orders`) | `missing` · `ready` · `printed` (All = none); counts under every other filter | `src/lib/nav/facets/label-intake-orders.ts` |
| **Filter** | Missing slot (Orders) | `?gap=` (facet, comma list) | `label` · `slip` · `paperwork` | same |
| **Filter** | Channel (Orders) | `?channel=` (facet, comma list) | `orders.account_source` values, case as stored | same |
| **Sort** | Sort (Orders) | `?sort=` | `priority` *(default: Missing › Ready › Printed, then ship-by)* · `ship-by` · `newest` · `oldest` · `order` | `NAV_PAGE_DECLS['label-intake'].items.orders` (`ORDERS_CONTROLS`) |
| **Action** | Upload (⌘O; the face on Bulk) + drag-drop anywhere on the desk | nav intent `labels-docs:upload` | PDFs, no type choice → `/api/v1/label-batches`; each page classified by size (4×6-class = shipping label, else paperwork) and matched to orders silently | `src/features/labels-docs/files/FilesDesk.tsx` |
| **Action** | Print (⌘P on Bulk) | nav intent `labels-docs:print-selected` | the checked files, else the open one — every page in page order, labels to the 4×6 station, paperwork to the Letter station, one reprint confirm | same |
| **Action** | Print order (⌘P on Orders) | nav intent `labels-docs:print-orders` | the checked orders, else the open one — labels then paperwork in the same order, each stock to its station | `src/features/labels-docs/orders/OrdersDesk.tsx` |
| **Action** | Upload (⌘O on Orders) | nav intent `labels-docs:upload` | the open order's first missing slot, typed + targeted (`labels-docs:upload-order`, `OrderPane`); no open order = PDFs into Bulk's file list (no type choice) | same |
| **Action** | Buy label (Orders) | `?view=orders&buy=1` | the desk's Buy a label compose in the pane | same |
| **Record** | File pane (Bulk) · Order pane (Orders) | right `DeskSelectionDock` (a drawer when narrow) | — | `src/features/labels-docs/*` |
| **Count** | Bulk counts | facet `label-intake.uploads` (`countPrintFiles`) | All · Not printed · Partly printed · Printed under every non-status filter | `src/lib/label-prints/print-files.ts` |

---

### Shipping — removed 2026-09-26

On 2026-09-26, all above-table controls were removed from the Shipping desk tables in commit **`e7dc59dd7b5b6ce2b3b9763d123c1b8d727bcc95`** (*"wip: desk sidebar / desk views session work"*). These controls are scheduled for restoration inside the new contextual sidebar in Wave A.

| Removed Control | Component Name | URL Parameter(s) Written | Allowed / Target Values | Commit SHA + Pre-Removal File:Line |
|---|---|---|---|---|
| **Select-All Checkbox** | `GridRowCheckbox` | In-memory selection event | `emitToggleAll(DASHBOARD_ORDERS_SELECTION_SCOPE, 'all' \| 'none')` | `e7dc59d^:src/components/outbound/orders/OutboundOrdersLedger.tsx:456-463` |
| **Search Input** | `SearchField` | `q` (or `search`) | free text search string | `e7dc59d^:src/components/outbound/orders/OutboundOrdersLedger.tsx:464-477` |
| **Filter Menu: Needs Attention** | `DataTableFilterMenu` | `late`, `attention`, `ustatus`, `rowFlag`, `cage` | `late=1` (must_ship), `attention=1` (urgent), `ustatus=BLOCKED` (blocked), `rowFlag=awaiting_customer`, `cage=1` (caged) | `e7dc59d^:src/components/outbound/orders/OutboundOrdersLedger.tsx:478`<br>(wiring: `src/components/unshipped/useToShipChrome.ts:140-153`) |
| **Filter Menu: Stage** | `DataTableFilterMenu` | `stage` | `pending` \| `tested` \| `packed` | `e7dc59d^:src/components/outbound/orders/OutboundOrdersLedger.tsx:478`<br>(wiring: `src/components/unshipped/useToShipChrome.ts:147-152`) |
| **Filter Menu: Aging** | `DataTableFilterMenu` | `aging` | `overdue` \| `today` \| `upcoming` \| `unscheduled` | `e7dc59d^:src/components/outbound/orders/OutboundOrdersLedger.tsx:478`<br>(wiring: `src/components/unshipped/useToShipChrome.ts:143-146`) |
| **Sort Menu** | `DataTableSortMenu` | `sort`, `dir` | column key (`ship_by`, `order_id`, `created_at`, etc.) + `dir=asc` \| `desc` | `e7dc59d^:src/components/outbound/orders/OutboundOrdersLedger.tsx:479` |
| **Saved Views Menu** | `WorkbenchViewsMenu` | localStorage `orders:views` | JSON preset views array | `e7dc59d^:src/components/outbound/orders/OutboundOrdersLedger.tsx:482-488` |
| **Page Size Menu** | `DataTablePageSizeMenu` | localStorage `cf:data-table-page-size` | `20` \| `50` \| `100` \| `200` (via `writeDataTablePageSize`) | `src/components/tables/DataTable.tsx` |
| **Edit Platforms Button** | `Button` ("Edit platforms") | React state `setPlatformsOpen(true)` | opens `CatalogManagerPopover` | `e7dc59d^:src/components/outbound/orders/OutboundOrdersLedger.tsx:500-514` |
| **Row Size Zoom Buttons** | Button Group `Row size` (1 \| 2 \| 3) | localStorage `LEDGER_ROW_ZOOM` | `1` (small) \| `2` (medium, default) \| `3` (large) | `e7dc59d^:src/components/outbound/orders/OutboundOrdersLedger.tsx:515-538` |
| **Density Stepper Buttons** | Buttons `−` and `+` density | React zoom state | decrements / increments zoom index | `e7dc59d^:src/components/outbound/orders/OutboundOrdersLedger.tsx:539-566` |
| **Fullscreen Toggle Button** | `DataTableFullscreenToggle` | `DeskStageContext` toggle | card width (1152px) ↔ fullscreen full-bleed | `e7dc59d^:src/components/outbound/orders/OutboundOrdersLedger.tsx:567` |
| **Exception Category Tabs** | `<nav aria-label="Exception category">` (`exception-category-tabs`) | `category` | `all` \| `unpaired_sku` \| `bad_address` \| `buyer_hold` \| `customs` \| `inventory_sync` \| `fraud` \| `carrier_exception` | `e7dc59d^:src/components/outbound/orders/exceptions/OrderExceptionsWorkbench.tsx:254-282` |
| **Shipped Search Field** | `SearchField` | `q` | package tracking #, recipient, or order string | `e7dc59d^:src/components/shipped/ledger/ShippedLedgerToolbar.tsx:64-73` |
| **Shipped Date Range Picker** | `DateRangePickerField` | `start`, `end`, `period` | ISO dates or period identifiers | `e7dc59d^:src/components/shipped/ledger/ShippedLedgerToolbar.tsx:74-88` |
| **Shipped Type Dropdown** | `DropdownMenu` | `shipped` | `all` \| `store` \| `direct` \| `wholesale` | `e7dc59d^:src/components/shipped/ledger/ShippedLedgerToolbar.tsx:89-104` |
| **Shipped Carrier Dropdown** | `DropdownMenu` | `carrier` | `USPS` \| `UPS` \| `FedEx` | `e7dc59d^:src/components/shipped/ledger/ShippedLedgerToolbar.tsx:105-117` |
| **Shipped Status Dropdown** | `DropdownMenu` | `statusCategory` | `delivered` \| `in_transit` \| `exception` | `e7dc59d^:src/components/shipped/ledger/ShippedLedgerToolbar.tsx:118-130` |
| **Shipped Exceptions Toggle** | `Button` | `exceptionsOnly` | `1` (toggle presence) | `e7dc59d^:src/components/shipped/ledger/ShippedLedgerToolbar.tsx:131-140` |
| **Desk Navigation View Tabs** | `DeskPageChrome` tab links | pathname navigation | `/shipping/exceptions`<br>`/shipping/shortage` *(Picking, formerly Pending)*<br>`/shipping/orders`<br>`/shipping/shipped` | `e7dc59d^:src/design-system/components/DeskPageChrome.tsx:298-320` |
| **Header Action: Add Order** | `OrdersDeskAddAction` | `triage=new` (primary) + menu actions | `?triage=new` (modal), `syncRun` (sync), `?import=csv` (import) | `e7dc59d^:src/components/outbound/orders/OrdersDeskAddAction.tsx:32-150` |
| **Header Action: Past Imports** | `OrdersDeskPastImportsAction` | `openPastImports` state | opens past import review history | `e7dc59d^:src/components/outbound/orders/OrdersDeskPastImportsAction.tsx:28-60` |
| **Header Action: Print Paperwork** | `OrdersDeskLabelsAction` | `paperwork` | `?paperwork=<orderId>` | `e7dc59d^:src/components/outbound/orders/paperwork/OrdersDeskLabelsAction.tsx:42-100` |
| **Header Action: Export CSV** | `DeskExportMenuRegistrar` | browser CSV export | triggers pre-pack orders CSV export | `e7dc59d^:src/components/unshipped/UnshippedTable.tsx:1120-1130` |
| **Header Action: Resolve Exception** | `DeskHeaderAction` (primary "Resolve") | `order` | `?order=<orderId>` | `e7dc59d^:src/components/outbound/orders/exceptions/OrderExceptionsWorkbench.tsx:227-238` |

### Open questions / risks

1. ~~Client-only `LabelIntakeLedger` view state~~ — resolved 2026-09-27: Labels & docs views are sidebar children bound to `?view=`.
2. **Double source of truth for desk badge counts**: The Shipping desk currently consumes `GET /api/orders/queue-counts` for live pre-pack lane numbers (`byStage`, `urgent`, `mustShip`) and `GET /api/orders/desk-counts` for the 5-view desk counts (`exceptions`, `po`, `pick`, `triage`, `shippedToday`). These should be unified under the Phase 3 facets endpoint to avoid divergent numbers (noted in handoff: triage count 38 vs queue-counts total 406).
3. **Pending tab re-labeled to Picking**: The old `shortage` tab (`/shipping/shortage`), historically labeled "Pending", was officially renamed "Picking" on 2026-09-26. Any legacy documentation or bookmarks expecting `pending` must map to `shortage` / `pair=po` / "Picking".
4. **Shipped filters are server-side (operator ruling 2026-09-26).** Shipped's type (`shippedFilter`), carrier (`carrier`), status (`statusCategory`) and exceptions-only (`exceptions=1`) filters — the params the list reads today, not the pre-removal toolbar's `shipped` / `exceptionsOnly` / `start` / `end` / `period` cited above — are answered in `fetchPackerLogRows`' page WHERE (`src/lib/shipping/shipped-filter/shipped-filter-sql.ts`). They now span every row of the date range, not just the loaded page, and they narrow within the window instead of widening it to all-time. `GET /api/nav/facets?context=outbound.shipped` counts packages from the same fragments, so a count equals the list total for that pick (desk-store search and `?ostatus` are not reflected).


## Inventory

### inventory — Inventory

**Page ID**: `inventory`  
**Label**: `Inventory`  
**Domain Group**: `inventory` (`src/lib/sidebar-navigation.ts:1159`)  
**Route / Canonical Href**: `/inventory` (`src/lib/sidebar-navigation.ts:819`, `1159`)  
**Permission**: `sku_stock.view` (`src/lib/sidebar-navigation.ts:1159`)  
**Layout Chrome**: `deskChrome: true`, `railless: true` (`src/lib/sidebar-navigation.ts:1162-1163`)  
**Route Parameter Ownership**: `INVENTORY_ROUTE_PARAMS` (`src/lib/routing/query-mode-routes.ts:327-343`)

---

#### Primary View / Tab Parity Table (`SIDEBAR_PAGE_NAV` Children)

| View / Tab ID | Tab Label | Route / Path | Filters (URL Param + Allowed Values) | Action Buttons | Recents List (Store: Endpoint vs localStorage) | Scan Input | Saved-Views Key | Counts / Badges | Source (file:line) |
|---|---|---|---|---|---|---|---|---|---|
| `stock` | Stock | `/inventory/stock` | • `q`: text query<br>• `room`: comma-separated room codes<br>• `status`: `provisional` \| `paired` \| `on-hold`<br>• `open`: row ID (`${locId}:${sku}:${source}`)<br>• `sku`: text | • "New temp SKU" (`StockLedger.tsx:196`)<br>• Row selection / open record (`StockLedger.tsx:96`)<br>• "Create temp SKU" (`SkuExceptionCreateForm.tsx:120`)<br>• "Pair with catalog SKU" (`SkuExceptionEvidence.tsx:80`)<br>• "Print label" (`StockEvidence.tsx:110`) | None (`store: none`) | `SearchField` with barcode scan auto-submit ("Search by SKU, title, bin, serial…", `StockLedger.tsx:244`) | None | • Total stock pairs count (`totalCount`, `capped` indicator, `StockLedger.tsx:64`, `page.tsx:22`)<br>• Per-room facet count badges (`StockLedger.tsx:280`)<br>• Summary items/bins/SKUs count (`StockEvidence.tsx:45`) | `src/app/inventory/stock/page.tsx:16`<br>`src/components/inventory/stock/StockLedger.tsx:64`<br>`src/lib/routing/query-mode-routes.ts:365` |
| `sku-exceptions` | SKU Exceptions | `/inventory/sku-exceptions` | • `q`: text query<br>• `sku`: placeholder SKU code (`TMP-…`)<br>*(Redirects to `/inventory/stock?status=on-hold`)* | None *(redirect shell)* | None (`store: none`) | None *(forwarded to Stock)* | None | None on redirect shell | `src/app/inventory/sku-exceptions/page.tsx:6`<br>`src/lib/routing/query-mode-routes.ts:390`<br>`src/lib/sidebar-navigation.ts:1169` |
| `ledger` | Ledger | `/inventory` | • `q`: text filter (`PulseView.tsx:22`)<br>• `field`: `all` \| `bin_barcode` \| `zone` \| `room` \| `sku_contained` \| `sku` \| `product_title` \| `brand` \| `unit_id` \| `serial_number` \| `order_id` \| `tracking` \| `user` \| `event_type` \| `rule`<br>• `filter`: multi-select bucket IDs (`full`, `low`, `empty`, `stale`, `in_stock`, `oos`, `available`, `allocated`, `held`, etc.)<br>• `open`: detail-panel selection key<br>• `sku`: single SKU detail view<br>• `bin`: single bin barcode detail view<br>• `unit`: single unit ref detail view<br>• `state`: CSV states<br>• `condition`: CSV conditions<br>• `mode`: `ledger` \| `triage` \| `pulse` \| `replenish` | • "Refresh" activity feed (`PulseView.tsx:75`)<br>• "Back to recent activity" (`InventoryShell.tsx:71`)<br>• Unit photo upload/delete (`ByUnitView.tsx:120`)<br>• Allocation release/reassign (`ByUnitView.tsx:150`)<br>• SKU stock adjust & save (`SkuDetailView.tsx`)<br>• Bin relabel & relocate (`LocationDetailView.tsx`) | Recent activity feed: last 50 events (`store: GET /api/inventory-events?limit=50`, `PulseView.tsx:37`) | `SearchField` in `PulseView` ("Filter activity…", `PulseView.tsx:64`), SKU/bin lookup bars on detail sub-views | None | • Event count (up to 50 in `PulseView`)<br>• Unit status badges (`unitStatusBadgeClass`, `ByUnitView.tsx:28`)<br>• SKU stock quantity badges | `src/app/inventory/page.tsx:4`<br>`src/components/inventory/InventoryShell.tsx:15`<br>`src/components/inventory/PulseView.tsx:12`<br>`src/lib/inventory-search.ts:10-70`<br>`src/lib/routing/query-mode-routes.ts:327` |
| `triage` | Tracking Exceptions | `/inventory/triage` | • `open`: tracking_exception ID<br>• `mode`: `triage`<br>• `q`: text search<br>• `field`: search field<br>• `filter`: bucket filter | • "Resolve" (`PATCH status: resolved`, `TriageWorkspace.tsx:164`)<br>• "Discard" (`PATCH status: discarded`, `TriageWorkspace.tsx:173`)<br>• "Reopen" (`PATCH status: open`, `TriageWorkspace.tsx:183`)<br>• "Save notes" (`TriageWorkspace.tsx:242`) | None (`store: none`) | Tracking number / exception search box | None | • Status badge: `open` \| `resolved` \| `discarded` (`triageStatusBadgeClass`, `TriageWorkspace.tsx:149`)<br>• Zoho check count badge (`TriageWorkspace.tsx:215`) | `src/app/inventory/triage/page.tsx:4`<br>`src/components/inventory/TriageWorkspace.tsx:45`<br>`src/lib/sidebar-navigation.ts:1171` |
| `pulse` | Pulse | `/inventory/pulse` | • `open`: serial_unit ID<br>• `mode`: `pulse`<br>• `q`: session-local event filter | None *(read-only trace view)* | Chain-of-custody event timeline (`store: GET /api/inventory-events?serial_unit_id=${unitId}`, `PulseWorkspace.tsx:27`) | `SearchField` ("Filter this unit's events…", `PulseWorkspace.tsx:75`) | None | • Unit status badge (`unitStatusBadgeClass`, `PulseWorkspace.tsx:135`)<br>• Current location bin chip (`PulseWorkspace.tsx:140`)<br>• SerialChip, SkuScanRefChip | `src/app/inventory/pulse/page.tsx:4`<br>`src/components/inventory/PulseWorkspace.tsx:25`<br>`src/lib/sidebar-navigation.ts:1172` |
| `graph` | Graph | `/inventory/graph` | • `view`: `parts` \| `relationships` (`parents` \| `children` \| `tree`)<br>• `sku`: focused SKU code | • "Add Connection" (`SkuGraphToolbar.tsx:64`)<br>• Graph view toggles (`parents`, `children`, `tree`; `SkuGraphToolbar.tsx:50`)<br>• "Recenter graph on this SKU" (`SkuGraphWorkspace.tsx:90`)<br>• "Delete relationship" (`SkuGraphDetailPanel.tsx:65`)<br>• "Add Part Link", "Not a Part", "Remove Link" in Parts | None (`store: none`) | Sku search input with typeahead dropdown (`useSkuCatalogSearch`, `SkuGraphWorkspace.tsx:34`) | None | • Node stock count badge (`stock`, `SkuGraphWorkspace.tsx:82`)<br>• Node tier badge: `parent` \| `child` \| `component` | `src/app/inventory/graph/page.tsx:5`<br>`src/components/inventory/graph/InventoryGraphRouter.tsx:10`<br>`src/components/inventory/graph/SkuGraphWorkspace.tsx:20`<br>`src/lib/routing/query-mode-routes.ts:340` |
| `replenish` | Replenish | `/inventory?section=replenish` | • `section`: `replenish`<br>• `rtab`: `need` \| `fifo`<br>• `rsku`: SKU code search<br>• `rstatus`: `OPEN` \| `ORDERED` \| `SHIPPED` \| `RECEIVED` \| `CANCELLED` \| `IGNORED` \| `RESOLVED` \| `DISMISSED` | • "Create PO" (`ReplenishmentNeedTable.tsx:43`)<br>• Batch actions: "Change status", "Assign vendor"<br>• "Save purchasing plan" (`ReplenishmentPlanEvidence.tsx:85`)<br>• "Transition status" (`ReplenishmentNeedTable.tsx:105`) | None (`store: none`) | SKU search input (`rsku`, `ReplenishWorkspace.tsx:11`) | None | • Total items needing order (`payload.total`, `ReplenishmentNeedTable.tsx:40`)<br>• Replenishment status badges per row (`ReplenishmentPlanRecord.tsx:35`) | `src/components/replenish/ReplenishWorkspace.tsx:8`<br>`src/components/replenish/ReplenishmentNeedTable.tsx:25`<br>`src/lib/routing/query-mode-routes.ts:333` |
| `locations` | Locations | `/inventory/locations` | • `tab`: `labels` \| `bays` \| `rooms` \| `bins` \| `totes` \| `map` \| `manage`<br>• `room`: room filter<br>• `code`: bay/rack code<br>• `q`: search bins/locations<br>• `status`: bin status<br>• `showEmpty`: boolean flag<br>• `view`: map mode (`grid` \| `floorplan` \| `occupancy` \| `drift`)<br>• `serial`: text<br>• `new`: `true`<br>• `edit`: boolean flag<br>*(Special bin print route)*:<br>• `barcode`: string<br>• `count`: int copies | • "Print Labels" / "Generate Tags" / "Download PDF" (`LabelPrintWorkspace.tsx:120`)<br>• "Generate Bay Labels" (`RackLabelWorkspace.tsx:90`)<br>• "Print Tote Plates" (`TotePlateWorkspace.tsx:85`)<br>• "Bulk Actions" ("Print barcodes", "Export CSV", "Relocate", `BinsBulkActionBar.tsx:40`)<br>• "Save Room" (`RoomDetailForm.tsx:75`)<br>• "Add Location" / "Edit" (`LocationsManagementTab.tsx:110`)<br>• "Print label" / copies +/- (`special-bin/page.tsx:80`) | None (`store: none`) | Bins search & barcode scan bar ("Scan or type a bin barcode…", `BinsFilterBar.tsx:45`) | None | • Total bins count (`useBinsOverview`, `BinsTable.tsx:50`)<br>• Bin occupancy status pills: `EMPTY`, `OCCUPIED`, `STALE`, `NEVER_COUNTED`<br>• Bay & Room occupancy percentage badges | `src/app/inventory/locations/page.tsx:5`<br>`src/components/warehouse/LocationsWorkspace.tsx:25`<br>`src/lib/inventory/locations-path.ts:8`<br>`src/lib/routing/query-mode-routes.ts:347-362`<br>`src/app/inventory/locations/print/special-bin/page.tsx:25` |
| `reason-codes` | Reason Codes | `/inventory/reason-codes` | Local component state (no URL params):<br>• `filter`: text search (`code` or `label`)<br>• `flowFilter`: vocabulary dropdown (`inventory_event`, `inventory_adjust`, `substitution`, `short_pick`, `receiving_exception`, `repair_failure`, `verdict_detail`, `warranty_denial`, `lifecycle_unshipped`, `lifecycle_outbound`, `serial_absent_reason`, `station_command`) | • "New Reason Code" dialog opener (`ReasonCodesManagementTab.tsx:210`)<br>• "Edit" reason code dialog opener (`ReasonCodesManagementTab.tsx:270`)<br>• "Delete" reason code confirmation (`ReasonCodesManagementTab.tsx:285`)<br>• "Print station command label" (`ReasonCodesManagementTab.tsx:298`)<br>• Dialog "Save" / "Cancel" (`ReasonCodesManagementTab.tsx:480`) | None (`store: none`) | None | None | • Reason codes total count (`rows.length`)<br>• Direction badge: `In` \| `Out` \| `Either`<br>• Requirements badges: `note`, `photo`<br>• Flow context category badge | `src/app/inventory/reason-codes/page.tsx:6`<br>`src/components/admin/ReasonCodesManagementTab.tsx:30-150`<br>`src/lib/sidebar-navigation.ts:1179` |
| `favorites` | Quick Picks | `/inventory/favorites` | Local component state (no URL params):<br>• `workspace`: `repair` \| `sku-stock` \| `fba`<br>• `filter`: text search (`sku`, `label`, `productTitle`) | • "New Shortcut" dialog opener (`FavoritesManagementTab.tsx:170`)<br>• "Edit" shortcut dialog opener (`FavoritesManagementTab.tsx:220`)<br>• "Delete" shortcut confirmation (`FavoritesManagementTab.tsx:235`)<br>• Dialog "Save" / "Cancel" (`FavoritesManagementTab.tsx:410`) | None (`store: none`) | None | None | • Filtered shortcut count (`filtered.length`)<br>• Status active/inactive badge | `src/app/inventory/favorites/page.tsx:6`<br>`src/components/admin/FavoritesManagementTab.tsx:20-150`<br>`src/lib/sidebar-navigation.ts:1180` |
| `health` | Health | `/inventory/health` | None (`INVENTORY_HEALTH_ROUTE_PARAMS.owns = {}`) | • "Timeline →" submit in Unit lookup form (`LookupForms.tsx:22`, calls `lookupUnit` server action -> `/inventory/pulse?open={ref}`)<br>• "Detail →" submit in SKU lookup form (`LookupForms.tsx:38`, calls `lookupSku` server action -> `/inventory/health/sku/{sku}`)<br>• Sub-desk quick link navigation buttons (`StatusSections.tsx:102`) | Recent events feed: last 20 events (`store: inventory_events`, `RecentEventsSection`, `TableSections.tsx:150`) | Unit lookup text input (serial or ID, `LookupForms.tsx:16`), SKU lookup input (`LookupForms.tsx:32`) | None | • Feature flag count and active badges (`StatusSections.tsx:15`)<br>• Preflight badges: `PASS` \| `WARN` \| `FAIL` (`StatusSections.tsx:60`)<br>• Open drift alerts count badge (`TableSections.tsx:20`)<br>• Unreconciled allocations count (`TableSections.tsx:110`) | `src/app/inventory/health/page.tsx:16`<br>`src/app/inventory/health/_inventory-admin/LookupForms.tsx:10`<br>`src/app/inventory/health/_inventory-admin/StatusSections.tsx:50`<br>`src/lib/routing/query-mode-routes.ts:408` |

---

#### Inventory Operations Sub-Desks (Nested under Health Frame)

These 6 desks run inside the Inventory desk frame (`InventoryDeskFrame`) with no tab lit (`resolveChild` returns `null` per `src/lib/sidebar-navigation.ts:1186-1193`):

| Sub-Desk | Path | Filters (URL Param + Allowed Values) | Action Buttons | Recents List (Store) | Scan Input | Saved-Views Key | Counts / Badges | Source (file:line) |
|---|---|---|---|---|---|---|---|---|
| **Events Explorer** | `/inventory/events` | • `event_type`: `RECEIVED` \| `TEST_START` \| `TEST_PASS` \| `TEST_FAIL` \| `PUTAWAY` \| `MOVED` \| `ALLOCATED` \| `PICKED` \| `PACKED` \| `LABELED` \| `STAGED` \| `SHIPPED` \| `RETURNED` \| `SCRAPPED` \| `HELD` \| `RELEASED_HOLD` \| `RELEASED` \| `ADJUSTED` \| `LISTED` \| `NOTE` \| `TRIAGED` \| `REPAIR_STARTED` \| `REPAIR_COMPLETED` \| `GRADED`<br>• `station`: `RECEIVING` \| `TECH` \| `PACK` \| `SHIP` \| `MOBILE` \| `SYSTEM`<br>• `sku`: text<br>• `unit`: serial_unit_id<br>• `actor`: actor_staff_id<br>• `since`: YYYY-MM-DD<br>• `until`: YYYY-MM-DD<br>• `q`: search across event facts<br>• `page`: integer page offset | • "Filter" submit button (`EventsExplorerTable.tsx:85`)<br>• "Reset" filter button (`EventsExplorerTable.tsx:90`)<br>• Pagination: "Next", "Previous" (`EventsExplorerTable.tsx:110`) | Paginated global events table (`store: inventory_events`, 100 per page, `src/app/inventory/events/page.tsx:14`) | None | None | • Total matching events count (`total`, `page.tsx:135`)<br>• Event type badge, station badge, status transition pill (`prev_status -> next_status`) | `src/app/inventory/events/page.tsx:12`<br>`src/lib/routing/query-mode-routes.ts:469-485` |
| **Bulk Allocate** | `/inventory/bulk-allocate` | • `page`: integer page offset (`0`-indexed) | • "Allocate" button per candidate row (server action `allocateOne`, `AllocationCandidatesTable.tsx:55`)<br>• Pagination: "Next", "Previous" | None (`store: none`) | None | None | • Total allocation candidates count (`total`, `page.tsx:42`)<br>• Stocked available units badge per row (`available_stocked`, `page.tsx:50`) | `src/app/inventory/bulk-allocate/page.tsx:14`<br>`src/lib/routing/query-mode-routes.ts:455` |
| **Holds (Quarantine)** | `/inventory/holds` | • `error`: `missing_input` \| `not_found` | • "Place on hold" submit (`holdAction`, `page.tsx:64`)<br>• "Release hold" action button per row (`releaseAction`, `page.tsx:94`) | None (`store: none`) | Unit identifier input (`ref`: serial or ID, `page.tsx:135`) | None | • Count of quarantined units (`units.length`, `page.tsx:28`)<br>• Condition grade badge, restored status badge | `src/app/inventory/holds/page.tsx:16`<br>`src/lib/routing/query-mode-routes.ts:419` |
| **Returns Intake** | `/inventory/returns` | • `ok`: `1` (flash)<br>• `error`: `missing_serials` \| `failed` \| `not_found`<br>• `missing`: CSV of unmatched serials | • "Process return intake" submit (`intakeAction`, `page.tsx:40`) | Recent returns table: last 50 RETURNED events (`store: inventory_events`, `loadRecentReturns`, `page.tsx:20`) | Multi-line serials textarea ("Paste or scan serial numbers...", `page.tsx:150`) + tracking input | None | • Success flash banner with processed count<br>• Error banner listing missing serials count | `src/app/inventory/returns/page.tsx:16`<br>`src/lib/routing/query-mode-routes.ts:425` |
| **Throughput** | `/inventory/throughput` | • `range`: `24h` \| `72h` \| `7d` | • Range switch buttons: `24h`, `72h`, `7d` (`page.tsx:160`) | None (`store: none`) | None | None | • Total events KPI tile (`page.tsx:32`)<br>• Active staff actors KPI tile (`page.tsx:33`)<br>• Distinct units moved KPI tile (`page.tsx:34`)<br>• Breakdown counts by event type, actor, hourly station volume | `src/app/inventory/throughput/page.tsx:16`<br>`src/lib/routing/query-mode-routes.ts:462` |
| **Cycle Counts** | `/inventory/cycle-counts` & `/inventory/cycle-counts/[id]` | • `error`: `missing_name` \| `failed` \| `invalid_qty`<br>• `status`: `all` \| `pending` \| `counted` \| `pending_review` \| `approved` (on `[id]/page.tsx`) | • "Create campaign" submit (`createCampaignAction`, `page.tsx:47`)<br>• On `[id]/page.tsx`: "Add Bins to Campaign", "Close Campaign", "Approve Line", "Recount Line" | None (`store: none`) | None | None | • Total lines count (`total_lines`, `page.tsx:28`)<br>• Counted lines badge (`counted_lines`)<br>• Pending review lines badge (`pending_review_lines`)<br>• Approved lines badge (`approved_lines`)<br>• Campaign status badge: `draft` \| `in_progress` \| `closed` | `src/app/inventory/cycle-counts/page.tsx:13`<br>`src/app/inventory/cycle-counts/[id]/page.tsx:15`<br>`src/lib/routing/query-mode-routes.ts:412` |


## Products

### products — Products

- **Registry ID / Label**: `id: 'products'` · `label: 'Products'` (`src/lib/sidebar-navigation.ts:1136-1150`, `APP_SIDEBAR_NAV:326`, `src/lib/nav/lanes.ts:27`)
- **Canonical Route**: `/products` (`PRODUCTS_ROUTE_PARAMS` in `src/lib/routing/query-mode-routes.ts:217-235`)
- **Permission**: `requires: 'sku_stock.view'` (`src/lib/sidebar-navigation.ts:1136`)
- **Sidebar Component**: `ProductsSidebarPanel` (`src/components/sidebar/ProductsSidebarPanel.tsx:44-123`)
- **Workspace Dispatcher**: `ProductsWorkspace` (`src/components/products/ProductsWorkspace.tsx:42-67`)

| View / Tab | Filters (URL Param + Allowed Values) | Action Buttons | Recents List (Store / Key) | Scan Inputs | Saved-Views Key | Counts / Badges | Source (file:line) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Manuals** (`id: 'manuals'`, default view) | • `view`: omitted or `manuals` (`src/components/products/products-view.ts:18-23`)<br>• `q`: string fuzzy text filter (`src/components/sidebar/ProductsSidebarPanel.tsx:76`)<br>• `id`: positive integer (`product_manuals.id`) (`src/components/manuals/ManualLibrary.tsx:55`, `src/lib/routing/query-mode-routes.ts:233`) | • **Upload a manual** FAB (`src/components/manuals/LibraryBrowser.tsx:112-123`)<br>• **Rename folder** trigger (`src/components/manuals/LibraryBrowser.tsx:48`)<br>• **Bulk Move / Delete / Clear** (`src/components/manuals/LibraryBrowser.tsx:99-106`)<br>• **Edit** manual metadata (`src/components/manuals/ManualLibrary.tsx:212-221`)<br>• **Replace** underlying file (`src/components/manuals/ManualLibrary.tsx:223-233`)<br>• **Delete / Undo** soft delete (`src/components/manuals/ManualLibrary.tsx:235-247, 180-205`)<br>• **Open** external link (`src/components/manuals/ManualLibrary.tsx:250-258`) | None (hierarchical folder/file tree fetched via `GET /api/product-manuals`, `src/components/manuals/library/hooks/useManualsData.ts:25-38`) | `SearchBar` text input in sidebar header (`src/components/sidebar/ProductsSidebarPanel.tsx:87-97`, placeholder "Fuzzy filter folders & manuals…") | None | • Folder item count: `currentNode.totalCount` (`src/components/manuals/LibraryBrowser.tsx:72, 85`)<br>• Bulk selection count: `sel.selection.size` (`src/components/manuals/LibraryBrowser.tsx:100`)<br>• Status badge: `manual.status` (`src/components/manuals/ManualLibrary.tsx:201-205`)<br>• Type badge: `manual.type` (`src/components/manuals/ManualLibrary.tsx:206-210`) | `src/lib/sidebar-navigation.ts:1143`<br>`src/components/manuals/ManualLibrary.tsx:50-265`<br>`src/components/manuals/LibraryBrowser.tsx:34-138` |
| **SKU Barcodes** (`id: 'labels'`) | • `view`: `labels`<br>• `labelsView`: `print`, `history`, default `recent` (omitted) (`src/components/labels/labels-view.ts`, `src/components/labels/LabelsProductsWorkspace.tsx:37-45`)<br>• `q`: catalog search text (`src/components/labels/LabelsProductsWorkspace.tsx:44, 73`)<br>• `historyId`: serial/unit lookup key (`src/hooks/useLabelsHistoryIdParam.ts`, `src/components/labels/ProductLabelsRecentRail.tsx:75`)<br>• `facets.status`: status facet filter (`src/components/sidebar/rail-shell/LabelPrintRailFilters.tsx:14`, `src/components/labels/ProductLabelsRecentRail.tsx:77, 107`) | • **Product Pick** in catalog list (`onPick` dispatches `sku:fill`, `src/components/labels/ProductCatalogList.tsx:83-86`, `LabelsProductsWorkspace.tsx:79`)<br>• **Print** label actions in `MultiSkuSnBarcode` (`src/components/labels/LabelsProductsWorkspace.tsx:129-131`)<br>• **Select Tab** (Print / History / Recent toggle) (`src/components/labels/LabelsProductsWorkspace.tsx:55-66, 151-155`)<br>• **Clear history** (`src/components/labels/UnitHistoryFinder.tsx:120, 178`)<br>• **Select history unit** jump (`src/components/labels/UnitHistoryFinder.tsx:83-86, 156-169`) | • `localStorage`: `labels:history-recents:v1` (max 10 entries) (`src/components/labels/UnitHistoryFinder.tsx:10, 40-52`)<br>• Server feed: `GET /api/labels/recent?limit=12` (`src/components/labels/ProductLabelsRecentRail.tsx:30-41`) | • `SearchField` on History tab ("Look up a unit…") dispatches `unit-history:lookup` (`src/components/labels/LabelsProductsWorkspace.tsx:83, 94-102`)<br>• Unit scan resolver (`extractUnitLookupKey` via `routeScan`, parses DataMatrix/serial) (`src/components/labels/UnitHistoryFinder.tsx:21-38, 93-108`) | `products_catalog_saved_views` (surface: `products_catalog`, paramKeys: `['platform', 'linkFilter', 'pending', 'inactive', 'noChannels', 'noManuals', 'noQc', 'colsort', 'coldir']`) (`src/lib/saved-views/surfaces.ts:40, 78, 93`) | • Unit history recents badge: `Recent (${recents.length})` (`src/components/labels/UnitHistoryFinder.tsx:125-130`)<br>• Recent rail count limit: 12 (`src/components/labels/ProductLabelsRecentRail.tsx:30`)<br>• Rail row status dot (`getLabelPrintStatusDot`, `src/components/labels/product-labels-rail-vm.tsx`)<br>• Relative time badge (`railRelativeTime`, `src/components/labels/ProductLabelsRecentRail.tsx:6`) | `src/lib/sidebar-navigation.ts:1144`<br>`src/components/labels/LabelsProductsWorkspace.tsx:42-158`<br>`src/components/labels/ProductLabelsRecentRail.tsx:30-189`<br>`src/components/labels/ProductCatalogList.tsx:28-95`<br>`src/components/labels/UnitHistoryFinder.tsx:10-196` |
| **Pairing** (`id: 'pairing'`) | • `view`: `pairing`<br>• `q`: text filter ("Filter SKU, title, or any platform ID…") (`src/components/sidebar/ProductsSidebarPanel.tsx:75`)<br>• `sort`: `volume` (default), `confidence`, `count`, `title` (`PAIRING_SORTS`, `src/components/products/pairing/types.ts:21-26`, `src/components/sidebar/ProductsSidebarPanel.tsx:28-40`)<br>• `sku`: selected SKU string (`src/components/products/pairing/ProductsPairingShell.tsx:12`, `src/components/sidebar/ProductsSidebarPanel.tsx:149`) | • **Pair identifier** modal trigger (`src/components/sidebar/ProductsSidebarPanel.tsx:165`, `PairingUnmatchedSection.tsx`)<br>• **+ Add SKU** modal trigger (`src/components/sidebar/ProductsSidebarPanel.tsx:166`, `PairingUnmatchedSection.tsx`)<br>• **AddOrPairSkuModal** submit buttons (`src/components/products/pairing/AddOrPairSkuModal.tsx`)<br>• **Accept** suggestion (`onAccept`, `src/components/products/pairing/ProductHubPanel.tsx:98`)<br>• **Reject** suggestion (`onReject`, `src/components/products/pairing/ProductHubPanel.tsx:99`)<br>• **Unpair** confirmed row (`onUnpair`, `src/components/products/pairing/ProductHubPanel.tsx:100`)<br>• **Preview** external listing (`onPreview` opening `ListingResizePanel`, `src/components/products/pairing/ProductHubPanel.tsx:101, 122-128`)<br>• **Save pairings** (commit decisive) (`onCommit`, `src/components/products/pairing/ProductHubPanel.tsx:117`, `PendingFooter.tsx`)<br>• **Discard changes** (`onDiscard`, `src/components/products/pairing/ProductHubPanel.tsx:118`, `PendingFooter.tsx`) | None (live pairing queue from `GET /api/sku-catalog/pairing-queue?q=&limit=20` and `GET /api/sku-catalog/resolve?sku=`, `src/components/products/pairing/ProductsPairingShell.tsx:32-58`) | `SearchBar` in sidebar header (`src/components/sidebar/ProductsSidebarPanel.tsx:75, 87-97`, accepts barcode/SKU/platform ID scans) | None | • Accepted count badge: `selectedCount` in `PendingFooter` (`src/components/products/pairing/ProductHubPanel.tsx:113`)<br>• Unselected suggestion count badge: `unselectedCount` (`src/components/products/pairing/ProductHubPanel.tsx:114`)<br>• Unpair count badge: `unpairCount` (`src/components/products/pairing/ProductHubPanel.tsx:115`)<br>• Queue item suggestion count badges (`src/components/products/pairing/PairingQueueList.tsx`) | `src/lib/sidebar-navigation.ts:1145`<br>`src/components/sidebar/ProductsSidebarPanel.tsx:144-184`<br>`src/components/products/pairing/ProductsPairingShell.tsx:10-114`<br>`src/components/products/pairing/ProductHubPanel.tsx:33-131` |
| **QC Checklist** (`id: 'qc'`) | • `view`: `qc`<br>• `q`: filter products in catalog picker ("Filter products…") (`src/components/sidebar/ProductsSidebarPanel.tsx:78`)<br>• `skuId`: positive integer (`sku_catalog.id`) (`src/hooks/useProductsSkuIdParam.ts`, `src/components/products/QcChecklistWorkspace.tsx:16`, `src/lib/routing/query-mode-routes.ts:227`) | • **Product Pick** in `QcSidebarPicker` (`handleSelect` sets `skuId`, `src/components/sidebar/ProductsSidebarPanel.tsx:210-213, 235-237`)<br>• **Source** button (`SourceThisButton` jumps to `/sourcing?mode=scout&by=model&q=...`, `src/components/products/QcChecklistWorkspace.tsx:102`)<br>• **Add QC Check / Edit / Delete / Reorder** in `QcChecklistSection` (`src/components/manuals/sections/QcChecklistSection.tsx`) | None (`useSkuCatalogSearch(query, { limit: 50, allowEmpty: true, hasQc: true })` fed by `GET /api/sku-catalog/search`, `src/components/sidebar/ProductsSidebarPanel.tsx:192-196`) | `SearchBar` in sidebar header (`src/components/sidebar/ProductsSidebarPanel.tsx:78, 87-97`, accepts SKU barcode scan to narrow QC catalog picker) | None | • QC steps count badge: `{checks.length} steps` (`src/components/products/QcChecklistWorkspace.tsx:103`)<br>• Product category badge: `catalog.category` (`src/components/products/QcChecklistWorkspace.tsx:98`) | `src/lib/sidebar-navigation.ts:1146`<br>`src/components/sidebar/ProductsSidebarPanel.tsx:187-278`<br>`src/components/products/QcChecklistWorkspace.tsx:14-118` |
| **SKU Detail** (Sub-route `/products/sku/[sku]`) | • Path param: `sku` string (`src/app/products/sku/[sku]/page.tsx:8-13`) | • **Platform link** (`ExternalLink` to channel listing, `src/components/products/ProductDetail.tsx:140-150`)<br>• **Save pack profile** (`ProductPackTimeCard.tsx`)<br>• **Save GTIN** (`ProductGtinField.tsx`) | None (`GET /api/products/[sku]`, `src/components/products/ProductDetail.tsx:28-40`) | None | None | • Stock pills: `stock.total_on_hand`, `stock.total_available`, `stock.total_reserved` (`src/components/products/ProductDetail.tsx`)<br>• Platform link status pills (`src/components/products/ProductDetail.tsx`) | `src/app/products/sku/[sku]/page.tsx:1-32`<br>`src/components/products/ProductDetail.tsx:20-295` |

---

### sourcing — Sourcing

- **Registry ID / Label**: `id: 'sourcing'` · `label: 'Sourcing'` (`src/lib/sidebar-navigation.ts:1003-1020`, `APP_SIDEBAR_NAV:330`, `domainGroup: 'inbound'`)
- **Canonical Route**: `/sourcing` (`SOURCING_ROUTE_PARAMS` in `src/lib/routing/query-mode-routes.ts:238-268`)
- **Permission**: `requires: 'sourcing.view'` (`src/lib/sidebar-navigation.ts:1003`)
- **Sidebar Component**: `SourcingSidebarPanel` (`src/components/sidebar/SourcingSidebarPanel.tsx:50-175`)
- **Workspace Dispatcher**: `SourcingWorkspace` (`src/components/sourcing/SourcingWorkspace.tsx:17-48`)

| View / Tab | Filters (URL Param + Allowed Values) | Action Buttons | Recents List (Store / Key) | Scan Inputs | Saved-Views Key | Counts / Badges | Source (file:line) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Queue** (`id: 'queue'`, default mode) | • `mode`: omitted or `queue` (`src/lib/sidebar-navigation.ts:1008`)<br>• `status`: `live` (default/open), `resolved`, `dismissed` (`ALERT_STATUS_ITEMS`, `src/components/sidebar/SourcingSidebarPanel.tsx:25-29, 151-164`) | • **Research** button (`Sparkles` icon, `src/components/sourcing/workspace/QueuePane.tsx:85-93`)<br>• **Target: $X** button (prompt to set `replenishTargetCents` via `PATCH /api/sku-catalog/:id`, `src/components/sourcing/workspace/QueuePane.tsx:35-45`)<br>• **Resolve** button (prompt reason, `PATCH /api/sourcing/alerts`, `src/components/sourcing/workspace/QueuePane.tsx:51-54`)<br>• **Dismiss** button (prompt reason, `PATCH /api/sourcing/alerts`, `src/components/sourcing/workspace/QueuePane.tsx:51-54`)<br>• **Source** button (`SourceThisButton`, `src/components/sourcing/SourceThisButton.tsx`)<br>• **Watch** button (`WatchSearchButton`, `src/components/sourcing/WatchSearchButton.tsx`)<br>• **Save candidate** in `ResearchPanel` (`POST /api/sourcing/candidates`, `src/components/sourcing/workspace/QueuePane.tsx:95-108`) | None (`GET /api/sourcing/alerts?status=...`, `src/components/sourcing/workspace/QueuePane.tsx:26-29`) | None | None | • Sourcing queue count: `Sourcing queue ({rows.length})` (`src/components/sourcing/workspace/QueuePane.tsx:58`)<br>• Severity tone badge (`severityTone`, `src/components/sourcing/workspace/QueuePane.tsx:11`)<br>• Demand source pill (`DEMAND_SOURCE_LABEL`, `demandSourceTone`, `src/components/sourcing/workspace/QueuePane.tsx:12-13`) | `src/lib/sidebar-navigation.ts:1008`<br>`src/components/sidebar/SourcingSidebarPanel.tsx:151-169`<br>`src/components/sourcing/workspace/QueuePane.tsx:21-154` |
| **Scout** (`id: 'scout'`) | • `mode`: `scout`<br>• `by`: `model` (default), `serial` (`BY_ITEMS`, `src/components/sidebar/SourcingSidebarPanel.tsx:21-24, 69-80`)<br>• `q`: model name/number or serial query (`src/components/sidebar/SourcingSidebarPanel.tsx:64-75`) | • **Find on eBay** search mutation (`POST /api/sourcing/search`, `src/components/sourcing/workspace/ScoutPane.tsx:75-81, 107`)<br>• **Research** mutation (`POST /api/sourcing/research`, `src/components/sourcing/workspace/ScoutPane.tsx:82-94, 108`)<br>• **Save candidate** from research results (`POST /api/sourcing/candidates`, `src/components/sourcing/workspace/ScoutPane.tsx:96-105`)<br>• **Source** button (`SourceThisButton`, `src/components/sourcing/workspace/ScoutPane.tsx:111`)<br>• **Watch** button (`WatchSearchButton`, `src/components/sourcing/workspace/ScoutPane.tsx:112`) | None (`GET /api/product-models/lookup?{by}={q}`, `src/components/sourcing/workspace/ScoutPane.tsx:21-25`) | `SearchBar` in sidebar header when `by === 'serial'`: placeholder `"Scan or type a serial…"` (`src/components/sidebar/SourcingSidebarPanel.tsx:65, 75`), accepts hardware serial scans | None | • Compatible parts count badge: `Compatible parts ({data.parts.length})` (`src/components/sourcing/workspace/ScoutPane.tsx:47`)<br>• Stock count pill: `0 in stock` / `{part.on_hand} in stock` (`src/components/sourcing/workspace/ScoutPane.tsx:105-107`)<br>• Lifecycle status pill: `part.lifecycle_status` (`src/components/sourcing/workspace/ScoutPane.tsx:106`)<br>• Part role badge: `part.part_role` (`src/components/sourcing/workspace/ScoutPane.tsx:104`) | `src/lib/sidebar-navigation.ts:1009`<br>`src/components/sidebar/SourcingSidebarPanel.tsx:63-90`<br>`src/components/sourcing/workspace/ScoutPane.tsx:17-142` |
| **Watchlist** (`id: 'watchlist'`) | • `mode`: `watchlist`<br>• `status`: `all` (default), `watching`, `ordered`, `imported` (`WATCH_STATUS_ITEMS`, `src/components/sidebar/SourcingSidebarPanel.tsx:30-34, 151-164`) | • **Import** candidate into inventory (`POST /api/sourcing/candidates/:id/import`, `src/components/sourcing/workspace/WatchlistPane.tsx:31-41, 56`)<br>• **Reject** candidate (`PATCH /api/sourcing/candidates/:id`, `src/components/sourcing/workspace/WatchlistPane.tsx:26-29, 57`) | None (`GET /api/sourcing/candidates?status=...`, `src/components/sourcing/workspace/WatchlistPane.tsx:21-24`) | None | None | • Watchlist count: `Watchlist ({rows.length})` (`src/components/sourcing/workspace/WatchlistPane.tsx:45`)<br>• Candidate price badge (`formatCents`, `src/components/sourcing/workspace/WatchlistPane.tsx:54`)<br>• Candidate status pill (`c.status`, `src/components/sourcing/workspace/WatchlistPane.tsx:55`) | `src/lib/sidebar-navigation.ts:1010`<br>`src/components/sidebar/SourcingSidebarPanel.tsx:151-169`<br>`src/components/sourcing/workspace/WatchlistPane.tsx:16-62` |
| **Searches** (`id: 'searches'`) | • `mode`: `searches`<br>(no URL filter params; uses form state) | • **Add** standing search submit (`POST /api/sourcing/saved-searches`, `src/components/sourcing/workspace/SearchesPane.tsx:30-33, 47-59`)<br>• **Run now** search execution (`POST /api/sourcing/saved-searches/:id/run`, `src/components/sourcing/workspace/SearchesPane.tsx:40-43, 76`)<br>• **Pause / Resume** cadence toggle (`PATCH /api/sourcing/saved-searches/:id`, `src/components/sourcing/workspace/SearchesPane.tsx:34-37, 77-81`)<br>• **Remove** standing search (`DELETE /api/sourcing/saved-searches/:id`, `src/components/sourcing/workspace/SearchesPane.tsx:38-40, 82`) | None (`GET /api/sourcing/saved-searches?active=false`, `src/components/sourcing/workspace/SearchesPane.tsx:25-28`) | None | None (persisted in dedicated `sourcing_saved_searches` table) | • Standing searches count: `Standing searches ({rows.length})` (`src/components/sourcing/workspace/SearchesPane.tsx:44`)<br>• Cadence pill (`s.cadence`: daily, weekly, off) (`src/components/sourcing/workspace/SearchesPane.tsx:69`)<br>• Hit count badge: `{s.last_hit_count} hit(s)` (`src/components/sourcing/workspace/SearchesPane.tsx:73`) | `src/lib/sidebar-navigation.ts:1011`<br>`src/components/sidebar/SourcingSidebarPanel.tsx:92-98`<br>`src/components/sourcing/workspace/SearchesPane.tsx:20-88` |
| **Suppliers** (`id: 'suppliers'`) | • `mode`: `suppliers`<br>• `q`: supplier search query (`src/components/sidebar/SourcingSidebarPanel.tsx:101`)<br>• `type`: `all` (default), `ebay_seller`, `distributor`, `salvage`, `oem` (`SUPPLIER_TYPE_ITEMS`, `src/components/sidebar/SourcingSidebarPanel.tsx:35-41, 102-113`)<br>• `supplier`: selected supplier ID or `'new'` editor door (`src/components/sourcing/workspace/SuppliersPane.tsx:27-33`) | • **Add supplier** button (`supplier=new`, `src/components/sourcing/workspace/SuppliersPane.tsx:40-45, 50-55`)<br>• **Select supplier** row link (`supplier=<id>`, `src/components/sourcing/workspace/SuppliersPane.tsx:58-81`)<br>• **Save changes / Delete** in `SuppliersManagementTab` (`src/components/admin/sourcing/SuppliersManagementTab.tsx`) | None (`GET /api/suppliers?stats=1&q=...&type=...`, `src/components/sourcing/workspace/SuppliersPane.tsx:18-25`) | `SearchBar` in sidebar header (`src/components/sidebar/SourcingSidebarPanel.tsx:101`, placeholder "Filter suppliers…") | None | • Suppliers count: `Suppliers ({rows.length})` (`src/components/sourcing/workspace/SuppliersPane.tsx:49`)<br>• Watch candidates stat pill: `s.candidate_count` (`src/components/sourcing/workspace/SuppliersPane.tsx:72`)<br>• Acquisitions stat pill: `s.acquisition_count` (`src/components/sourcing/workspace/SuppliersPane.tsx:73`)<br>• Spend stat: `formatCents(s.spend_cents)` (`src/components/sourcing/workspace/SuppliersPane.tsx:74-77`)<br>• Rating badge: `{s.rating}★` (`src/components/sourcing/workspace/SuppliersPane.tsx:66`)<br>• Lead time badge: `{s.lead_time_days}d lead` (`src/components/sourcing/workspace/SuppliersPane.tsx:65`) | `src/lib/sidebar-navigation.ts:1012`<br>`src/components/sidebar/SourcingSidebarPanel.tsx:100-120`<br>`src/components/sourcing/workspace/SuppliersPane.tsx:13-108`<br>`src/components/admin/sourcing/SuppliersManagementTab.tsx` |
| **Models** (`id: 'models'`)<br>*(Mounts `BoseModelsSidebarPanel`)* | • `mode`: `models`<br>• `search`: filter model name or number in sidebar (`src/components/admin/sourcing/BoseModelsSidebarPanel.tsx:27`)<br>• `model`: selected Bose model ID or `'new'` editor door (`src/components/admin/sourcing/BoseModelsSidebarPanel.tsx:28`, `BoseModelsManagementTab.tsx:54`, `src/lib/routing/query-mode-routes.ts:266`) | • **Add model** button in sidebar (`model=new`, `src/components/admin/sourcing/BoseModelsSidebarPanel.tsx:48-60`)<br>• **Select model** row in sidebar picker (`model=<id>`, `src/components/admin/sourcing/BoseModelsSidebarPanel.tsx:83`)<br>• **Create model** in `CreateModelForm` (`POST /api/bose-models`, `src/components/admin/sourcing/BoseModelsManagementTab.tsx:85-98`)<br>• **Save changes** in `ModelEditCard` (`PATCH /api/bose-models/:id`, `src/components/admin/sourcing/BoseModelsManagementTab.tsx:160-184`)<br>• **Deactivate** model in `ModelEditCard` (`DELETE /api/bose-models/:id`, `src/components/admin/sourcing/BoseModelsManagementTab.tsx:185-188`)<br>• **Add compatible part** in `CompatibilityManager` (`POST /api/part-compatibility`, `src/components/admin/sourcing/BoseModelsManagementTab.tsx:206-215`)<br>• **Remove compatible part** in `CompatibilityManager` (`DELETE /api/part-compatibility/:id`, `src/components/admin/sourcing/BoseModelsManagementTab.tsx:216-220`) | None (picker query: `GET /api/bose-models?q=...`, `src/components/admin/sourcing/BoseModelsSidebarPanel.tsx:32-40`) | `SearchBar` in sidebar header (`src/components/admin/sourcing/BoseModelsSidebarPanel.tsx:64-77`, placeholder "Filter model number or name…") | None | • Model compatibility count badge in sidebar: `{row.compat_count}` with tooltip `N compatible part(s)` (`src/components/admin/sourcing/BoseModelsSidebarPanel.tsx:88-97`)<br>• Compatible parts count badge in detail: `Compatible parts ({parts.length})` (`src/components/admin/sourcing/BoseModelsManagementTab.tsx:227`) | `src/lib/sidebar-navigation.ts:1015`<br>`src/components/sidebar/SourcingSidebarPanel.tsx:145`<br>`src/components/admin/sourcing/BoseModelsSidebarPanel.tsx:25-104`<br>`src/components/admin/sourcing/BoseModelsManagementTab.tsx:50-395` |
| **Compatibility** (`id: 'compatibility'`)<br>*(Mounts `CompatibilitySidebarPanel`)* | • `mode`: `compatibility`<br>• `search`: filter model name/number in sidebar (`src/components/admin/sourcing/CompatibilitySidebarPanel.tsx:26`)<br>• `boseModelId`: selected model ID filter or omitted for "All edges" (`src/components/admin/sourcing/CompatibilitySidebarPanel.tsx:27, 60-70`, `CompatibilityManagementTab.tsx:29`) | • **Select Model / All edges** rows in sidebar picker (`src/components/admin/sourcing/CompatibilitySidebarPanel.tsx:60-74`)<br>• **Remove compatibility edge** compound row action in DataTable (`PartCompatibilityRemovePlane`, `DELETE /api/part-compatibility/:id`, `src/components/admin/sourcing/CompatibilityManagementTab.tsx:36-52`, `PartCompatibilityRemovePlane.tsx`) | None (query: `GET /api/bose-models?q=...` for sidebar; `GET /api/part-compatibility?boseModelId=...` for edges, `src/components/admin/sourcing/CompatibilityManagementTab.tsx:31-34`) | `SearchBar` in sidebar header (`src/components/admin/sourcing/CompatibilitySidebarPanel.tsx:49-62`, placeholder "Filter by model…") | None | • Model compatibility count badge in sidebar: `{row.compat_count}` (`src/components/admin/sourcing/CompatibilitySidebarPanel.tsx:78`)<br>• Total edges count: `Compatibility edges ({rows.length})` (`src/components/admin/sourcing/CompatibilityManagementTab.tsx:73`) | `src/lib/sidebar-navigation.ts:1016`<br>`src/components/sidebar/SourcingSidebarPanel.tsx:146`<br>`src/components/admin/sourcing/CompatibilitySidebarPanel.tsx:22-87`<br>`src/components/admin/sourcing/CompatibilityManagementTab.tsx:25-107` |
| **Analytics** (`id: 'analytics'`) | • `mode`: `analytics`<br>• `range`: `7d`, `30d` (default), `90d`, `1y` (`SOURCING_ANALYTICS_RANGES`, `src/components/sourcing/sourcing-shared.ts`, `AnalyticsPane.tsx:48-59`) | • **Range selector** buttons (`7d`, `30d`, `90d`, `1y`) (`src/components/sourcing/workspace/AnalyticsPane.tsx:50-58`) | None (`GET /api/sourcing/analytics?range=...`, `src/components/sourcing/workspace/AnalyticsPane.tsx:61-65`) | None | None | • KPI stat tiles: Total spend, Cost vs target, Demand fill-rate, Time-to-source (`src/components/sourcing/workspace/AnalyticsPane.tsx:25-32, 62-67`) | `src/components/sidebar/SourcingSidebarPanel.tsx:88-95`<br>`src/components/sourcing/workspace/AnalyticsPane.tsx:45-222` |


## Sales & Support


Detailed audit of all views, tabs, URL filters, action buttons, recents stores, scan inputs, saved-views keys, and count/badge indicators across the **Sales** and **Support** pages in `SIDEBAR_PAGE_NAV`.

---

### sales — Sales

- **Page ID**: `sales` (`src/lib/sidebar-navigation.ts:839`)
- **Label**: `Sales` (`src/lib/sidebar-navigation.ts:839`)
- **Href**: `/dashboard?mode=sales` (`src/lib/sidebar-navigation.ts:839`)
- **Domain Group**: `sales` (`src/lib/sidebar-navigation.ts:840`)
- **Permission**: `dashboard.view` (`src/lib/sidebar-navigation.ts:840`)
- **Desk Chrome**: `true` (`src/lib/sidebar-navigation.ts:842`)
- **Sidebar Context Panel**: `DashboardOrdersContextPanel` (`src/components/sidebar/DashboardOrdersContextPanel.tsx:34-45`):
  - When `isDashboardRepairsMode(searchParams)` (`?mode=repairs`): returns `null` (`src/components/sidebar/DashboardOrdersContextPanel.tsx:41-43`).
  - Otherwise (`mode=sales` or `mode=pickup`): mounts `WalkInHistorySidebar` (`src/components/walk-in/WalkInHistorySidebar.tsx:46`).

| Child ID | Label & Target | View / Tab | Filters (URL Params & Allowed Values) | Action Buttons | Recents List & Store | Scan Input | Saved-Views Key & Surface | Count / Badge | Source File:Line |
|---|---|---|---|---|---|---|---|---|---|
| `counter` | **Counter**<br>`/counter` | Desk kiosk session drive (`CounterWorkspace`) | • `session`: Positive integer session ID (`src/app/counter/page.tsx:13-15`, `src/components/counter/CounterWorkspace.tsx:57`) | • "Start a new visit" (`src/components/counter/CounterWorkspace.tsx:376`)<br>• Tablet bind dropdown (`CounterDeviceAction`, `src/components/counter/CounterWorkspace.tsx:103`)<br>• Consult stance toggle (`ConsultStanceControls`, `src/components/counter/CounterWorkspace.tsx:151`)<br>• Session buttons: "Claim", "Take over", "Release" (`src/components/counter/CounterWorkspace.tsx:173-181`)<br>• Line actions: Quantity, Discount, Void (`src/components/counter/CounterWorkspace.tsx:210-213`)<br>• Retail line: "Add item" (`src/components/counter/CounterWorkspace.tsx:248`)<br>• Intake buttons: "Repair intake", "Sell / Trade-in" (`src/components/counter/CounterWorkspace.tsx:280-320`)<br>• Finish: "Park visit", "Finish visit" (`src/components/counter/CounterWorkspace.tsx:340-360`) | None | None (keyboard text entry for item/price/phone/name) | None | Cart total cents: `formatCents(totals.totalCents)` (`src/components/counter/CounterWorkspace.tsx:201`) | `src/lib/sidebar-navigation.ts:844`<br>`src/app/counter/page.tsx:11-28`<br>`src/components/counter/CounterWorkspace.tsx:57-360` |
| `sales` | **Sales Board**<br>`/dashboard?mode=sales` | Today / All | `mode=sales`; `tab=today|all`; local query and sort state | Open station | Static station links | DataTable search | No generic saved views | Total and day-group counts | `WalkInHistoryHub.tsx`; `SalesHistoryTable.tsx`; `WalkInDeskHeader.tsx` |
| `pickup` | **Local Pickup**<br>`/dashboard?mode=pickup` | Top header `TableTabs` (`WalkInDeskHeader`):<br>• `completed`: 'Completed' (default, omitted from URL)<br>• `draft`: 'Draft' | • `mode`: `pickup` (`src/lib/routing/query-mode-routes.ts:94`)<br>• `tab`: `draft` \| `completed` (maps to API `status=DRAFT|COMPLETED`, `src/lib/walk-in/history-modes.ts:44-58`, `src/components/walk-in/PickupOrdersTable.tsx:21-25`) | • Header: "Open station" (`walkInStationHref('pickup')` → `/pickup`, `src/components/walk-in/WalkInDeskHeader.tsx:44-53`)<br>• Retry: "Try again" (`src/components/walk-in/SalesTransactionsFeed.tsx:78-80`)<br>• Sidebar links: "New sale", "Local pickup", "Repair intake", "Open Walk-In station" (`src/components/walk-in/WalkInHistorySidebar.tsx:30-94`) | Static station links in `WalkInHistorySidebar` (`src/components/walk-in/WalkInHistorySidebar.tsx:14-44`) | None (feed pane) | `pickup_queue_saved_views` (surface `'pickup_queue'`, params `['status', 'colsort', 'coldir']`, `src/lib/saved-views/surfaces.ts:90,129`) | Day band count: `DateGroupHeader total={day.rows.length}` (`src/components/walk-in/SalesTransactionsFeed.tsx:96`) | `src/lib/sidebar-navigation.ts:846`<br>`src/components/walk-in/WalkInHistoryHub.tsx:90`<br>`src/lib/walk-in/history-modes.ts:44-58`<br>`src/components/walk-in/PickupOrdersTable.tsx:21-45`<br>`src/components/walk-in/SalesTransactionsFeed.tsx:96`<br>`src/lib/saved-views/surfaces.ts:90,129` |
| `repairs` | **Repair Service**<br>`/dashboard?mode=repairs` | `RepairCardList`: All / Incoming / Active / Done | `mode=repairs`; `tab`; `search`; `sort`; `openRepair`; `needsLabel`; `channel`; `repairStatus`; `hide` | Card opens `DeskRecordPlane`; checked cards expose `RecordActionStrip` bulk verbs | None | Contextual-sidebar Find | `repair_queue_saved_views` | Visible and open counts | `WalkInHistoryHub.tsx`; `RepairCardList.tsx`; `repair-card-model.ts` |

---

### support — Support items (rebuilt 2026-10-04)

The old Zendesk console (`SupportSidebarPanel`, `SUPPORT_MODES`, `?mode=` / `?tstatus=`) is deleted, and so is the
Tasks board's Support mode (`/?tab=ticket…` now server-redirects to `/support`, `src/app/page.tsx`). `/support` is
its own Workspaces lane (`DOMAIN_GROUPS.support` "Support", door → page `support` "Support items") on the local
Support model; the machine-checked rows live in `src/lib/nav/context/parity.ts` (`support`).

| Surface | Where | Params / ids | Source |
|---|---|---|---|
| Views (left sidebar) | Queue (no view) · Needs reply · Customer followed up · Draft ready · Follow-up due · Unclassified · Internal records · Unassigned · Sync failed · Post-purchase check-ins; bare `1`–`9` | `?view=` (`SUPPORT_LIST_VIEWS`) | `src/lib/sidebar-navigation.ts` (support); `src/lib/support/list/support-list.ts` |
| View counts | View switcher, facet context `support.<view>` (`support.queue`) | `cutSupportList` over `listSupportRows` | `src/lib/nav/facets/support.ts` |
| Facets (left sidebar) | Platform · Account · Assignee, counted with their own param removed | `platform`, `account`, `assignee` (comma lists) | `src/lib/nav/facets/contexts.ts` |
| Sort / Group by (left sidebar) | Most urgent (default) · Newest activity · Longest waiting · Due soonest; Group by Status · Platform · Assignee (unset = none) | `sort`, `group` | `NAV_PAGE_DECLS.support.controls` |
| Find (left sidebar) | Support locator dropdown + pasted list | `q`, `refs`, `located` | `NAV_PAGE_DECLS.support.search`, `src/lib/nav/locate/support-params.ts` |
| Status row (above the table) | New · Open · Pending · On-hold · Solved · Closed chips with server counts | `status` (comma list; filtered server-side by the same param) | `src/features/support/SupportDesk.tsx` |
| Table (body) | `DataTable` + `SUPPORT_TABLE_BINDING` (`support.items`): one row per item — Order ID · Platform · Customer question; `group` bands under sticky heads | `item` opens the row | `src/features/support/support-table.ts`, `src/features/support/SupportTable.tsx` |
| Record | `DeskRecordPlane`: subject · `SupportRecordHeader` · status verb top-right only; body = the conversation (`SupportConversationPanel`), no tabs | `item` (support_tickets.id) | `src/features/support/SupportDesk.tsx`, `src/features/support/SupportStatusVerb.tsx` |
| Create | New Support item (`C` / `N`), inline in the stage | intent `support:create` | `NAV_PAGE_DECLS.support.actions` |

---

### Open questions / risks

1. **`useRecentTickets` localStorage Key Divergence**: `BACKEND-HANDOFF.md:108` and `docs/refactors/sidebar/current-sidebar-inventory.md:49` specify `cycleforge:support:recent-tickets:v1`, but the actual production code in `src/hooks/useRecentTickets.ts:18` uses `support:recent-tickets`. When Phase 2 builds the server-backed `nav_recents` migration and seed, it must either read both keys or normalize from `support:recent-tickets` to prevent wiping user recents on existing browser instances.
2. **Sales Sidebar Nulling on Repair Desk**: `WalkInHistorySidebar` renders for Sales and Local Pickup, but returns `null` when `isDashboardRepairsMode(searchParams)` (`?mode=repairs`) is active (`src/components/sidebar/DashboardOrdersContextPanel.tsx:41-43`). Phase 2's `resolveNavContext` needs to decide whether the contextual sidebar should expose repair station shortcuts or preserve the table-only layout.
3. **Saved Views Coverage**: In `src/lib/saved-views/surfaces.ts`, only `pickup` (`pickup_queue_saved_views`), `repair` (`repair_queue_saved_views`), and `warranty` (`warranty_claims_saved_views`) are backed by generic saved views. Walk-in sales charges, tickets, voicemail, calls, and issues currently have no registered `SAVED_VIEW_SURFACES` entry.


## Operations


Scope: `SIDEBAR_PAGE_NAV` entries `operations` (12 children), `reports`, `studio`, `home`; plus Audit log and Settings › Roles / Access.
All refs are `path:line` as of this scan. "Panel" = second-column context panel mounted by `SidebarContextPanel` (`src/components/sidebar/SidebarContextPanel.tsx`) inside `ContextPanelLayout` (gate: `hasSidebarContextPanel || isStationSurfaceRoute`, `src/components/sidebar/ContextPanelLayout.tsx:61-63`).

Shared facts:
- `/operations` route spec `OPERATIONS_ROUTE_PARAMS` — `src/lib/routing/query-mode-routes.ts:178-214` (`mode` wire = `live|insights|history|signals|plans|reconciliation|checks|goals|quality|staff|sync|logs`, `src/components/sidebar/operations/operations-sidebar-shared.ts:22-61`; carries `staff, staffId, colsort, coldir, pane, layout, weekOffset` `query-mode-routes.ts:49`).
- **`/operations` does NOT mount `SurfaceParamHygiene`** (only `DeskPageLayout`, `src/app/operations/layout.tsx:5-7`; page `src/app/operations/page.tsx:9-15`) — so undeclared params below survive today but would be stripped if hygiene is ever mounted.
- No route-param spec exists for `/reports`, `/studio*`, `/settings*`, `/audit-log` (grep of `src/lib/routing` → none). `/review` spec: `query-mode-routes.ts:488-510`. `/` spec: `query-mode-routes.ts:141-158`.
- Operations desk tabs = nav children via `useDeskPageChromeTabs` (`src/components/desk/useDeskPageChromeTabs.ts:39-87`, permission-filtered by child `requires`, `router.push` on change `:77`).

### operations — Operations

Nav: `src/lib/sidebar-navigation.ts:858-905` (children `:866-881`, `resolveChild` `:883-904`). Right-pane router: `src/features/operations/workspace/OperationsWorkspace.tsx:37-69`. Panel router: `src/components/sidebar/OperationsSidebarPanel.tsx:67-84`.

| View (child id) | Kind | Item | URL param / allowed values / store | file:line | Notes |
|---|---|---|---|---|---|
| all | view/tab | Desk tab strip (12 children, gated `packing-review`→`packing.review`, `quality`→`sku_stock.view`, `staff`→`admin.manage_staff`, `logs`→`admin.view_logs`) | `?mode=` per child; `packing-review` → `/review` | `src/lib/sidebar-navigation.ts:866-881`; `src/components/desk/useDeskPageChromeTabs.ts:51-80` | Mounted by `src/app/operations/layout.tsx:6` |
| all | context panel | `OperationsSidebarPanel` | routeKey `operations` (also `/signals`) | `src/components/sidebar/SidebarContextPanel.tsx:42`; `src/lib/sidebar-navigation.ts:443,471-472` | |
| all | view | Kiosk/TV board takeover | `?tv=1` (NOT in route spec) | `src/features/operations/workspace/OperationsWorkspace.tsx:44-50` | `OperationsTvBoard`, `GET /api/operations/tv-board` `src/features/operations/workspace/useOperationsTvBoard.ts:24` |
| all | view | Legacy `?mode=plans` redirect → `/forge` (`?view=live` forwarded) | `mode=plans`, `view=live` | `OperationsWorkspace.tsx:26-35,67` | |
| live | view | `OperationsDashboard` (goal hero, KPIs, exceptions, pipeline, feed) | bare `/operations` (`mode` absent/`live`) | `OperationsWorkspace.tsx:68`; `src/features/operations/components/OperationsDashboard.tsx:19-94` | `GET /api/dashboard/operations?timeRange=24h`, key `OPERATIONS_QUERY_KEY` `src/features/operations/components/useOperationsDashboardData.ts:23-25` |
| live | count/badge | Primary KPI tiles → open `KpiDetailsModal` | local state `openKpi` | `OperationsDashboard.tsx:20,56,86-91`; `src/features/operations/components/PrimaryKpiGrid.tsx:21-26` | |
| live | count/badge | Secondary tiles "Out of stock" (→`/dashboard?unshipped&ustatus=BLOCKED`), "Tests overdue" (→`/operations`) | — | `src/features/operations/components/SecondaryKPITiles.tsx:111-128` | |
| live | count/badge | Exceptions row: Tracking exceptions (→`?mode=reconciliation`), Replenishment backlog (→`/inventory?section=replenish`), Aged repairs (disabled, `–`) | — | `src/features/operations/components/ExceptionsRow.tsx:33-51,73-101` | `/api/tracking-exceptions`, `/api/replenishment/tasks` |
| live | count/badge | Pipeline: FBA stages (→`/fba`), RMA stages (→`/support`) | — | `src/features/operations/components/PipelineRow.tsx:104-162` | `/api/fba/stage-counts`, `/api/rma` |
| live | action | Retry snapshot (degraded) | — | `OperationsDashboard.tsx:36-41` | |
| live | panel: filter | "Filter live activity…" search (local state, not URL) | `useState` `q` | `OperationsSidebarPanel.tsx:89,129-136` | Filters cached `activityFeed` |
| live | panel: count/badge | 4 KPI tiles (Scans today / Tested today / FBA scans today / Repair queue) | reads `OPERATIONS_QUERY_KEY` cache (enabled:false) | `OperationsSidebarPanel.tsx:91-109,142-155` | |
| live | panel: recents | Live feed (first 24 events) | cache `activityFeed` | `OperationsSidebarPanel.tsx:157-181` | |
| checks | view | `OperationsChecksView` + `DailyCheckReportPanel` (read-only) | `?mode=checks` | `OperationsWorkspace.tsx:66`; `src/features/operations/workspace/OperationsChecksView.tsx:27-100` | `useDailyChecks(dateKey,'all')` `:47` → `GET /api/daily-checks?date=&scope=all` `src/lib/daily-checks/use-daily-checks.ts:18` |
| checks | filter | Day stepper Prev/Next (Next disabled on today) | `?date=YYYY-MM-DD` (absent = today PST) | `OperationsChecksView.tsx:31-45,52-72` | spec `date: paramDateKey` `query-mode-routes.ts:183` |
| checks | action | "Run the list" link → `/` | — | `OperationsChecksView.tsx:73-81` | |
| checks | panel | Static teaching copy | — | `OperationsSidebarPanel.tsx:435-448` | |
| packing-review | view | `/review` → `ReviewWorkspace`: Packing table (default), Pairing, Catalog link | `?mode=` wire `packer|pairing|catalog-link` (`pairing`/`catalog-link` claimed by Products nav) | `src/app/review/page.tsx:6-14`; `src/features/review/ReviewWorkspace.tsx:45-179`; `src/features/review/review-mode.ts:6-27`; `sidebar-navigation.ts:884-889` | `/review` has NO `DeskPageLayout` → Operations tab strip disappears here. Mounts `SurfaceParamHygiene` `review/page.tsx:9` |
| packing-review | view/tab | Packed (default) / Shipped / History table tabs | `?rtab=shipped|history` (packed = absent) | `src/features/review/ReviewPackingTable.tsx:33-37,48,130-141,181-183`; `src/lib/packing/review-packing-tabs.ts:6-15` | Packed: `packedOrdersQuery`; Shipped: `dashboardShippedQuery` (this week, limit 500); History: `usePackReviewQueue('history')` `:54-77` |
| packing-review | filter | Table search "Filter order #, SKU, tracking…" (**local state**, server-answered on Shipped only) | `useState` — spec declares `?search=` but it is not written | `ReviewPackingTable.tsx:49,143-144,184-190`; spec `query-mode-routes.ts:506-507` | |
| packing-review | filter | Staff filter (`StaffFilterButton`) | `?staff=<id>` (`STAFF_FILTER_PARAM`) | `src/components/sidebar/review/ReviewSidebarPanel.tsx:23-33`; `ReviewPackingTable.tsx:50`; `src/hooks/useStaffFilter.ts:13` | Only for `packer`/`pairing` modes |
| packing-review | action | Open row → detail overlay | `?packerLogId=`, `?orderId=` (clears `choreId, exceptionId, section`) | `ReviewWorkspace.tsx:97-114,152-165` | Close → `clearSelection` `:87-95` |
| packing-review | context panel | `ReviewSidebarPanel` (staff filter + teaching card) | routeKey `review`, mounted via `isStationSurfaceRoute` (NOT in `CONTEXT_PANEL_ROUTE_KEYS`) | `SidebarContextPanel.tsx:88`; `sidebar-navigation.ts:379-390,509`; `ReviewSidebarPanel.tsx:20-42` | |
| insights | view | `OperationsInsightsView` → `AiChatConversation` (SSE `/api/ai/chat/stream`, in-memory messages) | `?mode=insights` | `src/features/operations/workspace/OperationsInsightsView.tsx:12-35`; `src/components/ai/useAiChat.ts:54-58` | No persistence |
| insights | panel: action | "New chat" (`emitAiChatNew`) | window event | `OperationsSidebarPanel.tsx:202-209` | |
| insights | panel: action | 4 "Try asking" prompt buttons (`emitAiChatPrompt`) | window event | `OperationsSidebarPanel.tsx:60-65,229-243` | Capabilities cards static `:53-58,217-227` |
| history | view | `OperationsHistoryView`: focused Record timeline / Browse feed / empty | `?mode=history` | `src/features/operations/workspace/OperationsHistoryView.tsx:89-376` | Trace `GET /api/operations/journey?…` `src/lib/queries/operations-journey-queries.ts:86`; browse gated by `isOperationsHistoryBrowseEnabled()` `:103-114` |
| history | scan input | "Paste order, serial, or tracking…" (Enter commits; debounced 300ms) | writes `?order=|?serial=|?tracking=|?unit=` per `dim` | `OperationsSidebarPanel.tsx:370-404`; `src/components/sidebar/operations/useOperationsTimelineUrlState.ts:143-154` | |
| history | filter | Dimension slider Order / Serial / Tracking | `?dim=order|serial|tracking` (spec also `unit`) | `OperationsSidebarPanel.tsx:407-412`; `operations-sidebar-shared.ts:71-79`; spec `query-mode-routes.ts:202` | |
| history | saved views | System presets chips: Receiving / Pack / Tech / Shipping & carrier / Floor activity | `?view=sys:<id>` | `src/lib/operations/saved-view-presets.ts:13-26`; `src/components/sidebar/operations/HistoryBrowseFilters.tsx:118-127` | Mirrored (inlined) in `src/proxy.ts:357-361` |
| history | saved views | User saved views chips + "Save view" (window.prompt) | server `GET/POST /api/operations/saved-views`; react-query key `['operations-saved-views']`; applied `?view=<numeric id>` | `src/hooks/useOperationsSavedViews.ts:24,37-57`; `HistoryBrowseFilters.tsx:102,110-114,128-136,206-213` | Any hand filter edit drops `?view=` `useOperationsTimelineUrlState.ts:124` |
| history | filter | Station chips RECEIVING/TECH/PACK/SHIP/FBA | `?stations=` CSV | `operations-sidebar-shared.ts:82-88`; `HistoryBrowseFilters.tsx:139-149` | |
| history | filter | Event chips (10 types) | `?types=` CSV | `operations-sidebar-shared.ts:91-102`; `HistoryBrowseFilters.tsx:151-157` | |
| history | filter | Source chips sal/inventory/audit(needs `admin.view_logs`)/carrier/warranty | `?sources=` CSV | `HistoryBrowseFilters.tsx:24-32,106-108,159-165` | |
| history | filter | When: All / Today / 7d / 30d | `?from=`, `?until=` | `HistoryBrowseFilters.tsx:167-180`; `useOperationsTimelineUrlState.ts:168-177` | |
| history | filter | Staff select | `?staffId=` | `HistoryBrowseFilters.tsx:182-197` | |
| history | filter | Status (setter only, no UI) / browse text | `?status=`, `?q=` | `useOperationsTimelineUrlState.ts:156-166,191-198` | `?q=` set by audit-log redirect |
| history | count/badge | Active filter count + Clear | derived | `useOperationsTimelineUrlState.ts:260-266`; `HistoryBrowseFilters.tsx:199-224` | |
| history | count/badge | Event count (browse + trace); related-signals badge ("N signals →", cap 20+) | `GET /api/entity-signals?entityType&entityId&limit=20` | `OperationsHistoryView.tsx:60-87,247-252,360-363` | Badge links `operationsSignalsBrowseHref` |
| history | action | Clear record; Retry; Load more; Export CSV; Print/PDF; Record grouping toggle (local) | — | `OperationsHistoryView.tsx:170-179,214-222,257-270,293-301,332-359` | cursor param deleted on any filter change `useOperationsTimelineUrlState.ts:126` |
| signals | view | `SignalsWorkspace` → Timeline (default) / Browse | `?signalsView=browse` (timeline = absent) | `src/features/signals/SignalsWorkspace.tsx:10-12`; `src/features/signals/signals-url.ts:8-36` | Legacy `/signals` → 308-style redirect `src/app/signals/page.tsx:15-30` |
| signals | filter | Time window 7d/30d(default)/90d/all | `?window=` | `OperationsSidebarPanel.tsx:252-257,313-327`; `src/features/signals/SignalsHistoryWorkspace.tsx:25` | |
| signals | filter | Signal kind (All + 6 kinds) | `?signalKind=return_reason|warranty_denial|exception_why|triage_outcome|test_fail_reason|buyer_note` | `OperationsSidebarPanel.tsx:328-343`; `src/lib/surfaces/registry.ts:141-181` | |
| signals | filter | Browse notes search | `?q=` | `OperationsSidebarPanel.tsx:350-357`; `src/features/signals/SignalsBrowseWorkspace.tsx:49,68-78` | `GET /api/entity-signals?limit=200&q=` |
| signals | action | Select signal → detail | `?signalId=` | `SignalsBrowseWorkspace.tsx:48,81-90,134-145` | `GET /api/entity-signals/:id` |
| signals | filter (dead) | History→Signals cross-link writes `entityType`, `entityId`, `nodeId` | not in spec; **not read** by `SignalsBrowseWorkspace` | `src/lib/operations/history-links.ts:33-46` | Drift |
| reconciliation | view | `OperationsReconciliationView`: smear candidates + open tracking exceptions | `?mode=reconciliation` | `src/features/operations/workspace/OperationsReconciliationView.tsx:33-139` | `GET /api/operations/reconciliation` `:28,34-38` |
| reconciliation | count/badge | KpiStrip Smear candidates / Open exceptions | derived | `OperationsReconciliationView.tsx:52-65` | |
| reconciliation | action | "Open queue" → `/tracking-exceptions` | — | `OperationsReconciliationView.tsx:103-108` | |
| reconciliation | panel | Static teaching copy | — | `OperationsSidebarPanel.tsx:420-433` | |
| goals | view | `GoalsAnalyticsTab` (history chart) | `?mode=goals`; reads `?staffId=` | `OperationsWorkspace.tsx:56`; `src/components/admin/GoalsAnalyticsTab.tsx:49-73` | `GET /api/staff-goals/history?days&station` |
| goals | filter | Range 7D/14D/30D + station ALL/TECH/PACK (local state) | `useState` | `GoalsAnalyticsTab.tsx:10-11,38-42,59-60,145-160` | |
| goals | context panel | `GoalsSidebarPanel` | — | `OperationsSidebarPanel.tsx:77`; `src/components/sidebar/GoalsSidebarPanel.tsx:222-420` | |
| goals | panel: filter | Goal view dropdown All/Below 70%/70–99%/100%+ | `?goalView=behind|on-track|exceeded` (NOT in spec) + writes `?section=goals` | `GoalsSidebarPanel.tsx:18-23,226,245-265,324-331` | |
| goals | panel: filter | "Filter staff or role" search | `?search=` (NOT in spec) | `GoalsSidebarPanel.tsx:225,336-343` | |
| goals | panel: action | Pick staff card | `?staffId=` (deletes `section`) | `GoalsSidebarPanel.tsx:234-240,366-375` | |
| goals | panel: action | Inline goal edit (PUT `/api/staff-goals`); Refresh Goal Data; Clear Filters | window `admin-goals-refresh` | `GoalsSidebarPanel.tsx:104,386-416` | |
| goals | panel: count/badge | Current Goals count | derived | `GoalsSidebarPanel.tsx:352-354` | |
| quality | view | `QualityDashboardTab` (risk tiles, top failures, repairs, high-risk units; read-only) | `?mode=quality` | `OperationsWorkspace.tsx:57`; `src/components/admin/QualityDashboardTab.tsx:34-165` | `GET /api/quality/dashboard` |
| quality | context panel | **Falls through to `LiveSidebar`** (no quality branch) | — | `OperationsSidebarPanel.tsx:67-84` | Drift |
| staff (People) | view | `StaffScheduleTab` (schedule board, availability, bulk buttons) | `?mode=staff`; reads `?staffId=` | `OperationsWorkspace.tsx:58`; `src/components/admin/StaffScheduleTab.tsx:21-142` | |
| staff | action | Bulk: All Tech Mon-Fri On/Off, All Packer Mon-Fri On/Off | — | `src/components/admin/staff-management/BulkScheduleButtons.tsx:16-46` | |
| staff | context panel | `StaffScheduleSidebarPanel` | — | `OperationsSidebarPanel.tsx:78`; `src/components/admin/StaffScheduleSidebarPanel.tsx:51-183` | `GET /api/staff?active=false`, key `qk.staff.all` `:62-70` |
| staff | panel: filter | All/Active/Inactive + All roles/Testing/Packing chips | `?staffView=active|inactive|technician|packer` (NOT in spec) + `?section=staff_schedule` | `StaffScheduleSidebarPanel.tsx:27-37,54,93-120` | |
| staff | panel: filter | "Filter name or ID…" | `?search=` (NOT in spec) | `StaffScheduleSidebarPanel.tsx:123-141` | |
| staff | panel: action | Pick staff row | `?staffId=` | `StaffScheduleSidebarPanel.tsx:151-158` | |
| sync | view | `SystemSyncActivityTab`: job cards, run history | `?mode=sync` | `OperationsWorkspace.tsx:59`; `src/components/admin/SystemSyncActivityTab.tsx:40-133` | cron-runs summary/list hooks |
| sync | filter | Job card select / Clear filter (local state) | `useState jobFilter` | `SystemSyncActivityTab.tsx:42-43,93,106-115` | |
| sync | action | Refresh; Run now (POST `/api/cron-runs/run?job=`) | — | `SystemSyncActivityTab.tsx:47-55,68-75,166-171` | |
| sync | context panel | **Falls through to `LiveSidebar`** | — | `OperationsSidebarPanel.tsx:67-84` | Drift |
| logs | view | `AdminLogsTab` | `?mode=logs`; reads `?search=`, `?logKind=`, `?actorStaffId=`, `?eventId=` | `OperationsWorkspace.tsx:60-64`; `src/components/admin/AdminLogsTab.tsx:46-74` | `GET /api/admin/logs`; key `['admin-logs',{…}]`. `initialSearch` prop from `?q=` is **ignored** (`_props`) `AdminLogsTab.tsx:46` |
| logs | context panel | `LogsSidebarPanel` | — | `OperationsSidebarPanel.tsx:79`; `src/components/admin/LogsSidebarPanel.tsx:89-258` | |
| logs | panel: filter | Kind chips All/Audit/SAL | `?logKind=audit|sal` (NOT in spec) + `?section=logs` | `LogsSidebarPanel.tsx:44-48,139-150` | |
| logs | panel: filter | Actor staff id input | `?actorStaffId=` (NOT in spec) | `LogsSidebarPanel.tsx:152-167` | |
| logs | panel: filter | "Filter action, source, entity…" | `?search=` (NOT in spec) | `LogsSidebarPanel.tsx:170-192` | |
| logs | panel: recents | Day-grouped log rows → select | `?eventId=` (NOT in spec) | `LogsSidebarPanel.tsx:200-233` | |
| logs | panel: action | Prev / Next page (local offset) | `useState offset` | `LogsSidebarPanel.tsx:101,235-253` | |

### reports — Reports

Nav: `src/lib/sidebar-navigation.ts:907-926` (4 children). Page: `src/app/reports/page.tsx`. No route-param spec, no hygiene, no context panel (`getSidebarRouteKey('/reports')` → `unknown`, `sidebar-navigation.ts:519`).

| Kind | Item | URL param / allowed values / store | file:line | Notes |
|---|---|---|---|---|
| view/tab | Page tabs (override nav children): Staff day, Packer day, Bin Utilization, Velocity (30d), Dead Stock (90d+), Tasks, Task time / activity | `?tab=staff|packer|utilization|velocity|dead|tasks|activity` (default `staff`) | `src/app/reports/page.tsx:38-58,413-414,460-464` | **Nav declares only 4** (`staff-day` tab:null, `utilization`, `velocity`, `dead`) `sidebar-navigation.ts:914-924`; `packer/tasks/activity` resolve to `staff-day` |
| filter | Day stepper "‹ Earlier" / "Later ›" (staff, packer, activity) | `?date=YYYY-MM-DD` (default today PST) | `page.tsx:233-265,415-416,421-430` | |
| filter | Find box (Utilization, Tasks server-answered; others client) | **session-local** `useState find` (not URL) | `page.tsx:70-85,418-419,152-170,195-230` | Reset on tab change `:426` |
| filter | Activity: Staff select, Record kind (Tasks/Checklists) | local `useState` | `src/components/reports/TaskActivityReport.tsx:25-26,43-63` | |
| action | Refresh (desk header CTA) | — | `page.tsx:467-479` | activity: invalidates `['task-activity-report', dateKey]` |
| action | Activity "Open record", "Task #N" (→`/?task=N&scope=everyone`) | — | `TaskActivityReport.tsx:90,110` | |
| count/badge | DataTable `totalCount` per tab; Packer footer (packs · minutes · unpaired); Tasks footer (N tasks · late); Activity "X of Y rows" | derived | `page.tsx:169,180,191,218-227,283,308-319`; `TaskActivityReport.tsx:64` | |
| data | Sources: `/api/daily-checks?scope=all`, `/api/packing/reports/export?format=json&day=`, `/api/tasks?lane=done&assignee=all&limit=200`, `/api/reports/{bin-utilization,velocity,dead-stock}` | — | `page.tsx:61-68,99-143` | |
| context panel | none | — | `SidebarContextPanel.tsx:32-92` (no branch) | |

### studio — Automations

Nav: `src/lib/sidebar-navigation.ts:1300-1314` (children Studio `/studio`, Rules `/studio/automations`, Catalog `/studio/catalog`; no `deskChrome`). Gate `studio.view` (`src/app/studio/page.tsx:10`). Context panel for all `/studio/*` except Rules (railless `sidebar-navigation.ts:409-412`).

| View (child id) | Kind | Item | URL param / allowed values / store | file:line | Notes |
|---|---|---|---|---|---|
| graph | view | `StudioShell` canvas (or `StudioUpgradePrompt` if gated) | `/studio` | `src/app/studio/page.tsx:9-15` | Provider mounted app-wide `src/components/layout/WarehouseShell.tsx:68` |
| graph | context panel | `StudioSidebarPanel` | routeKey `studio` | `SidebarContextPanel.tsx:45`; `src/components/sidebar/StudioSidebarPanel.tsx:52-185` | Also mounts on `/studio/catalog` (lens/zoom irrelevant there) |
| graph | filter | Lens: Build(default)/Procedure/Static/Live/Flow²/People/Gaps (Live disabled while editing) | `?lens=procedure|static|live|flow|people|gaps` | `StudioSidebarPanel.tsx:31-44,130-144`; `src/components/studio/studio-workspace/useStudioViewState.ts:30-39` | |
| graph | filter | Zoom L0/L1(default)/L2 | `?z=0|2` (clears `focus`) | `StudioSidebarPanel.tsx:46-50,149-158`; `useStudioViewState.ts:28-29` | |
| graph | filter | Workflow version select | `?v=<definitionId>` | `src/components/studio/StudioShell.tsx:100-106` | |
| graph | action | Node focus / zoom-to / open station | `?focus=<nodeId>`, `?z=` | `StudioShell.tsx:289,297,314-316,375` | |
| graph | panel: action | Node-type palette "add node" (edit only) | — | `src/components/studio/StudioLibrary.tsx:55-88` | |
| graph | panel: action | Templates "import" | — | `StudioLibrary.tsx:125-158`; `src/components/studio/studio-workspace/useStudioPublish.ts:134-154` | sets `v`, clears `focus,z` |
| graph | panel: count/badge + action | Issues (diagnostics) count; click → `focus,z=1,lens=gaps` | — | `StudioLibrary.tsx:177-205`; `StudioSidebarPanel.tsx:176` | |
| graph | action | Simulate toggle; Edit as draft; Add note; Save draft; Publish; Discard draft (confirm); Submit to catalog | local + mutations | `StudioShell.tsx:140-262` | Publish blocked → `lens=gaps` `useStudioPublish.ts:99` |
| rules | view | `AutomationsView` — `AUTOMATION_CATALOG` rows w/ live cron status | `/studio/automations` (railless) | `src/app/studio/automations/page.tsx:10-13`; `src/components/studio/AutomationsView.tsx:238-279` | |
| rules | action | Run now (needs `admin.view`), "Open its rules" link | POST `/api/cron-runs/run?job=` | `AutomationsView.tsx:153-173,246-254` | |
| rules | count/badge | Per-row cron counters | derived | `AutomationsView.tsx:134-150` | |
| catalog | view/tab | Browse (default) / Review (needs `studio.catalog.review`) | `?mode=review` (clears `selectedId`) | `src/app/studio/catalog/page.tsx:8-15`; `src/components/studio/CatalogWorkspace.tsx:16-67` | |
| catalog | action | Select template; "Clone into my workspace" | `?selectedId=<id>`; POST `/api/studio/templates/:id/import` | `src/components/studio/CommunityCatalogWorkbench.tsx:31-44,80-84,220-230` | |
| catalog | count/badge | "N templates" / "N pending" | derived | `CommunityCatalogWorkbench.tsx:106-108`; `src/components/studio/CatalogReviewWorkbench.tsx:88-90` | |
| catalog | action | Review: select (local state), Approve for catalog / Reject | POST `/api/studio/catalog/submissions/:id/review` | `CatalogReviewWorkbench.tsx:46,60-76,194-215` | |

### ai-chat — Chat

Nav: `src/lib/sidebar-navigation.ts` `SIDEBAR_PAGE_NAV` entry (no children) + APP row, FIRST top row (operator 2026-09-27). Page `src/app/ai-chat/page.tsx` → `SessionSurface`; `AiChatNavBridge` registers the `ai-chat:new` intent and publishes the live thread (`usePublishNavLiveRecent('assistant.sessions', …)`). Contract: `NAV_PAGE_DECLS['ai-chat']` (`recentsPanel`, Find `desk-store`, recents `assistant.sessions`, action `chat.new`); rollout `contextual`. The old UI below lives only in MasterNav, which since 2026-09-27 is the phone-width drawer only.

| Kind | Item | URL param / allowed values / store | file:line | Notes |
|---|---|---|---|---|
| action | `+` New chat trailing the Chat row → `AI_CHAT_NEW_EVENT` then `/ai-chat?new=1` | `?new=1` (self-stripping) | `src/components/sidebar/master-nav/SidebarNavList.tsx:547-560` | `chat.new` → `+` on the `‹ Chat` back row (`NavPanelActions`), ⌘⇧O keycap on hover (the chat body's `useSessionHotkeys` chord) |
| recents | Thread list under Chat (on `/ai-chat` only), recency groups, lit open thread, optimistic live thread | `GET /api/ai/chat-sessions` | `src/components/sidebar/master-nav/ChatSessionsNav.tsx:176-234` | `assistant.sessions` adapter (`listAssistantSessions`) |
| rowAction | Rename (inline) | PATCH `/api/ai/chat-sessions/:id` `{ title }` | `ChatSessionsNav.tsx:74-80,150-158` | `rowActions.verbs` `rename` |
| rowAction | Delete (soft) + 10 s Undo → restore | DELETE / PATCH `{ restore: true }` | `ChatSessionsNav.tsx:82-98,160-163` | `rowActions.verbs` `delete` |
| paging | Show more (keyset) | `before=<nextBefore>` | `ChatSessionsNav.tsx:220-230` | `recents.paged`, response `nextBefore` |
| filter | — (new) Find narrows the threads | desk store keyed `/ai-chat` → `q` | `src/lib/nav/recents/surfaces.ts` (`find`) | `/ai-chat` owns no route spec; nothing new in its URL |

### home — Daily

Nav: `src/lib/sidebar-navigation.ts:833-836` (`deskChrome`, no children); APP twin `:285`. Page `src/app/page.tsx:6-14` → `src/features/home/HomeWorkspace.tsx:10-12` → `DailyAgenda`. Rail-less (`hasSidebarContextPanel('/')` false; comment `SidebarContextPanel.tsx:37-39`). Spec `HOME_ROUTE_PARAMS` declares only `mode, date, item, q, filter` (`query-mode-routes.ts:141-158`).

| Kind | Item | URL param / allowed values / store | file:line | Notes |
|---|---|---|---|---|
| view/tab | Lens tabs in desk chrome: All/Daily checklist/Tasks/Tickets/Task+ticket (checklist only in `mine` scope) w/ counts | `?tab=checklist|task|ticket|task_ticket` (all = absent) — **not in spec** | `src/features/home/DailyAgenda.tsx:93,148-151,260-276`; `src/lib/daily/agenda-lens.ts:8-22` | |
| filter | Status TabSwitch All/Open/Done w/ counts | `?filter=open|done` | `DailyAgenda.tsx:53-57,92,153-156,355-362`; `src/features/home/daily-check-filter.ts:8-14` | |
| filter | Scope TabSwitch Mine/Handed off/Everyone | `?scope=handed|everyone` — **not in spec** | `DailyAgenda.tsx:59-67,94,363-369` | |
| filter | Find box "Find a task, order #, tracking #, ticket or person…" (matches link labels → scan-ish) | `?q=` | `DailyAgenda.tsx:91,129-146,345-353` | |
| filter | Civil day | `?date=` | `DailyAgenda.tsx:78-81` | Composer forced closed when not today `:241-243` |
| action | "Add task" (desk header CTA) → composer | `?compose=1` — **not in spec** | `DailyAgenda.tsx:187,232-239,273,278-315` | |
| action | Open record | `?task=<id>` / `?check=<id>` — **not in spec** | `DailyAgenda.tsx:84-90,168-186,333-342` | |
| action | Tick row (checklist mark / task DONE↔OPEN) | POST `/api/daily-checks/mark`; PATCH `/api/tasks/:id` | `DailyAgenda.tsx:190-199`; `src/lib/daily-checks/use-daily-checks.ts:40`; `src/features/tasks/useTaskDesk.ts:87` | |
| action | Checklist composer submit (needs `admin.manage_staff` + today) | POST `/api/daily-checks/items` + links | `DailyAgenda.tsx:209-230,306-311` | |
| recents | Composer queue rail `AgendaRecentRail` (limit 60, eyebrow "Agenda") | react-query `['daily-agenda.rail', version]` (derived) | `src/features/home/AgendaRecentRail.tsx:16,44-120`; `DailyAgenda.tsx:283-289` | |
| recents | Composer glyph recents | localStorage `daily-check-glyph-recents` (cap 8) | `src/lib/daily-checks/composer.ts:48-71` | |
| count/badge | Ledger summary | derived | `DailyAgenda.tsx:398,449-472` | |
| data | `/api/daily-checks?date=&scope=mine`; `/api/tasks?lane=all&…scope` | — | `use-daily-checks.ts:17-30`; `useTaskDesk.ts:64-71` | |
| context panel | none (rail-less) | — | `sidebar-navigation.ts:441` | |

### audit-log — Audit log

Not in `SIDEBAR_PAGE_NAV` or `APP_SIDEBAR_NAV` (comment `sidebar-navigation.ts:343`). **`/audit-log/*` is redirected by the proxy to `/operations?mode=history`** (`src/proxy.ts:363-425`, called `:593`); no `src/app/audit-log` page exists. The live audit viewer is `/settings/audit` (route key `audit-log`, `sidebar-navigation.ts:499`), which therefore mounts `AuditLogSidebarPanel`.

| Kind | Item | URL param / allowed values / store | file:line | Notes |
|---|---|---|---|---|
| view | Redirect `/audit-log[/<section>]` → `/operations?mode=history` + preset | receiving→`stations=RECEIVING&sources=sal,inventory&view=sys:receiving-audit`; packing→`stations=PACK&view=sys:pack-audit`; tech→`stations=TECH&view=sys:tech-audit` | `src/proxy.ts:357-381` | |
| filter | Redirect param mapping: trace `serial|tracking|order`→`dim`+entity; receiving `po`→`q`; packing `tracking`; tech `session|staffId`→`staffId`; sku `sku`→`q` | — | `src/proxy.ts:382-421` | |
| view | `/settings/audit` server page (gate `admin.view_logs`) | `?source=`, `?action=`, `?q=`, `?cursor=` | `src/app/settings/audit/page.tsx:18-33,87-151` | Settings section `src/components/settings/settings-sections.ts:162` |
| filter | GET form Source / Action + Apply / Clear | `?source=`, `?action=` | `src/app/settings/audit/page.tsx:96-127` | |
| filter | Table find "Search action, source, entity, actor, IP…" (server) | `?q=` | `src/app/settings/audit/AuditLogTable.tsx:35,56-66` | |
| action | "Older →" pager | `?cursor=` | `src/app/settings/audit/page.tsx:134-148` | page size 50 `:14` |
| context panel | `AuditLogSidebarPanel` (mounts on `/settings/audit`; `activeSection` never matches → "Select a section in the header.") | routeKey `audit-log` in `CONTEXT_PANEL_ROUTE_KEYS` | `SidebarContextPanel.tsx:59`; `sidebar-navigation.ts:449,499`; `src/components/sidebar/AuditLogSidebarPanel.tsx:18-115` | Section hrefs are `/audit-log/*` `src/components/sidebar/audit-log-panel/audit-log-panel-shared.ts:13-20` — all proxied away. Effectively dead UI |
| panel: scan input | Search bar; Trace mode "Scan or enter a serial…" (GS1 unwrap) | pushes `/audit-log/trace?serial=` | `AuditLogSidebarPanel.tsx:45-65` | Target redirects |
| panel: filter | "Audit Filters" dropdown: Today/Yesterday/Last 7/Custom + Staff | `?day=`, `?start=`, `?end=`, `?staffId=` (written to current pathname) | `AuditLogSidebarPanel.tsx:69-74`; `src/components/audit-log/AuditLogFilterStrip.tsx:37-126` | `/settings/audit` ignores these |
| panel: recents | Trace "Recently traced" (cap 12, case-insensitive dedupe) | localStorage **`audit-log.trace.recents`** (handoff doc's `audit-log:trace-recents:v1` is wrong) | `audit-log-panel-shared.ts:93`; `src/components/sidebar/audit-log-panel/TraceSerialPicker.tsx:16-40,67-81` | |
| panel: action | "Trace \"…\"" button | `/audit-log/trace?serial=` | `TraceSerialPicker.tsx:42-65` | |
| panel: pickers | Receiving PO / Packing tracking / Tech session / SKU lists | `?po=`, `?tracking=`, `?session=`, `?sku=` | `AuditLogSidebarPanel.tsx:79-97`; `src/components/sidebar/audit-log-panel/AuditSectionPickers.tsx:35-46,54-110`; `useAuditSectionList.ts:20-39` | `/api/audit-log/{receiving,packing,tech,sku}?q=&limit=50` |

### settings-roles — Settings › Roles

APP top pin only: `settings` `src/lib/sidebar-navigation.ts:294` (no `SIDEBAR_PAGE_NAV` entry). Panel special-cased `sidebar-navigation.ts:459-461`; `SidebarContextPanel.tsx:50-58`. Page gate `admin.manage_roles` (`src/app/settings/roles/page.tsx:8`). Settings section `src/components/settings/settings-sections.ts:158`.

| Kind | Item | URL param / allowed values / store | file:line | Notes |
|---|---|---|---|---|
| view | `RolesAdminTab` → `RoleEditor` or "Pick a role" empty | `?roleId=<id>` | `src/app/settings/roles/page.tsx:7-19`; `src/components/admin/RolesAdminTab.tsx:11-43` | |
| context panel | `RolesSidebarPanel basePath="/settings/roles"` | — | `SidebarContextPanel.tsx:51-53`; `src/components/admin/RolesSidebarPanel.tsx:38-148` | `GET /api/admin/roles` `:53-66`; refresh on window `admin-roles-refresh` `:70-74` |
| panel: action | Select role | `?roleId=` | `RolesSidebarPanel.tsx:76-80,130` | |
| panel: action | "Create role" → `CreateRoleDialog` (POST `/api/admin/roles`) → selects new | — | `RolesSidebarPanel.tsx:107-115,138-145`; `src/components/admin/roles/CreateRoleDialog.tsx:48` | |
| panel: action | Drag-reorder roles | PATCH **`/api/admin/roles/reorder`** `{order}` (inventory doc said `/order`) | `RolesSidebarPanel.tsx:87-100` | |
| action | Role editor: save, mobile defaults, add/remove member, delete, duplicate | PATCH/DELETE `/api/admin/roles/:id`, `/mobile-defaults`, PUT `/api/admin/staff/:id/roles`, POST `/duplicate` | `src/components/admin/roles/role-editor/useRoleEditor.ts:20-172`; `src/components/admin/roles/DuplicateRoleDialog.tsx:40` | |

### settings-access — Settings › Access

APP top pin `settings` (`sidebar-navigation.ts:294`). Panel special-cased `:461`. Page gate `admin.view` (`src/app/settings/access/page.tsx:8`); section `settings-sections.ts:159` has no `requires`.

| Kind | Item | URL param / allowed values / store | file:line | Notes |
|---|---|---|---|---|
| view | `StaffAccessMatrixTab` → `StaffAccessDetail` or "Pick a staff member" | `?staffId=<id>` | `src/app/settings/access/page.tsx:7-19`; `src/components/admin/StaffAccessMatrixTab.tsx:8-43` | |
| context panel | `AccessSidebarPanel basePath="/settings/access"` | — | `SidebarContextPanel.tsx:54-56`; `src/components/admin/AccessSidebarPanel.tsx:58-264` | `GET /api/admin/staff` `:75-88`; refresh on `admin-access-refresh` `:94-98` |
| panel: filter | "Search name, code, or id…" | `?search=` | `AccessSidebarPanel.tsx:61,158-174` | |
| panel: filter | Status chips all/active/invited/disabled | `?accessStatus=active|invited|disabled` | `AccessSidebarPanel.tsx:47,62,177-193` | |
| panel: count/badge | Stat pills Total / Active / PIN / Passkey | derived | `AccessSidebarPanel.tsx:147-153,196-201` | |
| panel: action | "Add staff" → `AddStaffDialog` (POST `/api/admin/staff`) → selects new | — | `AccessSidebarPanel.tsx:204-214,253-261`; `src/components/admin/access/AddStaffDialog.tsx:45` | |
| panel: action | Select staff row | `?staffId=` | `AccessSidebarPanel.tsx:224-249` | |
| panel: action | Drag-reorder (only unfiltered) | PATCH **`/api/admin/staff/reorder`** (inventory doc said `/order`) | `AccessSidebarPanel.tsx:120-143` | |
| action | Detail: patch staff, permissions, roles, reset/set PIN, revoke passkey/session(s), mobile config, stations | `/api/admin/staff/:id/{detail,permissions,roles,reset-pin,set-pin,passkeys/:pid,sessions,mobile-display-config,stations}`, `/api/admin/sessions/:sid` | `src/components/admin/access/useStaffAccessDetail.ts:26-120`; `src/components/admin/access/useStaffStations.ts:19-34` | |

### Parity drift found (for Phase 0 gate)

1. Reports nav has 4 children; page renders 7 tabs (`packer`, `tasks`, `activity` unregistered) — `sidebar-navigation.ts:914-924` vs `src/app/reports/page.tsx:40-58`.
2. Operations `quality` and `sync` modes render `LiveSidebar` (no branch) — `OperationsSidebarPanel.tsx:67-84`.
3. Ex-admin rails write params absent from `OPERATIONS_ROUTE_PARAMS`: `search`, `goalView`, `staffView`, `logKind`, `actorStaffId`, `eventId`; Signals cross-link writes `entityType/entityId/nodeId` that nothing reads; `?tv=1` undeclared. Harmless only because `/operations` lacks `SurfaceParamHygiene`.
4. `AdminLogsTab` ignores `initialSearch` (from `?q=`) — `OperationsWorkspace.tsx:63` vs `AdminLogsTab.tsx:46`.
5. `/review` (Packing Review) drops the Operations desk tab strip (no `DeskPageLayout`) and its table search is local state though spec declares `?search=`.
6. Home writes `tab`, `scope`, `compose`, `task`, `check` — none in `HOME_ROUTE_PARAMS`.
7. `/audit-log` is fully proxied to Operations History; `AuditLogSidebarPanel` only mounts on `/settings/audit` where its sections/filters are inert. Actual trace-recents key is `audit-log.trace.recents`.
8. Existing inventory doc reorder endpoints are wrong: actual `PATCH /api/admin/roles/reorder`, `/api/admin/staff/reorder`.
9. `StudioSidebarPanel` (lens/zoom/library) also mounts on `/studio/catalog`, where it does not apply.


## Scan Stations


Scope: the `kind: 'station'` rows in `SIDEBAR_PAGE_NAV` (src/lib/sidebar-navigation.ts:831), plus FBA and Label intake. Every ref was re-read on 2026-09-26. Findings from static reading that were not run are tagged `[INFERENCE]`.

### Shared mechanics (every station below)

| Kind | Item | Detail | Ref |
|---|---|---|---|
| Panel host | Desktop left panel | `SidebarContextPanel` picks the panel by `getSidebarRouteKey`: `receiving` → ReceivingSidebarPanel, `tech` → TestingSidebarPanel, `pick` → PickSidebarPanel, `packer` → PackerSidebarPanel, `fba` → FbaSidebarPanel. `outbound` has no branch. | src/components/sidebar/SidebarContextPanel.tsx; src/lib/sidebar-navigation.ts (`getSidebarRouteKey`) |
| Panel host | Mobile | `RouteShell actions=` mounts only on mobile. `?pane=actions\|history`. | src/design-system/components/RouteShell.tsx:21-25 |
| Surface gate | Studio-composed override | `/api/surfaces/{key}/resolve` can swap the page for `SurfaceRenderer`. | src/components/surfaces/SurfaceGate.tsx:31,50-52 |
| URL hygiene | Undeclared keys stripped | `parseRouteParams` keeps only `owns` + `carries`. Mounted on /triage, /unbox, /pickup, /repair, /pack (page), /test (TechPageContent) and /pick (PickPageContent). | src/lib/routing/route-params.ts:184-209; src/hooks/useSurfaceParamHygiene.ts:10-24 |
| Ambient params | `staff, staffId, colsort, coldir, recvId, lineId, openReceivingId, pane, layout(board\|all), weekOffset` | | src/lib/routing/route-params.ts:85-106 |
| Scan input | Station scan bar core | `StationScanBar`: runs the `CMD-*` gate before the host submit (`navCommands` default true), marks SERIAL scans as the subject, hotkey target | src/components/station/scan-bar/StationScanBar.tsx:127,215-216,275,288-299 |
| Scan grammar | `CMD-*` gate | NAV → router push; ACTION → POST `/api/stations/handoff`. Any other `CMD-` is claimed with an "Unknown command" toast. | src/hooks/useStationCommandScan.ts:53-157; src/lib/stations/nav-command-codes.ts:70-77 |
| Scan input | HID wedge sink registry | `useRegisterScanSink` / `setActiveSinkId` / `dispatchScanToActiveSink` | src/lib/station-scan-sink/store.ts:27-68; src/lib/station-scan-sink/useRegisterScanSink.ts:15 |
| Scan input | Focus hotkey (Insert; ⌘. = clear + focus) | localStorage `scan:focus-hotkey`, also persisted to the server | src/lib/scan-hotkey/store.ts:10,61-70,107,147 |
| Scan input | Stance Scan/Preview | localStorage `scan:station-stance`. Preview turns the bar into the rail find field. | src/components/station/scan-bar/scan-stance.ts:8,22,39,49-76 |
| Scan input | GlobalScanDock (header) | Renders only when a `registerScanDockPolicy` is published. No production registrant (tests only), so it is dormant. | src/components/layout/GlobalScanDock.tsx:12-60; src/lib/scan-dock/store.ts:27 |
| Composer | Station composer mode `unbox\|ticket` | URL `composerMode` + sessionStorage `cf.stationComposerMode` | src/lib/composer/station-composer-mode.ts:6-14 |
| Rail row actions | Select / Share link / Hide from my list / Delete carton | Hide → POST/DELETE `/api/receiving/rail-exclusions`. Delete → DELETE `/api/receiving-logs?id=`, gated on `receiving.mark_received`. | src/lib/receiving/rail/row-actions.ts:49-81; src/components/sidebar/receiving/useRailRowDismiss.ts:11-51; useRailRowDelete.ts:28-30; ReceivingFeedRail.tsx:141-167 |
| Rail read filter | Dismissed rows | GET `/api/receiving/rail-exclusions?feedKey=` | src/components/sidebar/receiving/useRailExclusions.ts:15-31 |
| Rail facets | ReceivingLineRow facets: priority tier (0..3) · type · platform (display keep-filter, not URL) | | src/lib/receiving/rail/unbox-rail-facets.ts:13-84; src/components/sidebar/receiving/UnboxRecentRailFilters.tsx:23-119; src/components/sidebar/rail-shell/useReceivingRailFacets.ts |
| Rail row fields (ReceivingLineRow) | id, receiving_id, client_event_id, tracking_number (display), zoho_purchaseorder_number/_id, sku, workflow_status, last_activity_at/created_at, scanned_at, unbox_opened_at, condition_grade, serials[].serial_number, photo_count, zendesk_ticket, receiving_source, zoho_status, needs_test, source_platform(_pill), carrier, assigned_tech_id, priority_tier, is_priority, priority_lane, receiving_type/carton_intake_type | | src/components/sidebar/receiving/RecentActivityRailBase.tsx:137-499; unbox-rail-facets.ts:43-67; feeds.ts:204-206 |
| Nav counts | None on nav rows (the operator's rule) | | src/components/sidebar/master-nav/SidebarNavList.tsx:172-173 |

### triage — Arrival

Route `/triage` (sidebar-navigation.ts:929-931). Page: src/app/triage/page.tsx:10-14 → ReceivingSurfacePage.tsx:16-19. Route key `receiving` (sidebar-navigation.ts:479). Param spec: TRIAGE_ROUTE_PARAMS receiving-routes.ts:149-163, plus SCAN_SURFACE_CARRIES :40-52.

| Kind | Item | Values / endpoint | Ref |
|---|---|---|---|
| View (right pane) | Workbench tabs `?triview=` | `triage` (default, unlit) · `found` "Prioritize" · `unfound` · `done`. Clicking the lit tab resets to triage. | src/utils/triage-workspace-state.ts:6-44; src/components/receiving/triage/TriageWorkspaceView.tsx:38-41,76-92; TriageLineWorkspace.tsx:76 |
| View body | The sidebar rail is always `triageCombined`; the workbench tabs are right-pane only | | src/components/sidebar/receiving/ReceivingRailBody.tsx |
| Filter | `?triq=` carton-list filter | Free text. Local state, debounced 250 ms into the URL (Preview stance only). | useReceivingMode.ts:116,191; ReceivingSidebarPanel.tsx:174-193; TriageWorkspaceView.tsx:34 |
| Filter | `?uf_q=`, `?uf_kind=` (Unfound tab) | text | receiving-routes.ts:157-158 |
| Filter | Rail facets priority/type/platform | Local only, shown in Preview stance | ReceivingSidebarPanel.tsx:160-169,584-586 |
| Filter | `?staff=` | Positive int. Feeds with `usesStaffFilter` read it. | ReceivingFeedRail.tsx:78-80; feeds.ts:432 |
| Scan input | TriageScanBand (ThemedStationScanBar) | Placeholder "Scan tracking #" / batch variants. Has a "Batch sort" chip. | src/components/sidebar/receiving/ReceivingScanBands.tsx:41-94 |
| Scan grammar | `classifyArrivalScan`: command → (batch_sort) location → tracking | `CMD-BATCH-SORT`, `CMD-DEFAULT` | src/lib/receiving/arrival-command-routing.ts:38-89; src/lib/stations/station-command-codes.ts:20-48 |
| Scan submit | `submitTriageScan` | Tracking → `useTrackingScan`, which tries internal code → local tracking → `/api/receiving/lookup-po`. Batch mode uses `resolveOnly`. Shelf commit: GET `/api/locations/{bc}` then PATCH `/api/receiving/{id}`. | ReceivingSidebarPanel.tsx:323-377; useTrackingScan.ts:288-305,420-432,457,535-557; useArrivalBatchSortSession.ts:82,110 |
| Scan submit (sub-calls) | Internal handle resolve | `/api/receiving-lines?id=…`, `/api/serial-units/{id}`, `/api/handling-units/{id}`, `/api/receiving/{id}`, `/api/receiving-lines?tracking_in…` | src/lib/testing/resolve-testing-scan.ts:101-113,252-305,447 |
| Scan submit | Re-scan stamp | POST `/api/receiving/touch-scan` | useTrackingScan.ts:399,457; scan-apply.ts:126 |
| Scan input | Phone-paired scan (Ably `phone_scan`) → submitTrackingScan; result published back as `phone_scan_result` | | src/components/sidebar/receiving/usePhoneScanBridge.ts:27-57; ReceivingSidebarPanel.tsx:285-291 |
| Scan input | Procedure hand-back event `receiving-submit-tracking` | Arrival only | ReceivingSidebarPanel.tsx:389-395 |
| ⚠ Scan conflict `[INFERENCE]` | `CMD-BATCH-SORT` typed into the bar is claimed by the StationScanBar `CMD-` gate before `submitTriageScan` runs, so the command branch at :330 looks unreachable from the bar. | | StationScanBar.tsx:288; useStationCommandScan.ts:150-154; ReceivingSidebarPanel.tsx:328-335 |
| Recents (rail) | Combined Arrival rail, feed `triageCombined`, limit 200. Every Arrival scan path (internal code, cache hit, local tracking, lookup-po matched/unmatched) writes through `showOnArrivalRail` (prepend + reconcile) | `GET /api/receiving-lines?view=scanned&sort=priority&limit=50&offset=0&staff=` ∪ `GET /api/receiving/unfound-queue?kind=unmatched_receiving&checked=false&limit=200&exclude_unbox_intake=true`, deduped per carton | ReceivingSidebarPanel.tsx (rail mount); ReceivingRailBody.tsx; scan-apply.ts `showOnArrivalRail`; src/lib/receiving/rail/feeds.ts |
| Recents annotation | Staging chips | GET `/api/receiving/triage/staging-map` | src/components/sidebar/receiving/useTriageStagingMap.ts:24-27; ReceivingRailBody.tsx (`ArrivalRail`) |
| Recents (tabs) | Done tab | GET `/api/receiving/triage/done?limit=200&q=` | feeds.ts:300-316,480-492; TriageDoneList.tsx:22 |
| Action | Unfound "retry pair" | POST `/api/receiving/unfound-queue/retry-pair` | src/components/sidebar/receiving/TriageUnfoundList.tsx:40 |
| Action | Bulk Dismiss (edit mode) | POST `/api/receiving/rail-exclusions` | TriageWorkspaceView.tsx:93-99; ReceivingBulkActionBar.tsx:24-30; useRailEditMode.ts:109 |
| Action | Multi-match picker | Pick or cancel | ReceivingSidebarPanel.tsx:560-573 |
| Batch strip | ArrivalBatchCaptureStrip: remove one | | ReceivingSidebarPanel.tsx:520-523 |
| Count / badge | Batch count shown in placeholder | No tab counts | ReceivingScanBands.tsx:53-57 |
| Saved views | None mounted | | — |
| Client storage | Carton scratch `receiving:{org}:sidebar.lineDetails.v1:{id}` (+ legacy key) | | src/components/sidebar/receiving/receiving-sidebar-shared.ts:31-41,59-85 |

### receive — Unbox

Route `/unbox` (sidebar-navigation.ts:933-935). Page: src/app/unbox/page.tsx:10-16, with UnboxBrowseShell first-paint loader (UnboxBrowseShell.tsx:20-43). Route key `receiving` (:478). Param spec: UNBOX_ROUTE_PARAMS receiving-routes.ts:70-146.

| Kind | Item | Values / endpoint | Ref |
|---|---|---|---|
| View | Workbench tabs `?unboxview=` | Strip: `incoming` "Inbound" · `viewed` (Recent) · `history`. `queue` is the default (unlit). `all` and `urgent`→queue are deep-link only. | src/utils/unbox-workspace-state.ts:3-95; src/components/receiving/unbox/UnboxWorkspaceView.tsx:54-69 |
| View → feed | queue/all → `view=scanned`; recent → `view=viewed`; history → `view=activity`; incoming → `view=incoming` (+ `incoming_removed`); all → TechAllTriageTable scope unbox | `/api/receiving-lines` | src/lib/receiving/receiving-modes.ts:39-46,208-212,239-241,286-288,323-328,379-382,450-452; UnboxWorkspaceView.tsx:80-88 |
| Incoming facets | Delivered-unscanned / not-unboxed | GET `/api/receiving-lines/incoming/delivered-unscanned`, `/delivered-not-unboxed` | src/components/station/useReceivingLinesData.ts:74-107 |
| Filter | `ustage` staged\|unstaged; `ulane` PO_STOCKOUT\|PO_STANDARD\|RETURN\|HOLD; `priority_only` flag; `ukpi` opened-today\|awaiting-test\|stuck\|priority\|viewed-today\|unfinished | | receiving-routes.ts:93-107; triage-lane-policy.ts:13-30; unbox-metrics.ts:305-332; ReceivingLedgers.tsx |
| Filter | History search `rh_q`, `rh_field` all\|po\|tracking\|sku\|product\|serial, `rh_scope` all\|zoho_po\|unmatched\|unfound; `sort` unboxed_newest\|scanned_newest; `hlayout` drill\|list; `drillPo` | | receiving-routes.ts:85,126-132; receiving-history-search.ts:14-17,49-78,103-125; receiving-modes.ts:62-79 |
| Filter (declared, UI unmounted) | `urange` 24h\|7d\|30d\|90d, `uviz` tiles\|bars\|pie\|line, `clayout` single\|split\|quad, `c0..c3`, `photoPeekDemo`, `unboxdesk`, `openLine` | No KPI canvas or cluster is mounted (grep finds no `<UnboxChromeKpiCluster`/`<UnboxKpiCanvas`). | receiving-routes.ts:83-143 |
| Filter | Rail facets + Preview find text | Local only | ReceivingSidebarPanel.tsx:159-169,530-533,587-590 |
| Scan input | UnboxScanBand → ReceivingUnboxScanBar | Mode rail `ticket`·`tracking`·`order`(PO #). Unarmed submits `auto`. Placeholder "Ticket · Tracking · PO". | ReceivingScanBands.tsx:119-148; ReceivingUnboxScanBar.tsx:15-163 |
| Scan grammar | Server deep-scan in `auto`. Client: `looksLikeTicketScan`, `looksLikeReceivingCode` (R-/RCV-/H-/L-/U-/REP-, unit-id). Internal resolve is skipped for tracking-shaped input. | | useTrackingScan.ts:290-305; resolve-testing-scan.ts:24-99 |
| Scan submit | `submitTrackingScan(undefined,{mode})` | Optimistic rail stub → local tracking → POST `/api/receiving/lookup-po` (intakeSurface=unbox). Open → `applyUnboxCartonOpened` (touch-scan). | ReceivingSidebarPanel.tsx:535-545; useTrackingScan.ts:245-262,433-455,535-557 |
| Scan input (Preview) | previewLookup | GET `/api/receiving/preview-scan?value&mode`, `/api/receiving-lines?receiving_id_in=` | useUnboxPreviewOpen.ts:33-50; ReceivingSidebarPanel.tsx:534 |
| Scan input (right pane) | Serial field `data-unbox-serial-input` (SerialScanField); sink `po-line:<id>` | POST/DELETE `/api/receiving/scan-serial` | SerialScanField.tsx:71,191-239,320; line-edit/PoLineCaptureRow.tsx:269; PoLineRow.tsx:212; line-edit/hooks/useLineSerials.ts:147,343,398 |
| Scan input (right pane) | Location pill scan sink | | src/components/station/location/StationLocationPill.tsx:62-81; line-edit/UnboxNotesLocationControl.tsx:167 |
| Composer (right pane) | Notes/Ticket composer (StationComposerHost) | | line-edit/LineNotesCard.tsx:588; receiving/workspace/LineEditPanel.tsx:140-141 |
| Scan input | Phone bridge (same as Arrival) | | usePhoneScanBridge.ts:27-57 |
| Dead selectors | `[data-unbox-dock-scan]`, `[data-unbox-serial-dock]`, `[data-arrival-dock-scan]` have no setter anywhere | | ReceivingSidebarPanel.tsx:423-425 |
| Recents (rail) | "Unboxed" feed `unboxRecent`, limit 50 | GET `/api/receiving-lines?view=unbox_opened&limit=50&offset=0&staff=` (deduped per carton) | ReceivingRailBody.tsx:66-75; feeds.ts:143-155,181-189,271-289,342-368; unbox-opened-rows.ts:10 |
| Recents write | Recent tab stamp | POST `/api/receiving-lines/view` | receiving/workspace/ReceivingLineWorkspace.tsx:55 |
| Action | Unbox (resume MRU → Recent tab) | `fetchUnboxOpenedRows` | src/components/receiving/unbox/UnboxDeskActions.tsx:38-56,83-91 |
| Action | Check (unreceived-orders rail) | IncomingBulkTrackingPanel (`checkOnly`, own rail occupant) | UnboxDeskActions.tsx:29-32,73-82,100 |
| Action | Add purchase order (Inbound tab only) | `router.push(RECEIVING_PATHS.purchaseNew)` → `/purchasing/new` | UnboxDeskActions.tsx |
| Action | Rail row menu + bulk Dismiss | See shared | ReceivingSidebarPanel.tsx:399-413,597-603 |
| Action | Claim modal (from select mode) | | UnboxWorkspaceView.tsx:97-108 |
| Saved views | Receiving lines grid: none (tableId `receiving` has no SHEET config). `all` tab → `tech_all` views (keys status, staff, colsort, coldir). | `/api/saved-views` surface tech_all | receiving-table-definition.ts:22; DataTable.tsx:1505-1568; src/lib/saved-views/surfaces.ts:136-139 |
| Saved views (orphan) | `receiving_history_saved_views`, `receiving_incoming_saved_views` are defined with no consumer | | src/lib/station/table-url-params.ts:69-75 |
| Count / badge | None in rail or tabs | | — |
| Client storage | Carton scratch (as Arrival); `unbox-displays-push-width` | | receiving-sidebar-shared.ts:31-85; station/displays/StationDisplaysPushStack.tsx:55 |

### pickup — Local Pickup

Route `/pickup` (sidebar-navigation.ts:937-939). Page: src/app/pickup/page.tsx:9-12. Route key `receiving` (:484). Param spec: PICKUP_ROUTE_PARAMS receiving-routes.ts:218-229.

| Kind | Item | Values / endpoint | Ref |
|---|---|---|---|
| View | Single grid (PickupWorkspace). No tab strip. | | ReceivingRightPane.tsx:77-83; src/components/receiving/pickup/PickupWorkspace.tsx:244-291 |
| Filter | `?status=` single filter control | `all`\|`process`\|`draft`\|`done` | src/lib/local-pickup/order-status.ts:70-86; PickupWorkspace.tsx:96,145-172 |
| Filter | `?q=` server search | text | PickupWorkspace.tsx:97-100,261-267 |
| Filter | `?lcpu=` selected order | positive int | PickupWorkspace.tsx:129-134; PickupSidebarRail.tsx:61,93-102 |
| Filter | Rail facet status | process\|draft\|done (local) | src/components/sidebar/rail-shell/PickupRailFilters.tsx:19-57; ReceivingSidebarPanel.tsx:470-477 |
| Filter | Column sort `colsort/coldir` | | PickupWorkspace.tsx:217-224 |
| Scan input | PickupScanBand (ThemedStationScanBar), "Scan PO # or customer…" | | ReceivingScanBands.tsx:166-193; ReceivingSidebarPanel.tsx:463-481 |
| Scan grammar | `resolvePickupScan`: numeric id → exact PO/ref → exact customer → unique partial. Client-side only, over the cached rail. | | src/lib/local-pickup/resolve-pickup-scan.ts:19-56 |
| Scan submit | Writes `?lcpu=`, no network call | | ReceivingSidebarPanel.tsx:211-258 |
| Recents (rail) | LCPU orders rail, limit 200, query key `local-pickup-orders-rail` | GET `/api/local-pickup-orders/lines?limit=500`, grouped per order. Row fields: orderId, poNumber, customer, orderStatus, zohoStatus, itemCount, pickupDate, receivingId. | src/components/receiving/pickup/PickupSidebarRail.tsx:27-32,63-130; pickup-order-rail-vm.tsx:11-47 |
| Grid feed | Query key `local-pickup-lines` | GET `/api/local-pickup-orders/lines?q=…` | pickup-lines.ts:74-87 |
| Action | Create pickup dialog (POST `/api/local-pickup-orders`) | **No opener**: `setCreateOpen(true)` is never called. Global Add "New local pickup" only navigates to `/pickup`. | PickupWorkspace.tsx:103,174-199,293-351; src/lib/local-pickup/create-order.ts:32-54; src/lib/global-add/catalog.ts:209-212 |
| Count / badge | Per-status counts on filter options; `totalCount` | | PickupWorkspace.tsx:144-166,269 |
| Saved views | tableId `pickup` → `pickup_queue` (keys status, colsort, coldir) | | pickup-table-definition.ts:11; surfaces.ts:128-131 |
| Doc drift | The inventory doc says `/api/local-pickup/orders`. The code uses `/api/local-pickup-orders/lines`. | | current-sidebar-inventory.md:86 |

### repair — Repair Service

Route `/repair`, nav-declared `railless` (sidebar-navigation.ts:941-945). Page: src/app/repair/page.tsx:9-12. Route key `receiving` (:490). ReceivingSidebarPanel returns null for this mode (ReceivingSidebarPanel.tsx:456-458). Param spec: REPAIR_ROUTE_PARAMS receiving-routes.ts:232-248.

| Kind | Item | Values / endpoint | Ref |
|---|---|---|---|
| View | `RepairCardList` inside `DeskPageLayout`; `TriageCardList` + `RepairCard` + `DeskRecordPlane`. | | ReceivingRightPane.tsx; RepairCardList.tsx |
| Filter | `?tab=` | `incoming`\|`active`(default)\|`done`\|`all`; contextual-sidebar Status writes it. | history-modes.ts; nav/context/pages.ts |
| Filter | Search | Contextual-sidebar `?search=`, sent as `?q=` to the repair API. | RepairCardList.tsx; useRepairs.ts |
| Sort | Sidebar card order `?sort=` | Newest, oldest, status, SLA, or customer order. | RepairCardList.tsx; repair-sort.ts |
| Filter | `?needsLabel=1` | Declared by the repair route and read by the repair query. | RepairCardList.tsx; receiving-routes.ts |
| Filter | `?openRepair=` record plane (+ GET `/api/repair-service/{id}` fallback) | | RepairCardList.tsx |
| Card feed | Query key `repairs` | GET `/api/repair-service?tab=&q=&needsLabel=&channel=` | src/hooks/useRepairs.ts |
| Action | Intake overlay `?new=true` (one-shot pulse) → POST `/api/repair/submit` | Entry: Global Add `/repair?new=true` | RepairIntakeHost.tsx; global-add/catalog.ts |
| Action | Record action strip, J/K cursor | Shared `DeskRecordPlane`; detail stays `RepairServiceRecordView`. | RepairCardList.tsx; record/useRepairRecordSlot.tsx |
| Action | Card selection | `TriageCardList` selection port and `RecordActionStrip` bulk verbs. | RepairCardList.tsx |
| Scan input | **None** (rail-less, no scan bar) | | ReceivingSidebarPanel.tsx |
| Recents | None | | — |
| Saved views | `repair_queue`: tab, channel, card order, status, exclusion, and Find params. | | table-url-params.ts; surfaces.ts |
| Count / badge | None | | — |

### testing — Quality Control

Route `/test` (sidebar-navigation.ts `testing` row). Quality Control only since 2026-09-27 — the Picker desk moved to `/pick`. Page id `testing` for any `/test` or `/tech` URL; a legacy `?view=` is undeclared and stripped. Page: src/app/test/page.tsx → TechSurfacePage.tsx → TechPageContent.tsx (RouteShell: TestingSidebarPanel + TechDashboard). Route key `tech`. Param spec: TEST_ROUTE_PARAMS (`search`, `testTab`, `composerMode`) in query-mode-routes.ts.

| Kind | Item | Values / endpoint | Ref |
|---|---|---|---|
| View | One mode | No top-pane switch: TechDashboard mounts TestingLineWorkspace directly. The old `?view=receiving` pane (ReceivingInboundFeed) had no in-repo link and was deleted with the split. | src/components/TechDashboard.tsx |
| View | Tabs `?testTab=` | Strip lights only `history`. Default is `returns` (unlit). Unlit toggle goes to `all`. `urgent` and `pending` are deep-link only. | src/utils/testing-workspace-state.ts:6-65; src/components/tech/testing/TestingWorkspaceView.tsx:13-49 |
| View → feed | Queue tabs `view=needs-test&return_scope=returns\|standard\|all` (+`priority_only=1` for urgent). History `view=testing&weekStart/End`. | GET `/api/qc/receiving-lines?limit=500&include=serials&tester=&search=` | src/lib/tech/testing-workspace-query.ts:37-66; TestingHistoryList.tsx:123-146; surface-isolation.ts:108 |
| View → feed | `all` → TechAllTriageTable scope testing | | TechAllTriageTable.tsx:86-117 |
| Filter | `?staff=` (history defaults to self), `weekOffset`, `layout` board\|all | | testing-workspace-query.ts:5-18; TestingHistoryList.tsx:106-111,235-246 |
| Filter | Grid search | Local state. `?search=` is declared but unused. | TestingHistoryList.tsx:105,271 |
| Filter | Rail filter text + facets (SearchField footer) | Local | TestingSidebarPanel.tsx:126-127,456-466 |
| Scan input | TestingScanBar (ThemedStationScanBar, `data-testing-scan`) | Modes: tracking · po (PO#) · serial · sku. The mode rail shows only in Scan stance. Placeholder "Tracking · PO · Serial · SKU". | src/components/sidebar/receiving/TestingScanBar.tsx:27-149 |
| Scan grammar | `resolveTestingScan`: forced type, else code (handle/unit-id/serial/receiving id) → `PO-\d+` → tracking (`classifyInput`) → partial 3–24 (serial, then PO) → SKU | Client-side, calls `/api/receiving-lines?view=all&search_field=…`, `/api/serial-units/{k}`, `/api/handling-units/{id}` | src/lib/testing/resolve-testing-scan.ts:24-99,334-444,447 |
| Scan submit | `runScan` | line → open. multi → pick panel. box → H- rail. manifest → kit rail. Also `/api/serial-units/{k}/photos`. | TestingSidebarPanel.tsx:183,269-344 |
| Scan input | HID sink `testing-scan-bar`; event `testing-focus-scan` | | TestingSidebarPanel.tsx:347-360,382-390 |
| Scan input (right pane) | InlineSerialAdder sink `po-line:<id>` | POST/DELETE `/api/receiving/scan-serial`, `/api/serial-units/{id}/test\|grade\|failure-tags`, `/api/units/next-id`, `/api/post-multi-sn` | receiving/workspace/InlineSerialAdder.tsx:136-190; tech/TestingUnitSlots.tsx:200-216; tech/hooks/useTestingLineController.ts:213-623 |
| Recents (rail) | "Recent" feed `testingRecent`, limit 50 | GET `/api/qc/receiving-lines?view=testing_opened&limit=50&offset=0` (session staff; `?staff=` not read) | TestingRecentRail.tsx:20-35; feeds.ts:318-335,497-512 |
| Recents write | POST `/api/qc/receiving-lines/open` | | src/lib/testing/record-testing-line-open.ts:10-15 |
| Action | Scan-ack chip; multi-pick panel; box/manifest rails | | TestingSidebarPanel.tsx:419-440,475-508 |
| Saved views | None. `testing_history_saved_views` is defined with no consumer. The `all` tab → `tech_all`. | | table-url-params.ts:74; surfaces.ts:136-139 |
| Count / badge | None | | — |
| Client storage | `cf:testing:last-line-id`, `testing-displays-push-width`, `testing-manuals-slide-over-width` | | TestingLineWorkspace.tsx:25,64; TestingPanel.tsx:500; sku-testing/ManualsSection.tsx:197 |
| Doc drift | The inventory doc says the Testing rail reads `/api/receiving-lines?view=testing_opened`. The code reads `/api/qc/receiving-lines`. | | current-sidebar-inventory.md:123,126 |

### ready-to-pack — Picker

Route `/pick?ship=urgent` (sidebar-navigation.ts `ready-to-pack` row, gate `picking.view`). Own page since 2026-09-27: src/app/pick/page.tsx → PickSurfacePage.tsx → PickPageContent.tsx (RouteShell: PickSidebarPanel + PickDashboard). Route key `pick`. Param spec: PICK_ROUTE_PARAMS (`search`, `ship`, `packStation`, `packPlaced`, To-ship facets, `new`) in query-mode-routes.ts. Shell seed: `maybeSeedShell` seeds the Pending grid on bare `/pick`. Phone twin: `/m/pick`.

| Kind | Item | Values / endpoint | Ref |
|---|---|---|---|
| View | Tabs `?ship=` | Strip lights `urgent` and `history`. `pending` is the default (unlit). `all` is deep-link only. | src/utils/shipping-workspace-state.ts:7-70; src/components/tech/shipping/ShippingWorkspaceView.tsx:37-66 |
| View → feed | pending/urgent → UnshippedTable (`/api/orders` queue); history → TechTable (`/api/picking/desk/logs?q=`); all → TechAllTriageTable scope shipping | | ShippingWorkspaceView.tsx:89-102; dashboard-queries.ts:76-129; TechTable.tsx:151 |
| Filter | Urgent writes `attention=1`. Tab switches clear `ustatus, stage, late, surface`. Declared in PICK_ROUTE_PARAMS through `TO_SHIP_QUEUE_FACET_PARAMS`. Tab writes use `readLiveSearchParams` + `window.history.replaceState`. | UnshippedTable reads `attention`/`late` | shipping-workspace-state.ts:41-69; src/hooks/useShippingWorkspaceTab.ts; query-mode-routes.ts (PICK_ROUTE_PARAMS) |
| Filter | `packStation` (positive int), `packPlaced` flag | | query-mode-routes.ts (PICK_ROUTE_PARAMS) |
| Filter | Rail facet platform (account_source), Preview only | Local | StationHistoryRailFilters.tsx:18-89; ShippingSidebarPanel.tsx:39-56 |
| Scan input | ShippingScanBand → ShippingScanBar | Modes tracking · fba ("Amz Prep") · repair · serial. Placeholder "Orders · Amz SKU · Repair · Serial". Preview on. | src/components/sidebar/tech/ShippingScanBand.tsx:46-234; ShippingScanBar.tsx:20-151 |
| Scan grammar | `detectStationScanType`: NAV/ACTION/COMMAND → decoded unit key (SERIAL) → printed handle (REPAIR/HANDLE) → `:`=SKU → `RS-\d+` → FNSKU → YES/USED/NEW/PARTS/TEST command → tracking → SERIAL. FNSKU autodetect in the band. Pack-station barcode arms placement; unit-id stages a unit. | | src/lib/station-scan-routing.ts:34-93; useStationTestingController.ts:43-61,316-409; ShippingScanBand.tsx:90-126 |
| Scan submit | TRACKING → POST `/api/picking/desk/scan`; FNSKU → POST `/api/fba/fnsku-scan`; SKU → `/api/picking/desk/sku`; SERIAL → `/api/picking/desk/serial` (`add` / `add-to-last`); REPAIR → `/api/repair/station-scan`; pack arm → GET `/api/orders/pack-placement`; unit stage → POST `/api/units/pack-placement/move`; manuals → `/api/manuals/resolve` | | hooks/station/handleTrackingScan.ts:26; handleFnskuScan.ts:18; handleSkuScan.ts:18; handleSerialScan.ts:19,115; handleRepairScan.ts:21; useStationTestingController.ts:161,328-331,362-367 |
| Scan input (Preview) | `useShippingPreviewOpen` | GET `/api/orders/lookup/{raw}`, `/api/serial-units/{raw}?include=full` | sidebar/shipping/useShippingPreviewOpen.ts:54,69; ShippingSidebarPanel.tsx:43,50 |
| Recents (rail) | "History" rail, 25 rows (fetches 100) | GET `/api/picking/desk/logs?techId=<self>&limit=100`. Row fields: id, order_id, account_source, shipping_tracking_number, sku, product_title, quantity, condition, fnsku, source_kind, created_at, updated_at. | sidebar/shipping/ShippingStaffScanHistoryRail.tsx:45-174; src/hooks/useTechLogs.ts:126-156; station/tech-record-rail-vm.tsx:18-62 |
| Action | New order (`?new=true` → NewOrderEntryOverlay). `new` is declared in PICK_ROUTE_PARAMS. | | ShippingWorkspaceView.tsx:69-78,110; src/hooks/useNewOrderParam.ts:9-45 |
| Action | Clear armed packing station | sessionStorage `cf.pack-station-arm`, `cf.pack-station-arm.auto-off` | ShippingScanBand.tsx:198-217; src/lib/packing/pack-station-arm.ts:12-68 |
| Action | Queue rail selection overlays | | ShippingWorkspaceView.tsx:53-56,108 |
| Count / badge | Armed-bench staged unit count (`/api/units/pack-placement`); queue counts `/api/orders/queue-counts`; desk counts `/api/orders/desk-counts` when a lens is active | | ShippingScanBand.tsx:62-66,202-204; UnshippedTable.tsx:339-345 |
| Saved views | History: `tech_history_saved_views` (layout, scope, staff, weekOffset). Queue: `unshipped_saved_views` config exists; whether UnshippedTable mounts it here is unverified (the only consumer found is useOrdersQueueFeed.ts:253-262). | | TechTable.tsx:147-148; table-url-params.ts:45-47; outbound-sidebar-shared.ts:8-49 |
| Client storage | `shipping-displays-push-width` | | tech/ActiveOrderWorkspace.tsx:434 |

### scan-out — Scan out

Route `/shipping/scan-out`, `railless` (sidebar-navigation.ts:1125-1127; outbound-sidebar-shared.ts:8-11). Page: src/app/shipping/scan-out/page.tsx:4-6. Route key `outbound`, which has no panel. Param spec: SCAN_OUT_ROUTE_PARAMS outbound-routes.ts:196-203 (`q`, `sort` priority\|newest, `open`). **No component reads them**: grep finds no `searchParams` in outbound/scan-out.

| Kind | Item | Values / endpoint | Ref |
|---|---|---|---|
| View | Idle plane ↔ focused carton overlay; Displays push stack | | src/components/outbound/workspaces/ScanOutWorkspace.tsx:58-106; ScanOutIdleAwait.tsx:31-150 |
| Scan input | ScanOutComposerDock (StationComposerHost textarea), placeholder "Scan label to ship out…" / "…or note the last package…" | | src/components/outbound/scan-out/ScanOutComposerDock.tsx:44-226 |
| Scan input | HID sink `scan-out-composer` | | ScanOutComposerDock.tsx:82-91 |
| Scan grammar | `isScanOutTrackingCommit`: multi-line/marketplace order#/sentence → note. `1Z…` or alnum ≥10 → tracking. | | scan-out/scan-out-commit.ts:9-32 |
| Scan submit | POST `/api/shipped/scan-out {trackingNumber}` | Status ok\|dup\|exc\|blk\|miss\|err | useScanOutStation.ts:69-77,127-221 |
| Action | Undo | DELETE `/api/shipped/scan-out {shipmentId}` | useScanOutStation.ts:223-252; ScanOutComposerDock.tsx:179-189; ScanOutWorkspace.tsx:41-56; ScanOutActivePanel.tsx:306-313 |
| Action | Note last package | POST `/api/orders/{id}/notes` | ScanOutComposerDock.tsx:98-120; src/hooks/useOrderNotes.ts:41 |
| Action | Progress ring opens/closes Displays | | ScanOutComposerDock.tsx:214-222 |
| Recents | **None** (no rail, no feed) | | — |
| Count / badge | Ring progress per status only | | ScanOutComposerDock.tsx:37-42,145-150 |
| Saved views | None | | — |
| Client storage | `scan-out-displays-push-width` | | ScanOutActivePanel.tsx:349; ScanOutIdleAwait.tsx:136 |

### packer — Packing

Route `/pack` (sidebar-navigation.ts:1132-1133). Page: src/app/pack/page.tsx:9-12 → PackerSurfacePage.tsx:11-58, which RSC-prefetches `packer-logs` for the week. Route key `packer` (:506). Param spec: PACK_ROUTE_PARAMS query-mode-routes.ts:513-524.

| Kind | Item | Values / endpoint | Ref |
|---|---|---|---|
| View | Tabs `?packview=` | Strip lights only `history`. `queue` is the default (unlit). | src/utils/pack-workspace-state.ts:3-81; src/components/packer/PackWorkspaceView.tsx:30,49-54 |
| View → feed | queue → UnshippedTable (ready-to-pack); history → PackerTable (`/api/packerlogs`) | | PackWorkspaceView.tsx:76-90 |
| Filter | `?packMode=` standard(omitted)\|fragile\|multi (legacy banner) | | pack-workspace-state.ts:8-42; PackerSidebarPanel.tsx:30; PackScanColumn.tsx:423-429 |
| Filter | `?ustatus=` PENDING\|TESTED(default on queue)\|BLOCKED | | pack-workspace-state.ts:62-78; query-mode-routes.ts:521 |
| Filter | Rail filter text (SearchField footer) + platform facet | Local | PackerSidebarPanel.tsx:24-27,50-58 |
| Scan input | PackScanColumn (ThemedStationScanBar), "Tracking · QR · SKU · Prep" | HID sink `pack-scan-bar` | src/components/station/PackScanColumn.tsx:391-420 |
| Scan grammar | unit QR (`scannedUnitKey`) → FNSKU (`looksLikeFnsku`) → tracking (no `:`, not clean/fba-) → FBA ship-on-scan → packing log. SKU = contains `:`. | | PackScanColumn.tsx:173,224,253-256 |
| Scan submit | Unit: GET `/api/serial-units/{k}` + phone photo request. FNSKU: POST `/api/fba/items/scan`. Tracking: POST `/api/fba/shipments/mark-shipped`, then POST `/api/packing-logs` (Idempotency-Key, buyer-note ack). | | PackScanColumn.tsx:150-389 (175,225,257,290) |
| Recents (rail) | "Recent packs", 25/week | GET `/api/packerlogs?packerId=&limit=1000&weekStart&weekEnd`. Row fields: order_id, account_source, tracking_type, scan_ref, product_title, quantity, condition, shipping_tracking_number, carrier, sku, packer_log_id, created_at. | sidebar/packer/PackRecentPacksRail.tsx:39-168; src/hooks/usePackerLogs.ts:111-135; pack-record-rail-vm.tsx:15-43 |
| Action | New order (`?new=true`). `new` is **undeclared** in PACK_ROUTE_PARAMS, so hygiene strips it `[INFERENCE]`. | | PackWorkspaceView.tsx:56-65,98; useNewOrderParam.ts:9-45 |
| Action | Open queue record → pack pane | | PackWorkspaceView.tsx:44-46,85 |
| Saved views | History: `packer_history_saved_views` (layout, scope, staff, weekOffset). Queue: unshipped config (mount unverified, as on Picker). | | PackerTable.tsx:115-116; table-url-params.ts:45-47 |
| Count / badge | None in rail | | — |
| Client storage | `pack-displays-push-width` | | packer/PackOrderPanel.tsx:297 |

### Legacy aliases

The `tech` page family (children Quality Control / Picker on one `/test` URL) was deleted on 2026-09-27 when Quality Control and Picking became separate stations; CMD-GO-QC / CMD-GO-READY now name the `testing` / `ready-to-pack` pages. Legacy `/tech` (src/app/tech/page.tsx) mounts the same TechSurfacePage as `/test` and has **no route spec**, so hygiene falls back to `stripCrossSurfaceParams`. Legacy `/packer` (src/app/packer/page.tsx:4-6) mirrors *packer* with no route spec. The legacy `receiving` family entry only resolves deep links / `?mode=` into the receiving stations above.

### fba — FBA (Outbound lane, railless)

Route `/shipping/fba` (sidebar-navigation.ts:1030-1042). Page: src/app/shipping/(desk)/fba/page.tsx:4-6 → FbaWorkspace.tsx → FbaOutboundWorkspace. `/fba` redirects to it (src/app/fba/page.tsx:20-40). Route key is `outbound` (:512), so no panel mounts. Param spec: FBA_ROUTE_PARAMS outbound-routes.ts:120-142.

| Kind | Item | Values / endpoint | Ref |
|---|---|---|---|
| View | `?fbaMode=` | `combine`(default, omitted)\|`ready`\|`plan`\|`shipped`\|`catalog`. In-page buttons: Ready·Plan·Shipped·Catalog. Nav children: only Plan·Combine·Shipped (no Ready/Catalog). | src/lib/fba/fba-modes.ts:3-39; src/components/fba/FbaOutboundWorkspace.tsx:36-43,64-69,128-145; sidebar-navigation.ts:1033-1041 |
| View → body | ready → ReadyWorkspaceBody (`/api/shipping/ready-queue`); catalog → FBAManagementTab (`?q`); plan → FbaPlanRailBody; combine → FbaCombineRailBody (`/api/fba/board`); shipped → FbaActiveShipments (`/api/fba/shipments/active-with-details`) | | FbaOutboundWorkspace.tsx:152-175; outbound/ready/ready-history.ts:11; fba/sidebar/FbaSidebarRails.tsx:82; active-shipments/useFbaActiveShipments.ts:46; app/fba/useFbaBoard.ts:35 |
| Filter | `?rtab=` all\|fba\|prebox\|hold (Ready) | | src/utils/ready-workspace-state.ts:4-30; outbound-routes.ts:127 |
| Filter | `?q=` (shipped: debounced 350 ms), `r`, `plan`, `draft`, `main` print\|plan, `details` catalog, `openShipmentId`, `search`, `fnsku`, `fbaFilter` hydrated\|stubs, `sort` | | fba/sidebar/fba-workspace-hooks.ts:30-116; outbound-routes.ts:122-139; FbaOutboundWorkspace.tsx:104-115 |
| Scan input | **Orphaned on the live route.** FbaWorkspaceScanField / StationFbaInput ("FNSKU (X00…) or ASIN (B0…)") mounts only through FbaSidebarPanel under route key `fba` (`/fba/*`), and that route redirects away. | | fba/sidebar/FbaSidebar.tsx:11-24; FbaWorkspaceSidebar.tsx:63-89; FbaWorkspaceScanField.tsx:42-48; StationFbaInput.tsx:55-83; SidebarContextPanel.tsx:61; sidebar-navigation.ts:475,512 |
| Scan grammar (orphan) | FNSKU only in fbaScanOnly (`looksLikeFnsku`); `FBA[0-9A-Z]{8,}`; UPS `1Z…16` | GET `/api/fba/fnskus/validate?persist_missing=1`, `/api/fba/shipments/today`; POST plan items | station-input/useFbaScanRouting.ts:49-145; useFbaStationInput.ts:103-113; fba/sidebar/fbaShipmentTracking.ts:1-51 |
| Action | Combine dock ("Combine N items · M units", Clear selection) | | FbaOutboundWorkspace.tsx:179-198 |
| Action | Detail panel (from row / `openShipmentId`) | | FbaOutboundWorkspace.tsx:229-240 |
| Action | Quick-add FNSKU modal (opened via `emitOpenQuickAddFnsku` from row menus) | | FbaQuickAddFnskuModal.tsx:35-81; FbaTrackingBucket.tsx:163 |
| Action | Create-plan modal. **No dispatcher** for `fba-open-create-plan`; the Global Add intent `fba-create-plan` has no consumer. | | FbaCreatePlanModal.tsx:35-48; lib/fba/events.ts:68; global-add/catalog.ts:113 |
| Recents | None mounted on the live route | | — |
| Count / badge | `/api/fba/stage-counts` loads only inside the orphaned sidebar hook | | fba-workspace-hooks.ts:141-198 |
| Saved views | Ready → `outbound_ready` (status, packStation, packPlaced, colsort, coldir) if Ready uses the `ready` table binding (unverified) | | surfaces.ts:124-127 |
| Client storage | `fba:pending_catalog`, `fba:today_plan`, `fba-editor-undo-{id}` | | fba/hooks/usePendingCatalog.ts:3; useTodayPlan.ts:8; shipment-editor-helpers.ts:6 |
| Doc drift | The inventory doc says `routeKey 'fba'` mounts FbaSidebarPanel with a scan field. That is true only for `/fba`, which redirects. | | current-sidebar-inventory.md:90-97 |

### label-intake — Labels & docs (Outbound lane, railless, contextual)

Route `/shipping/label-intake` (under the `(desk)` frame since 2026-09-27), permission `packing.review`. Views, Find, chips and verbs: see the stage-0 table in §label-intake above; the old ledger inventory that stood here described the deleted `LabelIntakeLedger`.
