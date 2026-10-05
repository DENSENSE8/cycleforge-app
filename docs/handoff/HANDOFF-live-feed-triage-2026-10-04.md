# HANDOFF: Live feed package triage board (Phase 1 → Phase 2), 2026-10-04

Repo: `/home/michaelgarisek/Projects/cycleforge-lanes/prod` · dev origin **http://localhost:3050 only** (lane `cycleforge-lane@prod`; never start servers, never bind another port).
Auth for curl/browser: cookie `cf_sid` from `tests/.auth/admin.json` on localhost.
**Other sessions edit this tree at the same time.** Re-read every file right before editing it and never revert changes you didn't make. Their red gates are not ours (see "Known state").

## Owner rulings (binding)
1. The Live feed is an **outbound package triage board** with exactly four stages: **To pick → Picked → Packed → Scanned out**. No in-transit or delivered lanes, and no inbound direction.
2. Each stage must match **Allocate** (`/shipping/orders`) exactly. Phase 1 covers **carrier (physical) packages only**. Counter pickups and Square sales are excluded.
3. To pick, Picked and Packed always show **everything still in the building**. Scanned out shows only what left **today**. The board is live and always today: the Day / Week window was retired 2026-10-05 (owner: "the day, week, and today filters do nothing").
4. Progressive disclosure, in three levels: the headline (in the building / late / scanned out), then the board, then a package panel with its journey, tags and comments.
5. Mobile-first: on a phone, four stage tabs across the top over **one column**. A package opens as a full-screen sheet.
6. The owner told agents to **disregard the design-system placement and styling rules** for this board, so the current look is deliberate. Data-safety rules still apply: tenancy wrapper, `withAuth`/`requireRoutePerm`, migration files, `:3050`.

## What exists (Phase 1, built and verified 2026-10-04)
### Data (`src/lib/live-feed/`)
- `stages.ts`: `PACKAGE_STAGES`, `PACKAGE_STAGE_META`, `PACKAGE_STALL_HOURS` (picked 4h, packed 4h — To pick's pressure is the ship-by SLA) and `LIVE_FEED_PERMISSION = 'packing.view'`.
- `route.ts`: the paths, the API paths, `LIVE_FEED_PARAMS = { open, q, carrier, channel, staff, stage, offset, ids }`, `readLiveFeedOpen` / `readLiveFeedStage` / `readLiveFeedFilters` / `readLiveFeedIds`, `liveFeedFilterParams`, `LIVE_FEED_PAGE_SIZE = 25`. Filters: `carrier` / `channel` are comma-separated keys (`UPPER(BTRIM(stn.carrier))`, `LOWER(BTRIM(account_source))`), `staff` a staff id.
- `load.ts` (server):
  - **ONE member set** (`MEMBERS_SQL`): open stages = `sqlOrderInWarehouseToShip('o')` minus in-person orders, split by `sqlOrderDeskStage(…)`; scanned out = first `SHIP_CONFIRM` today; yesterday's scan-outs (`m_prev`). Every member carries `carrier_key`, `channel_key`, `staff_ok` (assigned to / picked / packed / scanned out by the staffer); `m` = members with the sidebar filters applied.
  - One shared bind list for every statement (`$1` org … `$10` ids; find adds `$11`–`$15`) — an unreferenced bind is fine.
  - `loadLiveFeedBoard(orgId, filters)`: `BOARD_SQL`, one statement — stage counts (count / earlier / late / stalled), first 25 cards per stage, hourly pace today vs yesterday, each carrier's load (floor-wide: a truck takes every box) and the facet counts — plus today's pickup cutoffs (`loadPickupCutoffsForDay`) joined to the carrier loads. A carrier facet narrows which pickups show, never their counts.
  - `loadLiveFeedLane(orgId, stage, offset, filters)`, `loadLiveFeedFacets(orgId, filters)` (each facet counted with every OTHER filter — the sidebar's counts), `loadLiveFeedPackages(orgId, ids)` (deep links / box mates past page 1), `findLiveFeedPackages(orgId, q)` (order number via `sqlIdentifierEqualsQuery`, SKU, or the box's tracking via `sqlTrackingNumberMatches` — matched over the board's members only; matching the whole order history timed out at 15 s).
  - Cards carry `stalled` and `boxMates` (other `orders.id` on the same `shipment_id`).
  - **Grain:** one card per `orders.id` row, the same as Allocate. Blocked (out of stock) shows only on To pick and Picked.
- `pace.ts`: `warehouseClockHours`, `pacePerHour`, `yesterdayByNow`, `pickupTone`, `formatDurationMinutes` — ONE copy for the board's strips and the TV panel.
- `pickup-cutoffs.ts` (server) / `pickup-cutoffs-shared.ts`: the carrier pickup cutoff store (`carrier_pickup_cutoffs`), `loadPickupCutoffsForDay(orgId, dateKey)`.
- `types.ts`: `PackageCard`, `PackageColumn`, `PackageBoard` (+ `pace`, `carriers`, `pickups`, `facets`), `PackageLanePage`.
- `query.ts`: `liveFeedBoardQuery(filters)` (key `liveFeedBoardQueryKey(filters)`, seeded by the pages), `liveFeedLaneQuery(stage, filters)`, `liveFeedFindQuery(q)`, `liveFeedPackagesQuery(ids)`. Root key `['live-feed']`.
- `tags.ts`, `tag-store.ts` (the only writer to `order_tags`).
- Tests: `pnpm test:live-feed` (route filters, tags, pace, pickup cutoffs, bulk actions, TV projection, nav facets).

### APIs
- `GET /api/live-feed/board[?carrier=&channel=&staff=]`, `GET /api/live-feed/lane?stage=…&offset=N[&filters]`, `GET /api/live-feed/packages?q=… | ?ids=…` — all `packing.view`.
- `GET|PUT /api/live-feed/pickup-cutoffs` — GET `packing.view`; PUT `admin.manage_features`, audited (`carrier_pickup_cutoffs.replace`). Editor: `/settings/pickup-cutoffs` (per carrier, per weekday; "same time Mon–Fri").
- `GET /api/operations/tv-board/live-feed` — `operations.tv.view` + the `ops_tv_board` flag; numbers only (no cards, no customers).
- Sidebar facet counts ride the existing `GET /api/nav/facets?context=live-feed` (`src/lib/nav/facets/live-feed.ts` → `loadLiveFeedFacets`).
- `GET|POST /api/orders/[id]/tags`; comments reuse `GET|POST /api/orders/[id]/notes`. Do NOT add a second comment store.
- Bulk verbs reuse Allocate's paths: assign picker → `POST /api/orders/assign` (`orders.create`); print labels → `GET /api/orders/{id}/documents` + `printOutboundDocuments` (`orders.view`).

### Database
- `2026-10-04h_order_tags.sql` and `2026-10-05_carrier_pickup_cutoffs.sql` are **applied** (both tenant-enforced).
- No new indexes: the board is about 100 ms in the database; find about 0.3 s.

### UI (`src/features/live-feed/`; `src/features` is importable by both desktop and `/m`)
- `LiveFeedBoard.tsx`: the orchestrator, with `surface: 'desk' | 'phone'` and `viewerStaffId`.
  - The open package lives in **React state seeded from the URL** (`open`); `q` and the filters are read from the URL (the sidebar writes them).
  - Headline (`BoardHeadline.tsx`: in the building / late / stalled / scanned out today, the Live pulse), `PaceStrip`, `PickupStrip`, `FindResults`, the columns, the package panel, `LiveFeedBulkBar`.
  - Find: the sidebar's NavFind on a desk (`?q=`), the phone's own field, or a **gun scan anywhere on the board** (the board claims the global `wedge-scan` event). One match opens; several list (`PackageMiniRow`); none says so.
  - Selection: hover checkbox on a desk (shift / ⌘-click a card also toggles); phone opts in with Select. While anything is selected a card tap toggles. Bulk bar (no backing panel — the count and verb pills float, owner 2026-10-05): **Assign picker only when every selected package is To pick** (`canAssignPicker`; hidden otherwise), Print labels always.
  - Phone (mobile exemption from the sidebar law): find field, **Mine** (`?staff=<me>`), Select, chime.
  - Chime (`live-feed-sound.ts`): off by default, per device; `playScanTone('warn')` when To pick grows or the late total rises.
  - Keys (outside text fields): Esc closes the package, else clears the selection; J/K walk its column; 1–4 jump to a stage; `/` focuses find.
- `StageColumn.tsx`: header, card list, and "load more" via IntersectionObserver. It reads the query state from a ref, so each page is requested exactly once.
- `PackageCard.tsx` (article + full-card open target under the content + `CardCheck`; Stalled pill; "Box of N" pill), `PackageFacts.tsx`, `PackageMiniRow.tsx`, `StageTrack.tsx`, `PackageDetail.tsx` (Stalled pill, **Open in Exceptions** → `/exceptions?order=<orders.id>` when out of stock, **Same box** list), `PackageTags.tsx`, `PackageComments.tsx`, `StageTabs.tsx`, `pills.tsx`, `stage-look.ts`, `BulkBar.tsx` + `bulk-actions.ts`.
- TV wall: `src/features/operations/workspace/TvLiveFeedPanel.tsx` on the Operations TV board (`/operations?tv=1`), fed by `useOperationsTvLiveFeed` (same realtime triggers as the board).
- Card face (owner 2026-10-05):
  - The order number is the canonical last-8 face (`formatOrderIdDisplay`), with no `…`.
  - Under the identity line, one row: the ship-by SLA (`ShipByPill`), out of stock and tags on the left; `PackageFacts` on the right.
  - `PackageFacts` is Allocate's paint (`RecordFactPaint`): quantity only above one (`×N`, warning ink), then grade (`lineCondition` label + code, grade ink), then price (success green). The right rail (`PackageDetail`) paints the same row.
  - Stage glyphs come from Allocate's `LIFECYCLE` → `LIFECYCLE_GLYPH`: CircleDot, PackageSearch, Package, Truck.
  - Selected / hover / active-tab state is an overlay border (`STATE_OUTLINE_CLASS`, `record-card-outline.ts`), never a `ring-*`: a scroller clips anything painted outside its items. Focus uses `focusRing('cell')` (inset).
- `live-feed-hooks.ts`:
  - `useLiveFeedRealtime` refreshes on `activity.logged`, `packer-log.changed` and `order.changed`.
  - `useNow()` stays `null` until the page has loaded in the browser, so relative ages are only drawn client-side. **Anything time- or fetch-dependent must wait for `now != null`**, or the server and browser draw different HTML.
- Pages:
  - `src/app/operations/live-feed/page.tsx` and `src/app/m/(shell)/live-feed/page.tsx` both load the board on the server first.
  - The phone menu entry lives in `src/components/mobile/v2/mobile-v2-destinations.tsx` (Workspace: Tasks, Support, **Live feed**, Exceptions).
  - The phone top-bar title is set in `src/lib/mobile-context-navigation.ts`.
- Navigation: one "Live feed" row under Operations, gated by `LIVE_FEED_PERMISSION`. Sidebar (`NAV_PAGE_DECLS['live-feed']`): find (`q`), Carrier / Channel facets with counts, Staff control.

## How to verify (reuse these)
- **Allocate parity.** Compare order IDs, not just counts. Today's expected result is that the only orders on Allocate's side are counter pickups.
  ```bash
  SID=$(jq -r '.cookies[]|select(.name=="cf_sid")|.value' tests/.auth/admin.json); C="Cookie: cf_sid=$SID"; B=http://localhost:3050
  curl -s -H "$C" "$B/api/live-feed/board" | jq -c '[.columns[]|{s:.stage,count}]'
  for s in pending picked packed; do curl -s -H "$C" "$B/api/orders?inWarehouse=true&stage=$s&limit=500" | jq '.orders|length'; done
  ```
- **Browser:**
  - Open a **fresh** headless tab for each turn; idle tabs freeze and then never finish loading.
  - Use `wait_until: 'domcontentloaded'`. `networkidle2` times out because of the realtime connection.
  - Load cookies as a header string: `tab.setCookies('cf_sid=…', { url: 'http://localhost:3050' })`.
  - Check the page is interactive by waiting until a card's text contains " here".
  - If another session's **Build Error** overlay covers the page, drive it with `element.click()` from `tab.evaluate`.
  - Phone: viewport 390×844, `isMobile`, page `/m/live-feed`.
- **Test data:** a test comment also overwrites `orders.notes` (the latest-note copy). Before posting, record the old value. Afterwards delete the `order_notes` and `order_tags` rows and restore `orders.notes`. Audit rows stay, because the audit log can't be edited.
- **Checks:**
  - `pnpm test:live-feed`;
  - `node_modules/.bin/eslint src/features/live-feed src/lib/live-feed …`;
  - `node scripts/typecheck.mjs` (the repo bans `npx`);
  - `pnpm verify:fast`.
  
  After adding or removing routes, run `pnpm audit-route-auth:emit`. After schema changes, run `npm run tenancy:coverage && npm run tenancy:routes`.

## Known state / gaps
- `verify:fast` fails lint and typecheck **only in other sessions' files**: task-board, support, labels-docs, `OrderCardList`. Four nav round-trip tests also fail on the committed code, and `command-bar-nav-groups.test.ts` fails on "Quality Control" capitalisation. None of these are ours.
- The design critique flags the raw `<button>` in `PackageCard`, `PackageMiniRow` and `StageTabs`. All are intentional and carry a `ds-raw-button:` comment explaining why.
- At 1440 with a package open, the Scanned out column slides off to the right (the board scrolls sideways). At 1920 everything fits.
- The comment box is plain text. The existing `OrderNotesPanel` supports @mentions; this board's composer doesn't yet.
- **No printable pick list exists** (the desk Pick list was retired 2026-09-29), so the bulk bar has Assign picker and Print labels only. The nearest existing print is `POST /api/orders/print-packet` (order paperwork) — an owner call whether it belongs on the bar.
- No carrier pickup cutoffs are configured for the dogfood org yet; the countdowns appear once a manager sets them at `/settings/pickup-cutoffs`.
- **Backfill (owner 2026-10-05):** every package that was Packed was marked scanned out at its own pack time by staff 1 (Michael) through the canonical dock writer `scanOutKnownShipment` (origin `bulk`). The run produced 10 shipments, `SHIP_CONFIRM` rows with `metadata.source = 'bulk-scan-out'`, audits, and allocations mirrored to SHIPPED. A re-run returns `duplicate`. Packed then read 0 on both the board and Allocate.
- **Next work is a prompt:** `docs/handoff/PROMPT-tv-board-as-live-feed-2026-10-05.md` (the TV wall becomes the read-only Live feed board).

## Next (in order; confirm with the owner before 4–6)
1. Re-check the interactive flows at `:3050` once other sessions' build errors clear: back/forward, load more, J/K, Esc, tag add/remove, posting a comment on desktop and phone. Screenshots at 1440, 1920 and 390.
2. Desktop polish: when a package opens, scroll its column into view. At 1440 with a package open, consider narrower columns so all four stay visible.
3. Phone polish: add swipe-down to close the sheet.
4. @mentions in the comment box, reusing the `note-mentions` helpers in `src/lib/orders/note-mentions.ts` and the staff list `OrderNotesPanel` uses.
5. Phase 2 (owner decision): in-person orders (counter pickups and Square), e.g. a "Ready for pickup → Handed over" path. That needs a recorded handover event; none exists today.
