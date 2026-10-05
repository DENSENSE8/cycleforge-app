# §4.A.2 — `/fulfilled` first-load data path + waterfall (slice: Waterfall)

Measured 2026-10-05 against `http://localhost:3050` (dev server, `cycleforge-lane@prod`; other clients were hitting the lane concurrently — journal shows `/api/auth/qr/status` 429 storms, `/m/stock`, other facets — so absolute numbers include contention). Org = dogfood `00000000-…0001` (5,302 packages in the facet total).

## 1. Code path

### Server (RSC) — one SQL round trip on the request path
- `src/app/fulfilled/page.tsx:17-22` — reads `?shippedFilter` / cookie `cf_shipped_filter`, `await seedShippedLedger(filter)` (blocks the document), wraps `ShippedWorkspace` in `HydrationBoundary`.
- `src/lib/queries/shipped-ledger-seed.server.ts:26` `getCurrentUser()` (session), then `:44` `fetchPackerLogRows({ limit: 100 (SHIPPED_FEED_PAGE_SIZE, shipped-feed-config.ts:4), shippedFilters: type=all, spineOnly: true })`.
- `src/lib/neon/packer-logs-week.ts`:
  - `:444` Upstash `getCachedJson('api:packing-logs-v17', org, key)` — on hit returns with **no SQL** (TTL 120 s when window is open, `:441`).
  - `:1040-1043` **one** statement via `pool.query` (owner pool, `src/lib/db.ts` default export, `neondb_owner` = BYPASSRLS) wrapped in `queryWithRetry(retries 3, 1 s)`. **Not** `tenantQuery`/`tenantQueryOneTrip` → 1 RTT, no RLS. Statement = `enrichedQuery` (`:903-1034`): CTE `latest_ship_confirm` (MATERIALIZED, all SHIP_CONFIRM rows of the org) → `page` CTE (ORDER BY `COALESCE(ship_confirmed_at, sal.created_at) DESC, sal.id DESC LIMIT 100`) → per-row laterals: `order_match_fallback`, `PACKAGE_OWNER_LATERAL`, `package_lines` (orders ∪ shipment_links + sku_catalog + catalog_external_ids), `test_data` (tech_serial_numbers). Spine skips `wa_deadline` (`:892-901`).
  - `:1068` photos + verification-outcome queries **skipped** on spine.
  - `:1123` `after()` cache write; `:1127-1150` `after()` heal query (SELECT missing `packer_log_enrichment`, then `computePackerLogEnrichment`) — off the TTFB path.
- Sequential: session → (cache GET) → 1 SQL. No parallel arms.

### Client after hydration (`ShippedLedger.tsx`, `useShippedTableRecords.ts`)
| Fetch | Source | Trigger / cadence |
|---|---|---|
| `GET /api/packerlogs?limit=N&shippedFilter=all&phase=spine` | `useShippedTableRecords.ts:121-139` (`dashboardShippedQuery`, `dashboard-queries.ts:227`, staleTime 5 min) | seeded at N=100; **auto-pagination** `:200-203` bumps `pageMultiplier` while `data.length >= limit` up to `autoCap=3` (`:62`) → refetches **limit=200 then limit=300**, each re-downloading the whole prefix |
| `POST /api/packerlogs/hydrate` | `:176-181` `fetchShippedHydration(salIds)` key = sorted sal ids | once per page size (100, 200, 300 ids) → 3 calls |
| `GET /api/orders-exceptions/unmatched` | `ShippedLedger.tsx:129-133`, `unmatched-scans.ts:14`, staleTime 60 s (`:77`) | once; **290 KB** |
| `GET /api/nav/facets?context=outbound.shipped` | `ShippedLedger.tsx:207-213`, staleTime 60 s (`:76`) — sidebar total "of N" | fires, aborted, re-fires (search-key change on mount) |
| Ably `activity.logged` on station channel | `ShippedLedger.tsx:112-125` | realtime; SHIP_CONFIRM invalidates `['dashboard-table','shipped']` + facets |
| `GET /api/realtime/token` + Ably `requestToken` + WSS | Ably provider | once |
| `POST /api/v1/print-stations` | `src/hooks/usePrintStations.ts:165` `refetchInterval: STAFF_PRINT_STATUS_POLL_MS = 15_000` (`src/lib/print/staff-print-bridge.ts:593`) | **poll every 15 s** (app chrome, not the page) |
| Shell: `/api/nav/context?path=/fulfilled` (aborted+refetch), `/api/inbox?filter=unread` (30 KB, 0.9–1.8 s), `/api/sync/global`, `/api/station-commands/aliases`, `/api/catalog/platforms`, `/api/catalog/platform-accounts`, `/api/staff?active=false`, `/api/saved-views?surface=dashboard_shipped` ×2 (duplicate), `/api/settings?page=desk` | global chrome / sidebar | once |

## 2. Measurements

### (a) Document via curl (cookie from `tests/.auth/admin.json`)
| run | TTFB s | total s | bytes |
|---|---|---|---|
| cold (first) | 4.06 | 5.67 | 1,299,164 |
| warm 1–5 | 1.00 / 1.34 / 2.67 / 1.94 / 1.28 | 1.65 / 1.35 / 2.67 / 1.94 / 1.28 | ~1,299,000 |
Warm median TTFB **1.34 s**; seed SQL is ~65 ms (below) → TTFB is dominated by RSC render / dev compile + a **1.3 MB HTML** (87 KB gzipped on the wire; flight payload 340 KB; 100 rows × `package_lines`/`status_history` dehydrated).

### (b) Browser (Playwright headless, storageState, CDP Network)
| | run 1 (colder) | run 2 (warm) |
|---|---|---|
| doc TTFB | 2,463 ms | 1,264 ms |
| FCP | 2,900 | 1,528 |
| LCP (seeded rows/cards painted) | 3,268 | 1,992 |
| DOMContentLoaded | 2,993 | 1,565 |
| load | 4,404 | 2,388 |
| network idle | 23,374 | 14,302 |
| requests (incl. 30 s idle) | 236 | 231 |
| bytes (encoded) | 7.18 MB | 7.04 MB |
| of which `_next/static` | 69 req / 3.44 MB | 68 / 3.38 MB |
| of which product images (amazon/ebay/cloudfront/shopify) | 133 / 2.20 MB | 131 / 2.18 MB |

Rows are painted from the server seed at LCP (no client fetch needed for the first 100).

Waterfall, run 2 (warm), non-static/non-image (ms from navigation start):
| start | dur | bytes | request |
|---|---|---|---|
| 0 | 1,408 | 87,022 | GET /fulfilled (document) |
| 2,476 | 195 | 0 | GET /api/nav/context?path=/fulfilled — ABORTED |
| 2,481 | 1,848 | 29,833 | GET /api/inbox?filter=unread |
| 2,486 | 486 | 1,872 | GET /api/sync/global |
| 2,489 | 1,098 | 744 | GET /api/station-commands/aliases |
| 2,507 | 460 | 3,903 | GET /api/nav/context?path=/fulfilled |
| 2,772 | 806 | 4,452 | GET /api/catalog/platforms |
| 2,903 | 787 | 835 | POST /api/v1/print-stations |
| 2,920 | 171 | 6,540 | GET /api/staff?active=false |
| 2,985 | 702 | 747 | GET /api/saved-views?surface=dashboard_shipped |
| 2,987 | 1,552 | 747 | GET /api/saved-views?surface=dashboard_shipped (dup) |
| 3,060 | 59 | 0 | GET /api/nav/facets?context=outbound.shipped — ABORTED |
| 3,067 | **7,528** | 2,993 | GET /api/nav/facets?context=outbound.shipped |
| 3,143 | 1,292 | 2,445 | GET /api/realtime/token |
| 4,442 | 346 | 2,269 | POST ably requestToken (+ OPTIONS, WSS) |
| 5,065 | 470 | 3,969 | GET /api/catalog/platform-accounts |
| 5,095 | 648 | 12,100 | POST /api/packerlogs/hydrate (100 ids) |
| 5,098 | 1,269 | 0 | GET /api/orders-exceptions/unmatched — ABORTED |
| 5,101 | 1,266 | 0 | GET /api/nav/facets — ABORTED |
| 5,104 | 322 | 2,466 | GET /api/settings?page=desk |
| 5,520 | 1,585 | **290,632** | GET /api/orders-exceptions/unmatched |
| 5,523 | **7,666** | 2,993 | GET /api/nav/facets?context=outbound.shipped (3rd issue) |
| 8,448 | 485 | **376,188** | GET /api/packerlogs?limit=200&phase=spine |
| 9,962 | 408 | 22,862 | POST /api/packerlogs/hydrate (200 ids) |
| 11,238 | 916 | **560,907** | GET /api/packerlogs?limit=300&phase=spine |
| 14,952 | 396 | 33,352 | POST /api/packerlogs/hydrate (300 ids) |
| 18,286 / 32,905 | 353 / 3,472 | 835 | POST /api/v1/print-stations (poll) |
Run 1 identical shape (facets 6,413 + 7,467 ms; packerlogs 200/300 at 10.8 s / 14.1 s; plus a `GET /fulfilled?_rsc=…` 49 KB at 51.3 s [INFERENCE: router refresh, source not traced]).

Feed bytes after first paint: 376 + 561 KB packerlogs + 68 KB hydrate + 291 KB unmatched ≈ **1.3 MB JSON** to show 300 rows that the operator mostly does not scroll to.

### Polling over 30 s idle
Only `POST /api/v1/print-stations` every ~15 s (14.6 s, 15.0 s gaps observed; `usePrintStations.ts:165`). No feed/facets polling; feed refresh is Ably-driven. Ably WSS open (`wss://main.realtime.ably.net`) + Next HMR socket (dev).

## 3. Per-SQL (read-only, EXPLAIN (ANALYZE, BUFFERS)); exact SQL captured from the real builders (`fetchPackerLogRows`, `buildShippedFacetSql`) with the driver stubbed
| statement | role | exec ms (2 runs) | plan headline |
|---|---|---|---|
| seed/feed limit=100 spine (enriched) | owner (as app: `pool`) | 64.7 / 66.9 (+6–7 ms plan) | no seq scans; quicksorts 25 kB; per-row laterals loops=100, all index |
| same, tenant role `app_tenant` + `app.current_org` | — | 79.4 | same shape |
| feed limit=300 | owner | 79.6 / 76.2 | loops=300, index only |
| facets `outbound.shipped` (no params) | owner | 434 / 493 | GroupAggregate over 5,303 packages; 8 `so_at_*` SHIP_CONFIRM index-only probes × 3,626 loops; key18 match uses `idx_stn_norm_key18` (0.006 ms/loop) |
| facets, **as `app_tenant` (what `tenantQuery` runs)** | RLS | **2,536 / 2,360** | `order_match` key18 arm: `Bitmap Heap Scan on shipping_tracking_numbers ord_stn` via `idx_shipping_tracking_numbers_organization`, **Rows Removed by Filter 11,929 × 137 loops ≈ 2.2 s** — under RLS the planner no longer uses the key18 expression index [INFERENCE: non-leakproof `regexp_replace` qual cannot go below the RLS security qual]; 318k shared hits |

pg_stat_statements (since 2026-09-03): facets queryid 1825470893170601182 mean **3,992 ms** (9 calls, sd 1,787); default feed statements (queryids 7228794045117985780 / -6478832489935257283) mean **100 / 86 ms**, rows/call ≈250 (confirms the 100→200→300 auto-pagination in production use).

Facets path: `src/lib/nav/facets/service.ts:48` → `tenantQuery` (`src/lib/tenancy/db.ts`: `BEGIN; set_config` / query / `COMMIT` = **3 RTT**), `shipped.ts:182-205`, retried as legacy on 42P01.

## 4. Server log (journal, read-only)
`GET /api/nav/facets?context=outbound.shipped 200 in 7.5s (application-code: 7.4s)`; `POST /api/packerlogs/hydrate 200 in 400ms`; `GET /api/inbox?filter=unread 913–1583 ms`. No `/fulfilled` document line appeared in the window [journal shows only a subset of requests]. Concurrent lane traffic: `/api/nav/facets?context=incoming.purchases` 3.5 s, `incoming.docked` 2.5 s, `/m/stock` 1–1.7 s.

## 5. Biggest time sinks (ranked)
1. **`/api/nav/facets?context=outbound.shipped` — 6.4–7.7 s per call, issued 2–3× per load** (two aborted client-side, server still runs). SQL 2.4–2.5 s under RLS vs 0.43 s as owner: the key18 order-match lateral loses its expression index under the tenant role (2.2 s of the 2.5 s). Plus 3 RTT `tenantQuery`. Gates the "of N" total.
2. **Auto-pagination re-downloads**: `limit=200` then `limit=300` (376 KB + 561 KB) + 2 extra hydrate calls, ending ~15 s after navigation; prefix refetched each step (`useShippedTableRecords.ts:200-203`, `autoCap=3`). Plus `/api/orders-exceptions/unmatched` 291 KB.
3. **Document: TTFB 1.0–2.7 s warm (4.1 s cold) for a 1.3 MB HTML** while the seed SQL is 65 ms — render/serialization of 100 fully-dehydrated rows (package_lines, status_history) + dev-mode; plus 3.4 MB static JS and 2.2 MB of un-sized product images (131 requests) for the card faces.

Overlaps: none of the measured files are in the uncommitted set named in context except that the purchases sheet (target) uses `/api/nav/facets` too — `incoming.purchases` facets measured 3.5 s in the same journal, so the RLS/facets cost is shared.

Artifacts: `/tmp/ful-wf.mjs` (Playwright probe), `/tmp/ful-run{1,2}.txt`, `/tmp/ful-captured.json` (exact SQL), `/tmp/ful-plan*.txt` (plans).
