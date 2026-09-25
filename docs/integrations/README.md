# Integrations

Per-provider documentation for everything in the Settings → Integrations catalog.

**Framing: capabilities, not vendors.** Product surfaces speak *capabilities*
(inventory, helpdesk, sales channel, label engine, email inbox) and resolve operator
copy from the connected provider's display label — vendors are connectors a tenant
plugs into a capability slot, never the product itself. Zoho Inventory is the first
**inventory connector** (POs, item catalog, stock, fulfillment push), not the app's
backbone; Zendesk is a **helpdesk connector**; ShipStation is the first **label
engine**. Settings → Integrations is the **only** surface where a tenant connects,
reconnects, or disconnects an account.

The catalog has two sources of truth, plus the capability vocabulary:

- **Display SoT** — `src/app/settings/integrations/registry.ts` (`PROVIDER_CATALOG`):
  labels, categories, badges, which `connect` method a card uses, OAuth/health paths.
- **Behavior SoT** — `src/lib/integrations/connectors/registry.ts`: `authKind`,
  `capabilities`, and (per provider) `sync` / `health`. A `Record<IntegrationProvider,…>`
  makes missing a provider here a **compile error**.
- **Capability vocabulary + labels** — `Capability` in
  `src/lib/integrations/connectors/types.ts`; product copy resolves through
  `src/lib/integrations/capability-labels.ts` (pure/client-safe) and
  `src/lib/integrations/capability-connections.ts` (server: `isCapabilityConnected`,
  `connectedProviderLabel`). Never hardcode a vendor name in operator copy.

Credentials for every provider resolve through one path —
`getIntegrationCredentials(orgId, provider)` in `src/lib/integrations/credentials.ts` —
which reads the encrypted `organization_integrations` vault, with a **USAV-org-only
env-var fallback** so the existing single-tenant config keeps working during the
multi-tenant migration. New code must not add to that fallback; it is being removed
(token-SoT consolidation Phase 5).

## Provider index

| Provider | Category | `connect` | `authKind` | Capabilities | Status | Doc |
|---|---|---|---|---|---|---|
| **Amazon** | Sales channels | `amazon` | oauth | orders | **Live** (Phase 1) | [amazon.md](./amazon.md) |
| **eBay** | Sales channels | `ebay` | oauth | orders | **Live** (hardened) | [ebay-connect.md](./ebay-connect.md) |
| **Square** | Sales channels | `nango` | nango | orders | **Built** (needs Nango sidecar to go live) | [square.md](./square.md) |
| **Ecwid** | Sales channels | `vault` | vault | orders, catalog | USAV env live; OAuth = plan | [ecwid.md](./ecwid.md) |
| **Shopify** | Sales channels | `nango`¹ | nango¹ | orders | Plan | [shopify.md](./shopify.md) |
| **Google Sheets** | Sales channels | `vault` | vault | orders | **Live** (legacy/backfill) | [google-sheets.md](./google-sheets.md) |
| **Zoho Inventory** | Purchasing & inventory | `oauth` | oauth | inventory | **Live** (inventory connector) | [zoho.md](./zoho.md) |
| **UPS / FedEx / USPS** | Fulfillment & shipping | `vault` | vault | tracking | Polling live; webhooks dormant | [carriers.md](./carriers.md) |
| **ShipStation** | Fulfillment & shipping | `vault` | vault | orders, tracking, labels | **Live** (label engine) | — |
| **Zendesk** | Support | `vault` | vault | helpdesk | **Live** (warranty + support console) | [zendesk.md](./zendesk.md) |
| **Nextiva** | Communications | `vault` | vault | voice | **Live** (voice modes) | — |
| **Gmail (PO mailbox)** | Communications | `oauth` | oauth | email_inbox | **Live** (legacy token home → vault migration) | — |
| **Ollama / Hermes (AI)** | AI | `vault` | vault | ai | **Live** (local gateway) | [realtime-ai.md](./realtime-ai.md) |

> **Ably** is live realtime infrastructure but is **not** a customer-facing card — its key
> is wired globally via env (`ABLY_API_KEY`), so the connect card was removed (2026-06-14).
> See [realtime-ai.md](./realtime-ai.md).

¹ Shopify is a **plan** — not yet in `PROVIDER_CATALOG`/the provider enum. The doc
describes how it slots in once added.

## The two integration patterns

### Hand-built (eBay, Amazon, Zoho) and vault (carriers, Zendesk, Sheets, AI)
Most providers are hand-built OAuth or paste-credential ("vault") flows. The vault stores
an AES-256-GCM-encrypted payload per `(org, provider, scope)`; `INTEGRATION_KMS_KEY` is
**required in production** (tokens/state are plaintext without it — dev only).

### Nango-backed (Square, future Shopify)
For providers whose OAuth is the only real gap, a self-hosted **Nango sidecar**
(`src/lib/integrations/nango.ts`, `nango-providers.ts`,
`/api/integrations/nango/{session,connected}`) does the OAuth dance, encrypted token
storage, and **auto-refresh**, and exposes an authenticated **proxy** to the provider
API. We use Nango's free **auth + proxy** tier — *not* Nango Syncs (Enterprise).

> One sidecar (nango-server + Postgres + Redis) unlocks Square, Shopify, and ~250 other
> OAuth providers. Until `NANGO_SECRET_KEY` is set, `isNangoConfigured()` is false and
> Nango-backed cards fall back to vault entry. See `docs/nango-sidecar-setup.md`.

**Recipe for a Nango-backed provider:** (1) add the key to `IntegrationProvider` +
`NANGO_BACKED_PROVIDERS` (mapping our key → Nango's `provider_config_key`); (2) add a
`ProviderDef` with `connect: 'nango'`; (3) add a connector entry with `authKind: 'nango'`
+ a lazy `sync`; (4) write `connectors/<provider>.ts` that calls
`nangoProxy(orgId, provider, …)` and upserts into `orders` (reuse the `sale_amount` /
`currency` ingestion); (5) add it to `SOURCE_PLATFORMS` and the orchestrator cron. The
display card + Connect button + `/api/integrations/nango/*` flow already exist.

## Shared framework

- **Connection-driven sync** — `connectorsWithCapability('orders')` feeds the
  orchestrator; "Sync now" → `POST /api/integrations/<provider>/sync`; the cron
  `/api/cron/integrations/sync?providers=square` runs the same path every 15 minutes.
  See `docs/integrations-oauth-connection-plan.md`.
- **ShipStation is the sole outbound-order importer** (2026-09-24) — the desk's Sync
  ShipStation face and `/api/cron/shipstation/orders-sync` (08:00 + 14:00 PT). eBay,
  Amazon, Ecwid and Google Sheets no longer pull orders (no connector `sync()`); their
  connections stay for tokens, catalog, health and update-only backfills.
- **`maxIntegrations`** — each connected provider counts against the org's plan ceiling
  (`src/lib/billing/plans.ts`).
- **Per-provider crons** — Zoho, ShipStation and the shipping carriers run their own
  dedicated crons rather than the generic 15-minute orchestrator run (see each doc). All
  cron routes authenticate with `Bearer ${CRON_SECRET}` (a Vercel **Sensitive** var — env
  changes require a redeploy or the crons 401).

## Conventions every doc follows

Real route paths + auth guard, the lib files that own the logic, the env vars (flagged
**Sensitive** where they hold secrets), the DB tables, the cron schedule (verified
against `vercel.json`), and a clear **built / plan / dormant** status so the doc doesn't
overstate what exists.
