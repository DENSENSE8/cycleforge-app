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
  the eBay vault migration (INT-002); runtime Zoho credentials are vault-only.
- `GET|POST /api/zoho/refresh-token` → refresh the short-lived access token (GET kicks
  off a fresh authorize flow; POST refreshes from the stored refresh token).
  POST does **not** mint a new refresh token — Zoho keeps the same refresh grant;
  only a full OAuth reconnect replaces it.
- `GET /api/zoho/health` → circuit-breaker state + rate-limit budget.

`src/lib/zoho/core.ts` owns `getAccessToken()` (refresh-on-demand),
`getInventoryBaseUrl()` (region-aware: `.com/.eu/.in/.com.au/.ca/.jp` from
`ZOHO_DOMAIN`), and `invalidateAccessToken()`.

### Access-token minting — INVARIANTS (2026-09-14 blackout)

Zoho mints **at most 10 access tokens per refresh token per 10 minutes**
(`zoho.com/developer/oauth/token-limits.html`). Exceeding it returns
`400 Access Denied: You have made too many requests continuously.`

On 2026-09-14 22:07Z we crossed it and Zoho went dark for **25 hours**: every
cron logged `No inventory integration connected`, the PO mirror froze, and
receiving could not push cartons as received. Three compounding causes, each now
closed — do not reintroduce any of them:

1. **One access token per PROCESS.** The cache was an in-process `Map`, i.e. one
   token per Vercel lambda instance, per health poll, per cron tick. The token is
   now shared fleet-wide in `organization_integrations.access_token_encrypted`
   (`src/lib/integrations/access-token-store.ts`), minted once per expiry window
   behind an in-process promise **and** a DB mint claim. Verified: 12 concurrent
   callers → 1 mint; a second instance adopts the winner's token.
   Never hold a checked-out client (`pg_advisory_lock`) across the mint —
   `PG_POOL_MAX` is 5 and a 12-caller stampede exhausts the pool, which silently
   degrades back to N mints.
2. **A throttle classified as a dead credential.** `isCredentialAuthFailure`
   matched `token refresh` and flipped `status='error'`. Transient failures now
   route to `noteIntegrationWarning` (status stays `active`, `last_error`
   records it) — see `credential-auth-failure.ts` and its tests.
3. **`status='error'` was a latch with no key.** Nothing cleared it but a human
   re-running OAuth. Now: a successful call/mint heals the row
   (`clearIntegrationError`), and `GET /api/cron/integrations/refresh` (hourly)
   revalidates every latched connection and lifts the latch when the credential
   proves alive (`connectors/self-heal.ts`). A genuinely revoked grant keeps
   failing validation and stays **Needs attention**.

### Connection health / reconnect

- Access tokens expire in ~1 hour; that is normal and does **not** disconnect the
  integration. Only a dead refresh grant (or mismatched client id/secret) flips
  the vault to `status='error'`.
- On auth failure during sync, `markIntegrationError` stores Zoho's reason in
  `last_error` (e.g. `invalid_code` / `invalid_client_secret`) and the Settings →
  Integrations card shows **Needs attention**. Reconnect via
  `/api/zoho/oauth/authorize` (OAuth on the Zoho card).
- Vault is the credential SoT. Runtime calls never fall back to a
  deployment-wide refresh token.
- `INTEGRATION_KMS_KEY` must match the key the row was encrypted under. A local
  `.env` with a different key cannot decrypt the prod payload (it surfaces as
  "No active Zoho connection"); add the prod key, or list the old one in
  `INTEGRATION_KMS_KEY_PREVIOUS`.
- Avoid: revoking Cycle Forge under Zoho Connected Apps; regenerating the API
  console client secret without reconnecting the same day; minting extra refresh
  tokens in Postman/scripts (Zoho caps ~20 refresh tokens per user — older ones
  get dropped).

### Delta cursors

`sync_cursors` is keyed on `(organization_id, resource)`; `getSyncCursor` /
`updateSyncCursor` take `orgId`. The migration landed 2026-07-11 without the
caller change, so every cursor advance threw `no unique or exclusion constraint
matching the ON CONFLICT specification` for two months: `zoho.po_sync` failed 173
times and each 15-minute "delta" replayed since 2026-07-11. Cursors now advance
**per org** inside the sweep — a shared watermark gated on "every org succeeded"
lets one tenant freeze everyone.

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

`POST /api/zoho/webhooks/{token}` resolves the organization by its opaque token,
verifies the signature using that organization's vault-backed webhook secret,
dedupes via the
`zoho_webhook_events` table (`dedupe.ts`), normalizes (`normalize.ts`), and dispatches
(`handlers.ts`) — e.g. PO created/updated, purchase-receive created.
The tokenless endpoint is retired and returns `410`.

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
| `ZOHO_REFRESH_TOKEN` | Legacy migration input only; runtime credentials are vault-backed. |
| `ZOHO_DOMAIN` | Accounts domain (default `accounts.zoho.com`; `.eu/.in/.com.au/.ca/.jp`). |
| `ZOHO_WEBHOOK_SIGNATURE_HEADER` | Default `x-zoho-webhook-signature`. |
| `ZOHO_WEBHOOK_SIGNATURE_ENCODING` | `hex` (default) or `base64`. |
| `ZOHO_FULFILLMENT_DRY_RUN` | Default `true` — outbound fulfillment is read-only until flipped. |
| `ZOHO_FULFILLMENT_INVOICE_MODE` / `ZOHO_FULFILLMENT_PAYMENT_MODE` | Invoice/payment behavior. |
| `RECEIVING_MOCK_ZOHO` | `1` → use `mock.ts` fixtures instead of live Zoho (local dev). |

## DB tables

- **`zoho_po_mirror`** — one header row per PO (`zoho_purchaseorder_id` PK, normalized
  number for matching, vendor/status/dates/totals, full `raw` jsonb, sync timestamps).
- **`zoho_webhook_events`** — webhook dedupe log.
- **`organization_integrations`** (`provider='zoho'`) — OAuth token and per-org webhook identity SoT (vault).

## Status / notes

- Connector registry: `zoho: { authKind: 'oauth', capabilities: ['inventory'],
  authorizeStartPath: '/api/zoho/oauth/authorize', healthPath: '/api/zoho/health' }`.
  No `sync` fn in the connector — Zoho's sync runs through its own dedicated crons, not
  the generic orders orchestrator.
- Settings card: `connect: 'oauth'`, `managePermission` → `integrations.zoho`.
- **Inventory trust source:** `GET /api/receiving-lines/incoming/details` prefers
  fat `zoho_po_mirror.raw.line_items`, then falls back to `receiving_line` +
  `receiving_line_zoho` siblings (list/delta sync often stores header-only
  `raw`). Line descriptions prefer `rz.zoho_notes` (post-receive `SN: … ·
  {condition}` text). Unbox no longer wraps this source in an Inventory display.
- **Cmd+S block-if-stale:** PO notes (`PATCH /api/receiving/[id]` + `push_to_zoho`) and
  line notes (`…/inventory-note`) accept `base_last_modified_zoho` from the last trusted
  pull; if live Zoho `last_modified_time` differs → **409**, draft kept, operator Refresh.
  Helper: `src/lib/receiving/zoho-po-stamp.ts`. Never silent last-write-wins.
- **Inbound write surface (honest):** header notes + line description PUT exist.
  Rate/qty/line add-remove are not Displays writes yet. Bill / close / void / delete /
  attachments have **no** operator routes (OAuth is mostly READ + PO UPDATE +
  purchasereceive CREATE) — do not ship dead buttons.
