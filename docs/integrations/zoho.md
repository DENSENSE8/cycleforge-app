# Zoho Inventory

The **operations backbone** — Zoho is USAV's system of record for purchase orders,
purchase receives, items, and (outbound) sales-order fulfillment. This is the most
mature integration in the repo: rate-limited HTTP client, circuit breaker, webhook
ingestion, a local PO **mirror**, and a delta/full cron schedule. Fully built and live.

## Auth (OAuth 2.0, server-side)

- `GET /api/zoho/oauth/authorize` (auth-protected) → Zoho consent. Scopes requested:
  `ZohoInventory.settings.READ` (required for `GET /organizations` during callback),
  `ZohoInventory.purchaseorders.{READ,CREATE,UPDATE}`,
  `ZohoInventory.purchasereceives.{READ,CREATE}`, `ZohoInventory.bills.READ`,
  `ZohoInventory.items.READ`, `ZohoInventory.warehouses.READ`.
- `GET /api/zoho/oauth/callback` (public) → exchanges the code for access + refresh
  tokens and persists them via `setZohoTokens()` into **`organization_integrations`**
  (`provider='zoho'`). Legacy `ebay_accounts.ZOHO_MAIN` token columns were removed in
  the eBay vault migration (INT-002); transitional USAV fallback is `ZOHO_REFRESH_TOKEN`
  env only when no vault row exists.
- `GET|POST /api/zoho/refresh-token` → refresh the short-lived access token (GET kicks
  off a fresh authorize flow; POST refreshes from the stored refresh token).
  POST does **not** mint a new refresh token — Zoho keeps the same refresh grant;
  only a full OAuth reconnect replaces it.
- `GET /api/zoho/health` → circuit-breaker state + rate-limit budget.

`src/lib/zoho/core.ts` owns `getAccessToken()` (refresh-on-demand),
`getInventoryBaseUrl()` (region-aware: `.com/.eu/.in/.com.au/.ca/.jp` from
`ZOHO_DOMAIN`), and `invalidateAccessToken()`.

### Connection health / reconnect

- Access tokens expire in ~1 hour; that is normal and does **not** disconnect the
  integration. Only a dead refresh grant (or mismatched client id/secret) flips
  the vault to `status='error'`.
- On auth failure during sync, `markIntegrationError` stores Zoho's reason in
  `last_error` (e.g. `invalid_code` / `invalid_client_secret`) and the Settings →
  Integrations card shows **Needs attention**. Reconnect via
  `/api/zoho/oauth/authorize` (OAuth on the Zoho card).
- Vault is the SoT. Do not rely on `ZOHO_REFRESH_TOKEN` env once a vault row
  exists — env bootstrap is ignored while the vault row is `error`/`revoked`.
- Avoid: revoking Cycle Forge under Zoho Connected Apps; regenerating the API
  console client secret without reconnecting the same day; minting extra refresh
  tokens in Postman/scripts (Zoho caps ~20 refresh tokens per user — older ones
  get dropped).

## HTTP client — `src/lib/zoho/httpClient.ts`

A hardened wrapper around the Zoho Inventory REST API: **80 req/min rate limiter**
(configurable), **circuit breaker**, retry/backoff, and `paginateZohoList()`. Exposes
`zohoGet/Post/Put` and typed errors `ZohoApiError`, `ZohoRateLimitError`,
`ZohoCircuitOpenError`. The inventory surface (`src/lib/zoho/index.ts`) builds on it:
`listPurchaseOrders`, `getPurchaseOrderById`, `listPurchaseReceives`,
`createPurchaseReceive` (auto-resolves `bill_id` for billed POs),
`searchPurchaseOrdersByTracking`, `searchItemBySku`, `getStockInfo`, `listWarehouses`, etc.

**Call-volume guards (rate-limit hygiene):**
- Incoming PO sync skips a detail GET when local `receiving_line_zoho` already
  mirrors the list row's last-modified stamp (`skipped_unchanged` in the cron summary).
- Unfound reconcile checks `zoho_po_mirror` before live tracking search.
- Tracking / PO-number search filters run sequentially and stop on the first hit.
- Scan-serial does **not** write Zoho — Receive owns the single PO description/notes PUT.

## The two sync directions

### Inbound — PO mirror + reconcile (`src/lib/zoho/po-mirror-sync.ts`)
`syncZohoPoMirror({ mode, lastModifiedTime?, maxPages?, maxItems? })` pulls POs and
UPSERTs one header row each into **`zoho_po_mirror`** (with the full Zoho body in `raw`),
then **reconciles** door-scanned `receiving_lines` against Zoho status — marking a line
received once Zoho shows received/billed/closed. This is what clears the receiving
"Prioritize" queue. (See the receiving-triage memories.)

### Outbound — fulfillment (`src/lib/zoho/fulfillment-sync.ts`)
`syncShippedOrdersToZoho({ reference?, dryRun?, force?, limit?, mode? })` walks shipped
internal orders and, in Zoho, ensures a sales order → creates a package → a shipment →
marks delivered (when tracking confirms) → creates an invoice. **Dry-run by default**
(`ZOHO_FULFILLMENT_DRY_RUN`). Config in `fulfillment-config.ts`. See
`docs/zoho-fulfillment-sync.md`.

## Webhooks — `src/lib/zoho/webhooks/`

`POST /api/zoho/webhooks` verifies the signature (`verify.ts`,
`ZOHO_WEBHOOK_SECRET` + `ZOHO_WEBHOOK_SIGNATURE_HEADER`), dedupes via the
`zoho_webhook_events` table (`dedupe.ts`), normalizes (`normalize.ts`), and dispatches
(`handlers.ts`) — e.g. PO created/updated, purchase-receive created.

## Cron schedule (`vercel.json`)

| Schedule | Path |
|---|---|
| `*/15 * * * *` | `/api/cron/zoho/incoming-po-sync` (Incoming "Sync Zoho" button = this) |
| `7,22,37,52 * * * *` | `/api/cron/zoho/po-sync?mode=delta` |
| `30 3 * * *` | `/api/cron/zoho/po-sync?mode=full` (nightly full refresh) |
| `15 */4 * * *` | `/api/cron/zoho/fulfillment-sync?mode=delta` |
| `45 3 * * *` | `/api/cron/zoho/fulfillment-sync?mode=full` |
| `* * * * *` | `/api/cron/zoho/orders-ingest-drain` (drains the ingest queue) |

> Crons need `CRON_SECRET` (a Vercel **Sensitive** var — pulls as `""`, not empty; env
> changes require a redeploy or the crons 401). See the CRON_SECRET memory.

## Environment variables

| Var | Purpose |
|---|---|
| `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` | OAuth app creds. **Sensitive**. |
| `ZOHO_ORG_ID` (or `ZOHO_ORGANIZATION_ID`) | Zoho Inventory organization id (required). |
| `ZOHO_REFRESH_TOKEN` | Refresh token (env fallback; the callback persists to DB). |
| `ZOHO_DOMAIN` | Accounts domain (default `accounts.zoho.com`; `.eu/.in/.com.au/.ca/.jp`). |
| `ZOHO_WEBHOOK_SECRET` | Webhook HMAC secret. |
| `ZOHO_WEBHOOK_SIGNATURE_HEADER` | Default `x-zoho-webhook-signature`. |
| `ZOHO_WEBHOOK_SIGNATURE_ENCODING` | `hex` (default) or `base64`. |
| `ZOHO_FULFILLMENT_DRY_RUN` | Default `true` — outbound fulfillment is read-only until flipped. |
| `ZOHO_FULFILLMENT_INVOICE_MODE` / `ZOHO_FULFILLMENT_PAYMENT_MODE` | Invoice/payment behavior. |
| `RECEIVING_MOCK_ZOHO` | `1` → use `mock.ts` fixtures instead of live Zoho (local dev). |

## DB tables

- **`zoho_po_mirror`** — one header row per PO (`zoho_purchaseorder_id` PK, normalized
  number for matching, vendor/status/dates/totals, full `raw` jsonb, sync timestamps).
- **`zoho_webhook_events`** — webhook dedupe log.
- **`organization_integrations`** (`provider='zoho'`) — OAuth token SoT (vault).
  Transitional USAV env: `ZOHO_REFRESH_TOKEN` when no vault row exists.

## Status / notes

- Connector registry: `zoho: { authKind: 'oauth', capabilities: ['inventory'],
  authorizeStartPath: '/api/zoho/oauth/authorize', healthPath: '/api/zoho/health' }`.
  No `sync` fn in the connector — Zoho's sync runs through its own dedicated crons, not
  the generic orders orchestrator.
- Settings card: `connect: 'oauth'`, `managePermission` → `integrations.zoho`.
- **Inventory Displays trust view** (`InventoryDisplayHost`): paints from
  `GET /api/receiving-lines/incoming/details` — prefer fat `zoho_po_mirror.raw.line_items`,
  fall back to `receiving_line` + `receiving_line_zoho` siblings (list/delta sync often
  stores header-only `raw`). Line descriptions prefer `rz.zoho_notes` (post-receive
  `SN: … · {condition}` text).
- **Cmd+S block-if-stale:** PO notes (`PATCH /api/receiving/[id]` + `push_to_zoho`) and
  line notes (`…/inventory-note`) accept `base_last_modified_zoho` from the last trusted
  pull; if live Zoho `last_modified_time` differs → **409**, draft kept, operator Refresh.
  Helper: `src/lib/receiving/zoho-po-stamp.ts`. Never silent last-write-wins.
- **Inbound write surface (honest):** header notes + line description PUT exist.
  Rate/qty/line add-remove are not Displays writes yet. Bill / close / void / delete /
  attachments have **no** operator routes (OAuth is mostly READ + PO UPDATE +
  purchasereceive CREATE) — do not ship dead buttons.