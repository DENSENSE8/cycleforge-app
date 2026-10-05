# Phase 1 report: Fulfilled as one datasheet

This answers `HANDOFF-fulfilled-sheet.md` §4 in the §5 format. It was measured on 2026-10-05, read-only, against org `…0001` (USAV, 5,166 order rows) and the `cycleforge-lane@prod` lane at `:3050`.

Evidence with file:line references, plans and SQL is in `phase1/scout-{SurfaceTree,Waterfall,DataSignals,LoadRoots}.md`. **Nothing has been built yet. The operator picks roots from this report.**

## Headline: the main signal can't be computed from today's data

The handoff names **no carrier movement** as the main quality-of-life signal. Today the carrier data can prove it for only 3 of 445 fulfilled rows in the last 30 days:

- **USPS is never polled.** That is 361 of 445 rows (81 %). `ENABLED_SYNC_CARRIERS = ['UPS','FEDEX']` (`src/lib/shipping/enabled-carriers.ts:9`), and USPS is blocked on its IP Agreement. The last USPS poll was on 2026-06-09.
- **UPS and FedEx polling is failing.** The errors read "UPS_CLIENT_ID and UPS_CLIENT_SECRET are required" and the FedEx equivalent, on 402 rows. The `shipping.sync_due` cron ran 284 times in 24 h and synced 0 rows. The last real event ingest is about 48.6 h old at p50.
- **`stn.last_checked_at` is stamped even when a poll fails**, so it can't serve as proof of freshness.
- **751 USPS rows carry a synthetic `IN_TRANSIT`.** They have `source_system='scan'`, no events, and no poll, and no writer for this exists in the repo. These rows look like they moved when they did not.
- **84 % of 30-day scan-out stamps are backfills.** The sources are `bulk-scan-out`, `bulk-catchup-scan-out` and `ops-backfill-scan-out`. Their `created_at` is backdated to the pack time or the ship-by date, so late-ship and pack→ship numbers are only meaningful for `metadata.source='shipped-scan-out'` (71 rows in 30 days).

The sheet itself is cheap to build. On existing indexes the backing query takes 40 ms for the all-time window. Carrier truth is an operator/infra fix, not a code fix.

---

## ROOTS (ranked, build order)

1. **Carrier truth: restore polling.** This blocks the main signal.
   - **Why:** see the headline. Signals 1 and 2 return 3 and 11 rows, and both counts are polluted by stale data.
   - **Fix (operator/infra):** set `UPS_CLIENT_ID/SECRET` and `FEDEX_CLIENT_ID/SECRET` in the environment that runs the `/api/cron/shipping/sync-due` cron (`vercel.json`). [INFERENCE] that environment is Vercel production. Also unblock USPS access.
   - **Code part (small):** record a successful poll separately from an attempted one. Today `last_checked_at` is written on failure. The sheet needs a "Last poll" based on `consecutive_error_count = 0` or the last `shipment_tracking_events.event_recorded_at`. Also stop treating `source_system='scan'` IN_TRANSIT rows without events as moved.
   - **Migration:** none.
   - **Risk:** none to the sheet; this only makes its signals truthful.
   - **Effort:** S once the credentials exist.

2. **`GET /api/nav/fulfilled`: one set-based, order-grain statement**, mirroring `/api/nav/purchases`.
   - **Why:** today's feed (`fetchPackerLogRows`, `src/lib/neon/packer-logs-week.ts:392`) takes 510–543 ms for every row, spills 548 temp blocks to an external merge sort, and costs 698–962 ms for a 30-day window. The planner mis-estimates the latest SHIP_CONFIRM (443 estimated vs 5,302 actual), which produces a 655× nested loop. The purchases-style path through the locator (`buildOutboundRefsSql`) takes 2.6–2.9 s for all time.
   - **The candidate statement** (`phase1/scout-LoadRoots.md` §2): a `ship_out` DISTINCT ON CTE, plus `order_stage_facts`, plus `stn`, plus a set-based WA deadline. It runs in **18–20 / 25–33 / 40 ms** at 30 days / 90 days / all time, with no spills. The bucket CASE adds 1–3 ms.
   - **Reuse:** it projects `outboundFacts()` column names, so the fact builder is reused unchanged. It runs through `tenantQueryOneTrip`, and the chips are counted from the rows.
   - **Files:**
     - `src/app/api/nav/fulfilled/route.ts`
     - `src/lib/nav/fulfilled/*`
     - additive fields in `NavLocateFacts` (`src/lib/nav/context/schema.ts:528`)
     - an outbound precedence in `src/lib/nav/locate/bucket-precedence.ts`
   - **Migration:** none.
   - **Risk:** `SHIP_OUT_LATERAL` (`src/lib/neon/orders-queries.ts:187`) reads `o.shipment_id` only. Split packages through `shipment_links` (9 orders in 30 days, 90 org-wide) need the union arm, which costs the same.
   - **Effort:** M.

3. **Add the org predicate to the `in_shipped` EXISTS** (`src/lib/nav/locate/outbound.ts:190`).
   - **Why:** `shipment_links WHERE owner_type='ORDER' AND owner_id=o.id` has no org predicate, so it seq-scans once per order: 2,171 ms of the locator's 2.6–2.9 s for all time. Adding `sl_own.organization_id = o.organization_id` brings it to **341–493 ms**, index-only on `ux_shipment_links_owner_shipment` (tested read-only).
   - **Benefit:** `/search/list` today, independent of the sheet.
   - **Migration:** none. M1 below is the alternative if the code change is refused.
   - **Risk:** the file area overlaps uncommitted locate work in `src/lib/nav/locate/service.ts` and `use-bulk-list.ts`.
   - **Effort:** XS.

4. **Facets under RLS.** This root is shared with inbound.
   - **Why:** `GET /api/nav/facets?context=outbound.shipped` takes **6.4–7.7 s per call** and fires 2–3 times per `/fulfilled` load (`ShippedLedger.tsx:207`).
   - **Cause:** the SQL takes 434–493 ms as the owner role but 2,360–2,536 ms as `app_tenant`. Under RLS, the key18 order-match arm drops `idx_stn_norm_key18` and bitmap-scans by org: 11,929 rows removed × 137 loops ≈ 2.2 s. [INFERENCE] the cause is the non-leakproof `regexp_replace` qual. pg_stat mean is 3,992 ms.
   - **Effect of the sheet:** it removes this call from `/fulfilled`, because the chips come from the rows. `incoming.purchases` facets (3.5 s observed) use the same path.
   - **Fix options:** a `SECURITY DEFINER`/leakproof wrapper for the normalizer, or precompute key18 into a column. This needs its own probe before choosing.
   - **Effort:** M.

5. **The sheet host and cutover.**
   - **Build:** `FulfilledSheet` (twin of `PurchasesSheet`), `useFulfilledList` (twin of `usePurchasesList`), and `fulfilled-params.ts` (twin of `purchases-params.ts`).
   - **Sidebar:** a `FULFILLED_CONTROLS` decl in `pages.ts` with date range, axis (Shipped / Delivered / Ordered / Ship-by), Channel, Carrier, Packer, sort and saved views.
   - **Route tree:** add a `/fulfilled` node in `route-tree.ts`; none exists today.
   - **Sheet:** `PastedListSheet` is generic and needs no fork; add outbound branches to `pastedListCellText` and `PASTED_LIST_COLUMNS`. Remove the DELETE LIST.
   - **Effort:** M–L.
   - **Required:** keep the order-details target. `recordDetailsHref` sends shipped orders to `/fulfilled?openOrderId=` (`src/lib/records/record-details.ts:7-9,37`), and today `ShippedLedger.tsx:236-300` resolves that to `?shipment=` → `useShipmentRecordSlot`. That slot is "the exact same details a triage card opens", so it must be rehosted beside the sheet, not deleted.

6. **Cut the waterfall that the cutover leaves behind.**
   - **Why:** today a load makes 231 requests and moves 7.04 MB. LCP is about 2.0 s warm and network idle is 14.3 s.
   - **Where the time goes:** `/api/packerlogs` auto-paginates 100→200→300 and refetches the whole prefix each time (937 KB). On top of that come 3 hydrate posts, `/api/orders-exceptions/unmatched` at 291 KB, and 2.18 MB of card images.
   - **Remaining work after cutover:** a narrow payload (570 kB vs 1,389 kB all-time; −400–700 ms receive) and no serial follow-ups.
   - **Note:** the cold pool connection adds 0.6–0.7 s after 10 s idle (`idleTimeout`, `src/lib/tenancy/db.ts:33`). That is a separate lever, not proposed here.

**Out of scope, but measured:** the pick-logs statement (`desk-pick-logs-query.ts:223`, OR-join on `shipment_links`) has used 6,674 s of DB time since 2026-09-03 (2,870 calls × 2,325 ms mean). It is the top entry in `pg_stat_statements`.

## MIGRATIONS

**None is needed for the sheet at today's size.** The statistics are fresh, so no `ANALYZE` is needed. The SHIP_CONFIRM mis-estimate comes from correlated columns, not from stale stats.

| # | File | Statements | CONCURRENTLY | Before → after | Rollback |
|---|---|---|---|---|---|
| M1 (optional, an alternative to root 3) | `src/lib/migrations/2026-10-05_shipment_links_order_owner.sql` | `-- migrate:no-transaction` then `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shipment_links_order_owner ON shipment_links (owner_id, shipment_id) WHERE owner_type='ORDER';` then `ANALYZE shipment_links;` | yes | Locator all-time 2.6–2.9 s → ~0.34–0.49 s [INFERENCE from the org-predicate analog] | `DROP INDEX CONCURRENTLY IF EXISTS idx_shipment_links_order_owner;` |
| M2 (not recommended) | extended stats | `CREATE STATISTICS IF NOT EXISTS stx_sal_type_staff_ship (mcv) ON activity_type, (staff_id > 0), (shipment_id IS NOT NULL) FROM station_activity_logs; ANALYZE station_activity_logs;` | n/a | Can't be proven read-only; moot once the feed is retired | `DROP STATISTICS IF EXISTS stx_sal_type_staff_ship;` |

**Rejected: a materialized or trigger-maintained per-order "shipment status" row.** `shipping_tracking_numbers` already denormalizes carrier status per package, `order_stage_facts` already holds the pack facts, and computing the bucket costs 1–3 ms.

## STATUS BUCKETS

The precedence is first-match-wins in a `CASE`, so a row gets exactly one bucket. Labels are bare words. Counts are for 30 days / 90 days / all time, and the 30-day total of 445 matches the fulfilled set.

| Prec | id | Label | Predicate | Columns | 30d | 90d | all |
|---|---|---|---|---|---|---|---|
| 1 | `returned` | Returned | `cat='RETURNED'` or a return-to-sender event | stn.latest_status_category, events | 0 | 0 | 6 |
| 2 | `delivered` | Delivered (green) | `delivered_at IS NOT NULL OR cat='DELIVERED'` | stn.delivered_at | 65 | 396 | 1229 |
| 3 | `exception` | Exception | `cat='EXCEPTION' OR has_exception` | stn | 0 | 0 | 0 |
| 4 | `untracked` | Untracked | carrier not polled (`upper(carrier) NOT IN ('UPS','FEDEX')`) and 0 events | stn.carrier, events | **360** | 1121 | 2730 |
| 5 | `no_movement` | No movement | tracked, not moved, scanned out more than N hours ago | first-scan expression, sal | 3 | 3 | 16 |
| 6 | `awaiting` | Awaiting pickup | tracked, not moved, scanned out less than N hours ago | same | 0 | 0 | 0 |
| 7 | `stalled` | Stalled | `latest_event_at < now()-72h`, not delivered (`isStalled`, `src/lib/shipping/shipment-status.ts:35-50`) | stn.latest_event_at | 11 | 14 | 15 |
| 8 | `out_for_delivery` | Out for delivery | `cat='OUT_FOR_DELIVERY'` | stn | 3 | 3 | 3 |
| 9 | `in_transit` | In transit | otherwise (moved) | stn | 3 | 4 | 4 |

- **`untracked` must rank above `no_movement`,** or 360 USPS rows show as "No movement".
- **`no_movement` and `stalled` need annotation while `consecutive_error_count > 0`.** Today that is every tracked undelivered row.
- **Flags overlap rows and are not statuses.** They become filter chips or columns: late ship, channel shipped / not scanned out, multi-package, shared tracking, return linked, backfill scan.

## COLUMNS

**Default 10:**

1. Order (`o.order_id`)
2. Channel (`o.account_source`, casing normalized)
3. Status (bucket)
4. Scanned out (date+time, `SHIP_OUT_LATERAL`)
5. By (`StaffCell` from `shipped_out_by`, id 100 %)
6. Carrier (`stn.carrier`)
7. Tracking (`stn.tracking_number_raw`)
8. Last event (`stn.latest_status_label` + `latest_event_at`; "Not polled" when untracked)
9. Delivered (`stn.delivered_at`)
10. Item (`COALESCE(sc.product_title, o.product_title)`, SKU on hover)

**Optional tier** (30-day population in parentheses):

| Column | Source | 30d |
|---|---|---|
| SKU | | 94.8 % |
| Qty | | |
| Customer | | 97.8 % |
| Order total | `sale_amount` | 97.5 % |
| Ordered | `order_date` | NULL on 85 % of rows; use `COALESCE(order_date, created_at)` |
| Ship-by | WA deadline | 69.7 % |
| Packed + Packer | `osf` | 100 % |
| Scan source | Live / Backfill | |
| First scan | | 18.7 % |
| Days in transit | | |
| Service | | 67.6 % |
| Label created | | 18.7 % |
| Label cost | | 14.4 % |
| ETA | | 0.4 % |
| Attempts | | |
| Exception code | | |
| Last poll + error | | |
| Channel status | `o.status`, warehouse-overwritten | |
| ShipStation status | | 67.6 % |
| Packages | | |
| Return link | | |

Two items from the handoff list can't be columns:

- **Tracking uploaded to channel:** no writer or record exists. ShipStation status is the only proxy.
- **Late delivery:** not computable, because ETA is known on 2 rows.

## DELETE LIST

Full evidence is in `phase1/scout-SurfaceTree.md` §2.

**Delete:**

- `src/components/outbound/workspaces/ShippedWorkspace.tsx`
- `src/components/shipped/ledger/{ShippedLedger,ShippedPackageRow,ShippedPackageCard}.tsx`
- `src/components/shipped/ledger/unmatched-scans.ts`
- `src/components/shipped/ledger/shipped-card-model.ts`, once `src/lib/nav/facets/shipped.ts` and `shipped-filter-sql.ts` stop using it
- `src/components/shipped/dashboard-table/{useShippedTableFilters,useShippedTableRecords,useShippedWeekBuckets}.ts`
- `src/lib/queries/shipped-ledger-seed.server.ts`
- `src/lib/shipping/shipped-feed-config.ts`
- `dashboardShippedQuery` / `dashboardShippedWeekQuery` (`src/lib/queries/dashboard-queries.ts:227,291`)
- `fetchDashboardPackedRecords` / `fetchShippedHydration` (`src/lib/dashboard-table-data.ts:398,479`)
- `src/app/api/packerlogs/hydrate/route.ts`

**Rehost (do not delete):**

- `use-shipment-record-slot.tsx`
- `ResolveShipmentExceptionDialog.tsx`
- whatever parts of `shipped-package-state.ts` the slot needs

These are the shipped order-details target that `/fulfilled?openOrderId=` must keep opening.

**Rewire:**

| File | Change |
|---|---|
| `src/app/fulfilled/page.tsx` | |
| `NAV_PAGE_DECLS.fulfilled` (`pages.ts:643`) | replace `SHIPPED_CONTROLS` / `SHIPPED_VIEWS` |
| `src/lib/nav/context/parity.ts:316-323` | |
| `src/lib/sidebar-navigation.ts:446,1437` | |
| `src/lib/triage/views/card-view-adapters.ts:48,374` | update `triage-views.test.ts` |
| `src/design-system/pinned.json:337,362` | |
| `docs/design-system/consolidation-ledger.json:593` | `operational-identity.currentPaths` |
| `docs/security/route-permissions.json` | |

**Keep:**

- `GET/POST/DELETE /api/packerlogs`: the pack station and `PackRecentPacksRail` use them.
- `/api/orders-exceptions/unmatched`
- the `/shipping/shipped` redirect

## OPEN QUESTIONS (product decisions only)

1. **Polling credentials.** Who sets the UPS/FedEx credentials in the cron environment, and is USPS access being pursued? Without these, the "No movement" chip shows about 3 rows plus a 360-row "Untracked" chip.
2. **Row set.** Should the sheet list **channel shipped, never scanned out** orders: 183 in 30 days, 174 of them shipped through ShipStation outside the dock? Options are as rows in their own bucket, or only as a separate saved view or flag.
3. **Backfilled scan-outs.** 84 % of 30-day rows have backdated stamps. Should "Scanned out" show them as is with a "Backfill" marker, or should late-ship and pack→ship be computed from live scans only?
4. **No-movement threshold.** N hours vs business hours, and whether to use carrier claim windows. UPS is 60 days per the tariff. USPS lost-package is 15–60 days from mailing [INFERENCE]. FedEx is 60 days [INFERENCE].
5. **Grain.** One row per order line (today 445 lines = 445 orders in 30 days) or one per package? Split packages exist on 9 orders in 30 days.
