# Fulfilled sheet — Phase 1 scout, slice DataSignals (§4.B, §4.C, §3 bullet 2)

Measured 2026-10-05 ~19:00 UTC, read-only (`BEGIN TRANSACTION READ ONLY … ROLLBACK`), org `00000000-0000-0000-0000-000000000001` (USAV, 5166 order rows). DB role `neondb_owner` has `rolbypassrls = t`, so every query filters `organization_id` explicitly; the app sets `set_config('app.current_org', …, true)` (`src/lib/tenancy/db.ts:50,117`).

## 0. Headline facts the build must respect

1. **Most dock scan-outs are backfills.** In the last 30 d there are 445 fulfilled order rows (SHIP_CONFIRM on `o.shipment_id`). Only **71 (16 %)** carry `metadata.source = 'shipped-scan-out'`, the live dock/desk/phone writer (`src/lib/outbound/scan-out.ts:262`). The other 374 split as: `bulk-scan-out` 292, `bulk-catchup-scan-out` 59, `(none)` 21, `ops-backfill-scan-out` 3. Over 90 d: 128 live of 1542; all time: 140 live of 4003. Backfills are backdated: `created_at` = the pack time or ship-by, and `updated_at` = when the row was written. Example: the 3 Amazon orders were written 2026-10-05 18:50 UTC and dated at their ship-by. All-time SHIP_CONFIRM rows with `created_at` equal to a PACK_COMPLETED on the same shipment: 5,070 of 5,304. `scripts/throughput/report.ts:81-86` already treats only `shipped-scan-out` as a real scan-out time. 445 of 445 30 d rows are scanned out by staff 1 except 2 (staff 18212 and 19576).
2. **USPS is never polled.** `ENABLED_SYNC_CARRIERS = ['UPS','FEDEX']` (`src/lib/shipping/enabled-carriers.ts:9`; USPS is blocked on its IP Agreement). USPS is **361 of 445 (81 %)** of 30 d fulfilled rows: 0 polled, 0 events, last USPS poll anywhere was 2026-06-09. 751 USPS rows have `latest_status_category = 'IN_TRANSIT'` with `carrier_accepted_at` between 2026-08-28 and 09-03, `source_system = 'scan'`, no events and no `last_checked_at`. That is a synthetic stamp written by a writer not in the repo (grep finds none) → **false "moved" evidence** [INFERENCE: seeded, not carrier data].
3. **UPS/FedEx polling is broken on this DB right now.** Every non-terminal UPS/FEDEX row has `last_error_message` = "UPS_CLIENT_ID and UPS_CLIENT_SECRET are required" / "FEDEX_CLIENT_ID … required" (402 rows). `cron_runs` for `shipping.sync_due`: 284 runs in 24 h, synced = 0. Synced per day 09-28…10-05 = 0, 36, 0, 0, 14, 33, 0, 0, against ~1.7–4.3 k errors a day. Carrier events arrive in bursts: 10-03 brought 5,968 events; 10-04 none; 10-05 10. **`last_checked_at` is stamped on failed polls**, so it is not proof of a poll.
4. **`orders.status` is not the channel's word.** `/api/packing-logs` overwrites any status, including `shipped`, with `'packed'` (`src/app/api/packing-logs/route.ts:634-638`; also `update/route.ts:300-316` and `src/lib/shipments/resolve-shipment-exception.ts:238`). Channel sync only upgrades a blank or `unassigned` status (`src/lib/orders/order-row-backfill.ts:81-88`). So `status <> 'shipped'` on a scanned-out row means "the warehouse packed it", not "the channel was never told". Values in the DB: shipped 4810, packed 288, unassigned 68.

## 1. Schema (live `\d+` / information_schema)

| Table | Key columns for this sheet | Notes |
|---|---|---|
| `orders` | `order_id` (channel order #), `item_number`, `external_line_id`, `account_source`, `fulfillment_channel`, `status`, `sku`, `sku_catalog_id`, `product_title`, `quantity` (text), `sale_amount` (line), `currency`, `customer_id`, `order_date`, `created_at`, `shipment_id`→stn, `tracking_added_at/by`, `label_printed_at/by`, `service_level` (CHECK nextDay/secondDay/expedited/standard/economy/pickup), `release_state` | Indexes incl. `idx_orders_shipment_id` (partial), key4/digits8 expression indexes. Grain = order **line**; in the 30 d fulfilled set 445 rows = 445 order numbers (0 multi-line). |
| `shipping_tracking_numbers` (stn) | `tracking_number_raw/normalized` (UNIQUE normalized), `carrier` (CHECK upper), `latest_status_code/label/description/category`, `is_label_created/is_carrier_accepted/is_in_transit/is_out_for_delivery/is_delivered/has_exception/is_terminal`, `label_created_at`, `carrier_accepted_at`, `first_in_transit_at`, `out_for_delivery_at`, `delivered_at`, `exception_at`, `latest_event_at`, `last_checked_at`, `next_check_at`, `check_attempt_count`, `consecutive_error_count`, `last_error_code/message`, `estimated_delivery_at`, `delivered_source`, `webhook_subscription_*`, `tracking_blocked_reason`, `source_system` | `idx_shipments_next_check` (partial, not terminal); `idx_stn_norm_key18`, `idx_stn_norm_last8`, `idx_stn_raw_lower` exist |
| `shipment_tracking_events` | `shipment_id`, `carrier`, `external_status_code/label/description`, `normalized_status_category`, `event_occurred_at`, `event_recorded_at`, city/state/postal, `signed_by`, `exception_code/description`, `payload` | 35,504 rows: UPS 18,026 / FEDEX 17,465 / USPS 13 |
| `station_activity_logs` (sal) | `activity_type` (`SHIP_CONFIRM`, `PACK_COMPLETED`, …), `station`, `shipment_id`, `staff_id`, `packer_log_id`, `metadata` (`source`), `created_at`, `updated_at`, `order_row_id` | SHIP_CONFIRM 5,304 rows / 5,302 shipments, max `created_at` 2026-10-02 20:35 |
| `packer_logs` | `shipment_id`, `packed_by`, `created_at`, `completion_state` | |
| `order_stage_facts` (osf) | `packer_log_id`, `packed_at`, `packed_by`, `pack_activity_at/by`, `packer_id`, `picked_*`, `qc_*` | One writer, `refreshOrderStageFacts` (`src/lib/orders/order-stage-facts.ts:101-200`); joined by `ORDER_STAGE_FACTS_JOIN` (:206) |
| `work_assignments` | TEST `deadline_at` = ship-by | `WA_DEADLINE_LATERAL` (`src/lib/orders/orders-list.ts:154`) |
| `shipment_links` | `owner_type='ORDER'`, `owner_id`, `shipment_id`, `role` (`ORDER_PRIMARY` / `ORDER_SPLIT`), `box_seq` | 90 orders have more than one shipment; ORDER_SPLIT 205 rows |
| `shipping_label_purchases` | `cost`, `carrier_code`, `service_code`, `tracking_number`, `order_id`, `created_at`, `creation_type` | Only 56 rows (2026-09-24/25), 1 with cost |
| `shipstation_shipment_refs` | `order_row_id`, `tracking_number`, `carrier_code`, `service_code`, `ship_date`, `create_date` (text), `shipment_cost`, `insurance_cost`, `voided`, `is_return_label` | 111 rows since 2026-09-18 |
| `shipstation_order_refs` | `order_row_id`, `shipstation_status` (shipped / awaiting_shipment / cancelled), `order_total`, `ship_by_date`, `requested_service`, `service_code`, `customer_username`, `ship_to` | 735 rows, all linked |
| `label_ingestions` / `label_ingestion_orders` / `label_print_events` | `observed_at`, `applied_at`, `printed_at` | 43 of 445 30 d rows have an ingestion |
| `rma_authorizations` | `order_id`, `rma_number`, `status` | **0 rows** |
| `receiving_line_return` | `source_order_id` (text = `orders.order_id`), `return_platform`, `rma_ref`, `return_reason` | 44 rows |
| `customers` | `customer_name`, `display_name`, shipping address | |
| `zoho_fulfillment_sync` | `reference_number`, `stage`, `status`, `delivered`, `tracking_number` | Not read for this sheet |
| `cron_runs` | `job`, `started_at`, `summary` | Used for the polling evidence |

The three fragments used by `buildOutboundRefsSql` (`src/lib/nav/locate/outbound.ts:243-271`):

- `WA_DEADLINE_LATERAL`, `src/lib/orders/orders-list.ts:154-163`: TEST work_assignment `deadline_at`.
- `ORDER_STAGE_FACTS_JOIN`, `src/lib/orders/order-stage-facts.ts:206-209`.
- `SHIP_OUT_LATERAL`, `src/lib/neon/orders-queries.ts:187-198`: MAX(SHIP_CONFIRM.created_at) plus the latest staff on `o.shipment_id` only. It does **not** cover `shipment_links` splits or the `metadata.source` provenance.

## 2. §4.B Column availability (fulfilled = SHIP_CONFIRM on `o.shipment_id`; population over that set by scan-out time)

| Column | Status | Source (reader file:line) | 30 d (n=445) | 90 d (n=1542) |
|---|---|---|---|---|
| Order # | exists | `orders.order_id` (outbound.ts:245) | 100 % | 100 % |
| Channel | exists | `orders.account_source` (casing differs: eBay/ebay, ecwid/ECWID) | 100 % | 98.8 % |
| Channel order id | exists (same as order #) | `orders.order_id`; line id `external_line_id`; listing `item_number` | 100 % | 100 % |
| Customer | exists | `customers.customer_name` via `orders.customer_id`; fallback `shipstation_order_refs.customer_username` / `ship_to` | 97.8 % | 48.4 % |
| Items / SKU / title | exists | `COALESCE(sc.sku, o.sku)`, `COALESCE(sc.product_title, o.product_title)` (outbound.ts:251-252) | SKU 94.8 %, title 99.3 % | 68.4 %, 99.8 % |
| Qty | exists (text) | `orders.quantity` | 100 % | 100 % |
| Order total | derivable | `orders.sale_amount` (line amount); order-level `shipstation_order_refs.order_total` | 97.5 % / ss 67.6 % | 49.1 % / 20.4 % |
| Ship-by | exists | `wa_deadline.deadline_at` (orders-list.ts:154); alt `shipstation_order_refs.ship_by_date` (text) | 69.7 % | 69.7 % |
| Packed at + packer id | exists | `osf.packed_at` / `osf.packed_by` (outbound.ts:255-256) | 100 % | 100 % |
| **Scanned out at + by (id)** | exists | `SHIP_OUT_LATERAL` `ship_confirmed_at` / `shipped_out_by` (orders-queries.ts:187) | 100 % / 100 % (staff 1 on 443 of 445) | 100 % |
| Scan-out provenance (live / backfill) | derivable | `sal.metadata->>'source'` (+ `updated_at` versus `created_at`) | live 16 % | live 8.3 % |
| Carrier | exists | `stn.carrier` | 100 % known (USPS 361, FEDEX 54, UPS 30) | 100 % |
| Service | partial | `orders.service_level` (class); `shipstation_shipment_refs.service_code` (actual) | 67.6 % / 14.4 % | 20.4 % / 4.2 % |
| Tracking | exists | `stn.tracking_number_raw` (outbound.ts:253) | 100 % | 100 % |
| Label created at | partial | `stn.label_created_at`; `orders.label_printed_at`; `shipstation_shipment_refs.create_date` | 18.7 / 9.4 / 14.4 % | 26.8 / 2.7 / 4.2 % |
| Label cost | mostly missing | `shipstation_shipment_refs.shipment_cost` (+ `insurance_cost`); `shipping_label_purchases.cost` (1 row) | 14.4 % | 4.2 % |
| **First carrier scan** | derivable | `COALESCE(MIN(event_occurred_at) of ACCEPTED/IN_TRANSIT/OFD/DELIVERED events, stn.carrier_accepted_at, first_in_transit_at, out_for_delivery_at, delivered_at)` | 18.7 % (real: UPS/FedEx only) | 75.7 % (751 are synthetic USPS) |
| Last carrier event + time | exists | `stn.latest_status_label/description`, `stn.latest_event_at` | 18.9 % | 75.7 % |
| Delivered at | exists | `stn.delivered_at` (outbound.ts:254) | 14.6 % | 25.7 % |
| Promised / estimated delivery | exists, ~empty | `stn.estimated_delivery_at` | **0.4 %** | 0.1 % |
| Delivery attempts | derivable | count of `shipment_tracking_events` whose description matches attempt (UPS codes 48, KX, 49, G3, 51, YD, ZM; FedEx `DE`) | 0 | 10 rows |
| Exception code | derivable | `shipment_tracking_events.exception_code` (FedEx `SE`/`DE` only); UPS keeps it in `external_status_code`; flag `stn.has_exception` | 4 rows ever had one | 61 |
| Returned to sender | derivable | `stn.latest_status_category = 'RETURNED'` or event text "returned to the sender" (UPS `UA`/`KR`/`KT`) | 0 | 0 (6 all time) |
| Return / RMA link | partial | `receiving_line_return.source_order_id = orders.order_id`; `rma_authorizations` is empty | 0 | 27 (1.8 %) |
| `channelStatus` | exists but polluted | `orders.status` (outbound.ts:249,296); see §0.4 | shipped 40.7 % | 82.9 % |
| Tracking uploaded to channel | **missing** | No upload writer or record in repo. The only proxy is `shipstation_order_refs.shipstation_status = 'shipped'` (ShipStation-routed orders only); eBay has only a GET (`src/lib/ebay/client.ts:463`) | proxy 67.6 % | 20.4 % |

## 3. 'Fulfilled' definition and Venn

Three candidate sources. Order rows are windowed on `COALESCE(order_date, created_at)`, and "owns shipment" means `o.shipment_id` ∪ `shipment_links` ORDER:

- **A** dock scan-out: an SHIP_CONFIRM exists on any owned shipment.
- **B** packer log: a COMPLETED `packer_logs` row on any owned shipment.
- **C** channel shipped: `orders.status = 'shipped'`.

| Window | rows | A | B | C | A∩B∩C | A∩B only | A∩C only | B∩C only | A only | B only | C only | none | A∪B |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 30 d | 701 | 431 | 460 | 357 | 173 | 258 | 0 | 1 | 0 | 28 | 183 | 58 | 460 |
| 90 d | 2077 | 1511 | 1541 | 1722 | 1247 | 264 | 0 | 2 | 0 | 28 | 473 | 63 | 1541 |
| all | 5166 | 4010 | 4041 | 4810 | 3746 | 264 | 0 | 3 | 0 | 28 | 1061 | 64 | 4041 |

- A ⊂ B on every window: every scan-out has a packer log.
- B only: 28 rows, all-time = 30 d, mostly Amazon with status `packed`. These are packed and not scanned out, and stay on To-ship (`buildPackerLogBaseWhere`, `src/lib/neon/packer-logs-week.ts:276-286`).
- A∩B without C: 264 rows, status `packed` 258. This is the sticky status from §0.4, not a channel defect.
- C only: channel shipped and the warehouse has neither stamp. 183 / 473 / 1061 rows. In 30 d: 174 of 183 are `shipstation_order_refs.shipstation_status = 'shipped'`, 124 have no `shipment_id`, 15 show carrier movement, 10 are delivered, 55 are `caged`, 0 are AFN. These are orders shipped through ShipStation outside the dock.

Windowed by scan-out time instead (set F, SHIP_CONFIRM on `o.shipment_id`): 30 d 445 rows (440 shipments, 445 order numbers); 90 d 1542; all 4003.

**Proposed definition:** a row = one order line whose owned shipment (`o.shipment_id` ∪ `shipment_links` ORDER) has ≥1 `SHIP_CONFIRM`.
- Date: `MAX(sal.created_at)`. By: the latest staff.
- Expose `metadata.source` as "Scan" (Live / Backfill), because 84 % of 30 d stamps are backfills.
- This matches the Shipped desk membership, which requires a staffed SHIP_CONFIRM (packer-logs-week.ts:278-286).
- `outboundFacts` falls back to `osf.packed_at` for `shippedAt` (outbound.ts:259). Under this definition the fallback never fires.
- C-only rows are **not** fulfilled; they become a signal (QoL 5, reverse direction). Whether the sheet lists them is an operator choice.

**The 3 Amazon orders** (113-6729910-1909809 / 112-4410844-9235459 / 114-7232334-9247429; order ids 13527 / 13604 / 13850):

| Source | What it says |
|---|---|
| `orders` | status `shipped`; `order_date` NULL; `release_state` `caged`; `account_source` Amazon |
| stn | USPS, ids 70666 / 76783 / 101295, tracking 93001109905135748207xx…; category NULL; never checked; no events |
| `shipment_links` | `ORDER_PRIMARY`, source `google-sheets-transfer-orders` |
| ShipStation | No refs |
| TEST `work_assignment` | Still `OPEN` |

**Today they are no longer "never scanned out".** `scripts/ship-out-stale-orders.ts` (uncommitted) wrote, for each one, a COMPLETED packer log (7261 / 7262 / 7274), a PACK_COMPLETED event (source `scripts.ship-out-stale-orders`) and a SHIP_CONFIRM (`bulk-scan-out`, staff 1). The stamps are dated 2026-09-04 / 09-05 / 09-09 06:59:59Z, which is the ship-by deadline, and `updated_at` is 2026-10-05 18:50 UTC. So they now count in A and B, with backfill provenance. Carrier truth is unknowable because USPS is unpolled.

## 4. Carrier polling

| Job | Schedule / route | Notes |
|---|---|---|
| `shipping.sync_due` | `/api/cron/shipping/sync-due?limit=200&concurrency=8&carriers=UPS,FEDEX`, `*/5 * * * *`, plus `30 3 * * 2-6` (`vercel.json`) | `getDueShipments` (`src/lib/shipping/repository.ts:160-243`) polls non-terminal rows with `next_check_at` due and upper(carrier) in UPS, FEDEX. Errored rows are retried every 24 h after 5 consecutive errors. Priority: To-ship rows without SHIP_CONFIRM, then rows on orders, then in-flight, then `next_check_at`. |
| Cadence | `computeNextCheckAt` (`src/lib/shipping/normalize.ts:235-264`) | LABEL_CREATED 2 h, ACCEPTED 4 h, IN_TRANSIT 2 h, OFD 30 m, EXCEPTION 3 h, RETURNED 12 h, UNKNOWN 6 h. Error backoff ×2^(n-1), capped at ×16. |
| `shipping.reconcile_delivered` | `20 * * * *` | |
| `shipping.metrics` | `*/30` | Latest alert: "432 USPS shipment(s) blocked … IP Agreement still pending"; 550 rows stuck at ≥5 errors |
| Webhooks | `src/app/api/webhooks/{ups,fedex,usps}/route.ts` exist | `webhook_subscription_status` COMPLETED on 0 recent non-terminal rows |

- Last-poll column per tracking: `stn.last_checked_at`. It is stamped on failures too, so a successful poll should be read as `MAX(shipment_tracking_events.event_recorded_at)` or `stn.updated_at` with `consecutive_error_count = 0`.
- Measured freshness for undelivered, non-terminal fulfilled rows scanned out in the last 30 d:

| Carrier | Undelivered | Ever polled | Erroring | `last_checked_at` age p50 / p90 | Last *ingested event* age p50 / p90 |
|---|---|---|---|---|---|
| USPS | 316 | 0 | – | never | never |
| FEDEX | 18 | 18 | 18 | 3.3 h / 5.4 h | **48.6 h / 48.7 h** |
| UPS | 2 | 2 | 2 | 3.3 h / 3.3 h | **48.7 h / 48.8 h** |

All non-terminal rows created in the last 30 d (inbound + outbound): USPS 821 all due, never checked; FEDEX 116 (50 at ≥5 errors), p50 7.4 h; UPS 57 (35 at ≥5 errors), p50 3.3 h.

## 5. QoL signals (F windowed by scan-out time)

The CTE is F (the population above) joined to stn, osf, the TEST deadline, and an events aggregate.

- `moved` = first-scan expression (§2) IS NOT NULL.
- `polled` = `last_checked_at IS NOT NULL OR n_events > 0`.
- `tracked` = `upper(carrier) IN ('UPS','FEDEX')`.

| # | Signal | Predicate | 30 d | 90 d | all | False-positive risks |
|---|---|---|---|---|---|---|
| 1 | **No movement** (provable) | `scanned_out < now()-N AND NOT moved AND tracked AND n_events>0` | N = 24 h, 48 h or 72 h: **3** | 3 | 16 | The 3 (UPS 113-2030566-1552214, FEDEX 114-9115030-0611442, 114-2714700-4926606) are LABEL_CREATED-only bulk backfills scanned 09-09 / 09-21. The real stamp may be wrong. Polls are failing (§0.3), so "no movement" may be "no poll". USPS is unprovable. |
| 1b | Not provable (untracked) | `NOT tracked AND n_events = 0` | 360 | 1121 | 2730 | Must not be painted "No movement". 751 USPS rows (90 d) look moved from synthetic stamps. |
| 2 | Stalled | `isStalled`: `latest_event_at < now()-72h AND delivered_at IS NULL AND NOT is_terminal` (`src/lib/shipping/shipment-status.ts:35-50`, 72 h default) | 14 (7 d: 4) | 17 (7 d: 7) | 31 | 11 of the 14 are FedEx IN_TRANSIT with last event 09-30…10-02, while every poll errors on missing credentials. This is stale data, not a stuck package. |
| 3a | Exception now | `cat='EXCEPTION' OR (has_exception AND delivered_at IS NULL)` | 0 | 0 | 0 | |
| 3b | Exception ever | events EXCEPTION or `has_exception` | 4 | 61 | 146 | |
| 3c | Attempted | events matching attempt text or codes | 0 | 10 | 31 | |
| 3d | Returned to sender | `cat='RETURNED' OR` RTS event text | 0 | 0 | 6 | |
| 4a | Late ship | `ship_confirmed_at > wa_deadline.deadline_at` | 40 (ship-by known: 310); live-only 3 | 425; live 15 | 1825; live 24 | Backfills stamp pack time or ship-by, not hand-off time. Only `source = 'shipped-scan-out'` is trustworthy. |
| 4b | Late delivery | `delivered_at > stn.estimated_delivery_at` | 0 (ETA known: 2) | 0 (ETA: 2) | – | Not computable without ETA data. ShipStation/marketplace promise dates are not stored. |
| 5a | Warehouse shipped, channel not | Proxy `shipstation_status='awaiting_shipment'` on a scanned-out order | 0 | 0 | – | `orders.status <> 'shipped'` gives 264, but that is the sticky `packed` (§0.4). Non-ShipStation channels have no upload record. |
| 5b | Channel shipped, never scanned out | `orders.status='shipped' AND NOT A AND NOT B` (order-date window) | 183 (174 ShipStation-shipped; 124 with no tracking) | 473 | 1061 | Mostly ShipStation-shipped outside the dock. The 3 Amazon examples were backfilled today. |
| 6 | Claim window | `days_since(scan-out or label) vs carrier window`, only on rows with no movement or stalled | n/a (3 no-movement rows) | | | Code knows only eBay buyer-claim 30 d (inbound: `src/lib/receiving/delivered-not-unboxed.ts:17`; `claim-window.ts`). Carrier windows, see below. |
| 7a | Multi-package order | `count(shipment_links ORDER) > 1` | 9 | 31 | 71 (90 orders org-wide) | `SHIP_OUT_LATERAL` reads `o.shipment_id` only, so split packages are invisible. |
| 7b | Duplicate tracking across orders | `count(DISTINCT o.order_id) per shipment_id > 1` | 10 rows | 20 | 11 shipments / 22 rows | stn normalized is UNIQUE, so a duplicate means a shared `shipment_id`. |
| 7c | Invalid (scientific notation) | `tracking_number_raw ~* '^\d+(\.\d+)?e[+-]?\d+$'` (= `SCIENTIFIC_NOTATION_TRACKING`, `src/lib/inbound/inbound-order-draft.ts:70`) | 0 | 0 | 0 on orders (145 stn rows, all carrier UNKNOWN; 3 inbound) | |
| 8 | Pack→ship / ship→first scan / transit | `ship_confirmed_at - osf.packed_at`; `first_scan - ship_confirmed_at`; `delivered_at - ship_confirmed_at` | | | | Live rows (90 d, n=128): pack→ship p50 0 h / p90 5.8 h (62 of 128 equal the pack time); ship→first scan p50 1.9 h (82 known; 9 before scan-out); transit p50 4.6 d. Backfill rows: pack→ship is always 0 (1321 of 1413 equal) — meaningless. |
| 9 | Returns linked | `EXISTS receiving_line_return r WHERE r.source_order_id = o.order_id` | 0 | 27 | 33 | Text match on order id. `rma_authorizations` is empty. |

**Carrier claim windows.** Nothing in code or docs covers these (grep found none).

- UPS: notice within 60 days after delivery, or for non-delivery within 60 days after the scheduled delivery date (UPS Tariff, https://www.ups.com/assets/resources/webcontent/en_US/claims_legal_action.pdf).
- USPS: damaged or missing contents no later than 60 days from mailing (DMM 609 1.4, https://pe.usps.com/text/dmm300/609.htm). [INFERENCE] Lost packages: no sooner than 15 days (7 for Priority Mail Express) and no later than 60 days from mailing (https://www.usps.com/domestic-claims/).
- FedEx: [INFERENCE] 60 days for US domestic, per the FedEx Service Guide (https://www.fedex.com/content/dam/fedex/us-united-states/services/Service_Guide_2025.pdf — not read).
- Marketplace windows (Amazon A-to-z, eBay INR) are not modelled for outbound.

## 6. Proposed status buckets

Style follows `LOCATE_BUCKET_PRECEDENCE` (`src/lib/nav/locate/bucket-precedence.ts:31-35`). The rule is first match wins in a `CASE`, so buckets are mutually exclusive by construction. Flags (late ship, channel mismatch, multi-package, return linked, backfill scan) are chips or filters that overlap rows, not statuses. Status reuses the vocabulary of `resolveOutboundStage` (`src/lib/order-lifecycle.ts:188-206`), with `stalled` computed by `isStalled`.

| Precedence | id | Label | Predicate | Columns | 30 d | 90 d | all |
|---|---|---|---|---|---|---|---|
| 1 | `returned` | Returned | `cat='RETURNED' OR rts_event` | stn.latest_status_category, events | 0 | 0 | 6 |
| 2 | `delivered` | Delivered (green) | `delivered_at IS NOT NULL OR cat='DELIVERED'` | stn.delivered_at | 65 | 396 | 1229 |
| 3 | `exception` | Exception | `cat='EXCEPTION' OR has_exception` | stn.has_exception, latest_status_category | 0 | 0 | 0 |
| 4 | `untracked` | Untracked | `upper(carrier) NOT IN ('UPS','FEDEX') AND n_events=0` (carrier not polled: USPS, UNKNOWN, LOCAL, AMAZON, GOFO) | stn.carrier, events | **360** | 1121 | 2730 |
| 5 | `no_movement` | No movement | tracked AND NOT moved AND `ship_confirmed_at < now()-24h` | first-scan expr, sal | 3 | 3 | 16 |
| 6 | `awaiting` | Awaiting pickup | tracked AND NOT moved AND scanned out < 24 h ago | same | 0 | 0 | 0 |
| 7 | `stalled` | Stalled | `latest_event_at < now()-72h` (not delivered) | stn.latest_event_at | 11 | 14 | 15 |
| 8 | `out_for_delivery` | Out for delivery | `cat='OUT_FOR_DELIVERY'` | stn | 3 | 3 | 3 |
| 9 | `in_transit` | In transit | else (moved) | stn | 3 | 4 | 4 |

- Sum for 30 d = 445 (matches F).
- The 24 h threshold should become business hours [operator]. Today N = 24 h, 48 h or 72 h gives the same 3 rows.
- `untracked` must sit above `no_movement` and `stalled`, otherwise 360 USPS rows paint as "No movement".
- `no_movement` and `stalled` should be suppressed or annotated while the row's `consecutive_error_count > 0` (poll failing). Today that is all 20 tracked undelivered rows.

## 7. Proposed columns

**Default 10:**
1. Order — `o.order_id`
2. Channel — `o.account_source` (normalize casing)
3. Status — the bucket above
4. Scanned out — date + time, `MAX(SHIP_CONFIRM.created_at)` via `SHIP_OUT_LATERAL`
5. By — `StaffCell`, `shipped_out_by`
6. Carrier — `stn.carrier`
7. Tracking — `stn.tracking_number_raw`
8. Last event — `stn.latest_status_label` plus `latest_event_at`; for untracked rows show "Not polled"
9. Delivered — `stn.delivered_at`
10. Item — `COALESCE(sc.product_title, o.product_title)` with the SKU on hover

**Optional:**
- SKU — `COALESCE(sc.sku, o.sku)`
- Qty — `o.quantity`
- Customer — `customers.customer_name`
- Order total — `o.sale_amount`, or ss `order_total`
- Ordered — `o.order_date`
- Ship-by — `wa_deadline.deadline_at`
- Packed + Packer — `osf.packed_at` / `packed_by`
- Scan source — Live / Backfill, from `sal.metadata->>'source'`
- First scan — derived
- Days in transit — derived
- Service — `o.service_level` or ss `service_code`
- Label created — `stn.label_created_at` or `o.label_printed_at`
- Label cost — ss `shipment_cost`
- ETA — `stn.estimated_delivery_at`
- Attempts — from events
- Exception code — from events
- Last poll — `stn.last_checked_at` plus `last_error_code`
- Channel status — `o.status`, footnoted "warehouse-overwritten"
- ShipStation status — `shipstation_order_refs.shipstation_status`
- Packages — count of `shipment_links`
- Return — `receiving_line_return` link

## 8. Overlaps / notes for the parent

- `scripts/ship-out-stale-orders.ts` (uncommitted) and the bulk scan-out (`docs/handoff/HANDOFF-live-feed-triage-2026-10-04.md:102-103`) are what make §3 and §0.1 look the way they do.
- `src/lib/nav/locate/service.ts` (uncommitted) already lists `shipment_last_checked_at` / `shipment_estimated_delivery_at` / `shipment_latest_event_at` (service.ts:94-97). That set of shipment fields can be reused.
- Operator / infra blockers for signals 1–2: (a) UPS/FedEx credentials are missing in the polling env; (b) USPS tracking access (IP Agreement); (c) no channel upload record.
