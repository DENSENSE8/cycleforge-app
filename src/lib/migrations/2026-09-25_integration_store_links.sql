-- ============================================================================
-- 2026-09-25_integration_store_links.sql
--
-- WHAT: integration_store_links — where an aggregator's store (a ShipStation
-- store id) sells: an EXISTING catalog platform and, optionally, one of that
-- platform's EXISTING accounts. It replaces the store mirror's per-store
-- `platform_accounts` rows (`shipstation-<storeId>`, integration_scope = the
-- store id), which duplicated every platform in the pickers (eBay listed 8
-- entries, Ecwid showed "ECW" beside "New Ecwid by Lightspeed Store").
--
-- WHY A TABLE (not platform_accounts.integration_scope): an eBay account's
-- integration_scope already holds its eBay vault scope ('DRAGON', 'seller:…'),
-- read by the eBay credential lookup, marketplace-account-deletion and the
-- purchase ingest. A store link cannot overwrite it.
--
-- READERS / WRITERS (every one stamps organization_id explicitly inside
-- withTenantTransaction / tenantQuery):
--   src/lib/catalog/integration-store-links.ts   read + operator upsert
--   src/lib/catalog/shipstation-store-sync.ts    places an UNLINKED store once
--   src/lib/integrations/connectors/shipstation.ts  attribution bindings
--   src/lib/neon/catalog-queries.ts listPlatformAccounts  (is_storefront)
-- A linked store never creates a platform or an account on the next sync.
--
-- BACKFILL (nothing is deleted):
--   1. Every mirror account `shipstation-<id>` becomes a link for store <id> on
--      the account's platform. USAV's three eBay stores link to the eBay
--      seller accounts they are (216566 eBay Dragonhn → DRAGON,
--      230134 eBay Mekong → MEKONG, 230141 eBay USAV → USAV); every other store
--      links to its platform only (account NULL) — Amazon US / Renewed,
--      Walmart, Shopify, Ecwid — until the operator names an account in
--      Settings.
--   2. The superseded mirror accounts are DEACTIVATED, not dropped (row + store
--      id stay as provenance). No FK row and no orders.account_source points at
--      a `shipstation-*` account (audited 2026-09-25), so no reference moves.
--
-- SAFETY: new table + additive backfill, idempotent (ON CONFLICT DO NOTHING,
-- guarded UPDATE). Tenant-from-birth: organization_id NOT NULL, per-org unique
-- key, enforce_tenant_isolation() — safe because every writer above stamps org.
--
-- VERIFY:
--   SELECT l.external_store_id, p.slug, a.slug
--     FROM integration_store_links l
--     JOIN platforms p ON p.id = l.platform_id
--     LEFT JOIN platform_accounts a ON a.id = l.platform_account_id
--    ORDER BY 1;                                   -- 8 rows for USAV
--   SELECT count(*) FROM platform_accounts
--    WHERE slug LIKE 'shipstation-%' AND is_active;  -- 0
--
-- ROLLBACK:
--   UPDATE platform_accounts SET is_active = true WHERE slug LIKE 'shipstation-%';
--   SELECT relax_tenant_isolation('integration_store_links');
--   DROP TABLE IF EXISTS integration_store_links;
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS integration_store_links (
  id                  BIGSERIAL PRIMARY KEY,
  organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- The aggregator ('shipstation'); the store id is that provider's.
  provider            TEXT NOT NULL,
  external_store_id   TEXT NOT NULL,
  platform_id         BIGINT NOT NULL REFERENCES platforms(id) ON DELETE CASCADE,
  -- NULL = the store is the platform itself (orders use the org's spelling).
  platform_account_id BIGINT REFERENCES platform_accounts(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT integration_store_links_org_store_unique
    UNIQUE (organization_id, provider, external_store_id)
);

CREATE INDEX IF NOT EXISTS idx_integration_store_links_org_account
  ON integration_store_links (organization_id, platform_account_id)
  WHERE platform_account_id IS NOT NULL;

DROP TRIGGER IF EXISTS integration_store_links_touch_updated_at ON integration_store_links;
CREATE TRIGGER integration_store_links_touch_updated_at
  BEFORE UPDATE ON integration_store_links
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('integration_store_links');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — integration_store_links left without FORCE RLS';
  END IF;
END $$;

-- 1. Mirror accounts → links. USAV's eBay stores name their seller account.
INSERT INTO integration_store_links
  (organization_id, provider, external_store_id, platform_id, platform_account_id)
SELECT m.organization_id, 'shipstation', btrim(m.integration_scope), m.platform_id, seller.id
  FROM platform_accounts m
  LEFT JOIN (VALUES
      ('00000000-0000-0000-0000-000000000001'::uuid, '216566', 'DRAGON'),
      ('00000000-0000-0000-0000-000000000001'::uuid, '230134', 'MEKONG'),
      ('00000000-0000-0000-0000-000000000001'::uuid, '230141', 'USAV')
    ) AS named(organization_id, store_id, account_slug)
    ON named.organization_id = m.organization_id
   AND named.store_id = btrim(m.integration_scope)
  LEFT JOIN platform_accounts seller
    ON seller.organization_id = m.organization_id
   AND seller.platform_id = m.platform_id
   AND seller.slug = named.account_slug
 WHERE m.slug LIKE 'shipstation-%'
   AND btrim(coalesce(m.integration_scope, '')) ~ '^[0-9]+$'
ON CONFLICT (organization_id, provider, external_store_id) DO NOTHING;

-- 2. Retire the superseded mirror accounts (kept as provenance).
UPDATE platform_accounts m
   SET is_active = false
 WHERE m.slug LIKE 'shipstation-%'
   AND m.is_active
   AND EXISTS (
     SELECT 1
       FROM integration_store_links l
      WHERE l.organization_id = m.organization_id
        AND l.provider = 'shipstation'
        AND l.external_store_id = btrim(m.integration_scope)
   );

COMMIT;
