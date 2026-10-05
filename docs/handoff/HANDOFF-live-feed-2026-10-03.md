# HANDOFF: Live feed (Operations) + fulfillment UX, 2026-10-03

> **Superseded 2026-10-04.** The Live feed was rebuilt as an outbound-only package triage board: four stages (To pick → Picked → Packed → Scanned out) matching Allocate's `?stage=` partition, a Day | Week window in the board header, cards that open to a journey timeline, tags (`order_tags`) and comments (`order_notes`), and a phone surface at `/m/live-feed` (stage tabs over one column). Code: `src/lib/live-feed/*`, `src/features/live-feed/*`. The inbound direction, lenses, channels, carrier facets and the sidebar controls below no longer exist; read this file as history only.

Repo: /home/michaelgarisek/Projects/cycleforge-lanes/prod · dev origin http://localhost:3050 only (lane `cycleforge-lane@prod`; never start servers).
Auth for probes/browser: cookie `cf_sid` from `tests/.auth/admin.json` on localhost.
**Another session edits this tree concurrently** (location-labels, racks, Sales "Customers", mobile/v2). Re-read before every edit; never revert others' changes. Their red gates are not ours: lint in src/features/location-labels/*, tenancy on /api/racks/*, ledger `location-label-builder-forks`, missing NAV_VIEW_ICONS key `sales.customers`.

## Binding operator rulings (today)
1. **Placement:** every control that changes which records show or in what order goes in the LEFT contextual sidebar, declared in `NAV_PAGE_DECLS` (src/lib/nav/context/pages.ts). The page body shows records only. Before building or delegating UI, run `node tools/design-mcp/ds.mjs contract "<job>"` and paste `placement.briefBlock` verbatim into the brief (AGENTS.md §3).
2. **Display method is chosen per page** with `node tools/design-mcp/ds.mjs display-method '<facts>'`. For the Live feed the answer is `column-board`: `ColumnBoard` (src/design-system/components/column-board/ColumnBoard.tsx).
3. **Single exception:** the Live feed's date range is page chrome, top-right in the header, and is ALWAYS applied, back end to front end (`from`/`to` never null; default today).
4. **One package = one lane** (its current state). No event lanes and no duplicates.
5. **Exceptions stay in the Exceptions hub** (`/exceptions`, new kind `unmatched` = orders_exceptions packer+outbound). Not in the Live feed.
6. **Nav:**
   - No "Management" band.
   - The desktop band "Operations" lists, in order: Live feed · Scan Stations · Receiving · Fulfillment · Warehouse (lane `inventory` renamed, Warehouse icon; its page row is now "Inventory") · Sales · Products (last).
   - Don't invent sub-navigation.
   - The Monitor lane stays parked.
   - Single source of the order: `fixedSpineOrder()` in src/lib/nav/spine-slots.ts.
7. **Live feed sidebar:**
   - Find.
   - Views Outbound · Inbound (required; no "all").
   - Controls: Date by (lens), Staff "Handled by", Channel facet (Online / In person), Carrier facet (outbound).
   - NO status views, NO sort.

## Live feed: current state
- **Route:** `/operations/live-feed` (src/app/operations/live-feed/page.tsx).
- **Lib:** src/lib/live-feed/* (statuses, feed-sql builder, outbound-sql, inbound-sql, load, model, route, types).
- **APIs:**
  - `/api/live-feed/board`: columns
  - `/api/live-feed?status=`: lane paging past 50
  - `/api/live-feed/tracking`: Copy all
- **Facets:** contexts `live-feed.outbound` / `live-feed.inbound`.
- **Lanes (mutually exclusive):**
  - Outbound: To pack · Packed (still in the building; includes in-person pickups, flag `pickup`) · Scanned out (USPS terminal; flag `noCarrierScan`) · In transit · Delivered · Sold in person (in_person only).
  - Inbound: To collect · At door · Docked · In transit · Unboxed.
- **Lens (URL param `lens`, sidebar "Date by"):** entered (default) | packed | scanned_out | delivered (outbound) | received | unboxed (inbound).
  - Open lanes carry `carriedOver`; `carry=1` includes them.
  - Done lanes carry `previousCount`.
  - Column fields: `applicable`, `lateCount`, `oldestAt`, `groups` (top 3), `groupsMore`.
- **Read-only sanity, 2026-09-30, outbound:**
  - lens packed: total 30 = Packed 2 + Scanned out 17 + In transit 5 + Delivered 6
  - lens scanned_out + UPS: total 6
  - all-time exclusivity check: 0 duplicate keys
- **UI (BoardUI agent; was still running "O opens split" acceptance at handoff):** src/components/live-feed/
  - LiveFeedBoard, LiveFeedLane, LiveFeedTicket, LiveFeedRecord, LiveFeedDateRange (header date + TimeFields), live-feed-board-model.
  - `ColumnBoard` gained a `lanes` layout: 20rem lanes running off-page with scroll shadows, sections, 56px collapsed rails, phone one-lane switcher.
  - DeskRecordPlane `splitPane="open"`; DeskPageChrome `measure="full"`.
  - LiveFeedList / ItemCard / ItemRow and the `live-feed.list` triage view were deleted.

## Remaining work (do in order)
1. **Unblock if needed.** If the BoardUI agent's work is incomplete, finish it. Known earlier blockers:
   - tsc in LiveFeedRecord.tsx:34 and LiveFeedTicket.tsx:159 (`dateLabel` removed) and ColumnBoard.tsx:74 (read-only ref);
   - add the ONE allow entry for `src/components/live-feed/LiveFeedDateRange.tsx` to the `filter-controls-outside-sidebar` rule in tools/design-mcp/design-mcp.profile.json;
   - remove any `status` branch in page.tsx.
2. **Browser acceptance** at 1440×900, 1920×1080 and 390×844 on `/operations/live-feed?from=2026-09-30&to=2026-09-30&lens=packed`:
   - Lane counts sum to 30, and each lane header is ONE line.
   - The board scrolls off-page horizontally with scroll shadows.
   - Empty lanes show as 56px rails; the Work now / Done sections are visible.
   - The carry chip and "▲/▼ vs prev" meta appear.
   - Row expand shows photo/title/condition/price/tracking/staff/trail.
   - **O opens the record in split with the board still visible (previously FAILED; undiagnosed).**
   - Fullscreen (DeskStageContext `setView`, DeskFullscreenToggle on the board row, ⌘/Ctrl+Shift+S) goes edge to edge, and Esc exits.
   - At 390px: one lane at a time, with the lane switcher.
   - Tasks `?layout=columns` still renders 3 columns.
3. **Checks** (all must be clean on touched files):
   - `pnpm -s test:live-feed`
   - nav tests: `node --import tsx --import ./scripts/register-server-only-shim.cjs --test --test-force-exit 'src/lib/nav/**/*.test.ts' src/lib/sidebar-navigation.test.ts 'src/components/sidebar/*.test.ts'`
   - `npx tsc --noEmit`
   - eslint on touched files
   - `node tools/design-mcp/ds.mjs critique <file>` for each touched UI file
   - `ds.mjs nav-names`
   - `ds.mjs card-views`
   - `pnpm verify:fast` (only the other session's red gates may remain)
4. **Open gaps to report, not invent:**
   - No pickup handover event, so in-person orders stay in Packed.
   - No realtime publish on counter payment or local pickup completion.
   - Local pickups have no "collected" fact (COMPLETED = done), so collected pickups aren't in Docked.
   - "Live feed" vs "Live feed V2" (`/stations/live`) naming overlap.
   - Layer-law route branch in src/components/receiving/ReceivingLedgers.tsx escaped the scan by moving folders.

## Also shipped today (done, verified)
- **Dock scan-out misses** persist as `orders_exceptions` source_station='outbound' (src/lib/outbound/scan-out.ts `recordUnmatched`). Resolving one via the import sweep or link-order replays the scan-out with the original staff and time (src/lib/outbound/held-scan-out-replay.ts).
- **Fulfilled list:** Copy N tracking; Copy all unmatched; tracking copy chip on cards; import-csv auto-resolves exceptions.
- **Compact/Full** list toggle is an icon menu left of In place / Split (TriageSelectBar); stored per person in `staff_preferences.prefs.triageDensity`. The hydration fix seeds staff prefs in src/app/layout.tsx.
- **The pulse strip and the `/live` + `/shipping/live` boards are deleted.**
- **Receiving:**
  - SwimlaneBoard / StationPipelineBoard / StationListTable chain deleted.
  - ReceivingLinesTable folded into src/components/receiving/ReceivingLedgers.tsx (used by ReceivingRightPane + UnboxWorkspaceView).
- **Design-system MCP:**
  - `ds_contract` is placement-first (`placement` {law, briefBlock, lead}).
  - New `ListPageRecipe` and `ColumnBoard` pins.
  - New `filter-controls-outside-sidebar` rule in adjudicate + critique.
  - `ds_display_method` gained the `column-board` candidate + `statusGroups` / `monitor-pipeline` facts.
  - Engine code lives in /home/michaelgarisek/Projects/Garisek-OS/tools/design-mcp (smoke: `node tools/design-mcp/smoke.mjs` there).

## Appendix A: board design spec
# Live feed: triage board spec (operator 2026-10-03)

## Problems in the current build (seen at 1440px)
1. The columns reuse `LiveFeedItemCard` (a RecordCard face: checkbox, chip row, 40px photo, two-line title, facts). That is a record-list face, not a board face. Each item is about 130px tall, so only ~5 items fit per column and the board can't be scanned.
2. Column headers break. "Scanned out, no carrier scan" wraps to 3 lines and runs into the "Copy all (0)" and "Show all" buttons; "Packed · waiting" wraps to 2. Every header carries two text buttons, which take more width than the title.
3. Empty columns take the same width as full ones ("Nothing here."), so the done columns end up off-screen.
4. Exceptions show up as board columns (1,571 historic rows) even though they belong in the Exceptions hub.
5. No hierarchy between work and output: open queues and done counts look identical.
6. No fullscreen and no edge-to-edge layout; the board sits inside the desk content width.

## Statuses (Exceptions removed from the feed)
Outbound, left → right:
- WORK NOW: `out-to-pack` "To pack" · `out-ready-pickup` "Ready for pickup" · `out-packed-waiting` "At dock" · `out-not-accepted` "Awaiting carrier"
- DONE: `out-packed` "Packed" · `out-scanned-out` "Scanned out" · `out-with-carrier` "With carrier" · `out-delivered` "Delivered" · `out-sold-in-person` "Sold in person"

Inbound, left → right:
- WORK NOW: `in-pickup-to-collect` "To collect" · `in-delivered-unscanned` "At door" · `in-docked` "Docked"
- MOVING: `in-transit` "In transit"
- DONE: `in-pickup-collected` "Collected" · `in-unboxed` "Unboxed"

The status `hint` keeps the long definition ("Scanned out, no carrier scan yet"). Labels must fit on one line at 280px with no ellipsis. Delete `out-exceptions` / `in-exceptions` from the registry, SQL memberships, facets, nav views, icons and tests. The Exceptions hub must still list both: outbound unmatched dock and pack scans (`orders_exceptions` packer and outbound), and inbound exceptions. Check the hub's kinds (`exceptions.unfound`, `exceptions.tracking`, …) and add a kind only if one is missing.

## Board API additions (per column, same query builder)
`lateCount` (items marked late or aging), `oldestAt` (oldest `at` for open statuses), `groups` (top 3 by count: carrier for carrier statuses, packer/staff for staff statuses, with `{ key, label, count }` and `more`). Items are capped at 50 and counts are exact.

## Display anatomy (custom components; no RecordCard / TriageRow in the board)
### `LiveFeedBoard` (page body)
- Built on `ColumnBoard` (extend it generically; don't fork it): a horizontal strip with snap. It runs edge to edge in the desk stage, with 12px gutters and no centered max-width.
- Section headers above the columns: "Work now" spans the open columns and "Done" (event columns) spans the rest. A hairline divider plus a 16px gap separates the sections; the label is an eyebrow (`text-role-eyebrow`), not a heading.
- Column width: `minmax(17.5rem, 1fr)`. When every column fits, they fill the width; otherwise they keep 280px and scroll.
- Empty column → a collapsed 56px rail: vertical label, "0", same header tint. Clicking or pressing Enter expands it temporarily. Done columns with 0 collapse too.
- Fullscreen uses the ONE stage state (DeskStageContext `setView('split')`; `fullscreen` derived). The control is `DeskFullscreenToggle` on the board's own top row (law: the fullscreen control belongs on the table's row). In fullscreen the board spans the full viewport width edge to edge. A record open while fullscreen splits on the right, and the board keeps scrolling sideways.

### `LiveFeedLane` (one column)
- Sticky header, two rows, 64px total:
  - Row 1: status label (one line, `text-role-label` semibold) · count right-aligned (display size, `tabular-nums`, e.g. 28).
  - Row 2 (muted caption): open columns show "3 late · oldest 2d"; done columns show the top groups as inline facts ("USPS 17 · UPS 6 · FedEx 5", "Tuan 27 · Thuy 3"), then "+n".
  - Top edge: a 3px accent bar. Tone comes from the state tokens: an urgent open column (lateCount > 0) is warning or danger; open with nothing late is info; done is success or neutral.
  - Header actions (Copy all tracking, Show all as a list, Expand column) live in ONE overflow `IconButton` (⋯) shown on header hover or focus. Never text buttons in the header.
- Body: virtualized if more than 50 rows. Late items are pinned on top under a tiny "Late" divider. A "+N more · Show all" footer opens the status list.
- Expand column: the lane grows to ~2× width (or full board width when the lane is focused with Shift+Enter) and rows show their expanded facts inline. Esc restores it.

### `LiveFeedTicket` (one row)
- At rest it's 44px and 2 lines; no checkbox, no photo:
  - Line 1: age/time (tabular, toned by urgency: late = danger text) · primary identity (order # or PO, mono, `text-role-code`) · carrier mark right (`CARRIER_BRANDS` glyph or short code).
  - Line 2: product title (1 line, truncated) · `×qty` if >1 · staff initials avatar right (staff color class).
- Hover/focus reveals a copy-tracking `IconButton` (writeClipboardText + toast) and shows the full tracking number in a tooltip.
- Click / Enter expands in place (accordion, motion on height with the house motion tokens; 0ms under reduced motion):
  - 48px photo, full title, condition grade tone, price, the full tracking chip (`TrackingChip`), staff full name, entered/event time.
  - A mini stage trail for outbound (Packed → Scanned out → With carrier → Delivered, with the times that exist), plus the "Open record" action, which opens the split pane beside the board.
- Selected or open: ring plus surface tint. The keyboard cursor is visible.

### Keyboard (teach via the existing hotkey hover pattern)
J/K within a lane, H/L across lanes (collapsed lanes are skipped unless expanded), Enter expand/collapse a row, O open the record (split), C copy tracking, E expand the lane, F fullscreen toggle (same as the stage shortcut ⌘/Ctrl+Shift+S, whichever the house uses), Esc collapse/close.

### Phone (`/m`, narrow widths)
Below 768px, one lane at a time with its header as a horizontal snap list of lanes. This is the `ColumnBoard` phone note: one column is the list.

## Hierarchy & throughput
- The count is the loudest element in a lane, then the label, then the meta row. Rows are quiet: one accent color (urgency) and nothing else saturated.
- No duplicate numbers on screen. Sidebar view chips are unfiltered totals (law); lane counts are the filtered numbers.
- 1440px target: 5 full lanes visible plus collapsed empty rails, and ~14 rows per lane above the fold.


## Appendix B: placement briefBlock (as returned by ds_contract)
PLACEMENT (binding — returned by ds_contract; paste verbatim, never restate a different placement):
1. Every control that changes WHICH records show or IN WHAT ORDER — filters, sort, date / day / time-of-day window, staff, carrier / status / reason facets, views, modes, direction (inbound / outbound) — lives in the LEFT contextual sidebar. Declare it; never draw it in the page body.
   - Modes (top tier, e.g. Direction): NAV_PAGE_DECLS[page].modes = { label } (src/lib/nav/context/pages.ts) + one SIDEBAR_PAGE_NAV child per mode (src/lib/sidebar-navigation.ts). No 'all' mode.
   - Views (one list each, unfiltered count chip): sidebar-navigation children with `group: <modeId>`; counts via facet context `<pageId>.<viewId>` (NAV_FACET_CONTEXTS, src/lib/nav/facets/contexts.ts).
   - Controls: NAV_PAGE_DECLS[page].controls or a view's `controls` (NavControlsSchema, src/lib/nav/context/schema.ts:115-227): sort { param, defaultValue, options }, staff[] { id, param, label }, dateRanges[] { id, label, fromParam, toParam, placeholder, fromTimeParam?, toTimeParam? } — one day + a time-of-day window IS one dateRange with fromTimeParam/toTimeParam (schema.ts:155-156; precedent SHIPPED_CONTROLS, pages.ts:397-415).
   - Facets with counts (carrier, status, reason…): NAV_FACET_GROUPS['<pageId>.<viewId>'] = [{ id, label, param, multi }] (src/lib/nav/facets/contexts.ts); counts come from the SAME query builder the list uses — never a second predicate.
   - Find: NAV_PAGE_DECLS[page].search = { source: 'url-param', param: 'q', placeholder } (NavFind). Never an in-page search field.
   ContextualSidebar / NavModeSwitcher / NavViewSwitcher / NavFilters paint all of it from the declaration; the list reads the same URL params.
2. The page body shows RECORDS ONLY, in the display method chosen PER PAGE by `ds_display_method` from THIS page's facts (column board | card list | triage sections | data table | record ledger | admin table | detail hub) — this block never fixes the display. The placement rule covers CONTROLS only: NO in-page filter bar, chip / pill row, aria-pressed toggle group, segmented control, tab row, date / time picker, staff picker or facet picker in the page body. Selection, `bulk` actions and the chosen display's own density stay with the records.
3. 'The convention can't do X' is only valid with a citation of the missing field in src/lib/nav/context/schema.ts; then extend NavControlsSchema + NavFilters — never build the control in the page.
4. Reference implementation: the Exceptions hub — NAV_PAGE_DECLS.exceptions.modes = { label: 'Domain' } (src/lib/nav/context/pages.ts:990-994); domain + kind children with `group` (src/lib/sidebar-navigation.ts, the `exceptions` entry ~1146-1185); facet contexts + counts (src/lib/nav/facets/contexts.ts, src/lib/nav/facets/exceptions.ts).
5. Gate: run ds_critique on every touched UI file. Rule `filter-controls-outside-sidebar` blocks a page-body write that both writes list filters to the URL and mounts a filter control.

