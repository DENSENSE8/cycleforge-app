# Integrations as SoT — Dogfood → Industry-Standard Relabel (program doc)

**Mission (one sentence).** Stop treating vendor brands as product features: product surfaces
speak **capabilities** (inventory, helpdesk, sales channel, label engine, email inbox),
Settings → Integrations is the **only** place tenants connect/disconnect accounts, and every
operator string that used to say "Zoho / Zendesk / …" resolves from the connected provider's
`displayLabel` (or a generic capability noun when none is connected).

Zoho Inventory is **not** deleted. It remains a first-class inventory connector. What dies is
Zoho-as-the-app.

## Non-negotiable rules

1. **Connect only in Integrations.** No parallel "Zoho tools" / "reconnect" admin islands that
   bypass the hub (admin diagnostics may deep-link to the hub card).
2. **Labels from SoT.** Operator copy uses either a generic capability noun ("Save to
   inventory", "Sync purchase orders") or `connectedProviderLabel(orgId, 'inventory')` →
   e.g. "Zoho Inventory" when that connector is active.
   - Vocabulary: `Capability` in `src/lib/integrations/connectors/types.ts`.
   - Pure label helpers (client-safe): `src/lib/integrations/capability-labels.ts`.
   - Org-aware resolution + gating (server): `src/lib/integrations/capability-connections.ts`.
3. **Capabilities gate features**, not brand permissions alone (permission *ids* like
   `integrations.zoho` never rename; labels may keep the brand).
4. **Connector packages stay brand-named.** `src/lib/zoho/**`, `/api/zoho/*`,
   `receiving_line_zoho`, OAuth scopes — brand belongs inside the connector, not on the
   product spine.
5. **No new USAV env fallbacks** in `src/lib/integrations/credentials.ts`.
6. **No zoho_\* columns on new spine tables** — new work uses `external_*` + `provider`.

Allowed brand surfaces: the Integrations card (`PROVIDER_CATALOG`), deep links into vendor web
apps ("Open in Zoho/Zendesk/Gmail"), platform/channel chips + their label registries,
permission labels, admin cron/diagnostic category names, Gmail search-syntax placeholders,
literal dogfood NAS folder paths.

## Capability model (foundation — landed)

`Capability = orders | inventory | tracking | labels | payments | voice | helpdesk |
email_inbox | catalog | ai`. Connector assignments: zoho → inventory; zendesk → helpdesk;
shipstation → orders+tracking+labels; ecwid → orders+catalog; ollama/ai_gateway/openai/
anthropic → ai; nextiva → voice; **gmail (new provider)** → email_inbox (PO mailbox; legacy
token home `google_oauth_tokens`, dual-read in `src/lib/po-gmail/client.ts`).
`inventory` means the ERP/inventory-backend capability — marketplace channel stock push is
part of the `orders` capability (`pushInventory` hook), not `inventory`.

Catalog taxonomy (`INTEGRATION_CATEGORIES`): Sales channels · Purchasing & inventory ·
Fulfillment & shipping · Support · Communications · Storage & Backup · AI.

## Capability facades (Phase B)

- **InventoryProvider** — `src/lib/integrations/inventory/` (`getInventoryProvider(orgId)`,
  Zoho adapter). Consumers: mark-received-po, receiving sync services, sku-catalog Zoho
  fallback, shipped fulfillment push.
- **HelpdeskProvider** — `src/lib/integrations/helpdesk/` (`getHelpdeskProvider(orgId)`,
  Zendesk adapter). Consumers: support console routes, receiving claim, warranty claim
  linkage.
- LabelEngine (ShipStation behind `/api/outbound/rates`) is already vendor-neutral at the API
  boundary; EmailInboxProvider is the po-gmail client behind the vault dual-read.

## Schema & tokens (Phase C posture)

- Prefer `receiving_line_zoho` / external-id helpers over scattering `zoho_item_id` in UI
  props; `items.zoho_item_id` is treated as "inventory external id" in the domain layer.
- `source='zoho_po'` enum values stay; display resolves via the source registry.
- **Token SoT** = `organization_integrations` (see
  `docs/integrations/token-sot-consolidation-plan.md`).

## ⚠️ Env-fallback burn-down — BLOCKED prerequisite

Phase 5 (delete the USAV Zoho env bridge) **must not run yet**: as of 2026-07-10 the prod
`ZOHO_REFRESH_TOKEN` env is empty and the live refresh token exists **only** in
`ebay_accounts.ZOHO_MAIN`. Removing the fallback before running
`scripts/migrate-zoho-to-vault.ts --apply` against prod (then verifying `/api/zoho/health`)
breaks dogfood receiving/fulfillment immediately. Sequence: migrate → verify → delete the
`'zoho'` envFallback arm + `legacyZohoFromEnv` + `loadLegacyZohoCredentials` → retire
`ebay_accounts.ZOHO_MAIN` readers → remove `includeUsavTransitional` from
`src/lib/cron/for-each-org.ts`. The other 12 env arms each need a vault row written first
(no generic migration script exists yet).

## Grep gates (CI-friendly)

```bash
# Product components must not hardcode Zoho as the inventory product name
rg -n "Save (all )?to Zoho|Synced .* to Zoho|Re-check Zoho|Zoho SKU|Missing from Zoho|Zoho Inbound|Refresh Zoho" src/components

# Nav must not brand FBA as the product name in primary labels
rg -n "Amazon FBA" src/components src/app --glob '!**/*.md'

# No new env fallback branches
rg -n "USAV_ORG_ID|ZOHO_REFRESH_TOKEN|Configured via environment" src/lib/integrations
```

## Explicit non-goals

Replacing Zoho with another ERP; renaming all `zoho_*` DB columns in one PR; moving
`/api/zoho/*` connector routes to generic paths; adding Shopify/Gorgias/EasyPost
implementations; putting Stripe/Ably/Resend on tenant Integrations cards; marketing-site work.
