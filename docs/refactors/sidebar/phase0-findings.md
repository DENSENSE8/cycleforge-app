# Phase 0 findings — contextual sidebar backend

Written 2026-09-26 by the sidebar backend session. Combined output of the
Phase 0 parallel scouting wave (spec: `BACKEND-HANDOFF.md` §Phase 0). Refs are
file:line as of `b0dbf544f`; `[INFERENCE]` marks unexecuted claims. The
per-page parity inventory is in `PARITY.md`.

## Headline facts that change the plan

1. **RLS makes polymorphic reads slow, not the polymorphism.** Under `app_tenant`
   (NOBYPASSRLS, forced RLS) predicates on non-leakproof operators (enum `=`,
   jsonb `->>`, `~`, `lower`/`btrim`, `LIKE`, trigram ops) cannot be index
   conditions. Same SQL owner vs `app_tenant`: queue-counts 37 ms vs 12,209 ms;
   `/api/orders` 436 ms vs 6,893 ms; work_assignments lateral 19 ms vs 913 ms.
   Index plan must target plain-column (`text`/`int`) btree predicates.
2. **`/api/orders` cache key bug confirmed** (`src/app/api/orders/route.ts:201-240`):
   key omits `limit` and `cursor`; `limit=3` after `limit=30` HITs with 30 rows.
3. **Triage 38 vs queue-counts 406**: triage uses `sqlOrderInWarehouseToShip`
   (shipment + non-blank tracking); queue-counts mirrors `fulfillmentScope`,
   which dropped that requirement. 406 = 38 labelled + 367 no shipment + 1 blank tracking.
4. **Empty first paint on `/shipping/orders`**: `serverSelfFetch` sends the seed
   request to `NEXT_PUBLIC_APP_URL` (usav-dev), which 401s the lane cookie, and
   the seed discards 401s silently.
5. **No structured brand exists anywhere** (Zoho brand/manufacturer 0%, listing
   payloads empty, bose_models 0 rows). A leading-token alias rule on the
   identity title brands 89.8% of active non-fixture SKUs (84.9% of all non-fixture).
6. **Identify path bugs**: scan/resolve tracking queries a non-existent column
   `stn.tracking_number_key18` and swallows the error; GS1 AI parsing claims any
   input starting with 2 digits; global-search receiving identifier lookup throws
   (`$2` unused, `global-entity-search.ts:360-406`). Auth floor ≈315 ms; each
   `tenantQuery` = ~4 Neon round trips (~100 ms each).
7. **Client-only recents keys differ from the handoff**: real keys are
   `assistant:recent-detail-stacks`, `support:recent-tickets`,
   `audit-log.trace.recents`, `labels:history-recents:v1`, `command-bar-recent`, and more
   (table in §Nav). Server recents already exist in part: `receiving_line_views`;
   `search_recents` + `/api/search/recents` have no caller.
8. **Nav registry drift**: Reports renders 7 tabs vs 4 registered; Sourcing
   `?mode=analytics` has no tab; FBA Ready/Catalog modes missing from children;
   the `receiving` legacy page is unreachable; the dogfood `nav_definitions` row
   still carries a stale `fba` Shipping child. "Pending" is still operator-visible
   in `oos-pending-toast.ts:29,44` and `UnshippedTable.tsx:920`.
9. **Settings override**: `nav.contextual.<pageId>` needs `'nav'` added to
   `SettingPage` (`src/lib/settings/types.ts:13`) and `SETTING_PAGES`
   (`registry.ts:62`); precedent `desk.<pageId>.fullscreen` over `/api/settings`.

## Incident during Phase 0 (11:17–11:27 PDT)

A scout (IdentifyAudit) opened psql sessions on the `.env` **pooler** DSN
(PgBouncer, transaction mode) with a session-level
`SET default_transaction_read_only=on`. Session SETs stick to the server
backend under transaction pooling, so the lane's pool inherited read-only
backends: 136 `cannot execute INSERT in a read-only transaction` errors,
including `/api/auth/qr/begin` and sign-in 500s. Cleared when PgBouncer recycled
the backends. Commit `0539ad62c` attributes this to a Neon branch lock; the
evidence above supersedes that. Rule adopted for all later agents: DB reads use
the UNPOOLED DSN and transaction-scoped `BEGIN READ ONLY … ROLLBACK` only.

## Schema and query-shape audit


Scope: the 20 polymorphic tables plus the four known slow or wrong paths. Evidence comes from the live dev DB (lane `prod` branch, PG 17.11) and authed curls against `:3050` (session minted the same way `scripts/lighthouse-mint-session.mjs` does it). EXPLAINs ran two ways. **`app_tenant`** is the runtime role that `tenantQuery` uses (`src/lib/tenancy/db.ts:8-14,35-39`, NOBYPASSRLS, `app.current_org` GUC). **Owner** is `neondb_owner` (BYPASSRLS). Every hot path audited goes through `tenantQuery`/`withTenantConnection`, so **the app_tenant numbers are the real ones**. All DB access was read-only (`default_transaction_read_only=on`, `BEGIN READ ONLY`).

### 0. Headline: under RLS, most of the "missing index" problem is really a leakproof/statistics problem

Evidence:
- **RLS is on and forced** on every audited table: `relrowsecurity=t, relforcerowsecurity=t` for orders, station_activity_logs, work_assignments, ticket_links, photo_entity_links, ops_events, documents, document_entity_links, shipping_tracking_numbers, feed_memberships, entity_signals, staff_rail_exclusions, staff_inbox_items, entity_search_docs, notification_outbox.
- **Roles:** `app_tenant rolbypassrls=f`, `neondb_owner rolbypassrls=t`. The tenant pool is used whenever the DSN points at the same compute (`src/lib/tenancy/db.ts:8-14`). `.env:227` points it at `ep-shiny-hall-adz0n0nu`, which is the same compute as `DATABASE_URL` (`.env:318`).
- **Leakproof flags** (`pg_proc.proleakproof`):

  | Leakproof | Functions |
  |---|---|
  | **t** | `int4eq`, `int8eq`, `int48eq`, `int84eq`, `texteq`, `uuid_eq`, `bpchareq` |
  | **f** | `enum_eq`, `enum_ne`, `jsonb_object_field_text` (`->>`), `textregexeq` (`~`), `int4in` (`::int` cast), `lower`, `upper`, `btrim`, `timezone`, `textlike` (`LIKE`), and the pg_trgm operator functions (`similarity_op`, `word_similarity_op`, `word_similarity_commutator_op`) |

What this means, with observed effects:

1. **Non-leakproof quals are never used as an Index Cond under app_tenant.** Expression indexes and enum-led indexes degrade to the leading `organization_id` (or another leakproof column) and apply everything else as a Filter.
   - `idx_sal_org_type_order_row_id` and `idx_sal_org_type_order_id` are the jsonb `->>` expression indexes from `src/lib/migrations/2026-08-21e_station_activity_logs_order_grain_indexes.sql:99-120`.
     - Owner plan: BitmapOr over these indexes.
     - app_tenant plan: `Index Scan using idx_station_activity_logs_organization`, `Rows Removed by Filter: 43464` per outer row.
   - `idx_entity_search_docs_barcode` on `(org, upper(btrim(barcode)))`: under app_tenant only `organization_id` is the Index Cond, and `upper(btrim(barcode)) = …` becomes a Filter (forced plan, §2.9).
   - `idx_entity_search_docs_search_trgm` on `lower(search_text)`: under app_tenant it cannot serve `LIKE` or `<%` at all.
   - `work_assignments` `entity_type = 'ORDER'` (an enum): `Index Cond: (entity_id = o.id)`, `Filter: … entity_type = 'ORDER'::work_entity_type_enum`.
2. **Selectivity estimates for non-leakproof quals fall back to defaults under RLS.** Example: `work_assignments WHERE entity_type='ORDER' AND work_type='TEST'`.

   | Role | Estimated rows | Actual rows |
   |---|---|---|
   | app_tenant | 252 | 5,018 |
   | owner (uses MCVs) | 4,943 | 5,018 |

   Text columns stay accurate under app_tenant (`ops_events.event_type='TRACKING_SCANNED'`: est 3,825, actual 3,786). The misestimate turns joins into Nested Loop + Materialize (see /api/orders, §2.8).
   - [INFERENCE] Mechanism: PG's `statistic_proc_security_check` refuses MCV/histogram stats for non-leakproof operators on RLS relations.
3. **Owner vs app_tenant, same SQL:**

   | Query | app_tenant | owner |
   |---|---|---|
   | queue-counts main | 12,209 ms | 37.5 ms |
   | /api/orders inWarehouse main | 6,893 ms | 436 ms |
   | work_assignments ORDER lateral | 913 ms | 19 ms |
   | ticket_links receiving lateral | 23.6 ms | 3.2 ms |

**Consequence for "make it fast".** The polymorphic model is fine, but the predicates and index keys must use **leakproof operators on plain columns**: int/bigint/uuid/text `=`, with no jsonb `->>`, no regex, no `lower()`, no enum `=`. Three levers:
- **(a) Promote hot jsonb keys to typed STORED generated columns.**
- **(b) Replace hot enum columns with `text` + `CHECK`**, or at least lead indexes with `(organization_id, entity_id)` so the leakproof prefix does the work.
- **(c) Search:** trgm and `LIKE` are inherently non-leakproof, so fuzzy search needs a `SECURITY DEFINER` function with an explicit org predicate, or the owner pool with an explicit org filter (open question).

`ALTER FUNCTION … LEAKPROOF` needs superuser; `neondb_owner rolsuper=f`, so that route is out.

Also: **schema.ts is not the index source of truth.** 46 live indexes on these tables are absent from `src/lib/drizzle/schema.ts`: every work_assignments, station_activity_logs, photo_entity_links, document_entity_links and entity_search_* index, among others. They live in hand-written `src/lib/migrations/*.sql`, for example `0000_baseline_through_2026-03.sql:390` (`idx_work_assignments_entity`) and `2026-06-18_photos_platform_side_tables.sql:40`.

### 1. Family inventory (live DB)

Counts are `n_live_tup` plus `seq_scan`/`idx_scan` from `pg_stat_user_tables` (cumulative since the last reset). Index usage is from `pg_stat_user_indexes`.

| Table | Rows | Size | seq_scan | idx_scan | Columns (polymorphic key in **bold**) | Live indexes (idx_scan) |
|---|---|---|---|---|---|---|
| ticket_links | 761 | 568 kB | **185,174,065** | 315,917,162 | id, organization_id, zendesk_ticket_id, **entity_type text, entity_id bigint**, support_ticket_id, is_primary, link_role, created_by, created_at, updated_at | org_entity (org,etype,eid) 314.7M · ux_ticket_entity 1.15M · ux_support_entity 5k · support_ticket partial 20.7k · ux_*_anchor/primary partial |
| photo_entity_links | 14,748 | 3.4 MB | **35,334,762** | 215,113,759 | id, photo_id, organization_id, **entity_type, entity_id**, link_role, created_at | entity (org,etype,eid) 201.6M · photo(photo_id) 9.66M · ux(photo_id,etype,eid,role) 3.8M |
| station_activity_logs | 43,696 | 26 MB | 1,406,938 | 265,520,733 | id, station varchar, activity_type varchar, shipment_id, scan_ref, fnsku, staff_id, fba_*, tech_serial_number_id, packer_log_id, notes, **metadata jsonb (order_row_id / order_id / unit_id / client_event_id)**, orders_exception_id, organization_id, created_at, updated_at | shipment_id partial 196.4M · (org,type,(meta->>'order_id')) 20.6M · (org,type,(meta->>'order_row_id')::int) 20.4M · (station,staff_id,created_at) 19.4M · **organization_id alone 6.83M** · pkey 1.8M · (org,created_at) 52k · (org,station,type,created_at) 25k · scan_ref_key18 **0** · fnsku 2 |
| ops_events | 23,929 | 15 MB | 534,196 | 580,692,211 | id, organization_id, occurred_at, event_type, **entity_type, entity_id**, actor_staff_id, client_event_id, payload jsonb, workflow_node_id, session_id, session_type | org_entity_time 568.7M · org_type_time 11.96M · client_event_id uq 29k · node/session partials ~0 |
| work_assignments | 9,194 | 6.2 MB | 1,991,691 | 88,013,667 | id, **entity_type enum, entity_id**, work_type enum, status enum, assigned_tech_id, assigned_packer_id, assignee_staff_id, assigned_by_staff_id, priority, deadline_at, remind_at, work_session_id, organization_id, … | entity (etype,eid,wtype,status) 47.7M · deadline_queue 31.3M · ux_active_entity partial 2.08M · order_entity_active partial 5.5M · tech_id 995k · organization 308k · assignee_status **0 (744 kB)** · receiving/sku_stock active partials 0 |
| feed_memberships | 2,674 | 1.8 MB | 51,621 | 6,555,633 | id, organization_id, feed_key, **entity_type, entity_id**, workflow_definition_id, node_id, state, priority_tier, occurred_at, title, subtitle, tone, meta | ux_natural (org,feed,etype,eid) 6.56M · org_entity 374 · org_feed_state_time **2** · org_node 42 |
| document_entity_links | 2,019 | 688 kB | 124,658 | 5,714,173 | id, document_id, organization_id, **entity_type, entity_id**, link_role, created_at | entity (org,etype,eid) 4.7M · document 998k · ux 7.9k |
| entity_threads | 559 | 280 kB | 56,081 | 9,898 | id, organization_id, **entity_type, entity_id**, status, support_ticket_id, last_message_at, created_by, deleted_at, … | ux_natural 7k · org_last_message 217 · support_ticket partial 34 |
| staff_rail_exclusions | 35 | 64 kB | 48,624 | 20,507 | id, organization_id, staff_id, station, feed_key, **entity_type, entity_id**, excluded_at | ux_natural 20.1k · org_entity 377 |
| entity_search_outbox | 9,475 | 3.7 MB | 44,688 | 179,440 | id, organization_id, **entity_type, entity_id**, enqueued_at, attempts, last_error, processed_at, claimed_at | pkey 82k · ux_pending partial 79k · pending partial 18k · processed partial 86 |
| staff_inbox_items | 21 | 160 kB | 40,339 | 20,490 | id, organization_id, staff_id, subscription_id, **entity_type, entity_id**, event_key, reason, dedup_key, collapse_key, collapse_count, state, snoozed_until, occurred_at, last_event_at, … | entity 11.5k · feed (org,staff,state,occurred_at) 8.9k · dedup 70 · collapse partial 1 |
| entity_search_docs | 12,533 | 14 MB | 30,242 | 41,783 | id, organization_id, **entity_type, entity_id**, title, subtitle, search_text, embedding vector, status, tracking_number, carrier, serial_number, barcode, happened_at, … | ux_natural 41.2k · trgm gin 442 · org_happened 128 · barcode expr partial 7 · hnsw 0 |
| entity_signals | 15,874 | 11 MB | 29,061 | 885 | id, organization_id, **entity_type, entity_id**, signal_kind, reason_code, notes, notes_tsv, severity, occurred_at, node_id, source_ref, meta | org_entity_time 627 · org_node_kind 151 · org_kind_time 59 · ux_source_ref 48 · notes_tsv gin 0 |
| entity_notes | 0 | 32 kB | 19,724 | 4,790 | id uuid, **entity_type, entity_id uuid**, body, author_id, organization_id | organization 4,790 · lookup (etype,eid) 0 |
| thread_links | 0 | 32 kB | 19,489 | 3,106 | id, organization_id, thread_id, **entity_type, entity_id**, link_role | ux_natural 3.1k · entity 0 |
| notification_outbox | 16,893 | 7.4 MB | 14 | 159,585 | id, organization_id, ops_event_id, **entity_type, entity_id**, event_key, payload, claimed_at, attempts, processed_at, … | pkey 106k · pending partial 36k · ux_event 17k · processed partial 0 (392 kB) |
| staff_subscriptions | 3 | 152 kB | 189 | 43,465 | subscription_kind, state, **entity_type, entity_id**, match_* rule columns | ux_entity partial 26.4k · staff 17k · rule/sla partials ~0 |
| pack_verification_events | 0 | 48 kB | 18 | 11,160 | **entity_type, entity_id**, shipment_id, outcome, client_event_id uuid, … | org_entity_time 11.2k · others 0 |
| shortage_inbound_links | 0 | 88 kB | 18 | 7,410 | shortage_id, source_kind, zoho_po_id, receiving_line_id, serial_unit_id, link_status | shortage 7.3k · natural uq 44 |
| agent_mutation_affects | 0 | 32 kB | 165 | 0 | agent_mutation_id, **target_kind, target_ref text** | 2 btrees, 0 scans; write-only (`src/lib/assistant/mutations/apply-agent-mutation.ts:423`) |

Parameters: org `00000000-0000-0000-0000-000000000001` (usav) holds 4,974 of 5,183 orders. Staff with the most ORDER assignments: 4 (1,996), 5 (1,647), 6 (308).

### 2. Hot query shapes + EXPLAIN (ANALYZE, BUFFERS), per family

Shapes were collected by five read-only scouts (full tables at `agent://SchemaAudit.Scout*Family/report`). Every EXPLAIN below was run by me. Unless marked, EXPLAINs ran under app_tenant with the org GUC set.

#### 2.1 station_activity_logs (order-grain facts): the #1 cost

| # | Shape (file:line) | Callers | WHERE / ORDER |
|---|---|---|---|
| S1 | `sqlOrderHasTechScan` / `sqlOrderHasPackScan`, `src/lib/orders/order-grain-sql.ts:17-38` (rendered via tsx) | `/api/orders`, `/api/orders/queue-counts`, `/api/orders/desk-counts` (`sqlOrderAwaitingPick`), correlated per order | `sal.organization_id=o.organization_id AND activity_type IN (…) AND ((meta->>'order_row_id') ~ '^[0-9]+$' AND (meta->>'order_row_id')::int=o.id OR meta->>'order_id'=o.order_id OR (sal.shipment_id=o.shipment_id AND meta->>'order_row_id' IS NULL AND sole-order NOT EXISTS))` |
| S2 | `sqlOrderHasShipConfirm`, `order-grain-sql.ts:64-71` | every queue/count | `shipment_id=o.shipment_id AND org AND activity_type='SHIP_CONFIRM'` |
| S3 | queue-counts shippedToday, `src/app/api/orders/queue-counts/route.ts:100-107` | poll | `org AND station='PACK' AND timezone('America/Los_Angeles',created_at)::date = …` (not sargable) |
| S4 | `/api/orders` CTEs `pack_activity` / `test_activity` / `sal_scan`, `src/app/api/orders/route.ts:369-462` | every `/api/orders` | whole-table `DISTINCT ON (shipment_id)` / `GROUP BY shipment_id` with **no org filter** (RLS adds it) |
| S5 | `src/app/api/serial-units/[id]/route.ts:271-275`; `src/app/api/post-multi-sn/route.ts:124-128` | detail / print | `metadata->>'unit_id'=$1`, `metadata->>'client_event_id'=$2` (unindexed jsonb) |

EXPLAIN, queue-counts main (S1 + S2), unfiltered:
- app_tenant: **12,209 ms**, `Buffers: shared hit=1,504,866`.
  - `SubPlan 4 → Index Scan using idx_station_activity_logs_organization … (actual 14.2 ms, loops=405) Rows Removed by Filter: 43464`
  - `SubPlan 6 … (15.5 ms, loops=406) Rows Removed: 43362`
- owner: **37.5 ms**, `SubPlan 4 → Bitmap Heap Scan … BitmapOr(idx_sal_org_type_order_row_id, idx_sal_org_type_order_id, idx_station_activity_logs_shipment_id) loops=405, 0.008 ms each`.
- staff=4 variant: app_tenant 306.5 ms, owner 15.2 ms.
- Set-based rewrite feasibility (a MATERIALIZED SAL key CTE with hash joins, not a parity rewrite): 98 ms under app_tenant.

S3 EXPLAIN: 5.8 ms. `Index Only Scan using idx_sal_org_station_activity_created`, 1,385 buffers, 0 rows (not sargable on the date).

#### 2.2 work_assignments

| # | Shape (file:line) | WHERE / ORDER |
|---|---|---|
| W1 | `src/app/api/orders/queue-counts/route.ts:44-50` (staff EXISTS), `:69-77` (deadline LATERAL) | `entity_type='ORDER' AND entity_id=o.id AND status<>'CANCELED' [AND (assigned_packer_id=$ OR assigned_tech_id=$)] ORDER BY deadline_at LIMIT 1` |
| W2 | `src/app/api/orders/route.ts:293-357`: `wa_deadline_ranked` / `wa_t_ranked` / `wa_p_ranked` | whole-table `ROW_NUMBER() OVER (PARTITION BY entity_id …)` on `entity_type='ORDER' AND work_type IN(TEST\|PACK)`, then `LEFT JOIN … ON entity_id=o.id` |
| W3 | `src/lib/work-orders/queries.ts:64-90`; `src/lib/work-orders/queue-fetchers.ts:38-55,148-160,226-238`; `src/lib/orders/feed-membership-projection.ts:155-164` | per-parent LATERAL `entity_type=$ AND entity_id=parent.id AND work_type=$ [AND status IN …] ORDER BY CASE status…, updated_at DESC, id DESC LIMIT 1` |
| W4 | `src/app/api/assignments/next/route.ts:35-46` | `assigned_{tech\|packer}_id=$ AND work_type=$ AND status IN('ASSIGNED','IN_PROGRESS') AND org` |

EXPLAIN W1 (deadline LATERAL over all 4,974 orders):
- app_tenant: **912.6 ms**. `Index Scan using idx_work_assignments_entity … Index Cond: (entity_id = o.id)`, with `Filter: … entity_type='ORDER'::work_entity_type_enum AND status <> 'CANCELED'`, cost 435 per probe.
- owner: 19.3 ms, full Index Cond.

W2: see §2.8.

#### 2.3 ticket_links

| # | Shape (file:line) | WHERE |
|---|---|---|
| T1 | `src/lib/receiving/lines/sql-receiving-ticket.ts:4-39` LATERAL, used by `src/lib/receiving/lines/build-sql.ts:277,414,1426` (`/api/receiving-lines`, polled) | `tl.org=rl.org AND ((etype='RECEIVING_LINE' AND eid=rl.id) OR (etype='RECEIVING' AND eid=COALESCE(rl.receiving_id,r.id)) OR (r.shipment_id IS NOT NULL AND etype='SHIPMENT' AND eid=r.shipment_id)) ORDER BY CASE etype…, is_primary DESC, created_at DESC LIMIT 1` |
| T2 | `sql-receiving-ticket.ts:52-82` | same shape over cartons |
| T3 | `src/lib/photos/queries/library.ts:377-388,420-435` | OR arm containing `eid IN (SELECT id FROM receiving_line WHERE receiving_id=rc.id)` |
| T4 | `src/lib/support/tickets.ts:278-285` | 4-arm OR with nested `serial_unit_provenance` subselects |

EXPLAIN T1 (200 newest receiving lines):
- app_tenant: **23.6 ms**. `Seq Scan on ticket_links tl … loops=200 Rows Removed by Filter: 761` (whole table on every row).
- owner: 3.2 ms.
- This per-row seq scan is the source of the 185M `seq_scan` counter.

#### 2.4 photo_entity_links

| # | Shape (file:line) | WHERE |
|---|---|---|
| P1 | `sqlReceivingPhotoCount`, `src/lib/photos/queries/receiving-list.ts:180-192`, used at `build-sql.ts:242,410,1388,1596,1741` | `COUNT(DISTINCT p.id) … photos p JOIN l ON l.photo_id=p.id LEFT JOIN receiving_line rl_ph ON l.entity_type='RECEIVING_LINE' AND rl_ph.id=l.entity_id WHERE (l.etype='RECEIVING' AND l.eid=$rid) OR (l.etype='RECEIVING_LINE' AND rl_ph.receiving_id=$rid)`; the second arm is not index-probeable |
| P2 | `src/lib/photos/queries/library.ts:397-401,771-796` | 4 scalar subqueries per photo row: `l.photo_id=p.id AND l.etype=…` |
| P3 | `src/lib/neon/orders-queries.ts:398-403` | `etype='PACKER_LOG' AND eid=ANY($)` |

EXPLAIN P1 (200 lines): app_tenant 6.8 ms, 4,294 buffers; owner 5.2 ms.

#### 2.5 document_entity_links (+ documents)

| # | Shape (file:line) | WHERE |
|---|---|---|
| D1 | `PRINT_PACKET_INCOMPLETE_SQL` (`src/lib/orders/print-packet.ts`, rendered via tsx), used by queue-counts `paperworkSql` at `route.ts:109-118` | `NOT EXISTS (documents d WHERE d.org=o.org AND ((d.document_type='shipping_label' AND EXISTS(l …ORDER/o.id)) OR (d.entity_type='SHIPPING_LABEL' AND d.entity_id=o.id)))`, plus a doc COUNT via links (ORDER or SKU) |
| D2 | `src/lib/orders/caged-orders.ts:25-76`; `src/lib/orders/order-exceptions.ts:63-103` | same release-gate shapes |
| D3 | `src/lib/documents/outbound-documents.ts:136-146` | `d.org AND ((d.etype='ORDER' AND d.eid=$) OR l.id IS NOT NULL)` |

EXPLAIN D1 (unfiltered):
- app_tenant: **1,266 ms**; owner 1,283 ms. `SubPlan 3 → Index Scan using idx_documents_organization on documents (loops=4974) Rows Removed by Filter: 1013, Buffers 552,797`: every order scans all of the org's documents.
- **Rewrite** (two EXISTS arms: link→documents join, and documents `(org, entity_type, entity_id)`): **22.7 ms**, same count (400 = the live `paperworkIncomplete: 400`).

EXPLAIN D3: 0.6 ms.

#### 2.6 ops_events

| # | Shape (file:line) | WHERE |
|---|---|---|
| E1 | `src/lib/receiving/lines/build-sql.ts:300,478,1115`; `src/lib/receiving/unbox-scan-opened-sql.ts:18` | per carton: `org AND etype='receiving' AND eid=r.id AND event_type IN('TRACKING_SCANNED'\|'UNBOX_SCAN_OPENED'\|'UNBOX_CONFIRMED')`, MIN/MAX or EXISTS |
| E2 | `src/lib/orders/buyer-note-interlock.ts:43` | `+ payload->>'note_sha' = sha256(…)` |
| E3 | `src/lib/support/context.ts:158,213` | `lower(entity_type)=$`: an expression that can never use the index, and is non-leakproof |

EXPLAIN E1 (200 cartons): 1.25 ms under app_tenant (the text columns keep the full Index Cond). The 580M `idx_scan` counter comes from call frequency (per row × polled), not from per-probe cost.

#### 2.7 entity_search_docs / entity_search_outbox

| # | Shape (file:line) | WHERE / ORDER |
|---|---|---|
| X1 | `src/lib/search/hybrid-retrieval.ts:111-120` (`/api/global-search` keyword arm) | `org AND (lower(st)=q OR lower(st) LIKE 'q%' OR LIKE '%q%' OR q <% lower(st)) ORDER BY rank DESC, happened_at DESC LIMIT 30` |
| X2 | `hybrid-retrieval.ts:140-149` | vector `ORDER BY embedding <=> $ LIMIT 30` (hnsw idx_scan = 0) |
| X3 | `src/lib/search/search-outbox-worker.ts:297-311` | claim: `processed_at IS NULL AND claimed_at IS NULL AND attempts<5 ORDER BY id LIMIT 50 FOR UPDATE SKIP LOCKED`; stale recovery: `processed_at IS NULL AND claimed_at < now()-15m` |
| X4 | `search-outbox-worker.ts:463-485` | `embedding IS NULL AND updated_at < …` (no index) |

EXPLAIN X1:

| Query | app_tenant | owner | Plan |
|---|---|---|---|
| 'bose' | 50.5 ms | 51.1 ms | Seq Scan, 8,500 rows match |
| 'guitar hero' | 229 ms | 214 ms | Seq Scan |
| 'soundlink' | 214 ms | 207 ms | Seq Scan |
| `<%` arm alone | 190 ms | 188 ms | |
| `LIKE '%…%'` arm alone | 8.7 ms | 8.9 ms | |

- The trgm GIN is chosen by neither role at 12.5k rows (seq cost 780 vs GIN 646 + heap).
- With `enable_seqscan=off`, owner can use `Bitmap Index Scan on idx_entity_search_docs_search_trgm`. app_tenant only gets `idx_entity_search_docs_org_happened (organization_id)` with `lower(...) ~~` as a Filter.

X3: claim 0.66 ms (`idx_entity_search_outbox_pending`); stale recovery 0.98 ms `Seq Scan` (no partial index for `claimed_at IS NOT NULL`); notification_outbox claim 0.07 ms.

#### 2.8 /api/orders (the To-ship desk list), captured SQL

Captured by invoking the real handler under tsx with a query tap (throwaway; nothing was written to the repo). URL: `/api/orders?inWarehouse=true&listShape=queue&limit=200`. Main statement took **4,009 ms** in-app (route metric 5,074 ms MISS).

EXPLAIN (app_tenant): **6,893 ms**. Exclusive node time:

| Self ms | Node | Why |
|---|---|---|
| 1,498 (+959 Materialize) | Nested Loop, Join Filter `wa_deadline_ranked.entity_id = o.id`, **removed 22,671,286 rows** | CTE est. 252 rows (actual ~5k) under RLS, so nested loop instead of hash |
| 1,005 (+699) | Nested Loop, `wa_p_ranked.entity_id = o.id`, removed 15,374,877 | same |
| 225 (+151) | Nested Loop, `wa_t_ranked`, removed 3,403,854 | same |
| 1,254 | `Index Scan using idx_sku_stock_organization on sku_stock` loops=1791, Filter `sku = COALESCE(sc.sku, o.sku) AND NULLIF(btrim(location),'')…`, removed 2,988/loop | org-only index chosen although `sku_stock_org_sku_key (organization_id, sku)` exists (misestimate; outside the 20 families) |
| 497 | `idx_station_activity_logs_organization` loops=37, removed 42,085/loop | S1 under RLS |
| 98 | Nested Loop `rr_ranked.order_id = o.id`, removed 1,256,915 | window CTE, same pattern |

Owner: **436 ms** for the same SQL and params. Hash joins, `sku_stock` absent from the top nodes.

#### 2.9 Smaller families (all fast at current volume; shape risks only)

| Family | Hottest shape (file:line) | EXPLAIN (app_tenant) | Note |
|---|---|---|---|
| feed_memberships + staff_rail_exclusions | `src/lib/assistant/tools/read-tools.ts:219-240`: `org AND feed_key=$ AND state<>'done' ORDER BY occurred_at DESC LIMIT` anti-join exclusions | 2.06 ms, `Seq Scan on feed_memberships` (1,984 rows) | `state<>'done'` defeats `(org,feed,state,occurred_at)` (idx_scan=2). Exclusions: `src/lib/receiving/rail-exclusions.ts:147-151`, polled every 15 s (`src/components/sidebar/receiving/useRailExclusions.ts`) |
| entity_signals | `src/lib/surfaces/entity-signals-read.ts:64` (`/api/entity-signals`): `org AND occurred_at >= now()-7d ORDER BY occurred_at DESC, id DESC LIMIT 200`; also `read-tools.ts:71,110,422`, `src/lib/operations/signal-rollup.ts:39` | 4.38 ms, `Seq Scan on entity_signals`, 739 buffers | no `(org, occurred_at)` index |
| staff_inbox_items (+subscriptions) | `src/lib/notifications/inbox.ts:63,88` (`/api/inbox`, polled) `ORDER BY last_event_at DESC` | 0.15 ms Seq Scan (21 rows) | feed index keys on `occurred_at`, the query sorts on `last_event_at` |
| entity_threads | `src/lib/threads/threads.ts:100-103` natural-key lookup | 5.3 ms (owner 0.13 ms); `ux_entity_threads_natural` full Index Cond under both | single-row; the difference looks like first-touch noise [INFERENCE] |
| thread_links / entity_notes | `src/lib/threads/thread-links.ts:50-53`; `src/lib/repositories/salesOrderRepository.ts:92-97` (write-only) | 0 rows | entity_notes.entity_id is **uuid**, unlike every other family (bigint) |
| pack_verification_events | `src/lib/packing/pack-review-queue.ts:44-50` (`DISTINCT ON (entity_id)` over the whole org); `src/lib/neon/packer-logs-hydrate.ts:127-133` | 0 rows | the review-queue CTE scans all PACKER_LOG rows before filtering on outcome |
| shortage_inbound_links | `src/app/api/orders/route.ts:257-270` (per-order scalar); `src/lib/orders/desk-view-sql.ts:18-29` | 0 rows | `link_status<>'released'` filter; fine |
| notification_outbox | `src/lib/notifications/fanout-worker.ts:104` claim | 0.07 ms | ok |
| staff_subscriptions | `src/lib/receiving/watched-arrival.ts:82`; `fanout-worker.ts:350` | 3 rows | ok |
| agent_mutation_affects | write-only | 0 rows | nothing to do |

### 3. Known slow / wrong paths

#### 3.1 `/api/orders/queue-counts`: unfiltered is the ~14 s path; `?staff=` is ~1–2 s

- **Handler:** `src/app/api/orders/queue-counts/route.ts:12-196`. Three `tenantQuery`s run in `Promise.all` (`:122-126`), then `countOpenPlacementsByLocation` runs serially (`:147`). Upstash cache TTL 60 s (`:169`).
- **Authed curl (MISS):**

  | Request | Time |
  |---|---|
  | no `staff` | **13.80 s** (route metric 13,276 ms) |
  | `staff=4` | 2.09 s |
  | `staff=5` | 1.75 s |
  | `staff=2` | 1.18 s |
  | `staff=6` | 1.38 s |
  | `staff=3` | 1.26 s |
  | `staff=7` | 1.21 s |
  | `staff=1` | 1.16 s |

- **Stampede:** the lane journal shows two concurrent MISSes of **27,543 ms and 27,652 ms**. There is no single-flight, so concurrent cold requests each run the 12 s query.
- **SQL cost (app_tenant):** main 12,209 ms (S1 under RLS, §2.1), paperwork 1,266 ms (D1, §2.5). With staff filter: 306 ms and 441 ms. Owner equivalents: 37.5 ms and 1,283 ms.
- **Fix:**
  - S1: typed columns (P1 in §4) → main ≈ owner plan ~40 ms [INFERENCE from the owner plan].
  - D1: rewrite → 23 ms (measured).
  - Expected MISS ≈ 0.1–0.2 s plus dev overhead.

#### 3.2 `/api/orders` Upstash cache key omits `limit` and `cursor`: CONFIRMED

- **Key builder:** `src/app/api/orders/route.ts:201-240` (`createCacheLookupKey({...})`). `pageLimit` (`:187-188`) and `cursor` (`:190-199`) are parsed but not in the key.
- **Read / write:** `getCachedJson('api:orders', …)` at `:244-253`, `setCachedJson(…, 300, ['orders'])` at `:1246-1247`.
- **Curl proof** (fresh key via `stallHours=73`):

  | Request | Cache | Rows returned |
  |---|---|---|
  | `limit=30` | MISS (3.72 s) | 30 |
  | `limit=3` | HIT (0.49 s) | **30** |
  | `limit=3&cursor=…` | HIT | **30**, same `nextCursor` |

- Paging is broken for 300 s after any first page.

#### 3.3 Triage 38 vs queue-counts 406: a label requirement in one predicate but not the other

- **Triage:** `src/lib/orders/desk-counts.ts:14-22` uses `sqlOrderInWarehouseToShip` (`src/lib/orders/desk-view-sql.ts:63+`). That predicate **requires `o.shipment_id IS NOT NULL AND COALESCE(TRIM(stn.tracking_number_raw),'')<>''`** (rendered).
- **Queue-counts:** `route.ts:78-89` mirrors `fulfillmentScope`, which dropped the label pair on 2026-08-30 (comment `:79-86`).
- **Live split** (same base predicate, app_tenant):

  | Bucket | Orders |
  |---|---|
  | queue scope | **406** |
  | with label | **38** |
  | no shipment | 367 |
  | blank tracking | 1 |

- `/api/orders/desk-counts` returns `triage: 38`.
- **The desk list uses the triage scope, not the counts scope.** The client fetch sets `inWarehouse=true` (`src/lib/dashboard-table-data.ts:149`); the SSR seed does the same (`src/lib/queries/unshipped-queue-seed.server.ts:56-58`), and `/api/orders` applies the label pair (`route.ts:907-910`). The To-ship KPI band (406, seeded from queue-counts, `unshipped-queue-seed.server.ts:81-86`) is therefore labelling a 38-row list, even though the `queue-counts` comment says the scope "MUST mirror" the list.

#### 3.4 First-paint HTML on `/shipping/orders` has no queue row

- Authed curl of `/shipping/orders`: 200, 1.83 s, 329,655 B. Both `data-paint-surface="orders:primary"` blocks render `aria-busy="true"` (the empty stand-in), with 0 `BIN </span>` row markers.
- **Server-side seed exists:** `src/app/shipping/(desk)/orders/page.tsx:19` calls `seedUnshippedQueue`, which calls `serverSelfFetch('/api/orders?inWarehouse=true&listShape=queue&limit=200')` (`unshipped-queue-seed.server.ts:55-78`).
- **Root cause:** `serverSelfFetch` resolves its origin from `APP_URL || NEXT_PUBLIC_APP_URL` before the Host header (`src/lib/observability/server-self-fetch.ts:13-18`, `src/lib/env-utils.ts:10-19`).
  - Next's env loader in this worktree resolves `NEXT_PUBLIC_APP_URL=https://usav-dev.michaelgarisek.com`. Ran `@next/env loadEnvConfig`; the empty `.env.local:102` value does not override `.env:93`.
  - So the seed fetch leaves the lane. That host returns **401 `UNAUTHENTICATED`** for the lane's `cf_sid__…` cookie (curl, 0.24 s).
  - `fetchUnshippedRows` treats 401/403 as a silent soft-miss and returns `null` without logging (`unshipped-queue-seed.server.ts:67-75`). Rows stay `[]` and the client fetches after hydration.
  - Corroboration: the lane journal for this page load shows `GET /shipping/orders 200 in 1829ms` with **no** matching `GET /api/orders?inWarehouse…` self-fetch on :3050.
- **Secondary issue even when the seed works:** the seed pays a full HTTP hop plus the uncached `/api/orders` main query (4–5 s MISS, §2.8) before first byte, and it is the same 38-row inWarehouse list (§3.3).
- **Fix direction:**
  - Resolve the self-fetch origin from the request Host first (or call the orders domain function in-process instead of HTTP).
  - Log soft-misses.
  - Fix §2.8 so the seed is affordable.

### 4. Ranked index / read-model plan

DDL sketches only; nothing was applied. "Win" means measured unless marked [INFERENCE].

| Rank | Change | DDL sketch | Query → expected win |
|---|---|---|---|
| **1** | SAL order-grain facts as **typed stored columns** (leakproof under RLS), then rewrite `order-grain-sql.ts` S1 to `sal.order_row_id = o.id OR sal.ext_order_id = o.order_id OR (sal.shipment_id = o.shipment_id AND sal.order_row_id IS NULL AND …)` | `ALTER TABLE station_activity_logs ADD COLUMN order_row_id int GENERATED ALWAYS AS (CASE WHEN metadata->>'order_row_id' ~ '^[0-9]+$' THEN (metadata->>'order_row_id')::int END) STORED, ADD COLUMN ext_order_id text GENERATED ALWAYS AS (metadata->>'order_id') STORED;`<br>`CREATE INDEX CONCURRENTLY idx_sal_org_type_row ON station_activity_logs (organization_id, activity_type, order_row_id) WHERE order_row_id IS NOT NULL;`<br>`CREATE INDEX CONCURRENTLY idx_sal_org_type_extorder ON station_activity_logs (organization_id, activity_type, ext_order_id) WHERE ext_order_id IS NOT NULL;`<br>then drop the two jsonb expression indexes (2026-08-21e) | queue-counts main **12.2 s → ~40 ms**; `/api/orders` S1 nodes −0.5 s; desk-counts triage (697 ms in-app) ↓ [INFERENCE: owner plan with the same index shape = 37.5 ms]. Table is 43.7k rows / 26 MB, so the rewrite is cheap |
| **2** | **work_assignments: enum → text + CHECK** for `entity_type`, `work_type`, `status` (restores stats and Index Cond under RLS); add an org-led per-entity index | `ALTER TABLE work_assignments ALTER COLUMN entity_type TYPE text USING entity_type::text, … ADD CONSTRAINT wa_entity_type_chk CHECK (entity_type IN (…));` (same for work_type, status; rebuild the partial indexes whose predicates name enum literals)<br>`CREATE INDEX CONCURRENTLY idx_wa_org_entity ON work_assignments (organization_id, entity_type, entity_id, work_type) INCLUDE (status, deadline_at, assigned_tech_id, assigned_packer_id, updated_at);` | `/api/orders` main **6.9 s → ~0.45 s** (owner plan measured 436 ms); W1 lateral 913 → ~19 ms. Also rewrite the W2 window CTEs to per-order `LATERAL … LIMIT 1` so a misestimate cannot pick a nested loop over whole-table CTEs |
| **3** | queue-counts **paperwork rewrite** (no index needed) + legacy-label index | Split `PRINT_PACKET_INCOMPLETE_SQL`'s OR into two EXISTS arms (link→documents, and direct `documents(entity_type,entity_id)`)<br>`CREATE INDEX CONCURRENTLY idx_documents_org_entity ON documents (organization_id, entity_type, entity_id);` (the existing `idx_documents_entity` is not org-led) | paperwork **1,266 ms → 22.7 ms** (measured, count parity 400) |
| **4** | Fix the `/api/orders` cache key | add `limit: pageLimit ?? ''`, `cursor: cursorRaw ?? ''` to `route.ts:201-240` | correctness (limit=3 returns 3; cursor pages advance) |
| **5** | queue-counts **single-flight** + serve stale | Upstash lock / SWR around `route.ts:33-38,169` | removes the 2×27.5 s concurrent MISS stampede (journal) |
| **6** | ticket_links LATERAL → 3 index probes | Rewrite T1 as `COALESCE((…RECEIVING_LINE… LIMIT 1),(…RECEIVING… LIMIT 1),(…SHIPMENT… LIMIT 1))` or a `UNION ALL … ORDER BY tier LIMIT 1`<br>`CREATE INDEX CONCURRENTLY idx_ticket_links_org_entity_rank ON ticket_links (organization_id, entity_type, entity_id, is_primary DESC, created_at DESC) INCLUDE (support_ticket_id, zendesk_ticket_id);` | T1 23.6 → ~3 ms per 200 rows [INFERENCE: owner 3.2 ms]; kills the 185M seq_scan source |
| **7** | `sku_stock` per-order lookup (outside the 20 families, surfaced by §2.8) | `sku_stock_org_sku_key (organization_id, sku)` already exists; the planner picked the org-only index under RLS misestimate. Move the `NULLIF(btrim(location),'')` test out of the join qual, or pre-aggregate the home bin per SKU | −1.25 s on `/api/orders` under RLS [INFERENCE] |
| **8** | Search under RLS | trgm/LIKE operators are non-leakproof, so no index is possible under app_tenant. Options: `SECURITY DEFINER` search function with an explicit `organization_id = $1` (owner-planned, GIN usable), or owner pool for this read. Also drop the `<%` arm from the default ladder or gate it | keyword search 207–229 ms → ~9 ms without the `<%` arm (measured arm split) |
| **9** | photo count read-model | `receiving_photo_counts(organization_id, receiving_id, n)` maintained by trigger on photo_entity_links, or rewrite P1 as two index probes (RECEIVING arm + `receiving_line` join) | P1 6.8 ms / 200 rows now; removes 35M seq scans at scale |
| **10** | entity_signals timeline | `CREATE INDEX CONCURRENTLY idx_entity_signals_org_time ON entity_signals (organization_id, occurred_at DESC, id DESC);` | 4.4 ms seq → <1 ms; scales with the 16k→N growth |
| **11** | feed_memberships open-rail | `CREATE INDEX CONCURRENTLY idx_feed_memberships_open ON feed_memberships (organization_id, feed_key, occurred_at DESC, id DESC) WHERE state <> 'done';` then drop the unused `idx_feed_memberships_org_feed_state_time` (idx_scan=2) | 2 ms → sub-ms; matches `read-tools.ts:230-240` exactly |
| **12** | ops_events per-carton facts | `CREATE INDEX CONCURRENTLY idx_ops_events_org_entity_type_time ON ops_events (organization_id, entity_type, entity_id, event_type, occurred_at DESC);` plus remove `lower(entity_type)` in `src/lib/support/context.ts:158,213` | E1 already 1.25 ms / 200; turns MIN/MAX into index-only first/last |
| **13** | shippedToday sargable | Replace `timezone(…)::date = …` (`queue-counts/route.ts:105-106`) with the range form already used in `desk-counts.ts:37-53` | 5.8 ms → index range |
| **14** | Outbox hygiene | `CREATE INDEX CONCURRENTLY idx_entity_search_outbox_stale_claim ON entity_search_outbox (claimed_at) WHERE processed_at IS NULL AND claimed_at IS NOT NULL;` · `CREATE INDEX CONCURRENTLY idx_entity_search_docs_null_embedding ON entity_search_docs (organization_id, updated_at) WHERE embedding IS NULL;` | sub-ms cron seq scans removed |
| **15** | staff_inbox_items feed order | `CREATE INDEX CONCURRENTLY idx_staff_inbox_items_feed_last ON staff_inbox_items (organization_id, staff_id, last_event_at DESC, id DESC) WHERE state IN ('unread','read','snoozed');` | negligible now (21 rows); correctness of the ordering index |
| drop | Unused / redundant | `idx_work_assignments_assignee_status` (0 scans, 744 kB), `idx_station_activity_logs_scan_ref_key18` (0, 952 kB, unusable under RLS anyway), `idx_notification_outbox_processed` (0, 392 kB), `idx_entity_notes_lookup` (0) | write amplification ↓ |

Governance: the hand-written migrations under `src/lib/migrations/` own these indexes, not `schema.ts` (46 live-only indexes). New DDL goes there, following the `db-migration-author` skill.

#### Open questions / risks

- **Is prod on app_tenant?** `.env:226-227` labels app_tenant a "local enforcement test 2026-06-20", but `tenantQuery` uses it whenever the DSN resolves to the same compute (`src/lib/tenancy/db.ts:8-14`). If Vercel prod still uses the owner role, prod timings resemble the owner column. The lane (:3050) uses app_tenant. [INFERENCE: prod env not inspected]
- **Enum → text migration (plan item 2):** it touches every writer of work_assignments and every partial index predicate with enum literals (`ux_work_assignments_active_entity`, `idx_wa_*_active`). Needs a full caller sweep. An alternative that keeps the enums: lead every index with `(organization_id, entity_id)` and accept default selectivity estimates, but the misestimate-driven nested loops in §2.8 stay possible.
- **Search under RLS (item 8):** a `SECURITY DEFINER` function is a policy decision (it bypasses the RLS canary for that read). Needs operator/security sign-off.
- **Generated columns on station_activity_logs:** a `metadata->>'order_row_id'` holding a value past int range would make the INSERT fail. The existing expression index already carries the same cast risk. Consider `bigint`.
- **Pipeline scope:** queue-counts (406) and the To-ship list (38) differ by design choice. Phase 2 nav facets must pick one scope per count; do not ship both numbers against one list (§3.3).
- **The self-fetch origin bug (§3.4) affects every `serverSelfFetch` caller**, not just this page. The ready-to-pack seed is one example (`src/lib/queries/ready-to-pack-shell-seed.server.ts:61`).
- **Endpoint timings include `next dev` overhead** (~0.3–1 s); DB timings are the EXPLAIN numbers. `pg_stat_statements` is not installed (extensions: plpgsql, pgcrypto, pg_trgm, btree_gist, vector, pg_session_jwt), so frequencies are inferred from counters plus callers, not per-statement stats.
- **Stats freshness:** `last_autoanalyze` for ops_events is 2026-09-10; ticket_links 2026-09-16; several tables (`entity_notes`, `thread_links`, `staff_subscriptions`, `pack_verification_events`) have never been analyzed. Re-check plans after `ANALYZE` once rows land.
- **Two small asides:** `entity_threads` natural lookup took 5.3 ms under RLS vs 0.13 ms as owner on one sample, which looks like noise but is unconfirmed. `entity_notes.entity_id` is uuid, the only non-bigint polymorphic id, which breaks a uniform `(entity_type, entity_id bigint)` read model.

## Brand / manufacturer data audit


Repo `/home/michaelgarisek/Projects/cycleforge-lanes/prod`, live DB from `.env` DATABASE_URL (role `neondb_owner`, `rolbypassrls=t`, so the counts below are unscoped; org filters were written explicitly). Read-only SELECTs only. Probe SQL lives in the BrandAudit eval kernel (`COV` CTE); its shape is described under "Coverage method".

### Verdict (TL;DR)

- **No structured brand exists anywhere today.** Zoho brand/manufacturer: 0%. Listing-payload brand: 0%. Bose model tables: 0 rows.
- **The only real signal is the leading token of the identity title.** On the operative "active" set (is_active, USAV, non-fixture, n=266) a deterministic alias rule brands **89.8%** (239). Adding untrusted listing titles lifts that to 91.4%. On all non-fixture SKUs the rule brands 84.9% (1247/1468).
- The catalog is about 78% Bose (1145/1468 non-fixture). The long tail is 25 brands with ≤12 SKUs each.

### Sources table

| # | Source | Where (file:line) | Column / JSON path | Live state | Usable? |
|---|---|---|---|---|---|
| 1 | Zoho item native `brand`, `manufacturer` | Not in type `src/lib/zoho/types.ts:18-59` (ZohoItem has no brand/manufacturer). Mapper drops it: `src/services/InventorySyncService.ts:30-59`. Upsert: `src/lib/repositories/itemRepository.ts:~100-126`. Drizzle `items`: `src/lib/drizzle/schema.ts:642` | No `items.brand` / `items.manufacturer` column (information_schema: only `custom_fields` matches `brand\|manufact`) | Zoho Inventory API returns `brand` and `manufacturer` as native string fields on the item object (https://www.zoho.com/inventory/api/v1/items/). Nobody captures them. | **0%.** Needs a column plus mapper, then `fullSync` (`InventorySyncService.ts:91`, `filter_by: 'Status.All'`). Whether USAV actually fills brand in Zoho is **unknown**. |
| 2 | Zoho item `custom_fields` | Mapper `InventorySyncService.ts:56` wraps it as `{values:[…]}`. Column in `0000_baseline…sql:2799` | `items.custom_fields` jsonb | 2089/2089 rows = `{}` (SELECT `custom_fields='{}'`). Zero keys. | 0% |
| 3 | Zoho mirrors (raw JSON) | n/a | `zoho_po_mirror.raw` (4614), `inbound_purchase_order_mirror.raw_payload` (389), `zoho_fulfillment_sync.raw` (679), `zoho_webhook_events.raw_payload` (0 rows) | 0 rows contain a `"brand"` or `"manufacturer"` key | 0% |
| 4 | `sku_catalog.product_title` / Zoho `items.name` (identity title) | Law: `src/lib/sku/sku-identity-law.ts:27-33` (order), `:70-76` (`resolveSkuIdentityTitle`), `:11-13` (`ZOHO_ITEM_TITLE_SQL`) | Leading 1–2 tokens of `COALESCE(items.name [sku+org, status='active'], sc.product_title)` | 1684 rows. 66.4% have an active Zoho twin. | **Primary source.** See coverage. |
| 5 | `sku_catalog.category` | `sku_catalog.category`. Index `idx_sku_catalog_category` | text | 1596/1684 NULL. The other 88 are `E2E…` fixture values. | Useless |
| 6 | Listing payloads | `platform_listings.platform_metadata` jsonb (Ecwid only, 1557 rows). No adapter extracts brand: grep `(?i)brand\|manufacturer` over `src/lib/{amazon,ebay,ecwid,zoho,integrations}` finds only the word "brand-new" (`integrations/connectors/shopify.ts:11`, `square.ts:10`). No eBay aspects/ItemSpecifics code (grep `aspects\|ItemSpecifics\|NameValueList` shows no listing hits). | `platform_metadata` | 1557/1557 = `{}`. No eBay/Amazon payload table exists. | **0% structured** |
| 7 | Listing titles (text, not payload) | `sku_platform_ids.listing_title` / `display_name` | Leading token | 6090 ebay/amazon/ecwid rows, but **only 278 have `sku_catalog_id`** and only 48 match by sku string. All 6 title-vs-listing conflicts are Ecwid mispairs (`00033` Panasonic ↔ ecwid platform_sku `33` "Bose Wave … remote"; `00054` Rock Band ↔ `54`/`00812` "OEM BOSE JEWEL CUBE CABLE"; `00095` Guitar Hero ↔ `95` "Bose CineMate GS…"). Leading-zero-stripped SKU pairing. | Review-queue only, never auto |
| 8 | Receiving line titles | Table `receiving_line` (RLS on); `receiving_lines` is a **view** (relkind `v`). Title ladder via `SKU_CATALOG_JOIN_ON_SQL` in `src/lib/receiving/lines/build-sql.ts:314,430,1432` | `receiving_line.item_name` (3379/3379 non-empty; 358 have no sku) | USAV 2760 lines: 77.0% brand via their SKU, 82.5% via item_name token, **89.8% union**. 1 disagreement. 220 of 357 SKU-less lines can be branded by name only. | Derive via SKU. Use item_name only for SKU-less lines, at read time for identify, never persisted as SKU brand |
| 9 | Bose models (`BoseModelsSidebarPanel`) | Panel `src/components/admin/sourcing/BoseModelsSidebarPanel.tsx:25-37` → `GET /api/bose-models` (`src/app/api/bose-models/route.ts:21-24`) → `src/lib/neon/bose-model-queries.ts:56-71`. Schema `src/lib/migrations/2026-06-06e_bose_models_compatibility.sql:21-34` (`family`, `product_type`). Per-org unique `2026-06-19_bose_models_per_org_unique.sql:7-41`. Brand-neutral façade `src/app/api/product-models/lookup/route.ts:5-28` | `bose_models.family/model_name/model_number`, `bose_serial_prefixes`, `part_compatibility` | **0 rows in all three tables.** `bose_models` RLS enabled but not forced (`relforcerowsecurity=f`) and `organization_id` nullable. | 0% today. The schema implies brand=Bose. Future `product_line` source. |
| 10 | Bose manuals | Writers: `src/lib/product-manuals.ts:206`, `src/lib/neon/product-manuals-queries.ts:371`, `src/lib/manuals/order-manuals.ts:354`, `src/app/api/manuals/upsert/route.ts:96` | `product_manuals.folder_path` (Drive taxonomy, e.g. `Systems/Surround/Lifestyle/…`, `Systems/SoundTouch/…`, `…Cinemate…`, `AM Systems (ACOUSTIMASS)`) | 515 rows, one org. Only ~12 linked to `sku_catalog_id`. 498 unassigned. | Vocabulary seed for Bose product_line aliases. Not a SKU brand source. |
| 11 | Parent SKU inheritance | SKU grammar `NNNNN-P-n[-COLOR][-N/U]`, `NNNNN-BK` (observed rows: `00041-P-1`, `00133-BK`, `00316-BK-U`) | `split_part(sku,'-',1)` → parent `product_title` | Adds only 2 SKUs that have no own-title brand, because parts repeat the parent title prefix ("Bose Wave FM Antenna - FM Antenna"). | Tie-break and confirmation only |
| 12 | Existing "brand" search option (dead) | `src/lib/inventory-search.ts:23,99` declares SKU search field `brand` ("Filters SKUs by brand prefix"). `src/hooks/useInventorySearch.ts:294` calls `fetchSkus({ q, signal })` and **ignores `field`**. | n/a | UI option exists, no backend | Wire to `brand_id` in Phase 1 or delete |

### Definition of "active SKU" (from code)

| Evidence | file:line |
|---|---|
| Partial index `idx_sku_catalog_active … WHERE is_active = true` | `src/lib/migrations/2026-04-07_create_sku_catalog_hub.sql:35-36` |
| Default catalog search filter `['sc.is_active = true']` | `src/app/api/sku-catalog/search/route.ts:325` |
| `/api/sku` list `WHERE sc.is_active = true AND sc.organization_id = $1` | `src/app/api/sku/route.ts:81-82` |
| Sourcing scan `WHERE sc.is_active = true AND sc.organization_id = $1` | `src/lib/jobs/sourcing-scan.ts:19-20` |
| **Meaning:** `is_active=false` is set for any SKU missing from the current Ecwid feed | `src/app/api/sku-catalog/sync-ecwid-titles/route.ts:92-103` |
| Code comment: "~85% of sku_catalog is is_active=false (inactive Zoho items that are still valid pairing targets)" | `src/app/api/sku-catalog/pairing-queue/route.ts:87-88` |

`lifecycle_status` is `active` on all 1684 rows, so it does not discriminate. The operative set is therefore `is_active = true`, excluding test fixtures. The fixture predicate is: org ≠ USAV, or sku ~ `^(E2E|AUDITSKU|QA-|DUPSKU|CF-|SKU-E2E|TMP-QA)`, or title ~ `^(e2e|qa |audit test|dup probe|r2$|probe|verify)`. Also reported: the "Zoho-active twin" set (items.status='active' by sku+org), which is the Zoho-governs population.

### Coverage (live, 2026-09-26)

Method: identity title = `COALESCE(active Zoho items.name by sku+org, sc.product_title, sku)`. Normalise by lower-casing and stripping `[^a-z0-9&+ -]`. Match token 1, or tokens 1+2, against the seed alias table below (longest match wins). The full-catalog query ran in ~1.2 s.

| Population | n | (a) Zoho brand/mfr | (b) title token, brand+franchise | (b′) + Bose product-line aliases | (c) listing payload brand | (c′) listing *title* token (untrusted) | parent-SKU | **Union (b′ ∪ parent) = auto-apply** | Union incl. (c′) |
|---|---|---|---|---|---|---|---|---|---|
| A all rows | 1684 | 0% | 72.0% | 73.9% | 0% | 8.3% | 42.9% | 74.0% | 74.3% |
| B `is_active` (all orgs) | 295 | 0% | 81.0% | 81.0% | 0% | 29.5% | 16.3% | 81.0% | 82.4% |
| **C `is_active`, USAV, non-fixture** | **266** | **0%** | **89.8%** | **89.8%** | **0%** | 32.7% | 18.0% | **89.8%** | **91.4%** |
| D Zoho-active twin (USAV, non-fixture) | 1117 | 0% | 93.6% | 94.0% | 0% | 11.3% | 59.4% | 94.4% | 94.5% |
| E all non-fixture | 1468 | 0% | 82.6% | 84.8% | 0% | 9.5% | 49.2% | 84.9% | 85.2% |

Remainder breakdown:

| Population | title strict | product-line only | parent only | listing only | "for <Brand>" compat only | unbranded |
|---|---|---|---|---|---|---|
| C active non-fixture (266) | 239 | 0 | 0 | 4 | 14 | 23 (+4 listing-only = 27 without listing) |
| E all non-fixture (1468) | 1213 | 32 | 2 | 4 | 17 | 217 |

Brand distribution (auto-apply rule), active-nf / all-nf: Bose 221/1145 · Guitar Hero 5/12 · Rock Band 4/10 · Panasonic 1/11 · Harman Kardon 1/10 · JBL 0/10 · Polk Audio 0/9 · Logitech 0/7 · Apple, Sony, Dura Micro 0/4 · 2 each: EOSONE, Hypershell, Klipsch, Incipio, Realistic, Infinity, Poly (1/2) · 1 each: Motorola, Samsung, HiFind, Definitive Technology, HQRP, NETUM, Plantronics · none 27/221.

The unbranded active SKUs (C, 23) are mostly **compatibility titles**: "Replacement CD drive **for Bose** Wave…", "USAV Bluetooth Adapter **for Bose** Wave…", "Plastic wall mount bracket **for Bose** 161…" (14 of them). The rest are generic accessories: "Set of 5 - 16 Gauge…", "FIFA 20", "The Beatles Rock Band" (a leading "the" defeats the match), and `STAT-00050` ESD bags.

### Top 50 leading tokens (identity title, all 1684 rows)

| token | n | active | fixture | → seed mapping |
|---|---|---|---|---|
| bose | 1109 | 220 | 0 | Bose (brand) |
| e2e | 88 | 1 | 88 | fixture |
| unidentified | 87 | 3 | 87 | placeholder, skip |
| guitar | 14 | 5 | 0 | only `guitar hero` → Guitar Hero (not "Guitar Strap") |
| qa | 13 | 10 | 13 | fixture |
| wave | 13 | 0 | 0 | Bose / product_line Wave |
| panasonic | 11 | 1 | 0 | Panasonic |
| bluetooth | 10 | 4 | 0 | generic (stop) |
| harman | 10 | 1 | 0 | `harman kardon` → Harman Kardon |
| jbl | 10 | 0 | 0 | JBL |
| oem | 9 | 0 | 0 | prefix stop-word; `oem bose` → Bose |
| polk | 9 | 0 | 0 | Polk Audio |
| rock | 9 | 4 | 0 | only `rock band` → Rock Band |
| audit | 8 | 8 | 8 | fixture |
| logitech | 7 | 0 | 0 | Logitech |
| sounddock | 7 | 0 | 0 | Bose / SoundDock |
| xbox | 7 | 1 | 0 | platform (Microsoft); do not auto-brand (the "xbox 360" bigram is 7 accessories) |
| rc | 6 | 0 | 0 | ambiguous (Bose remote shorthand); queue |
| soundtouch | 6 | 0 | 0 | Bose / SoundTouch |
| dup | 5 | 1 | 5 | fixture |
| replacement | 5 | 5 | 0 | stop-word (usually "for <Brand>" compat) |
| usav | 5 | 4 | 0 | **house brand** USAV; operator decision |
| apple | 4 | 0 | 0 | Apple |
| dura | 4 | 0 | 0 | `dura micro` → Dura Micro |
| line | 4 | 4 | 4 | fixture |
| optical | 4 | 0 | 0 | generic |
| plastic | 4 | 2 | 0 | generic (compat) |
| r2 | 4 | 0 | 4 | fixture |
| sl | 4 | 0 | 0 | Bose SoundLink shorthand; queue |
| sony | 4 | 0 | 0 | Sony |
| wireless | 4 | 0 | 0 | generic |
| wms | 4 | 0 | 0 | unknown; queue |
| 9 | 3 | 0 | 0 | numeric |
| a-569 | 3 | 0 | 0 | grill-cloth part no.; none |
| hdmi | 3 | 0 | 0 | generic |
| power | 3 | 0 | 0 | generic |
| ps3-2-1 | 3 | 0 | 0 | Bose / PS3-2-1 |
| sound | 3 | 0 | 0 | generic |
| verify | 3 | 0 | 3 | fixture |
| wii | 3 | 0 | 0 | platform (Nintendo); don't auto-brand |
| 35 / 35mm | 2 / 2 | 0 | 0 | "3.5mm" generic |
| ac | 2 | 0 | 0 | generic |
| acoustic | 2 | 0 | 0 | generic |
| av | 2 | 0 | 0 | generic |
| backlit | 2 | 0 | 0 | generic |
| cable | 2 | 1 | 0 | generic |
| cinemate | 2 | 0 | 0 | Bose / CineMate |
| control | 2 | 1 | 0 | generic |
| (blank) | 5 | 0 | 0 | empty title |

Bigram leaders (non-fixture), useful as **Bose product_line** aliases: bose wave 170 · bose lifestyle 164 · bose acoustimass 93 · bose 321 58 · bose cinemate 57 · bose soundtouch 48 · bose sounddock 46 · bose 151 35 · bose soundlink 31 · bose companion 30 · bose jewel 26 · bose surround 22 · bose solo 21 · bose smart 17 · bose 251 14 · guitar hero 12 · bose ub-20 11 · harman kardon 10 · polk audio 9 · rock band 9 · xbox 360 7 · wave radio 6 · bose av3-2-1 6.

Listing-title leading tokens (ebay/amazon/ecwid, 6090 rows) add alias candidates not present in catalog titles: **boser** 20 (misspelling → Bose), **sonos** 20, **yamaha** 18, **genuine** 178 (prefix stop-word), replacement 1177 / new 57 / pair 29 / set 72 / metal 65 / steel 21 / ribbon 19 / complete 17 (stop-words), sony 33, jbl 30, panasonic 26, logitech 26, xbox 33, wii 27.

Receiving `item_name` leading tokens (USAV, 2760) add stop-words: return 109, vintage 25, genuine 24, new 20, lot 13, tested 8, untested 5, read 6, for 6, 2x 5, pair 9. Brand candidates: harfington 5, hpdelgb 4, gearit 4, universal 4.

### Alias seed candidates (for Phase 1 `product_brand_aliases`, `source='seed'`)

| Brand (kind) | Aliases (normalized) |
|---|---|
| Bose (brand) | bose, bose corp, boser, genuine bose, oem bose |
| ↳ Wave (product_line, parent Bose) | wave, wave radio, wave music system |
| ↳ SoundDock / SoundTouch / SoundLink | sounddock, soundtouch, soundlink, sl (queue-only: ambiguous) |
| ↳ Lifestyle / Acoustimass / CineMate / Companion / QuietComfort / Solo / Jewel / 3-2-1 | lifestyle, acoustimass, am, cinemate, companion, quietcomfort, qc, solo, jewel, ps3-2-1, av3-2-1, 321 (bigram only after bose) |
| Rock Band (franchise; publisher Harmonix/MadCatz) | rock band, the beatles rock band |
| Guitar Hero (franchise; Activision/RedOctane) | guitar hero |
| Sony, JBL, Panasonic, Logitech, Apple, Klipsch, Infinity, Samsung, Motorola, Sonos, Yamaha, Anker (brand) | self |
| Harman Kardon / Polk Audio / Definitive Technology / Dura Micro | harman kardon, harman; polk, polk audio; definitive technology; dura micro |
| Plantronics / Poly | plantronics, poly (consider Poly as parent of Plantronics) |
| USAV (house brand, operator decision) | usav |

Stop-words to strip **before** matching: `the, genuine, oem, original, new, used, vintage, replacement, lot, lot of, set of, pair, 2x, tested, untested, return, read`. Exception: `genuine bose` / `oem bose` should resolve through the brand after stripping.

**Never brand from a mention after `for|fits|compatible with`.** Such a mention is a compatibility target (`compat_brand`), not the brand. There are 24 such titles in non-fixture SKUs, and 6 of them already carry a different leading brand (e.g. "USAV … for Bose").

### How brand must ride `resolveSkuIdentityTitle` / `SKU_CATALOG_JOIN_ON_SQL`

| Fact | file:line |
|---|---|
| `SKU_CATALOG_JOIN_ON_SQL = 'sc.sku = rl.sku AND sc.organization_id = rl.organization_id'`, pinned verbatim by a test that also forbids similarity/regexp | `src/lib/sku/sku-identity-law.ts:7-8`; `sku-identity-law.test.ts:191-195` |
| The test counts constant uses ≥ joins per file | `sku-identity-law.test.ts:172-176` |
| Zoho title arm is by `rz.zoho_item_id`, `status='active'` | `sku-identity-law.ts:11-13` |
| Write-side ownership predicate: a platform sync may only fill `product_title` behind `skuCatalogNoZohoTwinPredicateSql()` | `sku-identity-law.ts:16-21`, used in `sync-ecwid-titles/route.ts:85` |
| Title ladder: zoho_item_title → catalog_product_title → item_name → sku → zoho_item_id | `sku-identity-law.ts:27-33, 70-76` |
| About 23 consumers of `resolveSkuIdentityTitle` (receiving, picking, shipments, outbound, QC) | e.g. `src/lib/shipments/shipment-record.ts:603`, `src/components/outbound/orders/OrderRecordView.tsx:310` |

Recommendations:

1. **Leave `SKU_CATALOG_JOIN_ON_SQL` unchanged.** Brand is a column on the already-joined `sc` row (`sc.brand_id`). Add a sibling constant such as `SKU_BRAND_JOIN_SQL = 'pb.id = sc.brand_id AND pb.organization_id = sc.organization_id'` so every surface reads brand the same way. Extend `findSkuIdentityViolations` (`sku-identity-law.ts:84-188`) to flag a `product_brands` join that is not org-scoped.
2. **Zoho governs brand the same way it governs the title.** Add `items.brand` and `items.manufacturer`: map them in `InventorySyncService.ts:30-59`, add them to `ZohoItem` (`types.ts:18-59`), and add them to the drizzle `items` table (`schema.ts:642`). Then add `ZOHO_ITEM_BRAND_SQL` mirroring `ZOHO_ITEM_TITLE_SQL`, and a `resolveSkuIdentityBrand(row)` ladder of `zoho_item_brand → catalog brand (sc.brand_id, brand_source≠guess-below-threshold) → null`. Export the order as data (`SKU_IDENTITY_BRAND_ORDER`), matching the `SKU_IDENTITY_TITLE_ORDER` pattern, so ladders cannot drift. **Do not** parse brand from `item_name` or marketplace titles at read time on record surfaces. Doing that is the brand equivalent of "marketplace-title-first".
3. **The backfill must tokenize the resolved identity title, not raw `sc.product_title`.** Ecwid overwrote catalog titles; `build-sql.ts:313` records "132 Ecwid-overwritten titles". A Zoho brand that disagrees with the title token wins, and the pair is logged to the review queue.
4. **Brand writes by platform syncs must go behind `skuCatalogNoZohoTwinPredicateSql()`**, the same rule as titles. `brand_source='listing'` can never overwrite `'zoho'` or `'operator'`.

### Org scoping of `sku_catalog`

| Fact | Evidence |
|---|---|
| RLS enabled **and forced** on `sku_catalog`, `items`, `sku_platform_ids`, `platform_listings`, `entity_search_docs`, `product_manuals`, `custom_field_defs` | `pg_class.relrowsecurity/relforcerowsecurity = t/t` |
| Policy `tenant_isolation` ALL: `organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid`, plus `hermes_agent_read` SELECT `true` for role `hermes_agent` | `pg_policies` |
| `organization_id NOT NULL DEFAULT NULLIF(current_setting('app.current_org',true),'')::uuid` | `information_schema.columns` |
| GUC set per tx by `withTenantTransaction` / `tenantQuery` | `src/lib/tenancy/db.ts:39, 55, 70` |
| Per-org natural key `sku_catalog_org_sku_key (organization_id, sku)`; drizzle comment says "Unique PER ORG … NOT globally" | `pg_indexes`; `schema.ts:2306` |
| **Drift:** live DB still has **global** `sku_catalog_sku_key UNIQUE (sku)` | `pg_indexes` |
| `bose_models`: RLS on but **not forced**, `organization_id` nullable | `pg_class`, `information_schema` |
| `receiving_line` (table) has RLS. `receiving_lines` is a view without RLS. | `pg_class.relkind` |

Phase 1 `product_brands` / `product_brand_aliases` should copy the exact policy pair (tenant_isolation + hermes_agent_read), `FORCE ROW LEVEL SECURITY`, and the GUC column default.

### Existing SKU search-doc build (`entity_search_docs`)

| Step | file:line | Note for brand |
|---|---|---|
| Enqueue on INSERT `trg_enqueue_search_outbox_on_sku_catalog_ins` → `fn_enqueue_entity_search_outbox('SKU')` | `pg_trigger` | — |
| Enqueue on UPDATE `trg_enqueue_search_outbox_on_sku_catalog_upd` **OF sku, product_title, category, upc, ean, gtin, notes, lifecycle_status, is_active, provider_item_id** | `pg_trigger` | **Add `brand_id`** to the column list and WHEN clause |
| Child enqueue on `sku_platform_ids` (`fn_enqueue_search_outbox_sku_child`) | `pg_trigger` | — |
| No trigger on `items` | `pg_trigger` (none for items) | A Zoho name or brand change does **not** re-index SKU docs. A brand/alias rename also needs a bulk re-enqueue of the brand's SKUs, plus the ORDER / SERIAL_UNIT / RECEIVING docs that carry them. |
| Loader SQL `SKU:` | `src/lib/search/search-outbox-worker.ts:195-222` | Joins `items i ON i.zoho_item_id = sc.provider_item_id` (`:206-208`), not sku+org. Brand needs `LEFT JOIN product_brands` plus an alias `STRING_AGG`. |
| Builder `buildSkuDoc` | `src/lib/search/build-search-text.ts:237-273` | **Violates the identity law**: its title is `product_title` before `item_name` (`:238`). Brand name and aliases go into `searchText`. Add a brand facet (the facet slots at `:263-271` have none). |
| Upsert | `search-outbox-worker.ts:351-371` (`ON CONFLICT (organization_id, entity_type, entity_id)`) | Columns have no brand. Need `brand_id` or a facet column for `axis=brand`. |
| Live state | 1432 SKU docs, **0 embedded**. 252/1684 SKUs have **no doc**. | Coverage gap before brand is added |

### Recommended backfill order + thresholds

| Step | Source | Rule | `brand_source` | confidence | Action | Expected yield (active-nf / all-nf) |
|---|---|---|---|---|---|---|
| 0 | Prereq | Add `items.brand/manufacturer` plus mapper, run Zoho `fullSync`. Seed brands/aliases (table above) per org via seed script. | — | — | — | — |
| 1 | Zoho `items.brand` (else `manufacturer`) of the active sku+org twin | normalized → exact alias hit | `zoho` | 1.00 | auto-apply. Unknown Zoho brand → create alias proposal in queue. | unknown (0 today) |
| 2 | Identity title (Zoho name first), stop-words stripped, longest 1–2-token alias, `kind∈{brand,franchise}` | exact | `seed`/`title` | 0.95 | auto-apply | 239/266 · 1213/1468 |
| 3 | Same, product_line alias (Wave, SoundDock…) → parent brand + line | exact | `title` | 0.90 | auto-apply (brand = parent Bose) | +0 · +32 |
| 4 | Parent SKU (`split_part(sku,'-',1)`) already branded ≥0.95 | inherit | `parent` | 0.90 | auto-apply | +0 · +2 |
| 5 | Listing title token (ebay/amazon/ecwid via `sku_catalog_id`) | exact | `listing` | 0.60 | **review queue only** (6/6 conflicts were mispairs) | +4 · +4 |
| 6 | `for/fits/compatible with <Brand>` mention | regex | `compat` | 0.30 | queue with the suggestion "third-party / house brand (USAV?)", never auto | +14 · +17 |
| — | Conflict between any two sources ≥0.6 | — | — | — | queue, higher-authority source proposed | 6 today |

Suggested auto-apply threshold: **≥ 0.90**. Below that, route through the approval-first queue (LAWS T28) unless the org's auto-approve flag is set. Expected coverage after steps 2–4 is **89.8% of active SKUs** and **84.9% of all non-fixture SKUs**. The queue holds about 18 proposals for active SKUs (4 listing + 14 compat); the other ~9 unbranded active SKUs are generic accessories with no proposal. Receiving lines then brand at 77.0% via SKU, or 89.8% with the read-time `item_name` fallback for SKU-less lines.

#### Open questions / risks

- **Does USAV populate `brand`/`manufacturer` in Zoho?** This is unknowable from the DB because the field is dropped at `InventorySyncService.ts:30-59`. One authed Zoho `GET /items/{id}` answers it. If yes, step 1 dominates. If no, the title rule is the fact source, and "Zoho governs" only applies after the operator backfills Zoho.
- **The "active" definition is Ecwid-driven** (`sync-ecwid-titles/route.ts:92-103`). An "active" SKU means "listed on Ecwid now", not "in stock or sellable". For brand facet counts, Phase 1 should decide whether "active SKU count" in `GET /api/brands` means `is_active` or Zoho-active (1117).
- Global `sku_catalog_sku_key UNIQUE(sku)` is still live, while the drizzle comment and `sku_catalog_org_sku_key` say per-org. This affects the org-isolation brand tests (for example, the QA probe `BOSE-SLM2-BK` "shared SKU string" in org 2).
- `USAV` house brand, and platform tokens (`xbox`, `wii`, `ps3`/`ps4`, `playstation`), need an operator ruling. The rule deliberately does not auto-brand them.
- Ecwid `sku_platform_ids` pairing strips leading zeros (`33` ↔ `00033`), so listing titles are contaminated. Treat them as a signal only.
- The SKU search-doc loader joins items by `provider_item_id`, not by sku+org, and its title ignores the identity law. Brand indexing inherits both issues unless they are fixed together.
- Brand/alias edits need a bulk re-enqueue path. No trigger exists on `items` or on future brand tables.
- `bose_models` is empty and not forced-RLS. If Phase 1 reuses it as a product_line source, it needs data plus `FORCE RLS`. Also consider generalizing it: the `/api/product-models/lookup` "brand-neutral façade" already exists.
- Fixture rows (`E2E…`, `QA…`, `AUDITSKU…`, `unidentified…`: 216 of 1684 by the predicate above) pollute the counts. Brand typeahead ordering by "active SKU count" should exclude them, or the fixtures should move out of the USAV org.

## Nav route and param inventory


Evidence: file:line references, plus three throwaway probes run with the repo's own test loader (`node --require ./scripts/register-server-only-shim.cjs --import tsx /tmp/phase0-nav-*.ts`). The probes import `SIDEBAR_PAGE_NAV`, `applyChildTarget`, `routeParamsFor`, `getSidebarRouteKey`, `hasSidebarContextPanel`, `isStationSurfaceRoute`, `isRaillessSurface` and `getSidebarNavPageId`, and print the runtime results. `[INFERENCE]` marks anything not observed directly.

### Registry map (re-verified; the inventory doc's line numbers are stale)

| Thing | Real location | Stale reference in current-sidebar-inventory.md |
|---|---|---|
| `SIDEBAR_PAGE_NAV` | `src/lib/sidebar-navigation.ts:831-1317` (23 pages) | `:1140-2035` |
| `SidebarChildPage` / `SidebarPageNav` / `ChildNavTarget` types | `sidebar-navigation.ts:763-807` | — |
| `APP_SIDEBAR_NAV` (L1 rows, `requires`) | `sidebar-navigation.ts:283-344` | — |
| `ROUTE_PERMISSIONS` / `permissionForPath` | `sidebar-navigation.ts:693-756` | — |
| `filterPageChildren` (the one child funnel: parked plus `requires`) | `sidebar-navigation.ts:1355-1366` | — |
| `applyChildTarget` (constructs the URL: keeps `staff`, then `parseRouteParams(spec)`) | `sidebar-navigation.ts:1383-1403` | — |
| `hasDeskPageChrome` | `sidebar-navigation.ts:1406-1408` | `:2212` |
| `getSidebarNavPageId` (path → page id) | `sidebar-navigation.ts:523-581` | — |
| `getSidebarRouteKey` (path → panel key) | `sidebar-navigation.ts:465-520` | — |
| `isRaillessSurface` | `sidebar-navigation.ts:396-434` | — |
| `CONTEXT_PANEL_ROUTE_KEYS` / `STATION_SURFACE_ROUTE_KEYS` | `sidebar-navigation.ts:440-455` / `:379-386` | — |
| `routeParamsFor` (longest-prefix match) | `src/lib/routing/registry.ts:12-25` | — |
| `AMBIENT_PARAMS` / `SHARED_OWNED_KEYS` | `src/lib/routing/route-params.ts:85-106` / `:115-166` | — |
| Lanes and the mobile-first gate | `src/lib/nav/lanes.ts:23-34` (`DOMAIN_GROUPS`), `:57-71` (`LANE_MOBILE_FIRST`: support='hidden', monitor='hidden'), `:74-78` `isLaneVisible` | — |
| Parked tabs | `src/lib/nav/parked-tabs.ts:15-24` (6 inventory tabs) | — |
| Org nav override | `src/lib/nav/org-nav.ts:41-117`; `GET/PUT /api/nav` `src/app/api/nav/route.ts:12-26` (GET needs `dashboard.view`), `:28-77` (PUT needs `studio.manage` + stepUp); table `nav_definitions` (migration `src/lib/migrations/2026-07-05b_nav_definitions.sql:27`) | — |
| Desk tabs adapter | `src/components/desk/useDeskPageChromeTabs.ts:31-89`; frame `src/components/desk/DeskPageLayout.tsx:65-108`; chrome `src/design-system/components/DeskPageChrome.tsx` | pinned.json:36 says `design-system/components/desk/DeskPageChrome.tsx` (no such path) |
| Active page and child resolver | `src/components/sidebar/master-nav/useActiveSidebarChild.ts:7-16` | — |
| Panel dispatcher | `src/components/sidebar/SidebarContextPanel.tsx:32-92`; mount gate `src/components/sidebar/ContextPanelLayout.tsx:60-63`: `(useHasSidebarContext() \|\| isStationSurfaceRoute) && !railless` | — |
| Shipping desk views | `src/lib/outbound/desk-views.ts:34-140` | — |
| `docs/refactors/desk-3pane-ai-first-PLAN.md` (named in handoff "Read first" #4) | **deleted** in commit `270795058` (repo diet wave 2) | — |

### Pages (one row per SIDEBAR_PAGE_NAV entry, in registry order)

Legend. Children are written `id·Label→href`. `[perm]` is the child's `requires`, and `{P}` means parked (`parked-tabs.ts`). The href is the probe's output of `applyChildTarget(bare page href, child.to())`. **Spec** means `routeParamsFor(target pathname)`: the route, then the keys it owns. Every spec also carries the ambient keys `staff, staffId, colsort, coldir, pane, layout, weekOffset`; receiving specs add `recvId, lineId, openReceivingId`. **Panel** means the left context column mounted today; the probe computes it as `(ctx||station)&&!railless`.

| # | id · label (`src/lib/sidebar-navigation.ts` line) | kind · `requires` · flags | Children → href | Spec (`routeParamsFor`) | Panel mounted today | Panel data needs (recents / facets / saved views / scan input) |
|---|---|---|---|---|---|---|
| 1 | `home`·Daily (:833) | top · — · deskChrome (0 children, so no tab row) | — | `/` owns `mode,date,item,q,filter` | **none** (key `home`, not in CONTEXT_PANEL_ROUTE_KEYS) | The stage owns everything. Lens tabs are hand-rolled at `src/features/home/DailyAgenda.tsx:261-270` (`AGENDA_LENSES` `src/lib/daily/agenda-lens.ts:8`). Saved views `home_today` (server `/api/saved-views`, `surfaces.ts:148`). |
| 2 | `sales`·Sales (:838) | domain/sales · `dashboard.view` · deskChrome | `counter`·Counter→`/counter` [walk_in.view]; `sales`·Sales Board→`/dashboard?mode=sales` [walk_in.view]; `pickup`·Local Pickup→`/dashboard?mode=pickup` [walk_in.view]; `repairs`·Repair Service→`/dashboard?mode=repairs` [repair.view] | `/dashboard` owns `mode,tab,q,map,openOrderId,warranty,fba,open,wstatus,wexp,search,sort,dir,openRepair,dq,rh_q,rh_field,rh_scope`; **`/counter` has no spec** | `sales`/`pickup`: `DashboardOrdersContextPanel` (`src/components/sidebar/DashboardOrdersContextPanel.tsx:16`) → `WalkInHistorySidebar` (`src/components/walk-in/WalkInHistorySidebar.tsx:38`). `repairs`: none (`useHasSidebarContext.ts:11`). `counter`: none (key `unknown`). | Static deep-links only (`walkInStationHref`, `WalkInHistorySidebar.tsx:62-85`). No fetch, no recents, no scan input. |
| 3 | `operations`·Operations (:858) | main/monitor · `operations.view` · deskChrome · **lane `monitor`='hidden'** (`lanes.ts:68`) | `live`→`/operations`; `checks`→`?mode=checks`; `packing-review`·Packing Review→`/review` [packing.review]; `insights`; `history`; `signals`; `reconciliation`·Reconcile; `goals`; `quality` [sku_stock.view]; `staff`·People [admin.manage_staff]; `sync`; `logs` [admin.view_logs]. **12 children** (the inventory doc says 11). | `/operations` owns `mode,date,q,open,view,status,cursor,section,range,segment,station,stations,types,sources,from,until,dim,order,serial,tracking,unit,signalsView,signalId,window,signalKind`; `/review` owns `mode,rtab,packerLogId,orderId,choreId,section,exceptionId,search` | `OperationsSidebarPanel` (`src/components/sidebar/OperationsSidebarPanel.tsx:67`). `packing-review` mounts `ReviewSidebarPanel` (`src/components/sidebar/review/ReviewSidebarPanel.tsx:20`) instead (key `review`, station). | Live KPI tiles and feed come from the react-query cache `OPERATIONS_QUERY_KEY` (`OperationsSidebarPanel.tsx:92`), filled by `GET /api/dashboard/operations?timeRange=24h` (`src/features/operations/components/useOperationsDashboardData.ts:25`). History facets: `HistoryBrowseFilters` (`src/components/sidebar/operations/HistoryBrowseFilters.tsx:98`) plus saved views `GET/POST /api/operations/saved-views` (`src/hooks/useOperationsSavedViews.ts:47-58`). Goals `/api/staff-goals` (`src/components/sidebar/GoalsSidebarPanel.tsx:222`). People `/api/staff` (`src/components/admin/StaffScheduleSidebarPanel.tsx:51`). Logs `/api/admin/logs` (`src/components/admin/LogsSidebarPanel.tsx:89`). Review: `StaffFilterButton` only (`ReviewSidebarPanel.tsx:31`). No scan input. |
| 4 | `reports`·Reports (:907) | top · `operations.view` · deskChrome | `staff-day`→`/reports`; `utilization`→`?tab=utilization`; `velocity`→`?tab=velocity`; `dead-stock`→`?tab=dead` | **none** (no spec, no `ROUTE_PERMISSIONS` entry, no page guard: `src/app/reports/page.tsx:1` is `'use client'`) | **none**. Probe: `getSidebarNavPageId('/reports')` = **`unknown`**, because `SidebarRouteKey` has no `reports` (`sidebar-navigation.ts:67-91,465-520`). | The page hand-rolls **7** tabs (`src/app/reports/page.tsx:38-57`: staff, packer, utilization, velocity, dead, tasks, activity) and passes `tabs=` to `DeskPageLayout` (`:460-464`). So the nav's 4 children drift from the real page, and the nav child `staff-day` writes `tab:null` where the page says `staff`. Data: `/api/reports/{bin-utilization,velocity,dead-stock}` (`:62-64`), `/api/daily-checks` (`:104`), `/api/packing/reports/export` (`:117`), `/api/tasks?lane=done` (`:68`). |
| 5 | `triage`·Arrival (:929) | station/receiving · `receiving.view` | — | `/triage` owns `triview,triq,uf_q,uf_kind,composerMode` | `ReceivingSidebarPanel` (`src/components/sidebar/ReceivingSidebarPanel.tsx:65`) | Scan input: `TriageScanBand` (`ReceivingSidebarPanel.tsx:502`, def `src/components/sidebar/receiving/ReceivingScanBands.tsx:41`) → `useTrackingScan` (`useTrackingScan.ts:151`) → `/api/receiving/lookup-po`, `/api/receiving/touch-scan`. Recents feeds: `triageCombined`, `triageUnfound`, `triageDone`, `scanned` (`src/lib/receiving/rail/feeds.ts:392-497`) → `GET /api/receiving-lines?view=…` (`feeds.ts:152-155`), first paint from `GET /api/receiving/rail-snapshot?feed=` (`src/lib/receiving/rail/rail-snapshot-client.ts:12`). Facets: `useReceivingRailFacets` (`ReceivingSidebarPanel.tsx:160`). Stage tabs are hand-rolled (found/unfound/done) at `src/components/receiving/triage/TriageWorkspaceView.tsx:38`. Saved views: `unfound_queue` (`surfaces.ts:132-135`). |
| 6 | `receive`·Unbox (:933) | station/receiving · `receiving.view` | — | `/unbox` owns `unboxview,unboxdesk,sort,photoPeekDemo,ustage,ulane,priority_only,ukpi,urange,uviz,clayout,c0..c3,hlayout,drillPo,rh_q,rh_field,rh_scope,composerMode,openLine` | `ReceivingSidebarPanel` | Scan input: `UnboxScanBand` (`ReceivingSidebarPanel.tsx:526`; `ReceivingScanBands.tsx:119`), same scan endpoints as row 5. Recents feed `unboxRecent` (`src/components/sidebar/receiving/ReceivingRailBody.tsx:69`; `feeds.ts:342`) → `/api/receiving-lines?view=unbox_opened` (`feeds.ts:182-183`). A `viewed` feed (`feeds.ts:411-417`) is **already server-side recents**: `POST /api/receiving-lines/view` → `receiving_line_views` (`src/app/api/receiving-lines/view/route.ts:28`). Stage tabs are hand-rolled at `src/utils/unbox-workspace-state.ts:23`. Saved views: `receiving_history` (`table-url-params.ts`). |
| 7 | `pickup`·Local Pickup (:937) | station/walk-in · `receiving.view` | — | `/pickup` owns `lcpu,status,q` | `ReceivingSidebarPanel` | Scan: `PickupScanBand` (`ReceivingSidebarPanel.tsx:463`). Rail: `PickupSidebarRail` → `GET /api/local-pickup-orders/lines?limit=500` (`src/components/receiving/pickup/PickupSidebarRail.tsx:28`); the inventory doc's `/api/local-pickup/orders` is wrong. Facets: `PickupRailFilters` (`:472`). Saved views: `pickup_queue`. |
| 8 | `repair`·Repair Service (:941) | station/walk-in · `receiving.view` · **railless** | — | `/repair` owns `tab,new,openRepair,search,sort,needsLabel,channel,repairStatus,hide` | **none** (railless) | Everything lives on the stage: `RepairCardList` inside `DeskPageLayout`, API `/api/repair-service` family. Saved views: `repair_queue`. There is no left scan input. |
| 9 | `testing`·Quality Control (:947) | station/testing · `tech.view` | — | `/test` owns `view,search,ship,testTab,packStation,packPlaced,composerMode` | `TechSidebarPanel` (`SidebarContextPanel.tsx:71-81`) → `TestingSidebarPanel` (`src/components/sidebar/TechSidebarPanel.tsx:63`; def `TestingSidebarPanel.tsx:119`) | Scan: `TestingScanBar` (`src/components/sidebar/receiving/TestingScanBar.tsx:92`) → `src/lib/testing/resolve-testing-scan.ts` (`/api/receiving-lines?...`). Recents feed `testingRecent` (`src/components/sidebar/receiving/TestingRecentRail.tsx:28`) → `view=testing_opened` (`feeds.ts:325`). Stage tabs are hand-rolled at `src/components/tech/testing/TestingWorkspaceView.tsx:13`. Saved views: `testing_history`. |
| 10 | `ready-to-pack`·Picker (:951) | station/testing · `tech.view` | — | `/test` (same as row 9) | `TechSidebarPanel` → `ShippingSidebarPanel` (`TechSidebarPanel.tsx:56`; def `ShippingSidebarPanel.tsx:32`) | Scan: `ShippingScanBand` (`src/components/sidebar/tech/ShippingScanBand.tsx:46`) → `/api/picking/desk/scan`, `/api/fba/fnsku-scan`, `/api/picking/desk/sku`, `/api/repair/station-scan` (`src/lib/station/handle*Scan.ts`). Recents: `ShippingStaffScanHistoryRail` (`src/components/sidebar/shipping/ShippingStaffScanHistoryRail.tsx:90`) → `useTechLogs` → `GET /api/picking/desk/logs` (`src/hooks/useTechLogs.ts:111`). Stage tabs are hand-rolled at `src/components/tech/shipping/ShippingWorkspaceView.tsx:37-40` (urgent, history). Saved views: `tech_history`, `outbound_ready`. |
| 11 | `incoming`·Deliveries (:957) | domain/inbound · `receiving.view` · deskChrome · **railless** | `pipeline`·On the way→`/incoming`; `docked`·History→`/incoming?lane=docked` | `/incoming` owns `lane,incview,tracking_in,state,inbound,inkind,import,sort,po_from,po_to,page,rh_q,rh_field,rh_scope,openLine` | **none** (railless) | Stage only (`src/app/incoming/page.tsx:15`). Saved views `receiving_incoming`, but its paramKeys `incomingState, incomingPoFrom, incomingPoTo, incomingFacet` (`src/lib/station/table-url-params.ts:57-64`) are read nowhere and are not in the `/incoming` spec. The live keys are `state`/`po_from`/`po_to`, so these views are **dead**. |
| 12 | `receiving`·Receiving (:976, legacy compatibility) | station/receiving · `receiving.view` · not in `APP_SIDEBAR_NAV` | `incoming`→`/incoming`; `triage`→`/triage`; `receive`→`/unbox`; `pickup`→`/pickup`; `repair`→`/repair` | per target (rows 5–8, 11) | per target | per target |
| 13 | `sourcing`·Sourcing (:1002) | domain/inbound · `sourcing.view` · deskChrome | `queue`→`/sourcing`; `scout`→`?mode=scout`; `watchlist`; `searches`; `suppliers`; `models` [sourcing.view]; `compatibility` [sourcing.view] | `/sourcing` owns `mode,q,by,status,type,range,supplier,model` | `SourcingSidebarPanel` (`src/components/sidebar/SourcingSidebarPanel.tsx:39`) | It only writes URL params: `by` (`:55,82`), `status` (`:56`), `type` (`:119-128`), `q`. Models/Compat → `/api/bose-models` (`src/components/admin/sourcing/BoseModelsSidebarPanel.tsx:25`, `CompatibilitySidebarPanel.tsx:23`). Dead branch `mode==='analytics'` (`:108`), with no child. No recents, no scan input. |
| 14 | `fba`·FBA (:1030) | domain/fulfillment · `fba.view` · **railless** | `plan`→`/shipping/fba?fbaMode=plan`; `combine`→`/shipping/fba`; `shipped`→`?fbaMode=shipped` | `/shipping/fba` owns `q,sort,fbaMode,rtab,openShipmentId,plan,draft,main,details,r,search,fnsku,fbaFilter` | **none**. Key for `/shipping/fba` is `outbound`, not `fba`; `FbaSidebarPanel` only mounts on key `fba` = `/fba`, which redirects (`src/app/fba/page.tsx`). | `FbaWorkspaceScanField` exists only inside `FbaWorkspaceSidebar` (`src/components/fba/sidebar/FbaSidebar.tsx:11-24`), so **the FNSKU scan field is not mounted on `/shipping/fba` today** [INFERENCE: no other mount found by grep]. `/shipping/fba` renders inside the `bare` desk layout (`src/app/shipping/(desk)/layout.tsx:16`), so none of its three children are drawn as tabs. Data: `/api/fba/active-with-details`, `/api/fba/stage-counts` (inventory doc §9, not re-verified). |
| 15 | `label-intake`·Label intake (:1044) | domain/fulfillment · `packing.review` · railless | — | **none** | none | Stage only. |
| 16 | `outbound`·Shipping (:1049) | domain/fulfillment · `shipping.view` · deskChrome · railless | `exceptions`→`/shipping/exceptions` [orders.view]; `shortage`·**Picking**→`/shipping/shortage` [orders.view]; `orders`·To ship→`/shipping/orders` [orders.view]; `shipped`→`/shipping/shipped` [packing.view] | `/shipping/orders` owns `context,openOrderId,createTicket,unshipped,pending,packed,tested,shipped,open,sort,dir,rtab,type,search,attention,ustatus,stage,aging,late,packStation,packPlaced,new,ingest,triage,paperwork,cage,queue,import,shippedFilter,shippedSearchField,shippedWeekOffset,ostatus,exceptions,carrier,statusCategory,packedBy,testedBy,dateFrom,dateTo,allDates,olayout,drillOrder,clayout,c0..c3`; `/shipping/exceptions` owns **only `order,search`**; `/shipping/shipped` owns `search,shipment,openOrderId,shippedFilter,shippedSearchField,shippedWeekOffset,dateFrom,dateTo,allDates,ostatus,exceptions,carrier,statusCategory,packedBy,testedBy,sort,dir`; **`/shipping/shortage` has no spec** | **none**. `SidebarContextPanel.tsx:85-87` says the desk lives in `OutboundDeskSpine`; **that component does not exist** (grep: 0 hits outside that comment). The desk layout is `bare` (`src/app/shipping/(desk)/layout.tsx:16`), so no tab row either. | `DESK_VIEWS` (`desk-views.ts:34-80`) has **no UI consumer** (only `desk-views.test.ts` and the param constants). Counts: `GET /api/orders/desk-counts` (`src/app/api/orders/desk-counts/route.ts:14-39`, cached 60s, tag `orders`), consumed only by `UnshippedTable.tsx:345` when a lens is active. Saved views: `outboundSavedViewsConfig` (`src/components/unshipped/outbound-sidebar-shared.ts:38-49`) → `unshipped_saved_views`/`shipped_saved_views`/`packed_saved_views` → surfaces `dashboard_unshipped/shipped/packed` (`surfaces.ts:149-151`), consumed at `src/components/dashboard/orders-queue/useOrdersQueueFeed.ts:254-259`. Search: in-memory `desk-search-store` (see client-only table). Exceptions list: `GET /api/orders/exceptions?scope=actionable&category=&q=` (`src/components/outbound/orders/exceptions/OrderExceptionsWorkbench.tsx:75-78`). |
| 17 | `scan-out`·Scan out (:1124) | station · `shipping.view` · railless | — | `/shipping/scan-out` owns `q,sort,open` | none | Scan input on the stage: `ScanOutComposerDock` → `POST /api/shipped/scan-out` (`src/components/outbound/scan-out/*`, 2 call sites). Page `src/app/shipping/scan-out/page.tsx:1-6`. Saved views: `outbound_staged`. |
| 18 | `packer`·Packing (:1131) | station · `packing.view` | — | `/pack` owns `packview,packMode,ustatus` | `PackerSidebarPanel` (`src/components/sidebar/PackerSidebarPanel.tsx:18`) | Scan: `PackScanColumn` (`src/components/station/PackScanColumn.tsx:81`) → `/api/packing-logs`, `/api/fba/items/scan`, `/api/fba/shipments/mark-shipped`. Recents: `PackRecentPacksRail` (`src/components/sidebar/packer/PackRecentPacksRail.tsx:62`) → `usePackerLogs` → `GET /api/packerlogs` (`src/hooks/usePackerLogs.ts:101`). Facets: `StationHistoryRailFacets/Filters` (`PackerSidebarPanel.tsx:25,56`). Stage tabs are hand-rolled at `src/components/packer/PackWorkspaceView.tsx:30`. Saved views: `packer_history`. |
| 19 | `products`·Products (:1135) | domain/catalog · `sku_stock.view` · deskChrome | `manuals`→`/products`; `labels`·SKU Barcodes→`?view=labels`; `pairing`→`?view=pairing`; `qc`·QC Checklist→`?view=qc` | `/products` owns `view,q,sort,skuId,sku,labelsView,historyId,id` | `ProductsSidebarPanel` (`src/components/sidebar/ProductsSidebarPanel.tsx:40`) | manuals: `LibraryBrowser` (`src/components/manuals/LibraryBrowser.tsx:30`) → `/api/product-manuals[/search]`. labels: `ProductLabelsRecentRail` (`src/components/labels/ProductLabelsRecentRail.tsx:75`) → `GET /api/labels/recent`, plus stage `UnitHistoryFinder`, which keeps client recents. pairing: `PairingSidebarQueue` → `/api/sku-catalog/pairing-queue` (`src/components/products/pairing/usePairingQueue.ts`) and `/api/sku-catalog/search-unmatched`. qc: `QcSidebarPicker` (`ProductsSidebarPanel.tsx:196`) → `useSkuCatalogSearch` → `/api/sku-catalog/search` (`src/hooks/useSkuCatalogSearch.ts:38`). Saved views: `products_catalog` (`surfaces.ts:100-103`). |
| 20 | `inventory`·Inventory (:1158) | domain/inventory · `sku_stock.view` · deskChrome · railless | `stock`→`/inventory/stock`; `sku-exceptions`→`/inventory/sku-exceptions`; `ledger`→`/inventory`; `triage`·Tracking Exceptions {P}; `pulse` {P}; `graph` {P}; `replenish`→`/inventory?section=replenish`; `locations`→`/inventory/locations`; `reason-codes` [sku_stock.manage]{P}; `favorites`·Quick Picks [sku_stock.manage]{P}; `health` [admin.view]{P} | `/inventory` owns `mode,section,q,field,filter,open,sku,bin,unit,state,condition,view`; `/inventory/stock` owns `q,room,status,open,sku`; `/inventory/sku-exceptions` owns `q,sku`; `/inventory/locations` owns `tab,room,code,q,status,showEmpty,view,serial,new,edit`; `/inventory/health` owns nothing. **`/inventory/{triage,pulse,graph,reason-codes,favorites}` fall through to the `/inventory` spec** (prefix match). | none (railless, `SidebarContextPanel.tsx:62-64`) | Stage only (`src/components/inventory/InventoryDeskFrame.tsx:22-29`). Saved views: `inventory_units`, `warehouse_bins`, `tracking_exceptions`. |
| 21 | `tech`·Testing (:1222, legacy compatibility) | station · `tech.view` · not in `APP_SIDEBAR_NAV` | `testing`·Quality Control→`/test?view=testing`; `shipping`·Picker→`/test?ship=urgent` | `/test` | `TechSidebarPanel` | as rows 9–10 |
| 22 | `support`·Support (:1234) | domain/support · `integrations.zendesk` · deskChrome · **lane `support`='hidden'** (`lanes.ts:66`) | `tickets`→`/support`; `voicemail`→`?mode=voicemail`; `calls`; `warranty` [warranty.view]; `issues` [support.issues.view] | `/support` owns `mode,ticket,vm,issueId,open,openOrderId,q,search,status,assignee,direction,range,type,reporter,stage,wstatus,wexp,ustatus,attention,tq,tstatus` | `tickets` only: `SupportSidebarPanel` (`src/components/sidebar/SupportSidebarPanel.tsx:11`). The other modes are railless (`sidebar-navigation.ts:415-424`). | `SupportTicketsRecentRail` (`src/components/support/zendesk/queue/SupportTicketsRecentRail.tsx:22`), fed **only** by the localStorage `useRecentTickets` (`src/hooks/useRecentTickets.ts:18,32`). No server feed. Status facets are in `src/components/sidebar/support/support-sidebar-shared.ts:110-114`. Saved views: `warranty_claims`. |
| 23 | `studio`·Automations (:1300) | main/studio · `studio.view` (the page guard is `src/app/studio/page.tsx:10`, not `ROUTE_PERMISSIONS`) | `graph`·Studio→`/studio`; `rules`→`/studio/automations` (railless); `catalog`→`/studio/catalog` | **none** | `StudioSidebarPanel` (`src/components/sidebar/StudioSidebarPanel.tsx:52`) on graph/catalog | In-memory `useStudioWorkspace()` context. Writes `?lens=`, `?z=` (inventory doc §3, not re-verified). No endpoint. |

Row count: `SIDEBAR_PAGE_NAV` has **23** entries, one per row above. Rows 12 (`receiving`) and 21 (`tech`) are legacy compatibility entries that are not in `APP_SIDEBAR_NAV`. The probe enumerated: home, sales, operations, reports, triage, receive, pickup, repair, testing, ready-to-pack, incoming, receiving, sourcing, fba, label-intake, outbound, scan-out, packer, products, inventory, tech, support, studio.

### Shipping: DESK_VIEWS vs SIDEBAR_PAGE_NAV and where "Pending" is still shown

| Axis | `SIDEBAR_PAGE_NAV.outbound.children` (`sidebar-navigation.ts:1057-1068`) | `DESK_VIEWS` (`desk-views.ts:34-90`) | Dogfood org override (DB `nav_definitions` v1, org `…0001`) |
|---|---|---|---|
| Items | Exceptions · Picking(`shortage`) · To ship(`orders`) · Shipped | exceptions · triage·"**Action list**" · po·"PO paired" · pick·"Pick list" · shipped | children order: shortage 0, orders 1, **fba 2 (stale id, silently ignored by `mergeOrgPageChildren`, `org-nav.ts:82-102`)**, shipped 3, exceptions 4 |
| Paint order | code order above | `DESK_VIEW_ORDER` = exceptions, triage, po, pick, shipped (`:90`); groups Queues/Picking/History (`:82-87`) | spine paints Picking · To ship · Shipped · Exceptions. `useDeskPageChromeTabs` does **not** apply org nav (`useDeskPageChromeTabs.ts:39-43`), so the spine and the desk tabs would disagree. |
| Pick list (`/shipping/orders?queue=pick`) | resolves to **`orders`/To ship** (`resolveChild` `:1099-1107`) | belongs to group `pending` → label **Picking** | — |
| To-ship label | "To ship" | "Action list" | — |

The handoff's target section is Exceptions · Picking (PO paired, Pick list) · To ship · Shipped. It matches neither registry today.

"Pending" is still shown for the Picking view / shortage desk:

| Where | Kind |
|---|---|
| `src/lib/outbound/oos-pending-toast.ts:29` "Moved to Pending" / "N orders moved to Pending"; `:44` action "View Pending"; `:15,18` doc | **operator-visible toast** |
| `src/components/unshipped/UnshippedTable.tsx:920` aria-label `'Pending out-of-stock orders'` (shortageDesk) | a11y label |
| `src/app/shipping/(desk)/shortage/page.tsx:10` "(Pending tab)" | comment |
| `src/lib/shipping/orders-desk.ts:7` "Reads as Pending in the tab." | comment (stale) |
| `src/lib/sidebar-navigation.ts:1048` "Pending · To ship · Shipped · Exceptions", `:1056` "Exceptions · Pending · To ship · Shipped" | comments (stale) |
| `src/components/outbound/orders/OrderRecordView.tsx:4`; `src/components/outbound/orders/to-ship/MorphingRowActionMenu.tsx:820` "To Ship, Pending, Exceptions" | comments |
| `src/lib/outbound/morphing-oos.test.ts:80` "targets the Shipping Pending desk" | test name |
| `src/components/unshipped/UnshippedTable.tsx:916` "Pending (ex-Shortage) desk" | comment |
| Not the Picking view, but same word: `useToShipChrome.ts:34` stage option `pending` "Pending" (the To-ship stage filter); `UnshippedTable.tsx:154,878` "Show All Pending Orders"; `src/app/shipping/(desk)/orders/page.tsx:9` and `OutboundOrdersDesk.tsx:3` "(Pending · Tested · Packed · Shipped)"; `src/lib/outbound/work-contract.ts:23` + fixtures `pending` "Pending" (the V1 work-contract state) | stage vocabulary; decide separately |

Already correct: the nav child label at `sidebar-navigation.ts:1062`, `DESK_VIEW_GROUP_LABEL.pending='Picking'` at `desk-views.ts:85`, and `ShortageDesk.tsx:5-6`.

### Param contract gaps the NavContext must cover (Shipping is wave A)

| Finding | Evidence |
|---|---|
| `/shipping/exceptions` spec owns only `order,search`. `category` is read by the workbench but **stripped by hygiene**. | Spec `src/lib/routing/outbound-routes.ts:184-192`; reader `OrderExceptionsWorkbench.tsx:43`; hygiene is mounted in `src/app/shipping/layout.tsx:34`. Probe: `parseRouteParams(spec,'category=label&search=x&order=5')` → `order=5&search=x`. |
| `/shipping/shortage` has **no spec**, so `pair` and the rest are only cross-surface-stripped (`stripCrossSurfaceParams`, `src/lib/surface-isolation.ts:79`). | Probe: `pair=po&search=x&stage=pending&staff=3` passes through unvalidated. `applyChildTarget` on the Picking child builds a bare `/shipping/shortage`, then the page redirects to `?pair=po` (`shortage/page.tsx:17`, `shortageDeskRedirectSearch`). |
| `/shipping/orders` spec drops foreign keys (`category`, `pair`) and invalid values (`aging=3`). | Probe: `queue=pick&stage=pending&aging=3&category=x&pair=po` → `stage=pending&queue=pick`. |
| These routes have no spec: `/reports`, `/counter`, `/studio*`, `/shipping/label-intake`, `/shipping/shortage`. Inventory's parked sub-paths borrow the `/inventory` spec. | nav-dump probe `spec: NONE` rows |
| `useShippedTableFilters` falls back to localStorage when `?shippedFilter` is absent, so the URL alone does not reproduce the view. | `src/components/shipped/dashboard-table/useShippedTableFilters.ts:52-58`; `src/utils/dashboard-preferences.ts:11-14,22` |

### Client-only stores the Tauri app cannot reach over HTTP

The keys the handoff names do not exist. The real keys are marked **bold**.

| Store (real key) | File:line | Used by page / panel | Kind | Server equivalent today |
|---|---|---|---|---|
| **`assistant:recent-detail-stacks`** (handoff says `cycleforge:detail-stacks:history:v1`) | `src/lib/detail-stacks/history-store.ts:18,46,57`; hook `src/hooks/useRecentDetailStacks.ts:15`; writer `src/components/assistant/DetailStackHistoryTracker.tsx:26` | `DashboardRecentsPanel` (`/dashboard?mode=inbound`, `DashboardOrdersContextPanel.tsx:21-22`); `RecentDetailStacksSection` | recents | none |
| **`support:recent-tickets`** (handoff says `cycleforge:support:recent-tickets:v1`) | `src/hooks/useRecentTickets.ts:18,24,50` | Support › Tickets rail (row 22), the rail's **only** data source | recents | none (the Zendesk API is there, but recents are not recorded) |
| **`audit-log.trace.recents`** (handoff says `audit-log:trace-recents:v1`) | `src/components/sidebar/audit-log-panel/audit-log-panel-shared.ts:93`; `TraceSerialPicker.tsx:20,34` | `/audit-log` (`AuditLogSidebarPanel`; not a SIDEBAR_PAGE_NAV page) | recents | none |
| `command-bar-recent` | `src/components/CommandBar.tsx:92,100,114` | ⌘K, every page | recents | `search_query_log` + `markSearchResultOpened` (`src/lib/search/query-log.ts:49-103`) [not wired to ⌘K recents] |
| `cf_search_recents_v1` (+ legacy `usav_*`, migrated flags) | `src/lib/search/search-recents.ts:31-34,103,120` | **No live reader**: only `formatRelativeTime` is imported from this module now. | recents | `GET/POST/DELETE /api/search/recents` → table `search_recents` (`src/lib/search/staff-recents.ts`, `src/app/api/search/recents/route.ts:15-77`). **No client caller**. DB: 101 rows, last write 2026-08-27. |
| `labels:history-recents:v1` | `src/components/labels/UnitHistoryFinder.tsx:10,46,64` | Products › SKU Barcodes stage (`LabelsProductsWorkspace`) | recents | `/api/labels/recent` covers prints, not lookups |
| `mobile.scan.recent` | `src/app/m/(shell)/u/[id]/page.tsx:27,33` | `/m` unit prefill | recents (5-min) | none |
| `cf-m-nav-trail` | `src/lib/mobile/nav-trail.ts:6` | `/m` back trail | nav history | none |
| `daily-check-glyph-recents` | `src/lib/daily-checks/composer.ts:48` | Daily composer | recents | none |
| `cf:testing:last-line-id`; `cf:last-manual:tech:<userId>` | `src/components/tech/TestingLineWorkspace.tsx:25`; `src/hooks/useStationTestingController.ts:36,134` | QC / Picker stations | last-opened | none |
| `dashboard:selected-order:v2` | `src/hooks/useDashboardSelectedOrder.ts:26` | Shipping record snapshot | selection | URL `openOrderId` |
| `dashboard:shipped-filter`, `dashboard:shipped-search-field`, `dashboard:shipped-week-offset`, `dashboard:details-open-behavior` | `src/utils/dashboard-preferences.ts:11-14` | Shipping › Shipped defaults (`useShippedTableFilters.ts:58`) | view prefs | URL params / could be settings |
| `receiving-triage-complete:<id>` | `src/lib/receiving/triage-complete-local.ts:7` | Arrival | workflow state | none |
| receiving line-details scratch (per org + carton) | `src/components/sidebar/receiving/receiving-sidebar-shared.ts:31-85` | Unbox | draft | none |
| **In-memory** `desk-search-store` (a Map, no persistence) | `src/lib/outbound/desk-search-store.ts:7-35`; readers `src/hooks/useDashboardSearchController.ts:21`, `src/components/shipped/dashboard-table/useShippedTableFilters.ts:6` | Shipping desk search (handoff `search.source:'desk-store'`) | search text | URL `search` param (owned by the specs above) |
| `sidebar-spine-sections-open` (+ legacy `-closed`) | `src/components/sidebar/master-nav/useSpineSectionCollapse.ts:6,9` | old spine | nav UI state | none |
| `context-panel-width` / `context-panel-collapsed` | `src/components/sidebar/context-panel-column.ts:11,26`; `ContextPanelLayout.tsx:65` | old second column | layout | none (deleted with the column) |
| `detail-inspector-width` / `-collapsed` | `src/design-system/shells/detail-stack/layout.ts:16,24` | right rail | layout | none |
| `studio:inspector-open`, `studio:simulate-open` | `src/components/studio/StudioShell.tsx:77,83` | Automations | layout | none |
| sessionStorage react-query workbench cache (`cf-rq-wb:` prefix) | `src/components/providers/WorkbenchCachePersistence.tsx:32-79`; `src/lib/mobile/workbench-cache.ts:5` | all | cache | n/a |
| `scan:station-stance`, `scan:focus-hotkey`, `cf.stationComposerMode` (session), `cf.pack-station-arm(.auto-off)` | `src/components/station/scan-bar/scan-stance.ts:8`; `src/lib/scan-hotkey/store.ts:10`; `src/lib/composer/station-composer-mode.ts:14`; `src/lib/packing/pack-station-arm.ts:12,18` | stations | device config | none (device-local is arguably correct) |
| `fba:pending_catalog`, `fba:today_plan`, `fba-editor-undo-<id>` | `src/components/fba/hooks/usePendingCatalog.ts:3`; `useTodayPlan.ts:8`; `src/components/fba/sidebar/shipment-editor/shipment-editor-helpers.ts:6` | FBA | workflow state | none |
| Server-backed but cached locally: `cf.quickAccess` ↔ `staff_preferences.prefs.quickAccess` | `src/lib/quick-access/storage.ts:12`; `src/components/quick-access/QuickAccessSync.tsx:11` | global | synced | yes |

Server-side recents that already exist (these need a normalised adapter, not a new store):
- `receiving_line_views`: `POST /api/receiving-lines/view` (`src/app/api/receiving-lines/view/route.ts:28`), read via `view=viewed` (`feeds.ts:411-417,453-459`). DB: 2687 rows, last write 2026-09-25.
- `search_query_log` (494 rows, last write 2026-09-26).
- `/api/picking/desk/logs`, `/api/packerlogs`, `/api/labels/recent`, `/api/receiving-lines?view=unbox_opened|scanned|testing_opened`, `/api/local-pickup-orders/lines`.

Saved views are already server-side: `useSavedViews` → `GET /api/saved-views?surface=` (`src/hooks/useSavedViews.ts:105-121`), keyed by `surfaceFromStorageKey` (`src/lib/saved-views/surfaces.ts:147-186`). Ops uses `/api/operations/saved-views`. The names `storageKey` / `*_saved_views` are historical (they used to be localStorage keys) and no longer mean localStorage.

### Settings registry notes (for `nav.contextual.<pageId>`)

| Fact | Evidence |
|---|---|
| Def shape: `key, page, group, scope:'org'\|'staff', personalizable?, control, schema(.default required), options, permission?` | `src/lib/settings/types.ts:23-55` |
| `SettingPage` is a closed union `'receiving' \| 'desk'`, and `SETTING_PAGES` declares only those two | `types.ts:13`; `registry.ts:62-65` |
| Guards: keys must start with `${page}.`, every page must be declared, schemas need defaults, org scope needs `permission`, staff scope must have no permission, personalizable ⇒ org | `src/lib/settings/registry.test.ts:16-19,22-26,36,71,77,83` |
| Resolution: staff override → org value → schema default. For `personalizable` org settings the staff value wins. | `src/lib/settings/resolve.ts:34-87` |
| Storage: org scope → `organizations.settings` JSONB; staff scope → `staff_preferences.prefs` JSONB. Dotted keys persist: DB shows `prefs ? 'desk.outbound.fullscreen'` on 2 of 17 staff. | `types.ts:29`; `src/app/api/settings/route.ts:101-104` |
| HTTP: `GET /api/settings?page=<page>` (withAuth, no permission) returns resolved `items[]`; `PUT /api/settings {key,value,target}` validates the schema, checks org-write permission, and audits. **The Tauri app can use this as-is.** | `src/app/api/settings/route.ts:22-44,52-133` |
| Precedent for per-page dynamic keys: `DESK_FULLSCREEN_DESKS` mapped to `desk.<pageId>.fullscreen` (staff scope), keyed by SIDEBAR_PAGE_NAV page id, and read by `DeskPageLayout` via `useSetting('desk', key)` | `registry.ts:30-60,419`; `DeskPageLayout.tsx:110-133`; client hook `src/hooks/useSettings.ts:36,99` |
| **Required for `nav.contextual.<pageId>`:** add `'nav'` to `SettingPage` (`types.ts:13`) and to `SETTING_PAGES` (`registry.ts:62`), or the page-namespace test fails. The settings UI panel renders pages from `SETTING_PAGES` (`src/components/settings/SettingsPanel.tsx:7,149`). Recommended def: `scope:'org', personalizable:true, permission:'admin.manage_features'`, `schema: z.enum(['inherit','legacy','contextual']).default('inherit')` (the pattern of `registry.ts:9-24`), generated from `SIDEBAR_PAGE_NAV` ids like `DESK_FULLSCREEN_SETTINGS`. The resolver must be able to take the resolved value without React; `resolveSetting` is pure (`resolve.ts:34`). | [design proposal] |

### Permission-filter notes

| Layer | Behaviour | Evidence |
|---|---|---|
| Server permission set | `withAuth` → `ctx.permissions`, built by `computeEffectivePermissions`: role union + `permissions_added` − `permissions_removed`; an admin role gets `ALL_PERMISSIONS`. | `src/lib/auth/withAuth.ts:151,206`; `src/lib/auth/permissions-shared.ts:98-125`; `src/lib/auth/current-user.ts:115-148` |
| Client permission set | `useAuth().user.permissions` → `new Set(...)` | `useDeskPageChromeTabs.ts:40` |
| L1 rows | `getSidebarNavItems({permissions})`: `requires` filter, then `sandboxOnly`, then the **lane mobile-first gate** `isLaneVisible` (support and monitor lanes are hidden) | `sidebar-navigation.ts:358-376`; `lanes.ts:57-78` |
| Org override | `mergeOrgNav` hides/renames/orders L1; `applyOrgNavToPage` does child hide/rename/order; unknown ids are ignored | `org-nav.ts:41-117` |
| Children | `filterPageChildren`: drops parked tabs, drops `requires` misses. **Absent permissions set ⇒ every gated child dropped** (`permissions?.has(...) ?? false`). | `sidebar-navigation.ts:1355-1366` |
| Unreachable page | `isSidebarPageReachable`: declared children all filtered ⇒ page removed | `:1369-1371` |
| MasterNav pipeline order | `useOrgNavItems` (items+org) → `toPageNav` → `applyOrgNavToPage` → `filterPageChildren` → `isSidebarPageReachable` | `src/components/sidebar/master-nav/MasterNav.tsx:50-59` |
| Desk tabs pipeline | `getSidebarPageNav` → `filterPageChildren` only, **with no org nav** (a divergence) | `useDeskPageChromeTabs.ts:39-43` |
| ⌘K Go-to | `buildCommandBarNavGroups(permissions)` → `getSidebarNavItems` + `filterPageChildren` reachability; `buildNavDestinations` skips parked tabs | `src/lib/nav/command-bar-nav-groups.ts:63-75`; `nav-destinations.ts:68` |
| Route gate | `permissionForPath` (prefix table) | `sidebar-navigation.ts:693-756` |
| Validity | Every `requires` string on a page, child, L1 row or route is a real `ALL_PERMISSIONS` member (probe: 25 perms, 0 MISSING). | `/tmp/phase0-perm-check.ts` output |
| Gaps | `/reports` needs `operations.view` in nav, but has **no** ROUTE_PERMISSIONS entry and no page guard (client page). `/studio` is guarded by `requirePermission('studio.view')` (`src/app/studio/page.tsx:10`) rather than the table. `GET /api/nav` requires `dashboard.view`; staff without it silently get no org override (`useOrgNavItems.ts:13-21` catches). | as cited |

### Test conventions (src/lib/nav)

- Files are `src/lib/nav/<name>.test.ts`, colocated. They use `import test from 'node:test'` + `import assert from 'node:assert/strict'`, with flat `test(...)` calls; one file uses `describe/it` (`spine-section-accent.test.ts`). All 10 nav tests follow this.
- The runner auto-discovers every `src/**/*.test.ts` (`scripts/run-unit-tests.mjs:37-53`) and invokes `node --test --require ./scripts/register-server-only-shim.cjs --import tsx` (`:108-121`). It runs as the `Unit tests` gate in the **full** verify profile only (`scripts/verify-profile.mjs:193-203`).
- Single file: `node --require ./scripts/register-server-only-shim.cjs --import tsx --test src/lib/nav/<file>.test.ts`. I used the same loader for the probes, and it resolves the `@/` aliases and the Icons React imports.
- The existing contract tests to extend are `src/lib/sidebar-navigation.test.ts:299-443` (every mode round-trips `resolveChild(apply(to()))`, the bare href resolves to the default, mode ids are unique, prod-nav or URL-only) and `:929-964` (lanes), plus `parked-tabs.test.ts` and `nav-destinations.test.ts`.
- `scripts/nav-name-guard.ts` runs in **every** profile (`verify-profile.mjs:152-156`) over `src/lib/nav/nav-name-collisions.ts`. New NavContext labels must not repeat a parent name in a child.
- `src/lib/settings/registry.test.ts` pins the settings invariants listed above.

#### Open questions / risks

1. **The handoff's localStorage key names are wrong.** Real keys: `assistant:recent-detail-stacks`, `support:recent-tickets`, `audit-log.trace.recents`. Any migration or cleanup must target these.
2. **Shipping has two competing section models.** `SIDEBAR_PAGE_NAV` (4 children; Pick list lights "To ship") vs `DESK_VIEWS` (5 views; "Action list"; Pick list in the Picking group). The live org override adds a third order and a stale `fba` child id. Someone has to pick the single source before `resolveNavContext`. The recommendation is `DESK_VIEWS` for the outbound section, with the SIDEBAR child `orders` resolved differently for `?queue=pick`. The org override needs cleaning.
3. **`OutboundDeskSpine` does not exist**, but `SidebarContextPanel.tsx:85-87` says the Shipping desk lives there. Today the desk has no rail, no tabs (`bare`), and `DESK_VIEWS` has no UI consumer. The only ways into Picking are the MasterNav children and ⌘K, which matches the handoff's "state of the tree".
4. **`category` on `/shipping/exceptions` is stripped by hygiene.** `/shipping/shortage` has no spec. Wave A's NavContext filters for these routes need spec entries first, or the facet links will be erased on arrival.
5. **`/reports` resolves to page id `unknown`.** The nav has 4 children; the page has 7 hand-rolled tabs; there is no route permission. `resolveNavContext` needs a `reports` route key, or the page falls off the contract.
6. **FBA's FNSKU scan field is not mounted on `/shipping/fba`** [INFERENCE from grep: only `FbaWorkspaceSidebar` mounts it, reachable only on key `fba`]. This is a "never remove a scan input" hazard, and it may already have happened. Verify in the browser.
7. **The `receiving_incoming` saved-view paramKeys are dead** (`table-url-params.ts:57-64`). Every view saved on Deliveries restores nothing.
8. **Server recents already exist but are unwired:** `search_recents` plus `/api/search/recents` have no caller (last write 2026-08-27). `receiving_line_views` is live. Before adding `nav_recents`, decide whether to fold these in or delete them; handoff rule: no second convention.
9. Icons in `SIDEBAR_PAGE_NAV` are React components (`sidebar-navigation.ts:1-45`), so an HTTP `NavContext` must carry icon ids, not components. Importing `sidebar-navigation.ts` server-side works under tsx; the Next route runtime behaviour is untested [INFERENCE: it should work because API routes already import it indirectly].
10. **Authed HTTP probes were blocked.** `scripts/lighthouse-mint-session.mjs` failed with `signin 500`, and the lane log shows `cannot execute INSERT in a read-only transaction` at `src/app/api/auth/signin/route.ts:136`: the dev DB session is read-only, so no session can be minted. `/api/settings`, `/api/nav` and `/api/orders/desk-counts` behaviour comes from code, not live probes.
11. `docs/refactors/desk-3pane-ai-first-PLAN.md`, handoff read-first #4, was deleted in `270795058`. The routing contract it describes survives only in `desk-views.ts` / `desk-view-filters.ts`.
12. The Support lane and the Operations/monitor lane are `hidden` by the mobile-first gate (`lanes.ts:66,68`), yet both pages have children. `NavContext` must apply `isLaneVisible` too, or the web shell and Tauri will show doors MasterNav hides.

## Identification path audit


Repo `/home/michaelgarisek/Projects/cycleforge-lanes/prod`, lane `cycleforge-lane@prod` (:3050, `NODE_ENV=development`), dev Neon branch (pooler host from `.env`), org `usav` = `00000000-0000-0000-0000-000000000001`. All DB access was SELECT / EXPLAIN (ANALYZE) on SELECT.

### Endpoints: handler, flow, cache, response

| Surface | Handler | Auth / perm | Flow (order of attempts) | Cache | Response shape |
|---|---|---|---|---|---|
| `GET\|POST /api/scan/resolve` | `src/app/api/scan/resolve/route.ts:566-577` → `resolve()` `:376-564` | `withAuth`, `sku_stock.view` `:570,577` | 0. printed handle via `routeScan`, but only for types receiving / receiving-line / serial-unit / handling-unit / bin that have a redirect `:389-431` → 0.5 tenant Studio grammar `loadPublishedIdentificationMethods` + `classifyIdentificationScan` `:435-462` (uncached DB read every call, `src/lib/identification/load-published.ts:18-27`) → 0b plain PO `:466-487` → 1. GS1 AI payload `:490-504` → 2. URL / Digital Link `:507-534` → 3. `classifyInput`: tracking → serial → else order_id, then open-order SKU `:537-546` | Only `resolveSkuByGtin` uses `getOrSet(CACHE_NS.skuByGtin, 1800s, [skuCatalog])` `:256-283`. The rest is uncached | `{ok, kind: ResolveKind, source:'ai'\|'url'\|'pattern'\|'none', raw, url?, ais?, entity?, matches: OrderMatch[], matchOutcome:'single'\|'multi'\|'none', mobileRoute}` `:25-66`. `matches` holds **orders only** (`id, order_id, sku, product_title, status, quantity, account_source`). Side effects: `mobile_scan_events` INSERT `:301-327`, and `publishScanLog` realtime to the staff phone-history on handle / grammar / PO hits `:427,456,484` |
| `GET /api/global-search` (⌘K + `/search`) | `src/app/api/global-search/route.ts:22-115` → `findRecords` `src/lib/search/find-records.ts:96-133` | `withAuth` with **no permission** `:22-115` | `findRecords.runOnce` `:61-94`: exact fan-out `searchAllEntities` (`global-entity-search.ts:1019-1105`). The hybrid (`hybrid-retrieval.ts:322-382`) runs only when no axis, `!looksLikeIdentifier`, and exact returned fewer than `limit`. After a miss (non-identifier only), synonyms plus a relaxation ladder of ≤3 rungs `find-records.ts:120-130`, `query-relaxation.ts:32-81` | Upstash `api:global-search:v5:{org}`, key `{org,q,limit,axis}`, TTL 60 s, tags `global-search, orders, repair-service, fba, receiving-logs, sku-catalog` `route.ts:47-53,88-95`. **`REDIS_CACHE_DISABLED=true` in `.env`**, so the dev lane is always MISS (`cache-flags.ts:10-12`) | `{rows: GlobalSearchResult[], count, query, relaxed, effectiveQuery, usedSemantic}` `route.ts:77-86`. A row is `{id, entityType, title, subtitle, href, matchField, facets?}`. Header `x-cache`. Logs `recordSearchQuery` in `after()` on both HIT and MISS `:59-71,97-109` |
| `GET /api/orders/lookup/[orderId]` | `src/app/api/orders/lookup/[orderId]/route.ts:157-210` | `withAuth`, `orders.view` `:210` | `?by=id` gives a PK lookup `:114-127`. Otherwise exact `o.order_id = $1` `:99-112`, then `findOrderByTrackingKey` (`src/lib/orders-exceptions.ts:127`) `:189-194`, then 5 activity rows from `work_assignments` `:129-155` | `getOrSet(CACHE_NS.orderDetail, 20s, [orders, techLogs, orderDetail])` `:172-204` (disabled on dev) | `{ok:true, order: OrderLookupRecord, activity[]}` (`src/lib/orders/order-hub.ts:5-6`); 404 `{ok:false, error:'not_found'}` |
| ⌘K command bar | `src/components/CommandBar.tsx` | client | Debounce 0 ms for an identifier, 80 ms otherwise `:326`. Fetches `/api/global-search?q&limit=12&surface=palette[&axis]` `:332-340`. Printed handles are decoded client-side (`decodedHandle`, `directOpenForTypedHandle` `:311-315`; `useFindFieldScan` → `searchPageHrefForScanRoute` `:466-480`). Nav groups are static `buildCommandBarNavGroups` `:203`. The click posts `/api/search/opened` `:418-427` → `markSearchResultOpened` | Recents live in **localStorage** `command-bar-recent`, max 6 `:92-118`, which Tauri/server cannot reach | Client facets (entity type, platform) are counted over the 12 fetched rows `:364-392` |
| query log | `src/lib/search/query-log.ts` | — | `recordSearchQuery` INSERT `:49-87`. `markSearchResultOpened` UPDATEs the newest unopened row matching `(org, normalized_query, staff)` `:91-122`. `zeroResultWorklist` `:132-168` | — | Table `search_query_log(id, organization_id, staff_id, query, normalized_query, axis, surface, result_count, relaxed, used_semantic, latency_ms, opened_entity_type, opened_entity_id, opened_at, created_at)`. `surface` is free text with no CHECK constraint (only PK + staff FK). `SearchSurface` TS union is `'palette'\|'search-page'` `:9`. Indexes: `idx_search_query_log_open_target (org, staff_id, normalized_query, created_at DESC) WHERE opened_at IS NULL`, `org_recent`, `zero_result` |

### Grammar matrix (endpoint × identifier kind)

✅ recognised and resolves · ⚠️ recognised but broken or partial · ❌ not recognised. Measured hit rates (n=25) are from the latency run below.

| Kind | Classifier (file:line) | scan/resolve | global-search | orders/lookup |
|---|---|---|---|---|
| Carrier tracking | `TRACKING_PATTERNS` `src/utils/carrier-patterns.ts:82-139`; `classifyInput` `scan-resolver.ts:75-114`; `looksLikeTrackingIdentifier` `global-entity-search.ts:148-163`; `orderTrackingMatchKeys` `tracking-format.ts:118-129` | ⚠️ **0/25.** `lookupOrdersByTracking` queries `stn.tracking_number_key18` `route.ts:79`, a column that exists nowhere (not in the DB, and grep finds it only in this file). The error is swallowed `:86-88`, so tracking always returns `none`. The same helper backs AI `00`/`420` `:363-364` and URL `/p/` `:342-343` | ✅ 25/25 via `searchOrders` STN-first + `shipment_links` `global-entity-search.ts:191-238`, plus holds `:605-699` | ✅ 25/25 via `findOrderByTrackingKey` fallback `route.ts:189-194` |
| Order # (Amazon `3-7-7`, eBay `2-5-5`, numeric Ecwid/Walmart) | `sqlIdentifierEqualsQuery` (compact / last-8 / chip) `order-number-match.ts:88-101`; `looksLikeIdentifier` `search-hit.ts:151-159` | ⚠️ Amazon 0/25: parsed as **GS1 AI** (`113-…` becomes AI `11` = "3-1528") because `parseGs1AiPayload` accepts any input starting with 2 digits that form a known AI `scan-resolver.ts:224-286,245`. eBay 0/25: 17 are classified FedEx tracking (`/^\d{12}$/` after dashes are stripped), 8 as AI. Numeric: 7/25 "hits" are **false positives**. `serial_partial` `scan-resolver.ts:28,109` goes to serial `LIKE '%n%'` `route.ts:155-183` (probe `4993` → order `1097`), and `lookupOrderById` is never reached `:541-545` | ✅ 25/25 each shape. Identifier path `global-entity-search.ts:175-189` | ✅ 25/25 (exact `order_id`) |
| Marketplace line / item # | `o.item_number` in the same predicate `global-entity-search.ts:173,180` | ❌ | ✅ (identifier path) | ❌ |
| Serial (on order, `tech_serial_numbers`) | `SERIAL_FULL_REGEX` `scan-resolver.ts:27` | ✅ 20/25 (4 lost to the AI misparse, 1 `unknown`). Ladder: exact, then suffix, then contains `route.ts:91-189` | ⚠️ **14/25.** The identifier path searches only `serial_units` `:521-554`. `tech_serial_numbers` serials are matched only in the non-identifier ILIKE `:247`. In DB, **1 284 / 4 117 tsn serials have no `serial_units` row**. `entity_search_docs` holds them, but the hybrid is bypassed for identifiers `find-records.ts:69` | ❌ 0/25 (404) |
| Serial (unit, `serial_units`) | same | ⚠️ 4/25 (only units attached to orders) | ✅ 25/25 `searchSerialUnits` | ❌ |
| SKU | `searchSkus` ILIKE sku/title `global-entity-search.ts:491-514` | ❌ 0/25. Returns only **open orders** carrying the SKU `route.ts:233-252`, never the SKU entity. 24/25 are misparsed as AI (`00096` → AI `00`) | ⚠️ 25/25 non-empty, but 10 bare-numeric SKUs are **shadowed by a support ticket**: `looksLikeTicketScan` `/^#?\d{1,12}$/` (`support/ticket-scan.ts:7-9`) returns tickets only `global-entity-search.ts:1072-1075` (`00096` → "Support ticket #96") | ❌ |
| UPC-A / EAN-13 (bare) | none. `sku_catalog.upc/ean/gtin`, `items.upc/ean` are indexed (`items_upc_idx`, `idx_sku_catalog_upc`, `idx_sku_catalog_org_gtin`) | ❌ 0/25. Misparsed as AI (`0014…` → AI `00`). A 12-digit value would also match FedEx `/^\d{12}$/` `carrier-patterns.ts:91` | ❌ 0/25. `searchSkus` ignores upc/gtin. The docs index has `upc/item_upc/ean/gtin` (`build-search-text.ts:249-253`, loader `search-outbox-worker.ts:196-202`), but identifiers skip the hybrid | ❌ |
| GTIN-14 (bare, e.g. `0200…`) | same | ❌ 0/25 (AI `02`, and `pickAiRoutingValue` has no `02` `scan-resolver.ts:289-298`) | ❌ 0/25 (same reason) | ❌ |
| GS1 Digital Link `/01/{gtin}[/21/s][/10/lot]` | `parseScannedUrl` `scan-resolver.ts:132-178`; `GS1_PATH_RE` `barcode-routing.ts:43` | ⚠️ `gs1_product` is recognised and the SKU resolves through the cached GTIN lookup, but the only output is open orders for that SKU: 1/25. With `/21/serial`, step 0 short-circuits to `gs1_unit` + redirect without resolving `route.ts:389-400` | ❌ 0/25. `routeScan` marks it printed, it goes to `searchInternalIds`, and the result is empty `global-entity-search.ts:1045-1046` | ❌ |
| GS1 AI element string `(01)…(21)…`, FNC1 | `parseGs1AiPayload` `scan-resolver.ts:224-286` (AIs `00 01 02 10 11 13 15 17 20 21 22 30 37 240 400 420 421` `:183-205`); location/unit AIs `barcode-routing.ts:195-214` | ⚠️ parses, then routes on 21, 00/420, 10, 01 `:289-298`: 1/25 (GTIN resolves to SKU, but only open orders come back) | ✅ 25/25 by accident: `(`/`)` make `looksLikeIdentifier` false, so the keyword arm matches `gtin` inside `search_text` | ❌ |
| SSCC | `scannedSscc` `barcode-routing.ts:83-88` | ⚠️ AI `00` is treated as tracking, which hits the key18 bug | ❌ | ❌ |
| FNSKU `X00…` / ASIN `B0…` | `FNSKU_REGEX`/`ASIN_REGEX` `scan-resolver.ts:31-33`; `routeScan` → `fnsku` `barcode-routing.ts:262-263` | ❌ 0/25 (`serial_partial`/`unknown`, no FNSKU lookup) | ❌ 3/25, and those 3 are only tracking-exception rows. `fba_fnskus` (indexed `org,fnsku`) is never queried. Docs carry `item_fnskus` `build-search-text.ts:316-317`, but identifiers skip the hybrid | ❌ |
| PO (`zoho_purchaseorder_number`, mostly shaped `2-5-5` like eBay) | `/^[A-Z0-9][A-Z0-9_\-]{2,}$/i` `route.ts:466` | ✅ 25/25 → `/m/r/{id}` `route.ts:212-231` (OR on number/id; `zoho_purchaseorder_number` has **no index**) | ❌ **0/25. Bug:** in `searchReceiving`'s identifier non-tracking branch, `$2` is unused (`global-entity-search.ts:360-406`). Postgres then fails with "could not determine data type of parameter $2" (reproduced with `PREPARE`), and the error is caught into `[]`. The branch is reached only for the 2 dashed shapes, because `looksLikeTrackingIdentifier` returns true whenever `key18` is non-empty, which covers every alphanumeric input `:158`. So identifier-shaped receiving is only ever matched **by tracking**, never by PO or source order id | ❌ 404 |
| Printed handles `R-/L-/U-/H-/REP-/RCV-/T-/KIT-`, locations, `/m/{r,l,u,h}` URLs | `routeScan` `barcode-routing.ts:168-292` | ✅ R 25/25, U 25/25 (redirect only, no entity lookup). ⚠️ `T-`/`KIT-` are not in the allow-list `route.ts:390-396`, so they fall through to the PO lookup | ✅ R 25/25, U 25/25 (`searchInternalIds` `:706-931`, ticket/repair/manifest `:1029-1044`) | ❌ |
| Support ticket `#123` | `looksLikeTicketScan` | ❌ | ✅ (shadows numeric SKUs / order #s, see above) | ❌ |
| Tenant Studio grammar | `classifyIdentificationScan` `src/lib/identification/compile-grammar.ts` | ✅ `route.ts:435-462` | ❌ | ❌ |
| Brand | — (no `brand`/`manufacturer` column anywhere in `public`; `bose_models` has 0 rows) | ❌. Probe `bose` → `serial_partial` → contains-LIKE → false-positive single order `24-14487-69146` | ⚠️ 20/20 non-empty through ILIKE fan-out + keyword arm. Ranking is by entity bucket, not relevance (see Ranking) | ❌ |
| Model number (`AWRCC1`, `PS48`, `421088`) | none | ❌ 1/20 | ⚠️ 20/20 non-empty. `tokenSelectivity` protects mixed alphanumeric tokens during relaxation `query-relaxation.ts:18-28` | ❌ |
| Fuzzy title / typo | keyword arm `<%` `word_similarity` (threshold **0.6**) `hybrid-retrieval.ts:85-124` | ❌ 0/20 | ⚠️ 19/20 non-empty. Transpositions in short words miss: `bsoe` gives 0 keyword rows, `similarity('bose','bsoe')=0.11`. `guitr hero` and `soundlnik` do match | ❌ |
| Multi-line batch | none (no splitter anywhere) | ❌ 0/20 (`unknown`) | ⚠️ 17/20 non-empty, but only through the **relaxation ladder** (`relaxed=true`, tokens dropped), so the rows are not per-line answers. p50 3.2 s | ❌ |

### Latency (dev lane, authed, sequential, cache disabled)

Method: session minted like `scripts/lighthouse-mint-session.mjs` (pinless `usav`/Michael). Bun `fetch` against `http://localhost:3050`. Each identifier was run once (so no warm cache) after route warm-up. Samples are real values drawn read-only from the DB (`ORDER BY md5(id)`): 25 per identifier class, 20 per free-text class. global-search used `limit=12` with no `surface`, which is the ⌘K shape. Cells are `p50 / p95 ms · non-empty/n`. For scan, non-empty means `matchOutcome≠none`. Non-empty does not mean correct: see the false positives above.

| Class | scan/resolve | global-search (⌘K) | orders/lookup |
|---|---|---|---|
| tracking | 1909 / 2492 · 0/25 | 1305 / 2096 · 25/25 | 2060 / 2344 · 25/25 |
| order_amazon | 1540 / 1839 · 0/25 | 1180 / 1537 · 25/25 | 1099 / 1436 · 25/25 |
| order_ebay | 1824 / 2608 · 0/25 | 1104 / 1200 · 25/25 | 1166 / 1388 · 25/25 |
| order_numeric | 2694 / 3080 · 7/25 (false +) | 1920 / 2360 · 25/25 | 1168 / 1230 · 25/25 |
| serial_order (tsn) | 1916 / 2207 · 20/25 | 1269 / 1757 · 14/25 | 1732 / 2120 · 0/25 |
| serial_unit | 1793 / 2217 · 4/25 | 1280 / 2220 · 25/25 | — |
| sku | 1395 / 4691 · 0/25 | 1528 / 2284 · 25/25 (10 ticket-shadowed) | — |
| gtin (bare 14) | 1070 / 1404 · 0/25 | 1397 / 1876 · 0/25 | — |
| upc (bare 12, `items.upc`) | 1452 / 2030 · 0/25 | 2101 / 2636 · 0/25 | — |
| gs1_dl `https://id.gs1.org/01/…` | 1464 / 1568 · 1/25 | 488 / 560 · 0/25 | — |
| gs1_ai `(01)…` | 1491 / 2042 · 1/25 | 1893 / 2461 · 25/25 | — |
| fnsku | 2092 / 2497 · 0/25 | 1307 / 1636 · 3/25 | — |
| po | 1089 / 1351 · 25/25 | 1256 / 2131 · 0/25 | 1660 / 2068 · 0/25 |
| handle R- | 389 / 811 · 25/25 | 877 / 1308 · 25/25 | — |
| handle U- | 411 / 527 · 25/25 | 848 / 1206 · 25/25 | — |
| brand (20 terms) | 2103 / 2260 · 3/20 | 1761 / 2055 · 20/20 | — |
| model number (20) | 1736 / 2300 · 1/20 | 1780 / 2119 · 20/20 | — |
| fuzzy / free text (20) | 1779 / 2612 · 0/20 | 1861 / 2703 · 19/20 | — |
| multi-line (3 ids/line ×20) | 1389 / 1688 · 0/20 | 3157 / 3709 · 17/20 | — |
| **floor** (empty input: auth + framework) | 320 / 613 | 312 / 348 | — |

What drives the latency:

| Factor | Evidence |
|---|---|
| Local lane to Neon us-east-1 round trip is about 90–150 ms | `psql \timing` `select 1`: 92 / 144 / 100 / 147 ms |
| Every `tenantQuery` costs **4 round trips** | `BEGIN` → `set_config('app.current_org')` → query → `COMMIT` `src/lib/tenancy/db.ts:35-47,55-63`. That is about 400 ms per query on this lane, so scan/resolve's sequential chain costs about 1.5–2.5 s: grammar load, PO lookup, main lookup, fallback, and the INSERT. `[INFERENCE]` In prod (co-located) this collapses to milliseconds. The number of sequential round trips is the real cost driver |
| Keyword arm on `entity_search_docs` **seq-scans** (the trigram index is not used) | The OR of `=`, two `LIKE`s and `<%` in one WHERE `hybrid-retrieval.ts:92-101` gives `Seq Scan … rows=8500`, 200–350 ms of server CPU (`bose` 350 ms, `bsoe` 198 ms, `guitr hero` 209 ms). Forcing index use is worse (1.2–2.1 s, via `idx_entity_search_docs_org_happened`). A single-predicate `LIKE '%soundlink color%'` uses `idx_entity_search_docs_search_trgm` in 4.8 ms. `<%` alone still seq-scans at 109 ms |
| Identifier `order_id` predicate cannot use an index | `sqlIdentifierEqualsQuery` wraps the column in `regexp_replace`, which gives `Seq Scan on orders`, 29 ms (5 183 rows). Plain `order_id = $1` uses `idx_orders_unique_org_account_order_line` in 0.05 ms |
| Exact lookups for identify are already indexed and sub-ms | `sku_catalog.gtin` 0.03 ms (`idx_sku_catalog_org_gtin`), `items.upc` 0.07 ms (`items_upc_idx`), `fba_fnskus.fnsku` 0.04 ms (`fba_fnskus_org_fnsku_key`). `UPPER(tsn.serial_number)=` seq-scans in 1.1 ms (no `upper()` index; 4 117 rows) |
| No vector arm on dev | `entity_search_docs`: 12 533 rows, **0 embedded** (14 MB, avg `search_text` 137 chars). `usedSemantic=false` on every probe |

### Ranking notes

| Where | Logic (file:line) | Consequence |
|---|---|---|
| `searchAllEntities` identifier path | Fixed concatenation `[orders, receiving, holds, units, skus, fba, repairs]`, each `ORDER BY created_at/id DESC` `global-entity-search.ts:1076-1093` | Entity-bucket order, not match quality. An exact SKU ranks under any order whose tracking tail matches |
| `searchAllEntities` free-text path | `perEntity = ceil(limit/7)` for each of 7 searchers, concatenated `[orders, holds, repairs, fba, receiving, skus, units]` `:1094-1104` | For `bose`, the ⌘K top 3 is typically `order, order, import_exception`, while the SKU sits at slot 11+. Recency decides within each bucket |
| Ticket short-circuit | `/^#?\d{1,12}$/` returns tickets **only** `:1072-1075` | Numeric SKUs / order #s are hidden when a ticket id collides |
| `findRecords` merge | exact first, then hybrid appended, de-duplicated `find-records.ts:79-91` | The hybrid only fills slots the exact arm left |
| Hybrid keyword arm | score 400 exact, 300 prefix, 200 contains, `word_similarity×100` for fuzzy. Ties go to `happened_at DESC` `hybrid-retrieval.ts:92-120` | `bose` matches 8 500 docs, all at 300/200, so recency decides |
| Hybrid RRF | `1/(60+rank+1)` across keyword + vector arms, optional ×1.3 `boostEntityTypes`, tiebreak by entity_type then id `hybrid-retrieval.ts:284-318` | On dev only the keyword arm contributes (0 embeddings) |
| `hybridSearch` identifier bypass | Identifiers go exact-only, with no keyword or embedding `:335-357` | This is why UPC, GTIN, FNSKU and tsn serials, which *are* in `search_text`, return nothing |
| Relaxation | synonym rung + single-token drops + cumulative drops, max 3 rungs, protected-token rule `query-relaxation.ts:8-81`; synonyms `query-expansion.ts:41-89` | Multi-line pastes get relaxed into unrelated order hits |
| scan/resolve | First branch wins, no scoring. Outcome = count of order matches `route.ts:548` | Wrong classification gives a wrong or empty answer with no second opinion |

### Trigram (pg_trgm) availability

`pg_trgm 1.6` installed (also `vector 0.8.0`, `btree_gist`, `pgcrypto`). **No `fuzzystrmatch`**, so no Levenshtein / soundex. Settings: `pg_trgm.similarity_threshold=0.3`, `word_similarity_threshold=0.6`.

| Table | Index | Expression | Usable by current code? |
|---|---|---|---|
| entity_search_docs | idx_entity_search_docs_search_trgm | `gin (lower(search_text))` | Not by the keyword arm as written (OR causes a seq scan); yes by single-predicate LIKE |
| orders | idx_orders_product_title_trgm, idx_orders_sku_trgm | `gin (lower(product_title))`, `gin (lower(sku))` | No. `searchOrders` uses `o.product_title ILIKE` / `o.sku ILIKE`, which don't match the `lower()` expression `global-entity-search.ts:245-246` |
| sku_catalog | idx_sku_catalog_product_title_trgm **and** ix_sku_catalog_title_trgm | both `gin (product_title)`, a **duplicate** | Yes for `product_title ILIKE` (but 1 717 rows, so the planner seq-scans in 0.5 ms) |
| sku_platform_ids | ix_sku_platform_ids_listing_title_trgm | `gin (listing_title)` | Not referenced by search |
| platform_listings | idx_platform_listings_merchant_sku_trgm | `gin (merchant_sku) WHERE is_active` | Not referenced by search |
| shipping_tracking_numbers | …tracking_number_raw_trgm | `gin (lower(tracking_number_raw))` | Via `sqlTrackingNumberMatches` like-param [INFERENCE: not EXPLAINed] |
| tech_serial_numbers | idx_tech_serial_numbers_serial_number_trgm | `gin (lower(serial_number))` | No. scan/resolve uses `UPPER(serial_number) LIKE` `route.ts:116,146,177` |
| customers | idx_customers_name_trgm, idx_customers_fullname_trgm | name expressions | Partly (buyer search) |
| tool_registry | idx_tool_registry_description_trgm | — | n/a |

### Gap list (for POST /api/identify)

| # | Gap | Evidence |
|---|---|---|
| G1 | **Brand**: no column, no alias table, no classifier. `bose_models` is empty | information_schema scan; `bose_models` count 0 |
| G2 | **Model number**: no model field or classifier. It only matches as substring text | matrix row |
| G3 | **Fuzzy title**: `word_similarity≥0.6` misses short-word typos (`bsoe`). No Levenshtein extension. Vector arm empty on dev | EXPLAIN + `similarity('bose','bsoe')=0.11`; 0 embeddings |
| G4 | **Multi-line batch**: no splitter on any endpoint | matrix row |
| G5 | **UPC/EAN/GTIN (bare)**: resolvable by index in under 0.1 ms, but no endpoint does it | matrix + EXPLAIN |
| G6 | **FNSKU/ASIN**: classifier exists, no endpoint looks up `fba_fnskus` | matrix |
| G7 | scan/resolve **tracking is dead** (`tracking_number_key18` column missing, error swallowed) | `route.ts:79,86-88`; `42703 column … does not exist` |
| G8 | scan/resolve **GS1 AI over-match**: any input starting with 2 digits that form a known AI (order #s, numeric SKUs, UPCs, digit-leading serials) becomes `gs1_ai` | `scan-resolver.ts:245-286`; probe results |
| G9 | scan/resolve **short-numeric / brand false positives** via `serial_partial` contains-LIKE, which runs before order_id | `scan-resolver.ts:28,109`; `route.ts:155-183,541-545` |
| G10 | global-search **receiving by PO / source order id is broken** (unused `$2`), and never attempted for other identifier shapes (`key18` makes everything tracking-shaped) | `global-entity-search.ts:158,360-406` |
| G11 | global-search **tsn serials missing** on the identifier path (31 % of tsn serials) | `:521-554`; DB count |
| G12 | Numeric SKU / order # **shadowed by ticket** short-circuit | `:1072-1075` |
| G13 | Results carry no **brand, confidence, stage, actions, or matchedOn token**. `matchField` is a coarse entity label (`'order'`, `'sku'`) | `GlobalSearchResult` `:30-65`; mappers |
| G14 | No **context-scoped** ranking (the only scope is the axis) | `search-by.ts:7-13` |
| G15 | ⌘K **recents are localStorage-only**. The server has `search_query_log.opened_entity_*`, but no reader API for "my recent opens" | `CommandBar.tsx:92-118`; `query-log.ts` exports only a writer + zero-result reader |
| G16 | `/api/global-search` has **no permission gate** | `route.ts:22` |

### Reuse recommendation for POST /api/identify

1. **Classifier: new pure module, reuse the regexes, not the scan/resolve ladder.** Build `classifyIdentifyToken(line) → Candidate kinds[]` returning *all* plausible kinds with priors, not first-match. Reuse:
   - `routeScan` / `decodedHandle` for printed handles (`barcode-routing.ts:168,352`);
   - `parseScannedUrl` for Digital Link;
   - `parseGs1AiPayload` **only** when parenthesised / FNC1 / symbology-prefixed, or when the AI parse consumes the whole string with valid fixed lengths (fixes G8);
   - `TRACKING_PATTERNS` + `orderTrackingMatchKeys`;
   - `scannedFnsku`/ASIN;
   - `looksLikeTicketScan`;
   - Studio grammar (`classifyIdentificationScan`);
   - GTIN check-digit validation for 8/12/13/14-digit input (new; disambiguates UPC from FedEx-12).
   Split on `\n` first (G4).
2. **Exact arm: one SQL round trip per request.** A single `UNION ALL` CTE (or `Promise.all` inside **one** `withTenantConnection`) with plain-equality, index-backed probes:
   - `orders.order_id`;
   - `orders.item_number` (no index: add one);
   - STN `tracking_number_normalized` (reuse `sqlTrackingNumberMatches`);
   - `serial_units.normalized_serial`, and `tech_serial_numbers` (add an `upper(btrim(serial_number))` index);
   - `sku_catalog.sku|gtin|upc|ean`, `items.upc|ean`;
   - `fba_fnskus.fnsku|asin`;
   - `receiving_carton.zoho_purchaseorder_number` (add an index) / `source_order_id`.
   Four sequential `tenantQuery` calls cost about 1.6 s on the dev lane. The <150 ms p95 target is only reachable with 1 connection × 1 query. Do **not** route through scan/resolve (its tracking, AI and serial bugs) or through `sqlIdentifierEqualsQuery` on the hot path (it seq-scans). Keep the compact / last-8 equality as a second-tier fallback only.
3. **Free-text arm:** reuse `hybridSearch`'s RRF (`hybrid-retrieval.ts:284-318`) and `docRowToHit`/`searchHitHref`. Replace the OR'd keyword SQL with separate index-friendly arms (e.g. `LIKE` via trgm, plus `%`/`<%` on a short `lower(title)` expression) so the GIN index is used. Add brand-alias expansion (Phase 1 brands table) before search. Cap the relaxation ladder at identify's budget, or turn it off for batch lines.
4. **Candidate shape:** extend `SearchHit` / `GlobalSearchResult` rather than adding a third DTO. Add `brand`, `confidence`, `matchedOn: {field, token}`, `stage`, and `actions[]`. `href` comes from `searchHitHref` plus the nav-context builder.
5. **Logging and recents:** call `recordSearchQuery` with a new surface value `'identify'`. This needs the `SearchSurface` union widened at `query-log.ts:9`; there is no DB CHECK. Reuse `markSearchResultOpened` via `/api/search/opened`. Add a `recentOpened(orgId, staffId)` reader over `opened_entity_*` (index `idx_search_query_log_org_recent` exists; staff-scoped reads would want `(organization_id, staff_id, opened_at DESC) WHERE opened_at IS NOT NULL`). That makes it a server recents surface replacing `command-bar-recent`.
6. **Cache:** follow the global-search pattern: org-partitioned namespace, tags `orders`/`sku-catalog`/…. Note that `REDIS_CACHE_DISABLED=true` on dev, so dev latency numbers are always uncached.
7. **Fix-or-retire decisions for owners (not in identify scope):** G7, G8, G9 in scan/resolve; G10, G11, G12 in global-entity-search; the duplicate `sku_catalog` trgm index; the `orders` trgm expressions that don't match `ILIKE` usage.

#### Open questions / risks

- **DB setting incident (mine):** my psql wrapper sent session-level `SET default_transaction_read_only=on;` through the Neon **pooler** (transaction pooling). This very likely leaked read-only onto shared backends and caused the lane's 11:17–11:27 "cannot execute INSERT in a read-only transaction". I reported this to Main and switched to `BEGIN READ ONLY … ROLLBACK`. No ALTER DATABASE/ROLE was ever run.
- **Probe side effects:** the HTTP probes wrote telemetry. `search_query_log`: 465 rows (surface NULL, staff Michael, 18:17–18:49 UTC). `mobile_scan_events`: 336 rows (18:17–18:53 UTC; fewer than calls, consistent with inserts failing during the read-only window). PO/handle hits also pushed `publishScanLog` realtime events to Michael's phone-history. These rows skew `zeroResultWorklist`; cleanup is Main's call.
- **Auth outage mid-run:** from 11:44:25 every authed call returned 500 `column s.credential does not exist` (`src/lib/auth/session.ts:290,294,353`, working-tree ` M`). Reported. The lookup bench was re-run after recovery, and the scan/global-search runs finished before the outage.
- **Absolute numbers:** they are dev-lane numbers (`next dev`, remote Neon, about 100 ms RTT, 4 RTT per `tenantQuery`, cache off). The spec's p95 budgets (150 / 400 ms) should be judged against round-trip count and server-side EXPLAIN times, or measured on a co-located deployment. `[INFERENCE]` prod is far lower.
- **Hit rates are presence-only:** relevance was not graded for brand, model, fuzzy and multi-line (for example, `bose` returns orders/holds before SKUs).
- The `T-`/`KIT-` fall-through in scan/resolve (`route.ts:390-396`) is inferred from code and not probed.
- JBL/Sony have little data (12 and 36 docs contain the token), so a brand fixture set should lean on Bose / Guitar Hero / Rock Band.
- Adding plain-equality indexes (`receiving_carton.zoho_purchaseorder_number`, `orders.item_number`, `upper(btrim(tech_serial_numbers.serial_number))`) overlaps SchemaAudit's scope; coordinate before the migration.
