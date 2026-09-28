# Google Sheets

Two jobs on one service account: the **legacy daily order sheet**, kept as the backup
order source beside ShipStation, and the **legacy technician / packer sheet import**.
**Write-back to Sheets is removed** (everything persists straight to Postgres).
Service-account auth (no per-user OAuth).

## Order backfill (backup source, 2026-09-28)

Staff log every sale — including labels bought outside ShipStation — in one
`Sheet_MM_DD_YYYY` tab per day. `googleSheetsOrdersSync`
(`src/lib/integrations/connectors/google-sheets-orders.ts`) reads the tabs in scope and
lands every row through ShipStation's writer, `ingestCanonicalOrders` in **aggregator
mode** (`matchOn: 'accountSourceAndOrderId'`, `aggregator: { platformOf }`):

- **Scope** — the rolling 7 days of tabs (by the date in the tab name); `full` reads every
  tab once (Settings → Google Sheets → **Backfill every tab**, or
  `POST /api/integrations/google_sheets/sync?full=1`).
- **Row gate** — row 1 must title `Order Number` and `Tracking` (other columns bind by
  title: item #, title, qty, SKU, condition, note, platform, price, ship-by). Rows with no
  order number, no tracking, or an FBA shipment id (`FBA…`) are skipped; the same row
  pasted twice (any tab) is one line.
- **Existing order** under one platform → adopted: blanks filled only (item #, SKU,
  condition, qty, notes, ship-by, price, tracking); a title, status or tracking ShipStation
  or an operator already set is never overwritten. Sale price is immutable once written.
- **Order number under two platforms** → left alone, counted as `ambiguous`.
- **Order nobody has** → inserted and auto-allocated. When ShipStation later imports it,
  ShipStation adopts that row the same way — no duplicate.
- Nothing is ever deleted (`collapseDuplicates: false`).

### Orchestration — one pipeline

`runOrdersBackfillPipeline` (`src/lib/sync/orders-backfill-pipeline.ts`) runs, per org,
each step after the last completes: **ShipStation → Google Sheets → other linked order
channels → exceptions pass**. A failing step never stops the rest. Driven by:

| Trigger | Scope |
|---|---|
| `orders.backfill_pipeline` cron — `/api/cron/orders/backfill`, 08:00 + 14:00 + 18:30 PT (`?sheetsFull=1` for a history run) | every org |
| Header **Sync** pill → *Orders — all linked platforms* (`POST /api/sync/global?job=pipeline:orders`, `Y` then `A`/`O`) — same lock + `cron_runs` ledger as the cron (`trigger: 'manual'`) | caller's org |
| To-ship chevron **Sync all platforms** / **Choose platforms…** (`useOrdersSync`, same order client-side, live ledger). The To-ship face is **Add manual order**. | caller's org |

The header pill (`GlobalHeaderSync`, right of the inbox) reads each job's latest
`cron_runs` row every minute and shows the newest as "Sync · 5m"; its panel lists
every outbound/inbound sync with its own last run and a Run verb.
It replaced the separate `shipstation.orders_sync` cron. Removed on 2026-09-24 and not
restored: `/api/google-sheets/transfer-orders`, `/api/google-sheets/sync-shipstation-orders`
(ShipStation CSV upload), the `google_sheets.transfer_orders` cron.

## Auth — `src/lib/google-auth.ts`

`getGoogleAuth(credentials)` builds a JWT from the service account stored in the
organization's encrypted `google_sheets` integration row. Scopes:
`https://www.googleapis.com/auth/spreadsheets` and `.../auth/drive.readonly`.
`connect: 'vault'` in the catalog (`admin.manage_features` to manage). Runtime
jobs do not fall back to a global service account or spreadsheet.

## Routes

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/google-sheets/execute-script` | `admin.manage_features` | Routes `scriptName` → `checkShippedOrders` / `syncTechSerialNumbers` / `syncPackerLogs`. |
| `POST /api/google-sheets/append` | `admin.manage_features` | **Removed** — returns 410. Persist to the DB instead. |

`updateNonshippedOrders` (an old execute-script target) is likewise **410 Gone**.

## What `execute-script` maps

- **`checkShippedOrders`** — read-only: which orders have a packer log via the
  `shipment_id` FK.
- **`tech_1` / `tech_2` / `tech_3`** (`syncTechSerialNumbers`) → `tech_serial_numbers`
  (+ `orders_exceptions` for unmatched tracking); resolves `shipment_id` from tracking.
- **`packer_*`** (`syncPackerLogs`) → `packer_logs`.

Shared helpers live in `src/lib/sync/sheet-sync-common.ts`
(`getTrackingLast8`, `hasFbaFnsku`, `hasOrderByTracking`, `parseSheetDateTime`,
`upsertOpenOrdersException`, …).

## Review · Missing item number

The removed order import parked sheet rows with a blank Item Number in
`order_import_exceptions`. No new rows arrive; the open ones are still listed, resolved
(the stored sheet row is re-mapped through `src/lib/orders/sources/google-sheet-rows.ts`
and ingested) or ignored on `/review?mode=catalog-link`.

## Vault migration

The one-time migration command reads the legacy deployment variables and writes
the encrypted service account plus spreadsheet id into `organization_integrations`:

```sh
pnpm google-sheets:connect
pnpm google-sheets:connect -- --apply
```

The command verifies KMS configuration and reads the spreadsheet before writing.
Runtime routes do not read the legacy Google Sheets variables.

## Environment variables

| Var | Purpose |
|---|---|
| `GOOGLE_CLIENT_EMAIL` | One-time migration input; not read by runtime jobs. |
| `GOOGLE_PRIVATE_KEY` | One-time migration input; not read by runtime jobs. **Sensitive**. |
| `SPREADSHEET_ID` | Required one-time migration input; stored in the vault after migration. |

## Status / direction

Legacy, kept as a **backup**: the daily sheet backfills orders behind ShipStation until
tracking upload moves into the app. New writes never go back to Sheets. Credentials are
vault-backed and tenant-scoped.
