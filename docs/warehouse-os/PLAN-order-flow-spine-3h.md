# PLAN — The order-flow spine, closed in 3 hours

**Written 2026-08-31; every claim below verified against the tree the same day by a
9-agent adversarial pass (file:line evidence; corrections folded in).**
Paste this whole file into a fresh session and say "build it." The budget is
**3 hours wall-clock**; the lanes above the cut line fit it with fan-out, the
lanes below are the next window. This encodes the operator's flow ruling of
2026-08-31 (the "initial order triage" interview). Where it contradicts an older
note, **this file wins**; strike the older note per X3.

---

## 0 · The target flow, verbatim from the operator

1. Sync orders from all platforms → all orders enter the system.
2. The system **splits** them: **accepted** vs **exceptions**.
3. An exception needs its **item number paired** to the inventory SoT (the Zoho
   SKU mirror, `sku_catalog`).
4. Triage links everything to the order ID: paperwork (manuals), the shipping
   label (**bought or uploaded**). Nothing moves until all of it is connected.
5. When complete, the **order is assigned to a staff ID** (a work order).
6. Work orders render in an **urgency display — must-ship-today on top**.
7. The assigned order **appears on that staff member's mobile home page**.
8. The **picker pairs the order ID to the unit** — serial number, or the
   prepacked QC label.
9. The **packer scans** the serial (or prepacked label) → **triggers the print
   job**: shipping label + all paperwork. Papers in the box, label on the box.
10. Order fulfilled.

## 1 · The gap map (verified 2026-08-31)

| # | Flow step | State | Ground truth |
|---|---|---|---|
| 1 | Platform sync | **EXISTS** | Connector registry `src/lib/integrations/connectors/registry.ts`; cron every 15 min (eBay/Amazon/Square/Ecwid/Sheets). All ingestion is poll-based — no order webhooks anywhere. Shopify + ShipStation `sync()` exist but are in no cron list. |
| 2 | Accepted/exception split | **PARTIAL** | The cage exists: `orders.release_state` (`2026-08-30c`, NULL = released), gates G1 identity / G2 docs / G3 label in `src/lib/orders/release-gates.ts:114` (pure), re-evaluated inside the release transaction (`caged-orders.ts:389` → 409 `GATES_NOT_MET`). **Nothing cages an order at ingest** — the split is a manual act today. |
| 3 | SKU pairing | **EXISTS** | `sku_catalog` (Zoho mirror via `provider_item_id`), `sku_platform_ids`, 3-tier resolution at ingest (`ingest-canonical-orders.ts:748` bySku→byItem→byTitle), `batchPair` sibling backfill (`src/lib/neon/pairing-queries.ts:346`, fan-out UPDATE at :705). **Pairing is not a release gate** — an unpaired order can be released (`order-exception-types.ts:78`). |
| 4 | Triage links label + docs | **PARTIAL** | `/shipping/exceptions` workbench + `ExceptionEditor` + intake form (`OrderIntakeForm.tsx`, 6 sections) with label **buy** embedded (`BuyLabelSection`, ShipStation v2 rate-shop → purchase → auto packing slip). **Label upload is dead code**: the NAS attach tray in `OrderDocumentsSection` renders only under `documentsMode='manage'`, which only `panelContext='labels'` grants — and nothing in the app mounts that context (the `open_labels` CTA pushes `/ops/labels`, a route that does not exist). |
| 5 | Assign to staff ID | **EXISTS (write)** | `work_assignments` (assignee trigger-derived for station rows, authoritative for FOLLOW_UP — `2026-08-08b:161`), `POST /api/orders/assign`, intake Assignment section. The **read side** is the gap (row 7). |
| 6 | Urgency display | **PARTIAL** | Ship-by lives on `work_assignments.deadline_at` (the `orders.ship_by_date` column is gone; ~89 surfaces alias it). `must_ship_n` SQL + dashboard Must-ship zone exist. Ranking SoT (`ranking.ts:30`) puts priority before deadline, but every writer hardcodes priority 100, so deadline decides de facto. **Ruled for this window:** the assigner-side urgency display is served by the existing must-ship zone + de-facto deadline order; a desktop deadline-banded board is out of scope. |
| 7 | Staff mobile home | **MISSING** | Full `/m` app exists (22 shell pages, react-query, drawer nav) but **no per-staff "my work" view anywhere in it**. `GET /api/work-orders/mine` returns a single slim `top` object (goal chip only), filters `techId/packerId` (`ranking.ts:53-58`), never `assignee_staff_id` — which **no query selects anywhere**. |
| 8 | Picker pairs order↔unit | **PARTIAL** | `/m/pick/[orderId]` verifies an existing allocation (`matchScanToTask`, `picker-shared.ts:42-64`: serial · bin · `/m/u/{id}` QR · sku · platform ids) but **cannot create one** — binding only happens via FIFO auto-allocate (`src/lib/inventory/allocate.ts:94`). Zero-allocation orders render `EmptyShell` — the scanner never even mounts. |
| 9 | Packer scan → print | **PARTIAL** | `POST /api/packing-logs` matched-ORDERS scan → `printBundleSuggested:true` (:760) → `triggerPackPrintBundle` → `dispatchPrintBundle` (label + slip + manuals; PrintNode `outbound` profile or browser fallback). But the matcher is **tracking-only** (3-rung ladder + FBA); a serial scan today 400s under 8 chars or falls into the not-found path, which **writes an `orders_exceptions` row AND a `PACK_COMPLETED` activity log** (inflating packed counts). Print routing is **one org-wide outbound printer** (`print-bundle.ts:109`, `LIMIT 1`) — there is no per-station printer. |
| 10 | Fulfilled | **PARTIAL** | `POST /api/pack/ship` transactional path + scan-out station exist (scan-out is mid-rebuild in the working tree — stay out). **No tracking push-back to any platform** (eBay client has zero POST/PUT calls): until the next window, "fulfilled" means shipped in Cycle Forge only — the marketplace and buyer see nothing. |

## 2 · Operator rulings encoded here (2026-08-31)

- **R-FLOW-1: Pairing becomes release gate G4.** Supersedes the
  "pairing is NOT a gate" notes in `order-exceptions.ts` (header) and
  `order-exception-types.ts:78-79` — strike both in the same change. Evidence
  already agreed: 19 of the operator's 22 caged orders were unpaired.
- **R-FLOW-2: New orders enter caged unless clean.** After insert, evaluate the
  **full gates** (reuse the `GATE_SELECT` fact SQL from `caged-orders.ts` over
  the new ids — one batched query) and stamp `release_state='caged'` on any
  failure. Guards: **new rows only**, **never** rows arriving already fulfilled
  (`status='shipped'` — the eBay lane pulls 30 days of already-shipped orders,
  Amazon FBA lands shipped; caging those floods the desk), and the UPDATE is
  defensive (`WHERE release_state IS NULL AND id = ANY(...)`). NULL-means-released
  stays; nothing historical is touched.
- **R-FLOW-3: On the staff's own queue, deadline outranks priority.** The global
  ranking SoT is untouched; the mobile view sorts by deadline bands (Overdue ·
  Must ship today · Upcoming · No deadline), priority breaking ties inside a band.
- **R-FLOW-4: A picker may bind a unit to an order at the shelf** when
  `unit.sku_catalog_id = order.sku_catalog_id`, the unit has no **open**
  allocation (open = `state NOT IN ('RELEASED','RETURNED')` — the
  `idx_oua_open_unit` predicate, not the route's older `<> 'RELEASED'`), and the
  unit's status is in the sellable set **STOCKED | TESTED | GRADED** (a deliberate
  widening of `isAllocatable`, which passes only STOCKED). Wrong SKU still 409s.
- **R-FLOW-5 (assumption, confirm with operator):** this window prints the whole
  bundle — label + slip + manuals — to the **single org-wide `outbound` printer**.
  Per-station printer routing is next-window work (text-column mapping, K12-safe).
- **R-FLOW-6 (operator, 2026-09-01, amended same day): shipping is a COMPONENT,
  not a page — and it is never scoped to exceptions.** One shared
  `OrderShippingPanel` (tracking/label state → parcel → rate-shop/buy →
  upload/attach) with two hosts importing the same component:
  (a) the exceptions/intake editor renders it as its G3 card;
  (b) **inline in the one data table** — the operator selects rows on the
  To-ship queue, invokes **Labels** (a `selectionActions` verb in the
  TableStatusBar cluster, hotkey `L`), and the panel expands as a band
  BENEATH the row currently being worked; that row carries the active-work
  highlight; each buy commits per row (K10) and advances to the next selected
  row, the band and scroll following. No standalone page. The `L` key binds
  through the house keyboard registry with `registerShortcutOverviewGroup`
  (the `?` sheet is the display SoT — no keycap on the button face), and it
  must be inert while any input/scan sink holds focus (wedge safety, T20's
  hazard). Pairing problems are the exceptions desk's concern; label work is
  universal. This also finally mounts the designed-but-dead "labels" documents
  context (`documentsMode='manage'`) and retires the `/ops/labels` CTA that
  points at a route that does not exist.

## 3 · The build

**T0 protocol (10 min, before any lane):**
1. `npm run verify` and **record the baseline**. It is currently red with a
   pre-existing foreign failure (`src/lib/tables/org-table-layouts.test.ts:43`,
   collateral of the concurrent session's uncommitted field-catalog churn). You
   are accountable only for failures not in the baseline — do not repair foreign
   tests without re-reading the dirty files first.
2. A concurrent session has ~200 dirty files in this tree (grids, scan-out,
   settings, **`src/lib/ebay/sync.ts`**). If it is live, negotiate the seam via
   SendMessage; regardless: re-read any shared file immediately before patching,
   stage only your own files, never `git add -A`, stage last.
3. Verify runtime is ~2 min wall (tsc 53s ∥ unit 75s ∥ lint cached) — iterate
   freely.

Lanes 1, 1b, 2 run in parallel (disjoint files). **Cut line after Lane 2.**

### Lane 1 — The split: G4 + auto-cage at ingest (75–100 min)

1. **G4 in the pure gate** — `src/lib/orders/release-gates.ts`: extend
   `RELEASE_GATE_IDS` (:54), `RELEASE_GATE_LABEL` (:57), the gates array (:131);
   fact `skuCatalogId: number | null` on `ReleaseGateFacts` (:68), green when
   non-null. Update `release-gates.test.ts` (its :31 asserts exactly
   `['G1','G2','G3']`), plus every facts fixture (the field is required).
   Typecheck-sweep all `ReleaseGateId` consumers. **Back-compat rule + test:**
   historical `orders.release_gates` snapshots without a G4 entry are read
   as-released, never re-judged.
2. **Fact plumbing** — `caged-orders.ts`: `o.sku_catalog_id` is referenced inside
   the G2 fragment but **not projected**; add it to `GATE_SELECT` and thread
   through `RawGateRow` → `factsFromRow` → `CagedOrderRecord`. Pure code.
3. **Blocker↔gate alignment** — `order-exception-types.ts:68`: `unpaired` now has
   a matching gate; update the coupling comment (:85-87) and strike :78-79.
4. **Intake form** — `OrderIntakeForm.tsx` hardcodes `gateById.get('G1'|'G2'|'G3')`
   (:750, :770, :805) and says "all three gates" (:738). Give G4 a section (or a
   row in Links) with a link to the pairing editor
   (`/shipping/exceptions?order={id}`) so an unpaired order does not dead-end at
   the desk; fix the copy. (Pairing itself stays `ExceptionCatalogPairing` /
   `batchPair` — do not rebuild it.)
5. **Auto-cage in the canonical writer** — `ingest-canonical-orders.ts` already
   returns `insertedOrderIds` (:78, insert loop :1027-1050, ids 1:1 with planned
   rows). New `src/lib/orders/auto-cage.ts`: takes new ids + a client, runs the
   gate-fact SQL over them, one defensive UPDATE
   (`SET release_state='caged' WHERE id = ANY($ids) AND release_state IS NULL
   AND COALESCE(status,'') <> 'shipped'`). Call it **after the insert loop and
   before** `invalidateAllOrdersApiCaches` (:1087) / `publishOrderChanged`
   (:1090) so the first refetch sees the cage. Unit-test the decision pure-half.
   (Drizzle's `ordersTable` has no `releaseState` column — the raw UPDATE seam
   avoids a schema.ts change entirely.)
6. **Bypass writers, last and defensively** — Amazon
   (`amazon/order-sync.ts:302-327`, has `(xmax=0) AS inserted` but discards ids)
   and eBay (**two** insert sites, `ebay/sync.ts:124` and `:367`, no RETURNING —
   the conflict path misreports updates as creations). Add `RETURNING id` (eBay
   also `(xmax=0)`) and call the same helper. **`ebay/sync.ts` is dirty from the
   concurrent session** (it is growing a third ingest path that will also need
   the call): re-read first; if it is still churning, cut the eBay wiring to the
   next window — the defensive UPDATE makes a later sweep safe.
7. CSV import (`/api/orders/import-csv:150`) funnels into the canonical writer —
   inherited for free.

*Blast radius, verified:* caged rows vanish only from the To-ship live queue, the
in-warehouse set, and queue-count totals (`orders/route.ts:667,676`,
`queue-counts:135`); `/api/pick/queue`, allocation, and packing have no
`release_state` predicate, and `releaseOrder` has exactly one caller (the
operator's cage-release route) — nothing automated releases.

*Acceptance:* import a CSV/Sheets/Square order with an unknown item number → lands
caged, appears on `/shipping/exceptions` with `unpaired`; pairing (sibling
backfill), docs, label turn all four gates green; Release succeeds. A clean row
(paired + docs + tracking) lands NULL and flows straight through. **Do not point
this test at the eBay lane** — its orders arrive already shipped.

### Lane 1b — `OrderShippingPanel`: one shipping component, two hosts (R-FLOW-6)

1. **Extract the shared component** — `OrderShippingPanel` composes what
   already exists, in this order: parcel weight/dims (persists via
   `set-parcel`), `BuyLabelSection` (rate-shop → buy → void), the
   upload/attach tray (`OrderDocumentsSection` with `readOnly={false}` — the
   browser→NAS PUT + attach-by-URL flow; hard-fail copy when the org has no
   `nasBaseUrl`), and the tracking/label state readout. Contract: takes
   `orderId`/`orderRef` + an `onFactsChanged` callback; every write re-reads
   the server facts (the `useOrderTriage` discipline — never patch locally).
2. **Host A** — the exceptions/intake editor's Shipping (G3) card imports it,
   replacing its inline shipping markup.
3. **Host B** — inline in the one data table (amended R-FLOW-6): a **Labels**
   selection verb (`selectionActions` on `DataTable`/`TableStatusBar`) +
   hotkey `L` (keyboard registry + `registerShortcutOverviewGroup`; inert
   while any input/scan sink has focus; run `pnpm run eval:cohort shortcuts`
   after). Invoking it over the selection opens the panel as an expansion
   band rendered by the outbound lane's `renderRow` beneath the ACTIVE row
   (active-work highlight on that row); buy → per-row commit → advance to the
   next selected row, band and scroll following. Works for any order,
   released or caged. This closes the "uploaded" half of flow step 4, which
   is currently unmounted dead code.

### Lane 2 — "My work" on mobile, urgency-first (90–120 min, descoped)

**Scope for this window: station work orders (TEST/PACK/REPAIR/QA/STOCK_REPLENISH)
for the signed-in staffer. FOLLOW_UP visibility is below the cut line** — the
work-orders lib fetches FOLLOW_UP nowhere, `assignee_staff_id` is selected
nowhere, and `useNextWorkOrder.ts:16-19` records its exclusion as deliberate
(thrown tasks are delivered via the desktop inbox). Surfacing it properly is a
new fetcher + row-type change + an X3 strike of that ruling — next window.

1. **Feed** — `GET /api/work-orders/mine` returns only `{ top }` and its shape
   feeds the goal chip (`useNextWorkOrder.ts:43`). **Do not widen the shared
   predicate** — `topWorkOrderForStaff` also drives desktop My Day
   (`aggregate-my-day.ts:203`), so changing it changes desktop membership and
   breaks the byte-identical acceptance. Instead add a list mode
   (`?list=1` → `{ top, rows }`) or a sibling route via the `new-route` skill;
   rows come from the same `fetchAllWorkOrderQueues` + mine-filter, serialized
   as `WorkOrderRow` (already carries `deadlineAt`, `queueKey/queueLabel` —
   there is no `work_type` field; use the queue label). Permission
   `work_orders.view` (seeded for receiver/packer/technician; a shipper-only
   staffer 403s — known).
2. **Banding** — the Overdue/Today/Upcoming classifier does not exist; write it
   in the page module from `getDaysLateNullable`/`getDaysLateTone`
   (`src/utils/date.ts:730,743` — note it clamps at 0, so "Upcoming" needs its
   own future-date check). Band sort per R-FLOW-3.
3. **Page** — `/m/work`: `page.tsx` thin `'use client'` wrapper → component under
   `src/components/mobile/` (the `/m/pick` → `PickQueue` pattern); data via
   `@tanstack/react-query` (`useCaptureStackQuery` if rendered as a feed); reuse
   `PendingOrderRow` (`src/components/mobile/feed/rows/`) — it already renders
   title, qty/condition, days-late tone dot, `OrderIdChip`/`TrackingChip`
   (Q4 last-8 via `src/lib/copy-chip-format.ts`, importable both sides). Copy the
   client auth bounce from `useMobilePicker.ts:36-40` (there is no middleware —
   an unauthenticated visitor otherwise gets a blank page, not a redirect).
   Tap → `/m/pick/[orderId]` for ORDER rows (deep-linkable; note the existing
   PickQueue taps go to `/m/orders/{id}`, don't copy that).
4. **Nav** — one `NAV_ITEMS` leaf in `MobileSidebarDrawer.tsx` (:99-117); on
   `/m/home`, a **static link band** above the feed in `Dashboard.tsx` (the feed
   is SSR-seeded for LCP — do not put a client-fetched band above it).
   `MOBILE_ALLOWED_PREFIXES` already passes `/m/*` — no routing change.
5. **Manifest** — if a new route: permission-registry entry + hand-edit
   `docs/security/route-permissions.json` **including the summary counts** (the
   generator named in the module header does not exist; the manifest test fails
   on inconsistent counts).

*Acceptance:* a staffer with an assigned order due today sees it in the top band
of `/m/work`; an unassigned staffer sees the empty state; the goal chip and
desktop `/` are byte-identical (the shared predicate was not touched).

—— **CUT LINE** — everything below is the next window unless ahead of schedule ——

### Lane 3 — Picker scan-to-bind (80–110 min)

Seam ruling (decided here so no agent re-litigates): **bind lives in
`POST /api/pick/scan`**; the mobile picker calls it and then refetches
pick-tasks + session (one extra round trip, no session-semantics surgery).

1. **Server** — `pick/scan/route.ts`: body already carries `order_id`
   (snake_case), `bin_id`, `client_event_id`, `override_mismatch`. New branch:
   scan resolves to a unit (`findByNormalizedSerial`/`findByUnitUid`,
   `serial-units-queries.ts:138,223` — the `orPrint=1` label fallback is private
   to the serial-units route, HTTP-only) with **no open allocation**
   (`state NOT IN ('RELEASED','RETURNED')`), `order_id` supplied, SKU match, and
   status in R-FLOW-4's sellable set → INSERT `order_unit_allocations`
   (`state='PICKED'`, `allocated_by_staff_id`, `organization_id`) + one
   `transition()` STOCKED/TESTED/GRADED→PICKED with payload
   `reason:'scan_bind'` — **mirror force-pick's payload-reason pattern**
   (`reason:'force_pick_override'`), not a new event type: a new
   `InventoryEventType` drags in the `EVENT_TYPE_TO_CBV` exhaustive Record +
   `epcisActionForEventType`. No ledger write (verified: `allocateOrder` writes
   allocation INSERT + transition only). Catch 23505 from `idx_oua_open_unit`
   (a **partial unique index, not deferrable** — races fire at INSERT) → 409.
   Widen the route's unit SELECT (:78-89) — it lacks `sku_catalog_id` and the
   bin join `isAllocatable` needs. Extract the bind decision as a Deps-injected
   pure function (`domain-unit-test` pattern) so the unit gate covers it.
2. **Mobile** — `useMobilePicker.ts` miss branch (:204-216): before setting
   `scanError`, POST the bind; on success refetch and treat as confirmed pick.
   **Zero-allocation orders never mount the scanner** (`page.tsx:66`
   `EmptyShell`) — replace that branch with a scan-capable bind state, or step 8
   of the flow still fails for the exact order that needs it most.

### Lane 4 — Packer serial-scan resolves to the order (45–70 min)

`packing-logs/route.ts` matcher is tracking-only, and the edges bite: the
`< 8 chars → 400` guard (:228-230) runs before all lookups; `classifyScan`
diverts colon-bearing scans to the SKU branch (**which mutates the stock
ledger**, :822-831) and 10-char `X00…/B0…` shapes to FNSKU; an unmatched serial
today writes an `orders_exceptions` row **and** a `PACK_COMPLETED` log
(inflating packed-by-packer counts). Slot the serial probe as the 4th rung —
after the FBA miss, before the not-found block (:415): serial →
`serial_units` (org-scoped normalized index) → **live** allocation
(do NOT reuse `findShippedOrderForSerialUnit` verbatim — it prefers SHIPPED) →
order. The response must mirror the matched-ORDERS contract exactly
(`orderRowId > 0`, non-empty `orderId`, `packerRecord.id`, **no `warning`**) or
`PackScanColumn`'s gate (:344-370) silently never fires the bundle. Fix the
NULL-`shipment_id` packer_logs dedup (:598-604 — `= $1` never matches NULL, so
re-scans double-count) with an `IS NOT DISTINCT FROM` or order-id dedup.
Reprint is free (`PackPapersStatusCard:58-78` keys off order id only).

### The gate (25 min, not optional)

- `npm run verify` — green **relative to the T0 baseline**.
- Manifest hand-edits (route entry + summary counts) if any route was added.
- Strike the superseded comments (Lane 1 step 3) and record two X3 amendments:
  the `/m/work` surface extends 00-endgame §4's enumerated mobile-browser list;
  D7 stands — `/m/work` is a read queue, work orders are default-assigned,
  tapping a row must never create or arm a session.

## 4 · Hard rules — paste this section verbatim into every subagent prompt

- **CLAUDE.md**: call `ds_contract`, `ds_tokens`, `ds_critique` before ANY UI
  code. `ds_contract` takes `intent`, not `query`.
- **LAWS V2**: never start/restart a dev server — the operator owns `:3050`.
  **V4**: `main` only, no branches. **V5**: stage only files you changed, never
  `git add -A`, stage last — a concurrent session is mid-fan-out in this tree;
  re-read any file that looks freshly rewritten. **V6**: `npm run verify`.
- **M1/M2/M3/M4**: nothing on new UI animates geometry — colour/opacity only,
  80ms cap; state rings via `outline`; no first-load cascade on the band list.
- **K12**: no new Postgres enum values or CHECKs. Receipts that no migration is
  needed: `orders.release_state` CHECK already allows `'caged'` (2026-08-30c);
  `orders.sku_catalog_id` exists (2026-04-07); `work_assignments.assignee_staff_id`
  exists, trigger-maintained (2026-08-08b); `order_unit_allocations.oua_state_chk`
  already contains `'PICKED'` with `allocated_by_staff_id` + `organization_id`
  under RLS (2026-05-17/23); `inventory_events.event_type` is TEXT by design
  (2026-05-13). If a step seems to need `ALTER TYPE`, the step is wrong.
- **D5**: `orgId` from `ctx.organizationId`, never the body. **D7**: sessions
  are never assigned; only work orders are.
- **Q4**: identifiers render last-8 through `src/lib/copy-chip-format.ts`.
- **Tests**: the unit runner collects `*.test.ts` ONLY — a `.test.tsx` is a
  silent no-op. Components: jsdom + `createElement` in a `.test.ts`. Domain:
  Deps-injection per the `domain-unit-test` pattern.

## 5 · Traps, named

- `orders` is **line grain** (PK `shipped_pkey`); no `order_items` table. Dedup
  key `UNIQUE(order_id, account_source)` is not org-scoped — known, untouched.
- `release_state` **NULL means released**; stamp new rows only, defensively.
- **Two exception systems**: `release_state='caged'` (this plan) vs legacy
  `orders_exceptions` (unmatched carrier scans). Never write the latter — note
  the pack station's miss path already does (Lane 4 bypasses on hit, does not
  remove the writer).
- **Two "release" verbs**: `cage-release` (the gate) vs `release` (unwinds
  allocations).
- `ship_by_date` everywhere is a projection of `work_assignments.deadline_at`.
- `assignee_staff_id`: trigger-derived for station rows, authoritative for
  FOLLOW_UP — read-only for TEST/PACK.
- Scan-out (`src/components/outbound/scan-out/`) is mid-rebuild in the working
  tree — out of bounds for this plan.
- `picking_sessions` has no `organization_id` (documented seam) — keep it that
  way in the bind path.
- The open-allocation predicate is `state NOT IN ('RELEASED','RETURNED')`;
  `pick/scan`'s own lookup still uses the older `<> 'RELEASED'` — don't copy
  the drift into new code.
- eBay's sync is "exceptions-first": it imports **already-shipped** orders.
  Amazon FBA rows land shipped. Auto-cage must skip them (R-FLOW-2 guard).

## 6 · Explicitly out of scope (the next window, in priority order)

1. **Tracking push-back to platforms** (eBay `createShippingFulfillment`,
   Amazon `confirmShipment`, Ecwid/Walmart) — until then, "fulfilled" is
   internal-only: the marketplace and buyer see nothing. The operator signs off
   on that semantics for this window.
2. **FOLLOW_UP tasks in the mobile feed** (needs the new fetcher + an X3 strike
   of the inbox-only ruling in `useNextWorkOrder.ts`).
3. **Per-station printer routing** (R-FLOW-5 assumption today: one org-wide
   `outbound` profile; label-class thermal profiles are never consulted).
4. Label **void** reconciliation (a voided label still satisfies G1/G3 via the
   orphaned STN — real gap, not a decision).
5. Printer-profile CRUD UI (rows are hand-inserted).
6. `PICK` work type; order header/lines grain; Shopify/ShipStation cron
   scheduling; org-scoping `idx_orders_unique_account_order`; multipart (non-NAS)
   document upload.
