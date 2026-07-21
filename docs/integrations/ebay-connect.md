# eBay account connect (Settings → Integrations)

Lets a workspace connect one or more eBay **seller** and/or **purchasing (buyer)**
accounts by signing in to eBay and granting consent. Server-side OAuth
(Authorization Code Grant); tokens never reach the client. Same shared eBay app;
`account_role` (`seller` | `buyer`) chooses scopes and which sync path runs.

This was a **hardening pass** over an existing implementation, not a greenfield
build. What was added/fixed in this pass:

- **Scope + environment SoT** — `src/lib/ebay/oauth-config.ts`. Consent and refresh
  now request the **same** scopes, and the token endpoint is chosen by environment
  (the refresh path previously hardcoded the production endpoint, so sandbox refresh
  was broken).
- **Per-tenant / shared-app credentials** — `src/lib/ebay/credentials.ts`
  (`getEbayAppCreds`). No `process.env` reads in the connect/callback/client/refresh
  paths.
- **CSRF** — encrypted `state` (carries tenant + nonce) **plus** an httpOnly
  cookie holding the same nonce, validated on callback, with a 10-minute TTL.
- **Per-org uniqueness** — `UNIQUE (organization_id, account_name)` so one org can't
  overwrite another's row (migration `2026-06-14e`).
- **Declined-consent**, **refresh-failure → needs-reconsent**, a **health** endpoint,
  and **per-account disconnect** (step-up; eBay has no revoke API, so delete = revoke).
- **Encryption-at-rest hard-fail** in production when `INTEGRATION_KMS_KEY` is unset.
- **Purchasing accounts** — `?role=buyer`, Trading GetOrders → `/incoming`, and
  auto-enable of `incoming_universal` on successful buyer connect.

## Tenancy model

**Shared eBay app, many accounts.** One eBay developer app + RuName (CycleForge's)
that every tenant's sellers/buyers grant consent to.

| Layer | Home | Contents |
|---|---|---|
| **App credentials** | env (`EBAY_APP_ID` / `CERT_ID` / `RU_NAME`) or vault `provider='ebay'` **scope=null** | Client ID, Cert, RuName, environment |
| **User tokens (SoT)** | `organization_integrations` `provider='ebay'` scope=`seller:{slug}` \| `buyer:{slug}` | Refresh + access tokens, expiry, scopes |
| **Account metadata** | `ebay_accounts` | Label, `account_role`, `ebay_user_id`, sync watermarks, expiry chips (no secrets) |
| **Catalog identity** | `platform_accounts.integration_scope` | Same string as vault scope |

Helpers: `ebayScopeForAccount`, `upsertEbayUserCreds`, `resolveEbayUserTokens` in
`src/lib/ebay/credentials.ts`. Mirror of the Amazon pattern (`amazon_accounts` +
vault `seller-{id}`).

Backfill existing rows: `npx tsx scripts/migrate-ebay-tokens-to-vault.ts --apply`
then apply migration `2026-07-20_ebay_vault_tokens.sql` (drops token columns).

## OAuth flow

1. `GET /api/ebay/connect?accountName=<label>` (auth: `integrations.ebay`) — resolves
   app creds, mints a nonce, encrypts `state = { organizationId, accountName,
   environment, role, createdBy, nonce, issuedAt }`, sets the `ebay_oauth_state` httpOnly
   cookie, and 302s to `https://auth[.sandbox].ebay.com/oauth2/authorize`.
   Pass `role=buyer` for a **purchasing** account (Settings → **Add purchasing**);
   omit / `seller` for selling.
2. eBay shows consent → redirects to the **RuName**, which must point at
   `GET /api/ebay/callback` (no auth — identity comes from `state`).
3. Callback validates: declined-consent (`?error=`), missing params, decryptable
   state, required fields, TTL, and **cookie nonce === state nonce**; exchanges the
   code (Basic `base64(appId:certId)`) at the env-matched token endpoint; probes the
   identity API for the eBay user id; **upserts vault** via `upsertEbayUserCreds`
   (scope `seller:`/`buyer:`); upserts `ebay_accounts` **metadata** (no token columns);
   syncs `platform_accounts`; audits `integrations.ebay.connected`; redirects to
   `/settings/integrations?success=ebay_connected`.
   Buyer connects also enable `organization_feature_flags(flag='incoming_universal')`.

## Purchasing accounts → Incoming

Purchasing (buyer) accounts feed **Universal Incoming** (`/incoming`) so ops can find
orders that are in transit or **delivered but not yet unboxed**.

| Step | Behavior |
|---|---|
| Connect | Settings → Integrations → eBay → **Add purchasing** → `role=buyer` |
| Flag | `incoming_universal` enabled for the org on successful buyer OAuth |
| Sync | Cron `/api/cron/ebay/purchase-sync` (~30m) or Incoming **Marketplace** refresh |
| Ingest | Trading `GetOrders` `OrderRole=Buyer` → `ingestPurchase` → `receiving_line` (`inbound_source_type='ebay'`, `EXPECTED`) |
| Tracking | Tracking + carrier from Trading `ShippingDetails` → STN; carrier poll marks delivered |
| UI | Main Incoming table + eBay details tab; facet **Delivered · not unboxed** for carrier-delivered, not-yet-opened packages |

**Buyer scopes** (default — override via `EBAY_BUYER_SCOPES`):

```
https://api.ebay.com/oauth/api_scope
```

`buy.order.readonly` is **opt-in** for richer Buy Order enrich (ETA/detail); Trading
discovery works without it. Refresh and consent **must** use the same role scope set —
`EbayClient` and the hourly refresh job pass `ebayScopeStringForRole(account_role)`.

Seller Fulfillment sync (`connectors/ebay.ts`) **excludes** buyer accounts; buyers
never hit `sell.fulfillment`.

**Delivered · not unboxed** needs tracking (or an eBay “ORDER DELIVERED” email signal).
Without tracking, the purchase can still appear on Incoming as awaiting tracking /
in transit once ingested, but it will not enter the delivered facet until a carrier
(or email) marks delivery.

## eBay Developer Portal setup

The **RuName** is a registered redirect name, **not** a literal URL. Per environment:

| Environment | Authorize host | Token host | RuName accept URL must point at |
|---|---|---|---|
| Production  | `auth.ebay.com` | `api.ebay.com/identity/v1/oauth2/token` | `https://<prod-domain>/api/ebay/callback` |
| Sandbox     | `auth.sandbox.ebay.com` | `api.sandbox.ebay.com/identity/v1/oauth2/token` | `https://<preview-or-tunnel-domain>/api/ebay/callback` |

Register a **separate RuName per environment**; set its accept/decline/privacy URLs in
the portal. The app must be approved for every scope requested (see below).

### Marketplace Account Deletion / Closure (Production keyset unlock)

eBay **hard-blocks new Production keysets** until this is configured. It is an
**application-level** webhook on the shared Cycle Forge eBay app (not per-tenant).

| Portal field | Value |
|---|---|
| Notification endpoint URL | `https://app.cycleforge.ai/api/webhooks/ebay/marketplace-account-deletion` |
| Verification token | Same as `EBAY_VERIFICATION_TOKEN` (32–80 chars, `[A-Za-z0-9_-]`) |

**Who can configure it:** an eBay Developer Program team member with **Admin**
(or equivalent) access on the application under
[developer.ebay.com](https://developer.ebay.com) → Application Keys →
Marketplace account deletion/closure. Viewer/support-only portal roles cannot
save the endpoint.

**Not the same as OAuth `account_role`:** Cycle Forge's `seller` | `buyer`
discriminator (`ebay_accounts.account_role`) is about which scopes a connected
store granted. MAD notifications fire when an **eBay user** deletes/closes their
eBay account; we purge every matching `ebay_accounts` row (both roles) by
`ebay_user_id`.

Implementation: `GET/POST /api/webhooks/ebay/marketplace-account-deletion`
(`src/lib/ebay/marketplace-account-deletion.ts`). GET answers the challenge
hash; POST verifies `X-EBAY-SIGNATURE` against the **raw request body** and
deletes tokens.

1. Deploy the route + set `EBAY_VERIFICATION_TOKEN` +
   `EBAY_MARKETPLACE_DELETION_ENDPOINT_URL` in Vercel Production.
2. Set **Production** `EBAY_APP_ID` + `EBAY_CERT_ID` + `EBAY_ENVIRONMENT=PRODUCTION`
   (same keyset you're unlocking — sandbox creds will fail signature verify).
3. Paste the exact URL + token in the portal and **Save** (eBay GETs the
   challenge; hash must match).
4. eBay sends a test POST notification — must return **200** (not 412).
5. Production keyset unlocks once verification succeeds.

**412 from the portal?** Signature verification failed. Check Vercel logs for
`[ebay/marketplace-account-deletion]`. Common causes: Production App ID/Cert ID
not set or mismatched (sandbox creds on a Production endpoint); wrong
`EBAY_ENVIRONMENT`; or `EBAY_VERIFICATION_TOKEN` / endpoint URL mismatch on
the GET challenge (POST can still fail separately).

## Scopes

### Seller (default)

Default (`src/lib/ebay/oauth-config.ts`):

```
https://api.ebay.com/oauth/api_scope
https://api.ebay.com/oauth/api_scope/sell.inventory
https://api.ebay.com/oauth/api_scope/sell.fulfillment
https://api.ebay.com/oauth/api_scope/sell.account
```

`sell.finances` is **not** default (needs separate eBay approval). Override the whole
set via the `EBAY_SCOPES` env var (space-separated) once approved — no redeploy of code.

### Buyer / purchasing

Default: `https://api.ebay.com/oauth/api_scope` only. Override via `EBAY_BUYER_SCOPES`
(e.g. to add `buy.order.readonly` once the app is approved for it).

## Environment variables

| Var | Purpose |
|---|---|
| `EBAY_APP_ID` | OAuth client_id (eBay "App ID"). Shared app. Vercel **Sensitive**. |
| `EBAY_CERT_ID` | OAuth client_secret (eBay "Cert ID"); Basic-auth on token calls. **Sensitive**. |
| `EBAY_RU_NAME` | The registered RuName used as `redirect_uri` (per environment). |
| `EBAY_ENVIRONMENT` | `PRODUCTION` (default) or `SANDBOX`. |
| `EBAY_SCOPES` | Optional space-separated **seller** scope override. |
| `EBAY_BUYER_SCOPES` | Optional space-separated **buyer** scope override. |
| `INCOMING_UNIVERSAL` | Global env fallback for Universal Incoming (per-org flag preferred; buyer connect auto-enables). |
| `EBAY_VERIFICATION_TOKEN` | MAD challenge token (32–80 `[A-Za-z0-9_-]`). Same value in the portal. **Sensitive**. |
| `EBAY_MARKETPLACE_DELETION_ENDPOINT_URL` | Exact public HTTPS URL used in the challenge hash. Default: `https://app.cycleforge.ai/api/webhooks/ebay/marketplace-account-deletion`. |
| `INTEGRATION_KMS_KEY` | base64 32-byte AES-256-GCM key. **Required in production** — tokens + OAuth state are stored plaintext without it (dev only). Generate: `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` |
| `CRON_SECRET` | Bearer secret for the hourly refresh cron (`/api/cron/ebay/refresh-tokens`). |
| `EBAY_REFRESH_TOKEN_USAV` | Transitional USAV bootstrap refresh token (env fallback only). |

## Background refresh

`/api/cron/ebay/refresh-tokens` (hourly, in `vercel.json` + `src/lib/cron/registry.ts`)
runs `runEbayRefreshTokensJob`: refreshes tokens expiring within 30 min using each
account's org app creds, environment, and **role-matched scopes**. A dead/expired
refresh token deactivates the account (`is_active=false`) and marks the integration
in error so the card prompts a reconnect.

Purchase sync: `/api/cron/ebay/purchase-sync` (~30m) for buyer → Incoming (gated by
`incoming_universal`).

## Manual sandbox test checklist

1. Set `EBAY_ENVIRONMENT=SANDBOX`, sandbox `EBAY_APP_ID/CERT_ID/RU_NAME`, and
   `INTEGRATION_KMS_KEY`; point the sandbox RuName at `…/api/ebay/callback`.
2. Settings → Integrations → eBay → **Connect**, enter a label, sign in to the
   sandbox seller account, grant consent.
3. Expect redirect to `…?success=ebay_connected`, a success toast, and the account
   in the card with a token-expiry detail.
4. **Check** → healthy. **Refresh** (per-account) → success.
5. **Cancel** consent on a second attempt → `?error=ebay_consent_declined` banner.
6. **Disconnect** (Trash) → account removed (step-up required for non-admins).
7. **Purchasing:** **Add purchasing** → grant buyer consent → confirm
   `incoming_universal` is on, Marketplace refresh pulls purchases to `/incoming`,
   and delivered packages with tracking appear under **Delivered · not unboxed**.
8. `npm run test:ebay` (scope/env SoT) and `npm run audit-route-auth:check`.
