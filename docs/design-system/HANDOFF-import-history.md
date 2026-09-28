# HANDOFF — Import history: its own page, a real per-order record, sidebar filters

> Paste this whole file as the prompt. Repo: `cycleforge-lanes/prod`. Dev origin `:3050` only
> (AGENTS.md §1). Owner ask (2026-09-28): the past imports need a better display on **their
> own page**, showing **exactly which ids** came in through each import, and **filtered from
> the left contextual sidebar**.

## 0. Read first

- Skills: `db-migration-author` (the new tables), `new-route` (the APIs), `new-ui-surface`
  (the page), `org-scope` (tenant scoping).
- Laws: AGENTS.md §4 (SKU identity: titles through `resolveSkuIdentityTitle` +
  `SKU_CATALOG_JOIN_ON_SQL`; nav: a parent and a child never share a name; every operator
  verb completable on `/m/*`). `docs/mobile-first/SURFACE_LAW.md`.
- Context: `docs/integrations/google-sheets.md` (the orders backfill pipeline).

## 1. What exists today (do not rebuild it)

| Piece | Where | What it holds | Gap |
|---|---|---|---|
| Run ledger | `cron_runs` (`src/lib/migrations/2026-06-07_create_cron_runs.sql`), written by `withCronRun` (`src/lib/cron/run-log.ts`) | one row per job run: `job`, `status`, `trigger` (`cron`/`manual`), times, `summary` JSONB, `error` | **global, no `organization_id`**; `summary` is free JSON; no per-order rows |
| Orders pipeline | `runOrdersBackfillPipeline` (`src/lib/sync/orders-backfill-pipeline.ts`), cron `orders.backfill_pipeline` + header Sync `pipeline:orders` | per org: ShipStation → Google Sheets → other channels → exceptions; per-step `imported/updated/error` | the per-step outcome is only inside `cron_runs.summary` |
| Writer detail | `ingestCanonicalOrders` (`src/lib/orders/ingest-canonical-orders.ts`) → `IngestCanonicalOrdersResult.details` (`TransferOrderDetails`, `src/lib/orders-sync/types.ts`) | per row: `orderId` (external number), title, sku, itemNumber, tracking, platform, quarantineReason | **carries no `orders.id`**; returned to the caller and then thrown away |
| ShipStation run state | `shipstation_sync_runs` (`2026-09-24h_shipstation_order_refs.sql`) | per org backfill checkpoints, `counts`, `reasons` | counts only |
| ShipStation pairing | `shipstation_order_refs`, `shipstation_shipment_refs` (same migration) | `shipstation_order_id` ↔ `order_row_id`, `match_kind`; `shipstation_shipment_id`, `tracking_number`, `attach_status` | durable, but not tied to a run |
| Sheet refusals | `order_import_exceptions` (`2026-07-30c_order_import_exceptions.sql`) | `account_order_id`, `account_source`, `sheet_row`, `raw_row`, `reason`, `status`, `resolved_order_id` | not tied to a run |
| Current display | Operations › Sync (`/operations?mode=sync`, `src/components/admin/SystemSyncActivityTab.tsx`) | every cron job's health + raw run feed with a JSON drill-down | a JSON dump, admin-only data (`/api/cron-runs` is `admin.view`) while the nav child has **no `requires`** — a dead end for staff |

## 2. Goal

A page whose single job is **"what did each import bring in, order by order"**:

1. **Runs view** — one row per import run per org (a pipeline run, a single provider sync, a
   Sheets history backfill), newest first: when, trigger (scheduled / manual + who), sources,
   inserted / backfilled / tracking filled / ambiguous / skipped / failed, duration, status.
2. **Rows view** — one row per order touched, across runs: the ids in §3, the outcome, which
   fields the import filled, and a door to the order (`/shipping/orders?openOrderId=<orders.id>`).
3. **Run record** — opening a run shows its steps (ShipStation, Google Sheets, each channel,
   exceptions) and that run's rows, filtered by the same sidebar.

Operations › Sync stays the **job health** page. The new page is the **import record**. They
link to each other; neither duplicates the other.

## 3. The ids every row MUST carry

### `order_import_runs` (one per run per org)

| Column | Source |
|---|---|
| `id` BIGSERIAL | — |
| `organization_id` UUID NOT NULL | the org being synced (RLS / tenant scoped) |
| `cron_run_id` BIGINT NULL → `cron_runs.id` | the `withCronRun` row that drove it (scheduled or manual pipeline) |
| `kind` TEXT | `pipeline` · `provider` · `sheets_full` |
| `trigger` TEXT | `cron` · `manual` |
| `triggered_by_staff_id` INT NULL | manual runs: `ctx.staffId` |
| `status` TEXT | `running` · `success` · `partial` (a step failed) · `failed` |
| `started_at`, `finished_at`, `duration_ms` | — |
| `counts` JSONB | per step `{ imported, updated, trackingFilled, ambiguous, skipped, failed }` |
| `error` TEXT | the failed steps, one line (`pipelineFailure`) |

### `order_import_run_steps` (one per step)

`id`, `run_id` → runs, `organization_id`, `step` (`shipstation` · `google_sheets` · `square` ·
… · `exceptions`), `ok`, `counts` JSONB, `error`, `started_at`, `finished_at`.

### `order_import_run_rows` (one per order the run touched — the part that is missing today)

| Column | Meaning / where to get it |
|---|---|
| `id` BIGSERIAL, `run_id`, `step_id`, `organization_id` | — |
| `order_row_id` INT NULL → `orders.id` | **the internal id** (NULL only for refused/ambiguous rows) |
| `external_order_id` TEXT NOT NULL | `orders.order_id` / the channel's order number |
| `account_source` TEXT | the account the row landed under |
| `platform` TEXT | catalog slug via `platformOf` (ebay, amazon, ecwid, …) |
| `source` TEXT | `shipstation` · `google_sheets` · `square` · … (which step wrote it) |
| `outcome` TEXT | `inserted` · `backfilled` · `adopted` · `claimed` · `tracking_filled` · `unchanged` · `ambiguous` · `quarantined` · `skipped` · `failed` |
| `reason` TEXT NULL | skip/quarantine reason (`noTracking`, `fbaShipment`, `shipstation_ambiguous_match`, …) |
| `filled_fields` TEXT[] | which blanks the import filled (`item_number`, `sku`, `condition`, `quantity`, `notes`, `ship_by`, `sale_amount`, `currency`, `shipment_id`, `customer_id`, `account_source`) |
| `tracking_number` TEXT NULL, `shipment_id` INT NULL → `shipping_tracking_numbers.id` | the tracking the row carried / linked |
| `sku_catalog_id` INT NULL, `item_number` TEXT NULL | listing identity (titles still read through `resolveSkuIdentityTitle`, never stored here) |
| `shipstation_order_id` BIGINT NULL, `shipstation_shipment_id` BIGINT NULL | ShipStation rows (pair with `shipstation_order_refs` / `shipstation_shipment_refs`) |
| `sheet_tab` TEXT NULL, `sheet_row` INT NULL | Google Sheets rows (`Sheet_MM_DD_YYYY`, 1-based row) |
| `import_exception_id` BIGINT NULL → `order_import_exceptions.id` | when the row was parked for review |
| `created_at` | — |

Indexes: `(organization_id, run_id)`, `(organization_id, order_row_id)`,
`(organization_id, external_order_id)`, `(organization_id, created_at DESC)`,
`(organization_id, outcome)`, `(organization_id, source)`. Retention: fold into the existing
`cleanup` cron (it already trims run history).

## 4. Writers (where the ids come from)

1. **Carry `orders.id` out of the writer.** Extend `TransferOrderDetail` with
   `orderRowId: number | null` and `filledFields: string[]`, filled where
   `ingestCanonicalOrders` builds `ordersToInsert` / `ordersToBackfill` (`planOrderRowBackfill`
   already knows the filled columns — its `values` keys). Add `outcome` for adopt vs claim
   (the `crossSource.kind`).
2. **ShipStation** (`src/lib/integrations/connectors/shipstation.ts`): return per-row detail
   with `shipstation_order_id` (from the refs it just upserted) and, from the label pass,
   `shipstation_shipment_id` + `attach_status` → `tracking_filled` / `ambiguous` rows.
3. **Google Sheets** (`src/lib/integrations/connectors/google-sheets-orders.ts`): keep
   `sheet_tab` + `sheet_row` on each line through `collectEligibleRows`, and emit a row per
   skip with its `reason` (today only counts survive).
4. **One recorder.** A domain function `recordImportRun(orgId, { cronRunId, kind, trigger,
   staffId }, steps)` in `src/lib/sync/` (Deps-injected, unit-tested) called by
   `runOrdersBackfillPipeline` and by `POST /api/integrations/[provider]/sync`. The cron
   route and `POST /api/sync/global` pass the `cron_runs.id` they hold. Never write rows from
   route handlers.
5. Tenant writes through `withTenantTransaction(orgId, …)` (skill `org-scope`).

## 5. The page

- **Route:** `/operations/imports` — its own page, in the Operations lane as child
  **"Imports"** (nav name law: not "Sync", not "Operations"). Register in
  `src/lib/sidebar-navigation.ts` (`SIDEBAR_PAGE_NAV`) with `requires: 'orders.view'`.
- **Mobile:** `/m/imports` — the same two lists, read-only, full-screen record on tap
  (SURFACE_LAW §7: the record is a scrollable screen with an X, not a sheet).
- **Runs list:** columns: when (PT) · trigger (chip: Scheduled / Manual · name) · sources
  (platform icons) · inserted · backfilled · tracking · needs review · status dot (same
  green/amber/blue as the header Sync). Row → run record.
- **Rows list / run record rows:** order number (link to the order) · platform + account ·
  source · outcome chip · filled fields (compact chips) · tracking · sheet tab:row or
  ShipStation id · review link when `import_exception_id` is set.
- Compose existing primitives (`ds_contract` first); no hand-rolled table. Disclosure ladder
  per `src/design-system/DESIGN_SYSTEM.md`.
- Doors in: header Sync panel footer ("Sync history & past imports" → this page, gated on the
  page's permission instead of `admin.view`); Operations › Sync links each pipeline run here.

## 6. Left contextual sidebar (filters)

Declare in `src/lib/nav/context/pages.ts` (`NAV_PAGE_DECLS`), views `runs` and `rows`:

| Control | Kind | Param | Applies to |
|---|---|---|---|
| Date | `dateRanges` (`DateRangePickerField variant="compact"`, with times) | `dateFrom` / `dateTo` / `timeFrom` / `timeTo`, placeholder "Last 7 days" | both |
| Trigger | `choices` | `trigger` = `cron` · `manual` | both |
| Status | `choices` | `status` = `success` · `partial` · `failed` · `running` | runs |
| Run by | `staff` | `staff` | runs (manual) |
| Source | facet group (multi) | `source` | both |
| Platform | facet group (multi) | `platform` | rows |
| Account | facet group (multi) | `account` | rows |
| Outcome | facet group (multi) | `outcome` | rows |
| Run | param only (set by opening a run) | `run` | rows |
| Sort | `sort` | `sort` = newest · most inserted · most failed (runs); newest · order number (rows) | both |

- Facet counts: a new facet context `imports.rows` / `imports.runs` in
  `src/lib/nav/facets/` (pattern: `outbound.ts` / `shipped.ts` + `contexts.ts`), served by
  `GET /api/nav/facets`, gated by the list endpoint's permission.
- Search (the sidebar Find): order number, tracking number, run id, sheet tab.
- Every param above in the page decl's `params`; add parity rows in
  `src/lib/nav/context/parity.ts` for the new page.

## 7. APIs

- `GET /api/imports/runs` — `orders.view`; params = §6; paged.
- `GET /api/imports/runs/[id]` — run + steps.
- `GET /api/imports/rows` — `orders.view`; params = §6 (+ `run`); paged.
- All org-scoped from `ctx.organizationId`; skill `new-route` (withAuth, Zod, thin handler).
- Run `pnpm audit-route-auth:emit` and commit the manifest with the routes.

## 8. Acceptance

1. After one pipeline run on `:3050`, the Runs view shows it with per-step counts equal to
   the run's response, and Rows lists every inserted/backfilled/ambiguous/skipped order with
   `orders.id` (null only for refused rows), external number, source, and sheet tab:row or
   ShipStation id.
2. Filtering Source = Google Sheets + Outcome = inserted narrows both the list and the facet
   counts; Reset clears every param.
3. A manual header Sync appears as Trigger = Manual with the operator's name.
4. Staff with `orders.view` but not `admin.view` can open the page and every link to it.
5. `/m/imports` shows the same runs and rows.
6. A second run over unchanged data records `unchanged`/no rows for already-current orders —
   it never inflates counts.
7. Unit tests: the recorder (Deps), the writer's `orderRowId`/`filledFields`, the facet
   resolvers. `pnpm verify:fast` green.

## 9. Non-goals

- No new sync behaviour: the pipeline, its order and its rules stay as they are.
- No backfill of history from before the recorder ships — `cron_runs.summary` stays the
  record for those runs.
- Operations › Sync is not removed; it remains job health.
