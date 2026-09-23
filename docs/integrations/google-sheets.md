# Google Sheets

The **legacy order-transfer pipeline** — USAV's pre-app orders/tech/packer data lived in
a Google Sheet, and these jobs pull it into the DB. Built and live, but **write-back to
Sheets is removed** (everything now persists straight to Postgres). Service-account auth
(no per-user OAuth).

## Auth — `src/lib/google-auth.ts`

`getGoogleAuth(credentials)` builds a JWT from the service account stored in the
organization's encrypted `google_sheets` integration row. Scopes:
`https://www.googleapis.com/auth/spreadsheets` and `.../auth/drive.readonly`.
`connect: 'vault'` in the catalog (`admin.manage_features` to manage). Runtime
jobs do not fall back to a global service account or spreadsheet.

## Routes

| Route | Auth | Purpose |
|---|---|---|
| `POST\|GET /api/google-sheets/transfer-orders` | `orders.import` | Streaming NDJSON job: import orders from the sheet (POST takes optional `manualSheetName`). |
| `POST /api/google-sheets/sync-shipstation-orders` | `admin.manage_features` | Upload a ShipStation CSV → match tracking → insert/update orders, clear matched exceptions. |
| `POST /api/google-sheets/execute-script` | `admin.manage_features` | Routes `scriptName` → `checkShippedOrders` / `syncTechSerialNumbers` / `syncPackerLogs`. |
| `POST /api/sync-sheets` | `integrations.sheets` | Multi-tab sync: `shipped` + `tech_1..3` + `packer_*` in one pass. |
| `POST /api/google-sheets/append` | `admin.manage_features` | **Removed** — returns 410. Persist to the DB instead. |

`updateNonshippedOrders` (an old execute-script target) is likewise **410 Gone**.

## Transfer-orders eligibility

`runGoogleSheetsTransferOrders` (sheet path) only imports rows that have:

1. **Order Number** (required header + non-blank cell)
2. **Item Number** / Item ID / Listing ID (required header + non-blank **raw** cell — catalog title-match does **not** count)
3. **Tracking** (non-blank cell; blank tracking is skipped like ShipStation)
4. Platform ≠ `ecwid` on the sheet (Ecwid comes from the API path)

Missing required headers fail the job with HTTP 400. Blank Item Number rows are counted as `skippedNoItemNumber` and never insert/update `orders` — this keeps unlinkable trash out of the orders SoT (`sku_platform_ids` / listing search need a listing id).

When Item Number is present but does **not** resolve to an existing `sku_catalog` /
`sku_platform_ids` row, the order **still imports** (`sku_catalog_id` null) and an
explicit chore is upserted into `order_catalog_link_chores`. Operators clear that
queue on **Review → Catalog link** (`/review?mode=catalog-link`): link the listing
once to a Zoho/catalog SoT and all matching orders backfill. Historical orphans are
**not** scanned into this queue — only new import misses.

## What `/api/sync-sheets` maps

- **`shipped`** tab → `orders` (`status='shipped'`, title/qty/condition/tracking/sku +
  `sku_catalog_id`, `account_source`).
- **`tech_1` / `tech_2` / `tech_3`** → `tech_serial_numbers` (+ `orders_exceptions` for
  unmatched tracking); resolves `shipment_id` from tracking.
- **`packer_*`** (dynamic tab names) → `packer_logs` (+ legacy allocation mirror).
- Detects FBA-like FNSKU patterns and logs exceptions when tracking doesn't match an
  order.

Shared helpers live in `src/lib/sync/sheet-sync-common.ts`
(`getTrackingLast8`, `hasFbaFnsku`, `hasOrderByTracking`, `parseSheetDateTime`,
`upsertOpenOrdersException`, …). The transfer-orders job is
`src/lib/jobs/google-sheets-transfer-orders.ts`
(`runGoogleSheetsTransferOrders(orgId, manualSheetName?, source?, progress?)`).

## Cron (`vercel.json`)

| Schedule | Path |
|---|---|
| `30 15 * * 1-5` | `/api/cron/google-sheets/transfer-orders` (3:30pm weekdays) |
| `0 18 * * 1-5`  | `/api/cron/google-sheets/transfer-orders` (6:00pm weekdays) |
| `0 22 * * 1-5`  | `/api/cron/google-sheets/transfer-orders` (10:00pm weekdays) |

The cron route calls `runGoogleSheetsTransferOrders(orgId, ...)` under `withCronRun()`.

## Vault migration

The one-time migration command reads the legacy deployment variables and writes
the encrypted service account plus spreadsheet id into `organization_integrations`:

```sh
pnpm google-sheets:connect
pnpm google-sheets:connect -- --apply
```

The command verifies KMS configuration and reads the spreadsheet before writing.
After one successful cron run, remove the legacy Google Sheets variables from the
deployment; they are not read by runtime transfer or execute-script routes.

## Environment variables

| Var | Purpose |
|---|---|
| `GOOGLE_CLIENT_EMAIL` | One-time migration input; not read by runtime jobs. |
| `GOOGLE_PRIVATE_KEY` | One-time migration input; not read by runtime jobs. **Sensitive**. |
| `SPREADSHEET_ID` | Required one-time migration input; stored in the vault after migration. |
| `CRON_SECRET` | Bearer for the transfer-orders cron. |

## Status / direction

This is a **migration-era** integration: it exists to drain the old spreadsheet workflow
into the DB. New writes never go back to Sheets. Credentials are vault-backed and
tenant-scoped. As the v1 outbound tracker
(`docs/integrations/`/ memory `v1-tracker-tier-strategy`) takes over the orders sheet,
these jobs become the backfill path, not the steady state.
