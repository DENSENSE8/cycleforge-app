# HANDOFF — Fulfilled as one datasheet (outbound twin of Receiving › Purchasing)

Owner ruling 2026-10-05: replace everything `/fulfilled` paints today with the SAME datasheet
the inbound side now uses (`/purchasing`, `/search/list`), showing every
scanned-out / fulfilled order, with outbound-specific quality-of-life signals — first among
them **no carrier movement**. Outbound only. **Phase 1 is a read-only scout that comes back
with the roots to build first (migrations for load time included). Do not build before the
operator picks from that report.**

---

## 0. How to run this handoff

1. **Phase 1 — scout (read-only).** Answer every question in §4 with file:line and measured
   numbers. No edits, no DB writes. Read-only SQL / `EXPLAIN (ANALYZE)` against the `.env`
   DSN is allowed.
2. **Return a ranked root list** (§5 format) and STOP. The operator chooses what to build.
3. **Phase 2 — build** only the approved roots, in the approved order (§6 rules apply).

Dev origin is `http://localhost:3050` only (lane unit `cycleforge-lane@prod`, worktree
`~/Projects/cycleforge-lanes/prod`). Auth for curl/browser: `tests/.auth/admin.json`.
Another agent may be doing perf work on `/fulfilled` (`fulfilled-perf-*` services were seen):
check `git status` / recent diffs on the shipped files before proposing changes and name any
overlap in the report.

---

## 1. What exists today (verify each in Phase 1)

| Piece | Where |
|---|---|
| `/fulfilled` page | `src/app/fulfilled/page.tsx` → `ShippedWorkspace` (`src/components/outbound/workspaces/ShippedWorkspace.tsx`), seeded by `seedShippedLedger` (`src/lib/queries/shipped-ledger-seed.server.ts`), filter via `?shippedFilter=` + `SHIPPED_FILTER_COOKIE` (`src/lib/shipping/shipped-feed-config.ts`) |
| `/shipping/shipped` | permanent redirect onto `/fulfilled` |
| Shipped row/card faces | `ShippedLedger` / `ShippedPackageRow` (operator density, see `pinned.json` `TriageCardList`) |
| Outbound facts already computed | `src/lib/nav/locate/outbound.ts` `outboundFacts()`: `channelStatus` (orders.status = the channel's word, NOT the warehouse stage), `shipBy`, `packedAt`, `shippedAt` (dock scan-out, else packer log), `packer {id,name}`, `tracking`, `sku`, `title` — built from `WA_DEADLINE_LATERAL`, `ORDER_STAGE_FACTS_JOIN`, `SHIP_OUT_LATERAL` |
| Carrier facts | `shipping_tracking_numbers` (canonical / key18 / last8 / raw indexes exist: `idx_stn_norm_key18`, `idx_stn_raw_lower`, `idx_stn_norm_last8`), carrier status category / event time / delivered columns (confirm names) |

## 2. The reference implementation to reuse (do NOT fork)

The inbound sheet is one component with two data sources. The fulfilled sheet becomes a third host.

| Concern | Reuse |
|---|---|
| The sheet (status row, tools, zoom, columns, click-to-copy, Enter/O open, keys, scroll round-trip) | `src/components/search/pasted-list/PastedListSheet.tsx` |
| Query host pattern (server sort + Find, URL contract) | `src/components/receiving/purchases/PurchasesSheet.tsx`, `usePurchasesList.ts`, `src/lib/receiving/purchases-params.ts` |
| Query endpoint pattern | `GET /api/nav/purchases` (route + domain module built 2026-10-05; read it for the set-based filter → shared verdict pipeline shape) |
| Row shape | `NavLocateEntry` + `NavLocateFacts` (`src/lib/nav/context/schema.ts`) — additive fields only |
| Status chips above the header | `src/components/sidebar/contextual/PastedListStatusRow.tsx` / `BulkStatusChips` |
| One status per row | `src/lib/nav/locate/bucket-precedence.ts` (`primaryBucketId`) — declare an outbound-shipped precedence there |
| Open details = same as a triage card | `src/lib/records/record-details.ts` (`recordDetailsHref`, `recordDetailsNavigation`, `RECORD_BACK_PARAM`; shipped orders → `/fulfilled?openOrderId=`) |
| Column widths / freeze / zoom persistence | `src/components/tables/useSheetColumns.ts`; DataTable `unpaged`, `rowNoun`, `onFreezeColumn`, header double-click fit |
| Staff cells with house colours | `src/components/identity/StaffCell.tsx` (needs a staff **id**, never a name only) |
| Sidebar controls | `NavControls` decl in `src/lib/nav/context/pages.ts` (see `PIPELINE_CONTROLS` / Purchases decl): date range + axis choice, choices, staff, sort, saved views |
| Copy/Export | `pastedListCellText`, house `downloadExport` |

## 3. Operator rulings that bind the build (all from 2026-10-04/05)

- **Remove every component `/fulfilled` paints today** from that surface; the body is the datasheet only. Delete what becomes dead (cards, rows, toolbars, per-surface hooks) — clean cutover, no shims. Check `docs/design-system/consolidation-ledger.json` and retire entries.
- Rows: every **scanned-out / fulfilled** order (define precisely in Phase 1: dock scan-out vs packer log vs channel-shipped — the warehouse's own stamps decide "fulfilled"; `channelStatus` is a separate fact).
- **Status chips** left-aligned directly **above the column header row**, on ONE line that never wraps (empty buckets hidden unless pressed; overflow folds into a trailing `More · N` menu); **sort** in the left sidebar; **date range with a date-axis choice** in the sidebar (Shipped / Delivered / Ordered / Ship-by); Source/channel, Carrier, Packer (house staff filter), saved views in the sidebar. Right of the chips, same row, icon first (word on hover): Copy shown · Export · Recheck all · Columns · Orders/Lines · Board/Sheet · zoom dropdown (`100%▾`) · full screen last, top-right (operator 2026-10-05). **Back** first at top-left when entered from elsewhere.
- **One status identifier per row** (precedence), bare words — never "Fulfillment · Delivered".
- Sheet feel: minimal padding (~4px), hairline column rules, single-line cells with full text on hover, Shift+wheel sideways, sticky header + frozen Number, drag-resize, **double-click divider = fit**, freeze from header, persisted per user; **all rows, virtualized, no paging**; footer "N orders".
- **Click a cell = copy that cell** (toast "Copied …"); **Enter / O / hover open-icon = the exact same order details a triage card opens** (shared opener).
- Dates show **date + time** (house `formatMonthDayTimePST`); staff via `StaffCell` (colours by id).
- Colour semantics: green = done/complete; never orange for a complete state.
- Motion: house ease-in-out presets only (`motionBezier.easeInOutCubic`), no bounce; reduced motion = fades.
- Every filter in the URL (bookmarkable). Routes/labels registered in `src/lib/nav/route-tree.ts` / `sidebar-navigation.ts` by the builder (no ask-operator rule).

## 4. Phase 1 — scout questions (answer all, with file:line + numbers)

**A. Today's surface**
1. Full component/hook/query tree of `/fulfilled` (ShippedWorkspace downwards) and every other route that renders those components. What breaks if they are deleted?
2. Exact data path + request waterfall on first load: seed SQL, client feeds, polling/realtime, counts. Measure at :3050: TTFB, total load, number of requests, payload size, per-query time.

**B. Data available per column** (exists / derivable / missing):
order #, channel + channel order id, customer, items/SKU/title, qty, order total, ship-by, packed at + packer (id), **scanned out at + by (id)**, carrier, service, tracking, label created at, label cost, **first carrier scan**, last carrier event + time, delivered at, promised/estimated delivery, delivery attempts, exception code, returned-to-sender, return/RMA link, `channelStatus`, whether tracking was uploaded to the channel.

**C. QoL signals — feasibility and exact predicate for each**
1. **No carrier movement**: scanned out (or label created) but no carrier acceptance scan after N business hours/days — the core signal. Which columns prove "no movement"? How fresh is carrier polling (cron cadence, last poll per tracking)?
2. Stuck in transit: last event older than N days, not delivered.
3. Delivery exception / attempted / return to sender.
4. **Late ship**: scanned out after ship-by (channel SLA risk). **Late delivery**: delivered after promised date.
5. **Warehouse shipped, channel not marked shipped** (tracking not uploaded → marketplace defect/late-ship risk) and the reverse (**channel says shipped, warehouse never scanned out** — real case found 2026-10-04: Amazon 113-6729910-1909809, 112-4410844-9235459, 114-7232334-9247429).
6. Carrier claim window (lost-package deadline) for no-movement / stuck rows.
7. Split shipments / multiple packages per order; duplicate tracking across orders; invalid tracking (scientific notation — see `isScientificNotationTracking`).
8. Pack-to-ship time; ship-to-first-scan time; days in transit.
9. Returns linked to a shipped order.
Propose the **status bucket set** for the chips (e.g. No movement · In transit · Out for delivery · Delivered · Exception · Returned · Unknown) with precedence and the predicate for each.

**D. Load-time roots (outbound only)**
1. `EXPLAIN (ANALYZE, BUFFERS)` the statements that would back the sheet at realistic windows (last 30 / 90 days / all time) and the current shipped feed. Seq scans, sort spills, lateral loops per row, N+1s, round trips (`tenantQuery` = 3 RTT; `tenantQueryOneTrip` = 1).
2. Missing indexes (expression indexes must copy the probing expression character-for-character, as in `2026-10-04_locate_bulk_keys.sql`), stale stats (`ANALYZE` needs), candidate denormalized columns or a materialized/trigger-maintained "shipment status" row per order if carrier status is computed per request.
3. Expected latency after each proposed migration (measure with forced plans in a read-only session where possible, like the locate work did: 222 ms → 50 ms).

## 5. Report format (Phase 1 output)

```
ROOTS (ranked — build order)
1. <root> — why (measured), files, migration?, risk, est. effort
2. ...
MIGRATIONS (each: file name, statements, CONCURRENTLY?, measured before/after, rollback)
STATUS BUCKETS (id, label, precedence, predicate, data columns)
COLUMNS (default 10, optional tier) with data source per column
DELETE LIST (components/hooks/routes that go away)
OPEN QUESTIONS for the operator (only true product decisions)
```

## 6. Phase 2 build rules

- One endpoint shape for the sheet (mirror `GET /api/nav/purchases`: filters → set-based SQL → shared fact builders, `tenantQueryOneTrip`, parallel arms), additive schema fields only.
- No second verdict/fact implementation: extend `outboundFacts()` / the shared fragments.
- Migrations: hand-written in `src/lib/migrations/`, `-- migrate:no-transaction` + `CREATE INDEX CONCURRENTLY IF NOT EXISTS` for indexes, follow `skill://db-migration-author`; apply with `node scripts/run-pending-migrations.mjs --only <file>`; run `ANALYZE` on touched tables afterwards (stats were the reason indexes went unused last time); verify `indisvalid`. Never drop a value from a shared CHECK constraint (the DB is shared across lanes — read the live constraint before replacing it).
- Verification at :3050 with real data: screenshots of the sheet, each status chip count = API count, a no-movement row, Enter → identical details to the triage card, before/after load numbers. `pnpm verify:fast` once at the end; report errors only in touched files.
