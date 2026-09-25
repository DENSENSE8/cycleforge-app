# Google Sheets

The **legacy technician / packer sheet import** — USAV's pre-app tech and packer data
lived in a Google Sheet, and these jobs pull it into the DB. **Write-back to Sheets is
removed** (everything persists straight to Postgres). Service-account auth (no per-user
OAuth).

**Order import from Sheets was removed on 2026-09-24.** ShipStation is the only
outbound-order importer: the desk's **Sync ShipStation** face
(`POST /api/integrations/shipstation/sync`) and the `shipstation.orders_sync` cron
(`/api/cron/shipstation/orders-sync`, 08:00 + 14:00 PT). Removed with it:
`/api/google-sheets/transfer-orders`, `/api/google-sheets/sync-shipstation-orders`
(ShipStation CSV upload), the `google_sheets` connector `sync()` / `orders` capability, and
the `google_sheets.transfer_orders` cron.

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

This is a **migration-era** integration: it exists to drain the old spreadsheet
workflow into the DB. New writes never go back to Sheets. Credentials are vault-backed
and tenant-scoped.
