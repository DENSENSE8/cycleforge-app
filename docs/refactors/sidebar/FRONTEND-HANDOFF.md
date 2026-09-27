# HANDOFF — Contextual sidebar: frontend host, port waves, visual layer

**Paste everything below the rule into a fresh session pointed at
`/home/michaelgarisek/Projects/cycleforge-lanes/prod`.** Written 2026-09-26 by
the backend session, from what it found and shipped only.

---

You are building the **frontend** of CycleForge's new contextual left sidebar,
the Vercel-dashboard pattern: the body of the sidebar changes with the page you
are on. The backend contract is done and live on `:3050`. The contract is
HTTP-first so the Tauri desktop app gets the same answers the web shell gets.
Your job:

1. Build the sidebar **foundation**: one new host beside the old nav (stage 5). Every
   page reuses it.
2. Port the pages to it **one page at a time**, starting with **Shipping**
   (`outbound`). Each page has its own contextual body, and each must meet the
   per-page baseline below.
3. Clean up (stage 7).
4. Add the visual layer (stage 8).

**Scan stations are out of scope. Do not port them, restyle them, or delete any of
their pieces.** Operator ruling, 2026-09-26: station work is physical (you move to
complete it), so its long-term home is mobile (`/m/*`). The desktop will later show
a live feed of what staff are doing on mobile; that is a separate program. Until
then every station keeps its current desktop surface exactly as is: the station
column with the scan bar and the recents rail in one sidebar display. The resolver
enforces this. `NAV_CONTEXT_PINNED_LEGACY` (every `kind: 'station'` page) resolves
`legacy` whatever the rollout map or a `nav.contextual.*` override says. The pinned
pages are Arrival, Unbox, Local Pickup, Repair Service, Quality Control, Picker,
Scan out, Packing, and the legacy `receiving` / `tech` entries.

Do not change the contract shapes. If you need a new field, add it to
`src/lib/nav/context/schema.ts` together with a resolver test.

## Where to start: Shipping (`outbound`)

Shipping goes first because:
- **It needs the sidebar most.** Its view tabs, header actions, table toolbar,
  exception category bar and `ShippedLedgerToolbar` were removed on 2026-09-26. Its
  tables have no controls above them today, so porting it restores functionality
  rather than moving it.
- **Its contract is the most complete.** 0 parity gaps. It has five views, facet
  counts that match the list and desk-counts exactly (one shared To-ship predicate),
  saved views and header actions.
- **There is nothing to tear down.** It is railless: no old context panel, and its
  tab row is already gone. The PR is additive, plus flipping `outbound` to
  `contextual`.
- **It exercises every foundation piece** (section panel with a group heading,
  desk-store search, facet groups, saved views, actions), so the host is proven on
  one page before the rest.

What Shipping's NavContext gives you, per view (resolved by `resolveNavContext`):

| View (href) | Search (`desk-store`) | Facet groups (`/api/nav/facets`) | Saved views | Actions |
|---|---|---|---|---|
| Exceptions `/shipping/exceptions` | `outbound.exceptions` "Search exceptions" | `category` | — | — |
| Picking › PO paired `/shipping/shortage?pair=po` | `outbound.po` | `aging` (Ship by), `late` (Must ship), `attention` (Urgent) | `unshipped_saved_views` | — |
| Picking › Pick list `/shipping/orders?queue=pick` | `outbound.pick` | `stage`, `aging`, `late`, `attention`, `ustatus` (Stock) | `unshipped_saved_views` | the To-ship eight below |
| To ship `/shipping/orders` | `outbound.triage` "Search orders to ship" | `stage`, `aging`, `late`, `attention`, `ustatus` | `unshipped_saved_views` | Sync ShipStation · Upload orders CSV · Export to CSV · Add one order (review first) · Add test order · Demo sync (sample data) · Past imports · Labels |
| Shipped `/shipping/shipped` | `outbound.shipped` "Search shipments" | `type` (`shippedFilter`), `carrier`, `status` (`statusCategory`), `exceptions` | `shipped_saved_views` | — |

The staff filter (`staff`) and Shipped's date range are not facet groups: they arrive
as `NavContext.controls` — `staff: { param }` on To ship, Pick list, PO paired and
Shipped; `dateRange: { fromParam, toParam, clearParams, placeholder }` on Shipped. Use
`AssigneeCombobox` through `StageStaffAssignPopover` (AGENTS.md §4) for staff; the
date-in-a-cell is `DateRangePickerField variant="compact"`.

**Decide first:** of the controls removed on 2026-09-26 (listed in PARITY §Outbound
"Shipping — removed 2026-09-26"):
- view-level controls move into the sidebar: views, search, filters, category,
  saved views, header actions;
- table-level controls return to a thin toolbar on the table, not the sidebar:
  select-all, sort, page size, Edit platforms, zoom, density, fullscreen.

Confirm this split with the operator before building. It is the one layout decision
the contract does not make.

Order of work for the first PR:
1. Foundation host.
2. Shipping body.
3. Restore the table-level toolbar.
4. Dogfood with `nav.contextual.outbound = contextual` on your own staff.
5. Operator sign-off.
6. Flip `outbound` in `NAV_CONTEXT_ROLLOUT`.

Next, in this order, all one page per PR:
- **Outbound lane:** Label intake, FBA. FBA's FNSKU scan field is not mounted on
  `/shipping/fba` today; decide with the operator whether it belongs on the desk
  or on mobile.
- **Tab-only desks:** Reports, Sourcing, Inventory, Products, Sales, Deliveries.
- **Picker/recents pages:** Support (tickets recents), plus Audit log and Settings
  roles/access.
- **Pages with parity gaps:** Operations, Daily and Automations, after their gaps
  are closed.

## The foundation (built once, stage 5)

Every contextual page renders inside the same host. Build and prove these once:

1. **Fixed header.** Collapse, then global search: a sunken 6px-corner button face
   of the ⌘K palette (`CommandBar` owns the chord). No page switcher — `‹` and ⌘K
   both reach every page (operator 2026-09-27).
2. **Scrolling body.** Either the top-level lane map (`scope: 'top'`) or the page's
   section panel (`scope: 'section'`). Group headings come from `section.label`.
3. **`‹ <Page>` back row.** Local state only: fetch `?view=top` and never change the
   URL. Browser back/forward rebuilds from the URL.
4. **Fixed footer.** User avatar and name, `…` menu, notifications.
5. **Data loop.** Fetch `GET /api/nav/context?path=` keyed on pathname + search.
   Render from cache and revalidate; never block first paint (≈300 ms auth floor).
   The same client works for Tauri.
6. **Rollout.** Render the new host only when `rollout === 'contextual'`; otherwise
   the old master nav stays. Stations always resolve `legacy`, so their surface is
   untouched.
7. **Shared slots**, in this order under `‹ <Page>` (operator 2026-09-27: minimal
   by default, detail on click):
   - Find (`F`), the same sunken face as global search, driven by `search.source`.
     It narrows only the list on screen; `identify` pages have none.
   - Views over `sections`: compact rows, one sliding lit plate.
   - Actions over `actions`: a split CTA — the first action is the face, a 1px
     hairline, a chevron menu with the rest.
   - Filters: a `Filters` heading with a Reset pill, then one closed row per
     `controls` entry (staff, date), `filters.groups` group (options and counts from
     `/api/nav/facets` open on click; the row shows the current value as a chip) and
     `savedViews`.
   - Recents list over `recents.endpoint`.

   Each slot renders only when its field is present, so no page needs custom host
   code.
8. **Motion.** The ~100–150 ms fade+blur swap between top and section, via
   `@/design-system/motion`.

## Per-page baseline (every ported page, no exceptions)

A page's PR is done only when all of these hold:

- [ ] **Identity:** `page.label` shows in the header and the back row reads `‹ <page label>`.
- [ ] **Views:** every PARITY view/tab is a section item. Each `href` opens that view and lights it (`active`); browser back/forward re-syncs.
- [ ] **URL is state:** every filter the old UI had writes its param (all listed in `params`); a reload or a pasted link reproduces the view.
- [ ] **Search:** it works with the page's `search.source`, and the placeholder matches.
- [ ] **Filters:** facet groups render with counts where the old UI had counts; group options exclude their own filter; a Reset clears them.
- [ ] **Saved views:** where `savedViews` exists, save/apply/delete round-trips through `/api/saved-views`.
- [ ] **Actions:** every header verb from PARITY is reachable (`actions`).
- [ ] **Recents:** where `recents` exists, the list renders `NavRecentRow` and opening a record POSTs to `nav_recents` surfaces.
- [ ] **Permissions:** a role without a child's permission doesn't see it. Check with a lower-role staff.
- [ ] **States:** loading (skeleton), empty, error (retry), and no layout shift on swap.
- [ ] **Keyboard:** Tab order, Enter/Space on rows, Esc closes popovers, focus returns after `‹`.
- [ ] **Mobile untouched:** `/m/*` for that verb still works.
- [ ] **Deletion in the same PR:** the page's old panel, tab row and localStorage recents are removed. Stations are never touched.
- [ ] **Gates:** `parityGaps(pageId)` is empty, `pnpm verify:fast`, `node scripts/probe-sidebar-contract.mjs` exits 0, and a screenshot at `:3050`.

## Read first (in this order)

1. `AGENTS.md`: `:3050` only; lane unit `cycleforge-lane@prod`; `pnpm verify:fast`
   before calling anything done.
2. `docs/refactors/sidebar/API-CONTRACT.md`: every route, zod schema, permission
   and a captured example response.
3. `docs/refactors/sidebar/NAV-CONTEXTS.md`: the resolved `NavContext` for every
   `SIDEBAR_PAGE_NAV` page. Generated by `resolveNavContext`; `GET /api/nav/context`
   returns the same shape per caller.
4. `docs/refactors/sidebar/PARITY.md`: per page, everything the old UI provides.
   **Each page's definition of done.**
5. `docs/refactors/sidebar/vercel-sidebar-research.md`: the observed behaviour to
   reproduce.
6. `docs/refactors/sidebar/BACKEND-RESULTS.md`: measured latency, index wins,
   brand coverage and per-page parity status.
7. `docs/design-system/BRIEF.md` §12 and
   `docs/design-system/HANDOFF-desktop-triage-foundation.md`: the desktop design base.
8. Skills: `skill://motion` (all animation), `skill://request-shape` (the sidebar is
   on every first paint).

## The contract (exact endpoints and shapes)

All routes are `withAuth`. orgId and staffId come from the session and never from the
request.

| Route | Returns | Notes |
|---|---|---|
| `GET /api/nav/context?path=<url>[&view=top]` | `NavContext` | Permission-filtered for the caller, with the org nav override applied, then the lane visibility gate. `view=top` gives the `‹` peek: the lane map with the current page's drill row active. |
| `GET /api/nav/recents?surface=<id>&limit=` | `{ surface, rows: NavRecentRow[] }` | 14 surfaces (see API-CONTRACT). 9 adapt existing server feeds; 5 are `nav_recents`-backed. |
| `POST /api/nav/recents` `{ surface, entityType, entityId, label }` | 200 | Only for `nav_recents`-backed surfaces. Adapter surfaces return 400 `SURFACE_NOT_WRITABLE`. Upsert-on-open with a per-surface cap. |
| `GET /api/nav/facets?context=<pageId.itemId>&…current params` | `NavFacetsResponse { context, total, groups[{id,label,param,options[{value,label,count}]}] }` | Counts come from the same SQL predicates as the list. A group's options ignore that group's own filter. |
| `POST /api/identify` `{ input, context? }` / `GET /api/identify?q=` | `IdentifyResponse` (see `src/lib/identify/schema.ts`) | Multi-line batch, one identifier per line. Each candidate has `kind, entityId, title, brand, confidence, matchedOn, href, actions[], stage`. An exact unique hit returns `mode:'single'`. Log opens with `POST /api/search/opened`. |
| `GET /api/brands…` | brand typeahead / detail / products | For brand chips and the brand filter. |
| `GET/PUT /api/settings?page=nav` | `nav.contextual.<pageId>` | `inherit` / `legacy` / `contextual`, set per org, and staff can override it. |

`NavContext` (zod `NavContextSchema`, strict):

```ts
{
  scope: 'top' | 'section',
  page: { id, label },
  back: { label, mode: 'local' } | null,     // null exactly at top
  search: { scope, placeholder, source: 'desk-store' | 'url-param' | 'identify', param? },
  sections: Array<{ id, label?, items: Array<{ id, label, href, active, kind: 'link'|'drill'|'filter'|'toggle', badge?: 'beta' }> }>,
  params: string[],                          // every URL param the page's views read (all survive route hygiene)
  filters?: { facetContext, groups: Array<{ id, label, param, multi }> },   // options + counts via /api/nav/facets
  recents?: { endpoint, surface },
  savedViews?: { storageKey, paramKeys },    // server-backed via /api/saved-views
  scanInput?: { grammar, endpoint },
  actions?: Array<{ id, label, href?, intent? }>,
  rollout: 'legacy' | 'contextual',
}
```

Nav items never carry counts. Counts appear only in facet groups.

`rollout` is clamped at runtime. It is `contextual` only when the override or map
says so **and** `parityGaps(pageId)` is empty (`src/lib/nav/context/resolve.ts`).
So an operator's staff override cannot turn on a page whose parity rows are not all
covered.

## Every page's NavContext, scan inputs and recents

`NAV-CONTEXTS.md` holds the full JSON per page. The scan-station contexts below are
**reference only**: stations stay on their current desktop surface, pinned `legacy`.
Nothing in this program mounts, moves or deletes them. The table is for the future
mobile/live-feed program.

| Page | `scanInput.grammar` → endpoint | `recents.surface` | Current scan component (untouched) |
|---|---|---|---|
| Arrival `/triage` | `arrival` → `/api/receiving/lookup-po` | `receiving.scanned` | `TriageScanBand` |
| Unbox `/unbox` | `unbox` → `/api/receiving/lookup-po` | `receiving.unbox_opened` | `UnboxScanBand` |
| Local Pickup `/pickup` | `pickup` → `/api/local-pickup-orders/lines` | `pickup.orders` | `PickupScanBand` |
| Quality Control `/test?view=testing` | `testing` → `/api/receiving-lines` | `testing.opened` | `TestingScanBar` |
| Picker `/test?ship=urgent` | `station` → `/api/tech/scan` | `tech.scans` | `ShippingScanBand` |
| Packing `/pack` | `pack` → `/api/packing-logs` | `packer.packs` | `PackScanColumn` |
| Scan out `/shipping/scan-out` | `scan-out` → `/api/shipped/scan-out` | — | `ScanOutComposerDock` |
| FBA `/shipping/fba` | `fnsku` → `/api/fba/fnskus/validate` | — | `FbaWorkspaceScanField`, which is **not mounted** on `/shipping/fba` today (see PARITY) |
| Support `/support` | — | `support.tickets` | — |

The exact grammar ids are `NAV_SCAN_GRAMMARS` in `src/lib/nav/context/pages.ts`.

The five `nav_recents` surfaces replace these localStorage stores. Move each writer
to `POST /api/nav/recents` in the PR that ports its page, and delete the localStorage
code in that same PR:

| Surface | Replaces |
|---|---|
| `support.tickets` | `support:recent-tickets` |
| `detail_stacks` | `assistant:recent-detail-stacks` |
| `audit_log.trace` | `audit-log.trace.recents` |
| `labels.lookups` | `labels:history-recents:v1` |
| `command_bar` | `command-bar-recent` |

## Program staging (the switch, the waves, the deletion rule)

| Stage | What |
|---|---|
| 5 · New sidebar host | One host beside the old nav. It renders `NavContext` for pages whose `rollout === 'contextual'`: the top-level map ↔ section panel, a local `‹ Back`, a fixed header (switcher + Find) and a fixed footer (user). The old master nav stays mounted for every `legacy` page. |
| 6 · Port pages | One page per PR, in the order under "Where to start": Shipping first; then Label intake and FBA; then tab-only desks (Reports, Sourcing, Inventory, Products, Sales, Deliveries); then picker/recents pages (Support, Audit log, Settings roles/access); then Operations, Daily and Automations once their parity gaps close. **Scan stations are not ported.** |
| 7 · Cleanup | Once every non-station page is `contextual`: delete `useDeskPageChromeTabs`, the `DeskPageChrome` tab row, `HeaderPageSwitcher` and the non-station context panels. Delete the old master nav (`MasterNav`, `SidebarNavList`, `DashboardSidebar`, `SidebarNavColumn`) only after the new host's top-level map links to every station. **Keep everything station pages mount:** the station column (scan bar + recents rail), `ReceivingSidebarPanel`, `TechSidebarPanel`, `PackerSidebarPanel`, and whatever part of `ContextPanelLayout` / `context-panel-*` / `isStationSurfaceRoute` they depend on. Those leave with the mobile/live-feed program, not this one. The rollout switch stays while stations are pinned `legacy`. |
| 8 · Visual layer | motion.dev, colour, the desktop design base, and the Tauri port. |

**The switch.** `NAV_CONTEXT_ROLLOUT` in `src/lib/nav/context/rollout.ts` sets all 23
pages to `legacy`. To dogfood a page before it flips for everyone, set
`nav.contextual.<pageId> = contextual` for your staff (`PUT /api/settings`). Flip
the map entry in the page's PR.

**Deletion rule.** For each page, its old context panel, its tab row and its
localStorage recents are deleted **in the same PR that turns the page on**, never
before. Never remove a surface's scan input or its only path to a record until the
replacement is live and proven by `scripts/probe-sidebar-contract.mjs`. On the
floor, a scan bar that disappears is an outage.

**Parity gate.** `src/lib/nav/context/parity.ts` (`NAV_PARITY`, `parityGaps`) is the
machine-checked form of PARITY.md. The resolver test fails if any page in
`NAV_CONTEXT_ROLLOUT` is `contextual` while it still has gaps, and the runtime
clamp enforces the same rule. Today 20 of 23 pages have 0 gaps. The three with gaps
are `home` (6 agenda lens views), `operations` (8 ex-admin rail params:
`goalView`, `search`, `staffView`, `logKind`, …) and `studio` (the node library
action). Close their gaps in the NavContext before porting them.

**Known gaps you inherit (decide or close them in the relevant wave):**
- **Shipped facet counts: closed 2026-09-26** (operator ruling). Shipped's type,
  carrier, status and exceptions filters are answered in `fetchPackerLogRows`' WHERE
  (`src/lib/shipping/shipped-filter/shipped-filter-sql.ts`) and span every row of the
  date range, not the loaded page; they narrow within the window rather than switching
  it to all-time. `/api/nav/facets?context=outbound.shipped` counts from the same
  fragments.
- **To-ship facets ignore free-text `?q=`.** When `q` is set, the list switches to an
  unscoped search feed.
- **The dogfood org's `nav_definitions` row orders Shipping's children** Picking · To
  ship · (stale `fba`) · Shipped · Exceptions, and NavContext applies it. The handoff
  order (Exceptions · Picking · To ship · Shipped) appears only if the operator
  republishes via `PUT /api/nav`.
- **`POST /api/nav/recents` writes no audit row**, deliberately: these are navigation
  clicks, following the precedent of `/api/receiving-lines/view` and
  `/api/search/opened`.
- **Every request pays ≈300 ms for the `withAuth` session lookup** on this lane. Don't
  put a blocking fetch on first paint.

## Vercel behaviours to reproduce

- Anatomy: a **fixed header** (switcher + Find), a **scrolling body** (the top-level
  list OR a drilled section panel), and a **fixed footer** (user avatar and name, `…`,
  notifications).
- **`‹ <Section>` back is local state.** It moves the sidebar up one level and never
  changes the URL. Fetch `?view=top` for the peek list, with the current page's drill
  row lit. Browser back/forward always rebuilds the sidebar from the URL.
- The body only swaps when you drill into a section that has sub-pages. Top-level
  items never appear under a drilled panel. Deep pages keep the parent panel and use
  in-page tabs.
- **Swap motion:** a ~100–150 ms cross-fade with blur (old labels fade and blur while
  the new ones fade in over them). No horizontal slide. The back is the same
  cross-fade in reverse.
- **Click-open** dropdowns and popovers (switcher, `…`, filters), not hover-open.
- **No nav counts.** Counts appear only inside facet groups (the Logs-panel pattern)
  and in page content.
- Find is a popover anchored to the Find field, not a full-screen modal. With an
  empty query it suggests items scoped to the current page first (identify's
  `context` param already ranks current-context first).

## Motion and design base

- **motion.dev only**, through `@/design-system/motion` and
  `@/design-system/motion/plus` (Motion+ is licensed and installed). No raw
  `framer-motion` imports and no CSS keyframes for these interactions. Respect
  reduced motion through the house wrapper.
- Motion follows the task context, not the device (BRIEF §12). The sidebar is
  triage/detective chrome, so it gets expressive motion. Industrial execution surfaces
  (scan stations) get none inside their work area: a scan lands the next record in 0 ms.
- **Desktop sidebar design base = the `triage` mode** (BRIEF §12;
  `HANDOFF-desktop-triage-foundation.md`): shadcn neutral surfaces, `0.625rem`
  radius (card 10 / control 8 / chip pill), triage motion (feedback 120–200 ms). Read
  tokens with `ds_tokens <axis>`; do not invent literals. The Tauri app reuses this
  host and this base unchanged.
- Check `ds_contract` before building any primitive (Popover, DropdownMenu, command
  surfaces already exist).

## How to wire the new UI to the backend

1. The host takes the current URL, calls `GET /api/nav/context?path=` (key it on
   pathname + search), and renders only when `rollout === 'contextual'`. Prefetch the
   `?view=top` variant on hover of the `‹` row.
2. Section items are plain links to `item.href`; `active` is already resolved.
   Filter groups write `group.param` into the URL (the list reads the URL). Options
   and counts come from `GET /api/nav/facets?context=<filters.facetContext>&<current
   params>`; refetch when the URL changes.
3. The search box follows `search.source`: `url-param` / `desk-store` writes
   `search.param`; `identify` calls `/api/identify` (it takes multi-line pastes) and
   navigates to `candidate.href`. On open, call `POST /api/search/opened`.
4. Recents: `GET recents.endpoint`. When the operator opens a record on a
   `nav_recents`-backed surface, `POST /api/nav/recents`.
5. Saved views: `savedViews.storageKey` + `paramKeys` via the existing
   `useSavedViews` → `/api/saved-views`.
6. `scanInput` is only set on station pages, which stay `legacy`. The contextual host
   never renders a scan input in this program.
7. Tauri calls the same HTTP routes with its session. Nothing here may depend on a
   React-only store.

## Measured numbers (from BACKEND-RESULTS.md)

See BACKEND-RESULTS.md for the full tables. The headlines:

- Lane `:3050` HTTP p50/p95: `/api/nav/context` 376/396 ms, facets 744/982 ms,
  recents 699/745 ms, brands 416/465 ms. `withAuth` alone costs ≈ 300 ms on this lane: `/api/settings`,
  a pre-existing route, is 620–670 ms. Design for it: render from cache and revalidate.
  Do not block first paint on the context fetch; the pure resolver can also run on the
  server during SSR with the session's permissions.
- Identify, in-process against the DB: exact p50 111–156 ms, free text p95 ≤ 188 ms.
- Brand coverage: 89.1% of active non-fixture SKUs (1,240 SKUs branded, 46 in review).

## Before you call a wave done

`pnpm verify:fast`, the page's parity rows green (`parityGaps(pageId)` empty),
`node scripts/probe-sidebar-contract.mjs` exits 0, and a screenshot at `:3050` of the
ported page.
