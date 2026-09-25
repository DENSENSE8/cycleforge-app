# Amazon (Selling Partner API)

Connects Amazon seller accounts: **LWA-only** auth (no AWS IAM/SigV4 — Amazon dropped
that requirement 2023-10-02), a zero-dependency SP-API client, a health probe, and the
per-order Product-tab reimport (`POST /api/orders/[id]/amazon-refresh`).

> **Order import removed 2026-09-24.** ShipStation is the sole outbound-order importer and
> already aggregates the Amazon store, so the Amazon order pull (`order-sync.ts`,
> `order-map.ts`, `POST /api/amazon/sync`, the `amazon.orders_sync` cron and the connector
> `sync()`) was deleted. That pull also imported FBA (AFN) orders read-only; they are no
> longer imported.

## Tenancy model

**Shared SP-API app, many sellers.** One published SP-API app (its
`lwaClientId`/`lwaClientSecret`) that every tenant's seller accounts authorize. The
app-level creds are shared but copied into each seller row so the stored
`AmazonCredentials` payload is self-contained at runtime. Only the per-seller
**refresh token** is per-tenant. One org can have many seller accounts
(`amazon_accounts`, scope `seller-{sellerId}`).

## Auth — two paths (both land in the vault)

The connect modal (`src/app/settings/integrations/AmazonConnectModal.tsx`) offers a
**region picker** (NA / EU / FE) and either:

1. **OAuth (multi-tenant)** — `GET /api/amazon/oauth/start?region=<NA|EU|FE>`
   (`integrations.amazon`) 302s to Seller Central consent with an encrypted `state`
   (org + region, 15-min TTL). `GET /api/amazon/oauth/callback` (public — identity from
   `state`) exchanges `spapi_oauth_code` → refresh token, writes the vault row, upserts
   `amazon_accounts`.
2. **Bootstrap paste** — `POST /api/amazon/connect` (`integrations.amazon`): paste an
   LWA refresh token (+ optional seller id). The route verifies it by exchanging for an
   access token and calling `getMarketplaceParticipations`, then stores it. This is how
   USAV's own account is wired without a full OAuth round-trip.

Tokens are encrypted at rest via `INTEGRATION_KMS_KEY` (`writeAmazonToken` /
`readAmazonToken`; plaintext only in dev when the key is unset).

## SP-API client — `src/lib/amazon/`

- `client.ts` — `callSpApi<T>()` (429/503 backoff + audit to `amazon_api_calls`),
  `getAccessTokenForAccount()` (1-hour cached LWA access token),
  `getMarketplaceParticipations()` (cheap, non-PII health probe),
  `getOrdersGenerator()` (pages by `LastUpdatedAfter`), `getOrderItems()`,
  `getOrderAddress()` + `createRestrictedDataToken()` (RDT for buyer PII, MFN only).
- `order-item-refresh.ts` — the Product-tab reimport behind `/api/orders/[id]/amazon-refresh`.
- `token-refresh.ts` — LWA code/refresh exchange + token encryption envelope.
- `accounts.ts` — `loadActiveAmazonAccounts()`, `loadAmazonCreds()`, `amazonScopeForSeller()`.

The connector wrapper `src/lib/integrations/connectors/amazon.ts` exports
`amazonValidate(orgId)`; registered in `connectors/registry.ts` with `authKind: 'oauth'`
and no `sync()`.

## Routes

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/amazon/accounts` | `integrations.amazon` | List connected seller accounts + sync state |
| `DELETE /api/amazon/accounts?id=N` | `integrations.amazon` | Disconnect (delete row + vault scope) |
| `POST /api/amazon/connect` | `integrations.amazon` | Bootstrap paste-refresh-token path |
| `GET /api/amazon/oauth/start` | `integrations.amazon` | Begin Seller Central OAuth |
| `GET /api/amazon/oauth/callback` | public (state) | Code → refresh token, store, upsert account |
| `GET /api/amazon/health` | `integrations.amazon` | Per-account `getMarketplaceParticipations` probe |

## DB tables (migration `2026-06-14b_amazon_integration.sql`)

- **`amazon_accounts`** — one row per seller: `organization_id`, `account_name`
  (UNIQUE per org), `seller_id` (UNIQUE per org where set), `region`, `marketplace_ids`
  (jsonb), cached `access_token`/`access_token_expires_at`, `last_updated_watermark`,
  `sync_started_at` (concurrency lock), `last_sync_at`, `status`, `last_error`,
  `is_active`.
- **`amazon_api_calls`** — per-call audit (operation, status, rate-limit header,
  duration) for diagnosing throttling.
- Credentials live in `organization_integrations` (`provider='amazon'`,
  `scope='seller-{sellerId}'`, `AmazonCredentials` payload).

## Environment variables

| Var | Purpose |
|---|---|
| `AMAZON_LWA_CLIENT_ID` / `AMAZON_LWA_CLIENT_SECRET` | Shared SP-API app creds. **Sensitive**. |
| `AMAZON_APP_ID` | SP-API public app id. |
| `AMAZON_OAUTH_REDIRECT_URI` | OAuth callback (`…/api/amazon/oauth/callback`). |
| `AMAZON_APP_DRAFT` | `true` while the app is unpublished (appends `&version=beta`). |
| `AMAZON_SP_API_REGION` | Default region for the env fallback (`NA`). |
| `AMAZON_MARKETPLACE_IDS` | Comma list (default `ATVPDKIKX0DER` = US). |
| `AMAZON_SP_API_REFRESH_TOKEN_USAV` | Transitional USAV bootstrap token (env fallback, USAV org only). |
| `INTEGRATION_KMS_KEY` | AES-256-GCM key; **required in prod** to encrypt tokens at rest. |

## Notes / follow-ups

- `last_updated_watermark` / `sync_started_at` / `last_sync_at` on `amazon_accounts` were
  written only by the removed order pull; they are now static.
- Buyer PII on MFN orders is best-effort via RDT and depends on the app's approved roles.
- The Settings card uses the `amazon` connect method: region picker + OAuth +
  paste-token + health + per-account disconnect (`managePermission` → `integrations.amazon`).
