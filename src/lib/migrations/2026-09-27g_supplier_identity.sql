-- ============================================================================
-- 2026-09-27g: suppliers become the org's own vendor master
-- ============================================================================
-- suppliers is already tenant-enforced (organization_id NOT NULL, loud-fail
-- GUC default, FORCE RLS). Two keys were still global or missing:
--   - uniq_suppliers_ebay_seller was (ebay_seller_id) across ALL orgs — one
--     org registering an eBay seller blocked every other org. Now per org.
--   - no name key, so inbound ingest could not find-or-create the vendor an
--     order names. Now (org, normalized name) is unique.
-- supplier_external_ids carries every external id a vendor has (a Zoho
-- contact id, an eBay seller, an Amazon seller id) — the vendor's identity is
-- suppliers.id; external ids are facts of it.
--
-- Safety: suppliers holds 0 rows in the dogfood DB at authoring time; the
-- name key is created after a duplicate check so a populated DB fails loudly
-- instead of half-applying. Writer switch: upsertEbaySupplier's ON CONFLICT
-- target moves to (organization_id, ebay_seller_id) in the same change.
--
-- ROLLBACK:
--   select relax_tenant_isolation('supplier_external_ids');
--   DROP TABLE IF EXISTS supplier_external_ids;
--   DROP INDEX IF EXISTS ux_suppliers_org_name;
--   DROP INDEX IF EXISTS ux_suppliers_org_ebay_seller;
--   CREATE UNIQUE INDEX uniq_suppliers_ebay_seller ON suppliers (ebay_seller_id) WHERE ebay_seller_id IS NOT NULL;
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS ux_suppliers_org_ebay_seller
  ON suppliers (organization_id, ebay_seller_id)
  WHERE ebay_seller_id IS NOT NULL;

DROP INDEX IF EXISTS uniq_suppliers_ebay_seller;

DO $$
DECLARE dup integer;
BEGIN
  SELECT count(*) INTO dup FROM (
    SELECT 1 FROM suppliers GROUP BY organization_id, lower(btrim(name)) HAVING count(*) > 1
  ) d;
  IF dup > 0 THEN
    RAISE EXCEPTION 'suppliers has % duplicate (org, name) group(s); merge them before 2026-09-27g', dup;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_suppliers_org_name
  ON suppliers (organization_id, lower(btrim(name)));

CREATE TABLE IF NOT EXISTS supplier_external_ids (
  id               BIGSERIAL PRIMARY KEY,
  organization_id  UUID NOT NULL,
  supplier_id      INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL,
  external_id      TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT supplier_external_ids_provider_chk
    CHECK (provider IN ('zoho', 'ebay', 'amazon', 'shopify', 'other')),
  CONSTRAINT supplier_external_ids_id_chk CHECK (btrim(external_id) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_supplier_external_ids_provider
  ON supplier_external_ids (organization_id, provider, external_id);

CREATE INDEX IF NOT EXISTS idx_supplier_external_ids_supplier
  ON supplier_external_ids (organization_id, supplier_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('supplier_external_ids');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — supplier_external_ids left without FORCE RLS';
  END IF;
END $$;
