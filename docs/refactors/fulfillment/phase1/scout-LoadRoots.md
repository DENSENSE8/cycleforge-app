# Fulfilled sheet — §4.D load-time roots (slice LoadRoots)

Measured 2026-10-05 against the `.env` DSN (Neon `ep-shiny-hall…-pooler`, us-east-1, PG 17.11, `work_mem` 4MB), org `…0001` (5,166 orders). Every SQL session ran as `BEGIN TRANSACTION READ ONLY; SELECT set_config('app.current_org', org, true); … ROLLBACK;`, the same GUC `tenantQueryOneTrip` sets (`src/lib/tenancy/db.ts:117`). Nothing was written and no ANALYZE ran. Exec ms = `EXPLAIN (ANALYZE, BUFFERS)` "Execution Time" over 3 warm runs. Plans are saved in `/tmp/fulfilled-scout/plans/*.txt`. The generated SQL captured from the real builders (a throwaway harness outside the repo patched `pool.query` to record statements instead of running them) is in `/tmp/fulfilled-scout/captured.json`.

## 0. Population: what "fulfilled" means here (needed to read the numbers)

| Set (org …0001) | rows |
|---|---|
| Orders whose own `o.shipment_id` has a staffed `SHIP_CONFIRM` (staff_id > 0) | **4,003** (4,004 later the same day, live writes) |
| Same, but counting any SHIP_CONFIRM, staffed or not | 4,003, so the `staff_id > 0` difference has no effect today |
| Scanned out only through an ORDER `shipment_links` row, not their own shipment | 7 |
| Completed packer log (`osf.packed_at`) but no scan-out | 29 |
| Union of scan-out and packer log | 4,032 |
| `orders.status='shipped'` but never scanned out (the channel/warehouse disagreement case) | 1,071 |
| Scanned out but channel status is not `shipped` | 264 |
| Scanned-out packages with no order at all (FBA / SKU / unmatched) | 1,273 of 5,302. These are why today's package-grain feed has 5,667 rows against 4,004 orders |
| Scanned-out orders with NULL `order_date` | **3,404 / 4,004 (85%)**. The Ordered axis needs `COALESCE(o.order_date, o.created_at)` or most rows drop out |

The latest SHIP_CONFIRM was 2026-10-02 until a new one landed during this scout. PACK_COMPLETED runs to 2026-10-05.

## 1. EXPLAIN — the current shipped feed and seed (`fetchPackerLogRows`, `src/lib/neon/packer-logs-week.ts:392`)

| Statement | exec ms | rows | Where the time goes |
|---|---|---|---|
| Seed: spine, top 100, `type='all'` (`shipped-ledger-seed.server.ts:44`) | **49–57** (pg_stat_statements: mean 65.4, max 667 over 907 calls) | 100 | The `page` CTE (packer-logs-week.ts:553) checks population and membership for every candidate row before the LIMIT: 5,302 loops of `idx_station_activity_logs_shipment_id` (26 ms, 43k buffer hits, 2 rows removed by filter per loop) plus 5,304 loops of the `NOT EXISTS pk` subplan (5 ms). |
| Full phase, top 100 | 52–64 | 100 | Same as the seed, plus 2 serial follow-up round trips (photos, then outcomes; packer-logs-week.ts:1070, 1100). |
| 30-day window, spine (`shippedFrom/To`, limit 5000) | **698–962** | 655 | `sqlLatestShipConfirmAt()` (line 206) runs as a correlated subquery in WHERE, twice (lines 318–319): 16,021 loops. The `latest_ship_confirm` CTE is estimated at 443 rows but returns 5,302 (12× too low), so the planner picks a nested loop: 655 × CTE scan of 5,302 rows = **346 ms**. Forcing `enable_nestloop=off` makes it worse (4.6–4.9 s): the per-row laterals then hash-join all orders 656 times. |
| All-time, every row (spine, limit 10000) | **510–543** | 5,667 | Sort **external merge, Disk, 548 temp blocks (~4.3 MB)** with work_mem 4MB. Per-row laterals: `package_lines` aggregate 5,667 loops (67 ms); the order-match fallback scans the whole org's orders 18 times (31 ms). With `SET LOCAL work_mem='16MB'` the spill goes away but it still takes 481–484 ms. |
| pg_stat_statements, other feed variants since 2026-09-03 | — | — | 91 calls at mean 2,123 ms; 14 at 2,314 ms; 11 at 2,366 ms; 18 at 1,669 ms (`stn_f` / filtered variants). |

Endpoint measured at :3050 (`/api/packerlogs?shippedFilter=all&phase=spine`, admin cookie):
- 100 rows: TTFB 194–602 ms, 188 KB, served from Redis after the first call.
- Cache-busted 101–199 rows: 330–850 ms, 228–370 KB.
- **Every row** (limit 1000–9000, cache-busted): **TTFB 2.9–4.5 s, 3.6–10.1 MB**. That is the price of building the sheet on top of today's feed.

N+1 and round trips in the feed path:
- `pool.query` sends one parameterised statement per round trip.
- Full phase adds photos and outcomes as **2 serial round trips** (packer-logs-week.ts:1070, 1100).
- On a cache miss, an Upstash GET runs before the DB call (line 444).
- An `after()` enrichment-heal query runs after the response (line 1134).

## 2. Candidate sheet SQL (set-based, order grain) and before-ms per window

Shape (`/tmp/fulfilled-scout/candidate_with_bucket.sql`):

```sql
WITH ship_out AS MATERIALIZED (            -- latest staffed dock scan-out per package, once
  SELECT DISTINCT ON (so.shipment_id) so.shipment_id, so.created_at AS ship_confirmed_at, so.staff_id AS shipped_out_by
    FROM station_activity_logs so
   WHERE so.organization_id = $1 AND so.activity_type = 'SHIP_CONFIRM'
     AND so.shipment_id IS NOT NULL AND so.staff_id > 0
   ORDER BY so.shipment_id, so.created_at DESC, so.id DESC
), wa_deadline_all AS MATERIALIZED (       -- WA_DEADLINE_LATERAL's ranking, set-based
  SELECT DISTINCT ON (wa.entity_id) wa.entity_id, wa.deadline_at
    FROM work_assignments wa
   WHERE wa.organization_id = $1 AND wa.entity_type = 'ORDER' AND wa.work_type = 'TEST'
   ORDER BY wa.entity_id,
            CASE wa.status WHEN 'IN_PROGRESS' THEN 1 WHEN 'ASSIGNED' THEN 2 WHEN 'OPEN' THEN 3 WHEN 'DONE' THEN 4 ELSE 5 END,
            wa.updated_at DESC, wa.id DESC
)
SELECT o.id, o.order_id, o.account_source, o.status, o.order_date, o.quantity, o.sale_amount, o.currency,
       COALESCE(cust.display_name, cust.customer_name) AS customer,
       COALESCE(sc.product_title, o.product_title) AS fact_title, COALESCE(sc.sku, o.sku) AS sku,
       to_char(wa_deadline.deadline_at, 'YYYY-MM-DD') AS ship_by_date, wa_deadline.deadline_at,
       COALESCE(osf.packed_at, osf.pack_activity_at) AS packed_at,
       COALESCE(osf.packed_by, osf.packer_id) AS packer_id, staff_packer.name AS packer_name,
       COALESCE(ship_out.ship_confirmed_at, osf.packed_at) AS shipped_at,
       ship_out.shipped_out_by, shipped_out_staff.name AS shipped_out_by_name,
       stn.tracking_number_raw AS tracking_number, stn.carrier, stn.latest_status_category, stn.latest_status_label,
       stn.latest_event_at, stn.label_created_at, stn.carrier_accepted_at, stn.first_in_transit_at,
       stn.out_for_delivery_at, stn.delivered_at, stn.estimated_delivery_at, stn.has_exception,
       stn.exception_at, stn.is_terminal, stn.last_checked_at,
       CASE WHEN stn.id IS NULL THEN 'unknown'
            WHEN UPPER(COALESCE(stn.latest_status_category,'')) = 'RETURNED' THEN 'returned'
            WHEN stn.has_exception OR UPPER(COALESCE(stn.latest_status_category,'')) = 'EXCEPTION' THEN 'exception'
            WHEN stn.is_delivered OR stn.delivered_at IS NOT NULL OR UPPER(COALESCE(stn.latest_status_category,'')) = 'DELIVERED' THEN 'delivered'
            WHEN stn.carrier_accepted_at IS NULL AND stn.first_in_transit_at IS NULL
                 AND UPPER(COALESCE(stn.latest_status_category,'')) IN ('', 'LABEL_CREATED', 'UNKNOWN')
                 AND COALESCE(ship_out.ship_confirmed_at, osf.packed_at) < now() - interval '24 hours' THEN 'no_movement'
            WHEN stn.latest_event_at < now() - interval '5 days' THEN 'stuck'
            WHEN UPPER(COALESCE(stn.latest_status_category,'')) = 'OUT_FOR_DELIVERY' THEN 'out_for_delivery'
            WHEN UPPER(COALESCE(stn.latest_status_category,'')) IN ('ACCEPTED','IN_TRANSIT') THEN 'in_transit'
            ELSE 'label_only' END AS bucket
  FROM ship_out
  JOIN orders o ON o.organization_id = $1 AND o.shipment_id = ship_out.shipment_id
  LEFT JOIN order_stage_facts osf ON osf.organization_id = o.organization_id AND osf.order_id = o.id   -- ORDER_STAGE_FACTS_JOIN
  LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
  LEFT JOIN sku_catalog sc ON sc.id = o.sku_catalog_id
  LEFT JOIN customers cust ON cust.id = o.customer_id AND cust.organization_id = o.organization_id
  LEFT JOIN wa_deadline_all wa_deadline ON wa_deadline.entity_id = o.id
  LEFT JOIN staff staff_packer ON staff_packer.id = COALESCE(osf.packed_by, osf.packer_id) AND staff_packer.organization_id = o.organization_id
  LEFT JOIN staff shipped_out_staff ON shipped_out_staff.id = ship_out.shipped_out_by
 WHERE o.organization_id = $1
   AND <axis_expr> >= $2::timestamptz AND <axis_expr> < $3::timestamptz
 ORDER BY COALESCE(ship_out.ship_confirmed_at, osf.packed_at) DESC NULLS LAST, o.id DESC
```

- `axis_expr` by axis:
  - shipped: `COALESCE(ship_out.ship_confirmed_at, osf.packed_at)` (outbound.ts:259)
  - delivered: `stn.delivered_at`
  - ordered: `o.order_date` (needs a `created_at` fallback, see §0)
  - ship-by: `wa_deadline.deadline_at`
- Union variant (scan-out or packer log): `FROM orders o LEFT JOIN ship_out ON ship_out.shipment_id = o.shipment_id … AND (ship_out.shipment_id IS NOT NULL OR osf.packed_at IS NOT NULL)`.
- The projected column names are exactly the ones `outboundFacts(row)` reads (outbound.ts:285–309): `fact_title, sku, tracking_number, delivered_at, status, ship_by_date, packed_at, packer_id, packer_name, shipped_at`. The fact builder can be reused unchanged; the statement only adds columns.
- Shipped-window pushdown variant (30d): replace `ship_out` with a window-filtered scan plus `NOT EXISTS` for a newer scan-out on the same package. It uses the existing `idx_sal_org_ship_confirm_shipment_created` (Merge Anti Join of two index-only scans) and WA as `WA_DEADLINE_LATERAL`.

### Exec ms (warm, 3 runs) — before any migration

| Variant | 30d | 90d | all-time |
|---|---|---|---|
| **shipped axis, scan-out, set WA** | **18.3–19.8** (445 rows) | **25.4–33.3** (1,561) | **40.1–40.6** (4,004) |
| shipped, scan-out, `WA_DEADLINE_LATERAL` (fragment as-is) | 16.6–17.2 | — | 58.3–59.6 (4,004 WA probes: 12 ms) |
| shipped, all three fragments as-is (`SHIP_OUT_LATERAL` per row too) | 39.1–46.6 | — | 81.4–88.1 (4,828 SAL probes plus 4,004 WA probes) |
| shipped, union with packer-log-only | 18.7–19.1 | 25.1–28.8 | 37.0–42.6 (4,033) |
| shipped, **pushdown** + WA lateral | **9.4–9.7** | 25.8–28.0 | n/a (same as set) |
| delivered axis | 12.5–13.7 (86) | 24.8–26.2 (436) | 28.6–35.9 (1,232) |
| delivered axis, sorted by delivered desc | 13.0–23.6 | — | 29.4–67.4 |
| ordered axis (raw `order_date`) | 12.3–25.0 (225) | 12.9–13.4 (320) | 16.6–17.9 (only 600; NULLs drop out) |
| ship-by axis | 12.8–13.1 (314) | 22.3–43.9 (1,060) | 47.5–53.6 (3,300) |
| + status-bucket CASE (all-time) | — | — | 41.1–43.7 (**+1–3 ms**) |
| chip counts `GROUP BY bucket` (all-time) | — | — | 28.3–29.3 |

- Seq scans in the candidate are all on small tables, each ≤ 2 ms:
  - `orders` 5,166 rows, 209 removed by the org filter (1.5 ms)
  - `order_stage_facts` 5,166 / 209 (0.5–1.5 ms)
  - `work_assignments` 5,192 rows, 5,169 removed as non-TEST (1.9 ms)
  - `customers` 1,517 (0.5 ms)
  - `staff` 41
  - On the delivered axis at 30d: `shipping_tracking_numbers`, 12,184 removed (2–10 ms)
- No sort spill: quicksort, ≤ 370 kB.
- No lateral loops in the set variant.

### The purchases-twin route through the locator (`buildOutboundRefsSql`, outbound.ts:151) — measured and rejected

Enumerating the fulfilled order numbers and then running `locateOutboundRefs` over them, as the purchases service does (service.ts:21–23):

| refs | exec ms | Cause |
|---|---|---|
| 445 (30d) | **324–368** | `in_shipped` EXISTS (outbound.ts:185–191): `shipment_links sl_own WHERE owner_type='ORDER' AND owner_id = o.id` has **no organization_id predicate**, so it cannot use `ux_shipment_links_owner_shipment (organization_id, owner_type, owner_id, shipment_id)`. Result: **Seq Scan on shipment_links per order**, 445 loops × 6,536 rows removed = 278 ms. |
| 1,545 (90d) | **1,011–1,103** | Same seq scan × 1,545 = 888 ms |
| 4,006 (all) | **2,629–2,856** | Same seq scan × 4,006 = **2,171 ms**, 653k buffer hits |
| 445, with `sl_own.organization_id = o.organization_id` added | **74–76** (one outlier at 129) | Index Only Scan on `ux_shipment_links_owner_shipment` |
| 1,545, same fix | **168–179** | |
| 4,006, same fix | **341–493** | Index-only, 4,006 loops = 16 ms. The rest is 5 hash-joined seq scans of STN for the tracking arms, the queue-scope columns, and the candidate-key unions. |

Even with the fix, the locator route is 8–9× the direct statement at all-time (340–490 ms vs 40 ms). It also recomputes 4 queue-bucket predicates per row that the sheet does not need. The same org-less probe slows `/search/list` bulk paste today: pg_stat_statements shows 101 calls at 115 ms, 82 at 136 ms, 61 at 91 ms.

## 3. Round trips, connection and payload (non-SQL roots)

- **RTT** to the Neon pooler from this workstation (where the lane runs): `SELECT 1` takes **75–91 ms** (6 samples).
  - `tenantQuery` = BEGIN+GUC, statement, COMMIT = 3 RTT ≈ 225–270 ms.
  - `tenantQueryOneTrip` = 1 RTT ≈ 75–90 ms (db.ts:78–95).
  - `tenantQueriesOneTrip` (db.ts:105) carries rows plus any extra statements in that same single RTT.
  - Because the sheet loads every row, unpaged, chip counts and facets can be counted in TS from the rows (as purchases does): 0 extra statements.
- **Cold connection**: a fresh psql connect + query takes **618–703 ms** vs 75–91 ms warm. The pool closes idle connections after `idleTimeoutMillis` = **10 s** (db.ts:33).
  - At :3050, the first cache-busted feed call after 16 s idle took 0.57–1.02 s vs 0.33–0.52 s warm (2 samples; noisy).
  - [INFERENCE] The Neon WebSocket handshake costs about the same as the psql TCP+TLS connect.
- **Wire payload** (all-time, 4,004 rows), measured as `sum(octet_length(row::text))` ≈ pg text wire:
  - Full candidate: 1,389 kB, received in a median of **538–1,102 ms** (2 sets of 6 runs; the link was jittery).
  - Narrow 14-column variant: 570 kB, median **146–376 ms**.
  - 30d: 149 kB, median 113–129 ms.
  - As `row_to_json` (closer to the HTTP JSON): 418 kB at 30d, 1.5 MB at 90d, 3.8 MB all-time; today's feed at every row is 9.9 MB.
  - Reference: `/api/nav/purchases` (90d) at :3050 measured 1.66–2.15 s for 616 KB.

## 4. Index audit (pg_indexes, pg_stat_user_indexes, pg_stat_user_tables)

Full index list with idx_scan and size: `/tmp/idx_audit.txt` (147 indexes on the 12 touched tables). The indexes that matter here:

- `station_activity_logs` (46,365 live rows, 16 MB heap / 14 MB indexes; **seq_tup_read 22.9 billion** since the last stats reset):
  - `idx_sal_org_ship_confirm_shipment_created (organization_id, shipment_id, created_at DESC, id DESC) INCLUDE (staff_id) WHERE SHIP_CONFIRM AND shipment_id NOT NULL AND staff_id>0` — 7.9M scans. It serves `ship_out`, the pushdown, and the `so_newer` anti-join. The feed's membership EXISTS still probes `idx_station_activity_logs_shipment_id` (293M scans) plus a filter.
  - Also used: `idx_sal_org_station_activity_created` (482k scans), `idx_sal_org_created`.
  - `idx_sal_created_at_brin`: 11 scans.
- `shipment_links` (6,537 rows):
  - Existing indexes: `ux_shipment_links_owner_shipment` (org, owner_type, owner_id, shipment_id), 11.4M scans; `ux_shipment_links_owner_primary`; `idx_shipment_links_shipment`; `idx_shipment_links_org_shipment`.
  - **No index leads with owner_id without organization_id.** seq_scan 6.7M, seq_tup_read **36.2 billion**.
- `shipping_tracking_numbers` (12,733 rows, global table with no org scope):
  - pkey 824M scans.
  - Key18 / last8 / raw-lower expression indexes are present.
  - No `delivered_at` or `latest_event_at` index; not needed at 12.7k rows (seq scan 2 ms).
- `orders` (5,375): `idx_orders_shipment_id` (1.03B scans), `ux_orders_org_id`, plus the 4 `2026-10-04` key indexes, all valid. Unused: `idx_orders_product_title_trgm` 0 scans (1.9 MB), `idx_orders_sku_trgm` 0, `idx_orders_order_date` 1 scan.
- `work_assignments` (10,361): `idx_wa_org_entity (organization_id, entity_id)`, 85M scans. It serves `WA_DEADLINE_LATERAL`, with 1 row removed by filter per probe.
- `order_stage_facts` (5,375): only the pkey `(organization_id, order_id)`.

Stats freshness (`n_mod_since_analyze / n_live_tup`, last autoanalyze):

| Table | Modified since analyze | Last autoanalyze |
|---|---|---|
| station_activity_logs | 794 / 46,365 (1.7%) | 2026-10-01 |
| shipping_tracking_numbers | 67 / 12,733 | 2026-10-05 (manual analyze 2026-10-04) |
| orders | 223 / 5,375 | manual analyze 2026-10-04 |
| work_assignments | 1,042 / 10,361 (10%) | 2026-09-29 |
| shipment_links | 2 / 6,537 | — |
| order_stage_facts | 275 / 5,375 | — |
| packer_logs | 251 / 6,387 | — |

**No ANALYZE is needed** for staleness. The 5.6–12× SHIP_CONFIRM under-estimate is a correlation problem, not stale stats:
- Plain estimate: 947 rows; inside the CTE: 443; actual: 5,304.
- Cause: the selectivities of `activity_type`, `staff_id > 0` and `shipment_id NOT NULL` are multiplied as if independent.
- `pg_statistic_ext` is empty.

## 5. Proposed migrations

At today's size the candidate needs **no migration**: 18 / 25 / 40 ms exec at 30d / 90d / all-time on existing indexes (the pushdown runs 9.5 ms at 30d on `idx_sal_org_ship_confirm_shipment_created`). The biggest measured DB root, the org-less `shipment_links` probe, is fixed by one predicate in code (outbound.ts:190), shown above read-only: 2,629–2,856 → 341–493 ms. The migrations below are offered for the operator to choose.

### M1 (optional; use it only if the outbound.ts:190 code fix is not taken) — `src/lib/migrations/2026-10-05_shipment_links_order_owner.sql`

```sql
-- migrate:no-transaction
-- 2026-10-05_shipment_links_order_owner.sql
-- WHAT  shipment_links (owner_id, shipment_id) WHERE owner_type = 'ORDER' — serves
--       ORDER-owner probes that carry no organization_id predicate
--       (outbound.ts buildOutboundRefsSql in_shipped `sl_own.owner_type = 'ORDER' AND sl_own.owner_id = o.id`;
--        also packer-log-enrichment.ts:225, orders-tracking-queries.ts:312/442, shipment-record.ts:270,
--        milestones-db.ts:51/73), which today seq-scan shipment_links once per order.
-- WHY   buildOutboundRefsSql over 4,006 refs: 2,171 ms of Seq Scan on shipment_links (4,006 loops × 6,536 rows).
-- SAFETY CREATE INDEX CONCURRENTLY IF NOT EXISTS; no data touched. Global (org-less) by design:
--       the probing statements filter org on `o`.
-- ROLLBACK DROP INDEX CONCURRENTLY IF EXISTS idx_shipment_links_order_owner;
-- VERIFY EXPLAIN the outbound refs statement: no Seq Scan on shipment_links sl_own.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shipment_links_order_owner
  ON shipment_links (owner_id, shipment_id) WHERE owner_type = 'ORDER';
```

- Plain columns, so no expression to copy. The partial predicate `owner_type = 'ORDER'` matches the probe's equality literally.
- ANALYZE afterwards: `ANALYZE shipment_links;`, per handoff §6. Not needed for the stats themselves; it keeps the routine.
- Expected after (evidence by analogy, since hypothetical indexes are not available read-only: hypopg is absent and CREATE INDEX is blocked in a read-only transaction): the same probe shape on `ux_shipment_links_owner_shipment` with the org predicate costs **16 ms / 4,006 loops**. So 4,006 refs: 2,629–2,856 → ~341–493 ms; 1,545: 1,011–1,103 → ~168–179; 445: 324–368 → ~74–76.
- Recommendation: **prefer the code fix**. Adding `sl_own.organization_id = o.organization_id` (and the same in the other org-less probes) gives the identical plan with no new index, and it is the tenant-correct predicate.

### M2 (not recommended now) — extended statistics for SHIP_CONFIRM correlation

- Example: `CREATE STATISTICS IF NOT EXISTS stx_sal_type_staff_ship (mcv) ON activity_type, (staff_id > 0), (shipment_id IS NOT NULL) FROM station_activity_logs;` followed by `ANALYZE station_activity_logs;`.
- Rollback: `DROP STATISTICS IF EXISTS stx_sal_type_staff_ship;`.
- It would target the 12× CTE misestimate that drives the feed's 30d nested loop (346 ms of 698–962).
- It **cannot be proven read-only** (CREATE STATISTICS and ANALYZE are writes) — [INFERENCE] about its effect.
- It only matters while `fetchPackerLogRows` windows survive. The candidate is not affected: it picks a hash join regardless.

### Rejected: trigger-maintained / materialized per-order "shipment status" row

- Carrier status is **already denormalized per package** in `shipping_tracking_numbers`: `latest_status_category`, `carrier_accepted_at`, `first_in_transit_at`, `out_for_delivery_at`, `delivered_at`, `is_delivered`, `has_exception`, `exception_at`, `latest_event_at`, `estimated_delivery_at`, `last_checked_at`, `label_created_at`, `is_terminal`, `tracking_blocked_reason`.
- Pack and stage facts are already materialized in `order_stage_facts` (order-stage-facts.ts:1–22).
- Computing the bucket per request costs **+1–3 ms at all-time** (40.1–40.6 → 41.1–43.7 ms); chip counts take 28–29 ms in SQL, or 0 extra if counted from the rows.
- The real status root is **upstream freshness, not compute**. Of 4,004 scanned-out orders' packages:
  - **1,643 never polled** (`last_checked_at IS NULL`)
  - 1,773 have NULL `latest_status_category`
  - 38 polled in the last 24 h; 367 in the last 7 days
  - 297 have `tracking_blocked_reason`
  - The latest poll was 2026-10-05 15:45.
- A naive "no movement" chip therefore counts 1,853 all-time (363 of 445 at 30d), mostly packages that were never polled. The predicate must separate "polled, no acceptance" from "never polled" (input for §4.C).

## 6. Load roots ranked by measured ms saved (all-time = the sheet's default "all rows")

1. **Back the sheet with one set-based order-grain statement**, not today's package feed and not the locator.
   - DB: feed every-row 510–543 ms → **40 ms**; locator route 2,629–2,856 ms → **40 ms**.
   - Endpoint: feed every-row 2.9–4.5 s / 3.6–10.1 MB measured → est. RTT + exec + transfer (see #3).
   - Saves ~470–2,800 ms. No migration.
2. **Org predicate on the `in_shipped` shipment_links probe** (outbound.ts:190), a code fix.
   - Locate refs: 2,629–2,856 → 341–493 ms (−2.3 s); 1,011–1,103 → 168–179; 324–368 → 74–76.
   - Helps `/search/list` today. Overlaps uncommitted `src/lib/nav/locate/service.ts`, `use-bulk-list.ts`. Migration M1 only as the alternative.
3. **Narrow the wire / JSON payload**: all-time 1,389 kB → 570 kB wire; median 538–1,102 → 146–376 ms (−~400–700 ms, noisy link). Defer columns the default 10 do not paint.
4. **One round trip**: `tenantQueryOneTrip` / `tenantQueriesOneTrip` instead of `tenantQuery` saves 2 RTT ≈ **150–180 ms**.
   - No serial follow-ups: today's full phase runs photos and outcomes after the main query, ≈ 2 RTT = 150–180 ms.
   - Chips and facets counted from rows: 0 RTT.
5. **Cold connection**: 618–703 ms fresh vs 75–91 warm. Pool `idleTimeoutMillis` 10 s (db.ts:33). Lane after idle: +~0.2–0.5 s (2 samples). Config, not a migration; shared by every route.
6. Shipped-window pushdown: 30d 18.3–19.8 → 9.4–9.7 ms (−9 ms), existing index.
7. WA set-based CTE instead of `WA_DEADLINE_LATERAL` at all-time: 58–60 → 40 ms (−19 ms). At 30d the lateral is equal or better (17 vs 18 ms), so choose by window or keep set-based.
8. M2 extended statistics: only relevant to the feed's 30d window (−≤346 ms, unproven); moot once the feed is retired.

### Overlaps / notes
- `fetchPackerLogRows` also backs the facets (`src/lib/nav/facets/shipped.ts`), `buildOutboundTextCountSql`, and the locator's Shipped bucket (outbound.ts:117, 179).
- `SHIP_OUT_LATERAL` (orders-queries.ts:187) takes MAX over **any** SHIP_CONFIRM, while the feed and the candidate require `staff_id > 0`. No live difference today (4,003 = 4,003).
- Side observation, outside this slice: the pick-logs statement (`desk-pick-logs-query.ts:223`, `LEFT JOIN shipment_links osl ON osl.owner_id = o.id … OR o.shipment_id = …`) leads pg_stat_statements: 2,870 calls × 2,325 ms mean = 6,674 s total since 2026-09-03. Its OR-join pattern is not fixed by M1.
