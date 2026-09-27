-- ============================================================================
-- 2026-09-27d: inbound_order — the internal header of every inbound order
-- ============================================================================
-- One row per real-world inbound order (vendor PO, marketplace purchase,
-- return, trade-in, pickup), owned by CycleForge. External systems (Zoho,
-- eBay, Amazon) are sources of an order, never its identity:
--   natural key = (organization_id, source_type, source_platform,
--                  external_order_id_norm)
-- so a Walmart order 1234 and a Goodwill order 1234 (both source 'manual')
-- are two orders, and a Zoho PO keeps its Zoho id only as external_order_id.
--
-- receiving_line gains the line half of the identity: inbound_order_id +
-- line_key (the source's own line id, or L1..Ln the ingest assigns), plus the
-- typed line cost. inbound_purchase_order_mirror stays the read-only
-- reconcile snapshot it is documented to be; it is NOT this header.
--
-- Purely additive: a new table, nullable columns, new indexes. The backfill
-- and the identity-index swap are 2026-09-27e.
--
-- Tenant-from-birth: the only writer (src/lib/inbound/ingest-inbound-order.ts)
-- runs inside withTenantTransaction and stamps organization_id explicitly.
--
-- ROLLBACK:
--   select relax_tenant_isolation('inbound_order');
--   ALTER TABLE receiving_line DROP COLUMN IF EXISTS inbound_order_id,
--     DROP COLUMN IF EXISTS line_key, DROP COLUMN IF EXISTS unit_cost_cents,
--     DROP COLUMN IF EXISTS currency;
--   DROP TABLE IF EXISTS inbound_order;
--   DROP FUNCTION IF EXISTS inbound_order_number_norm(text);
-- ============================================================================

CREATE OR REPLACE FUNCTION inbound_order_number_norm(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT upper(regexp_replace(btrim(coalesce(raw, '')), '\s+', '', 'g'))
$$;

COMMENT ON FUNCTION inbound_order_number_norm(text) IS
  'Order-number normal form for inbound identity: trimmed, whitespace removed, upper-cased. Mirrored by normalizeInboundOrderNumber() in src/lib/inbound/inbound-order-draft.ts.';

CREATE TABLE IF NOT EXISTS inbound_order (
  id                        BIGSERIAL PRIMARY KEY,
  organization_id           UUID NOT NULL,
  source_type               TEXT NOT NULL,
  source_platform           TEXT NOT NULL DEFAULT 'none',
  external_order_id         TEXT NOT NULL,
  external_order_id_norm    TEXT NOT NULL,
  -- Human order / PO number when it differs from the external id (Zoho PO id vs its PO-00123).
  order_number              TEXT,
  receiving_type            TEXT NOT NULL DEFAULT 'PO',
  origin                    TEXT NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'open',
  supplier_id               INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  vendor_name               TEXT,
  platform_account_id       BIGINT REFERENCES platform_accounts(id) ON DELETE SET NULL,
  currency                  CHAR(3) NOT NULL DEFAULT 'USD',
  order_date                DATE,
  expected_date             DATE,
  priority_tier             SMALLINT,
  notes                     TEXT,
  replenishment_request_id  UUID REFERENCES replenishment_requests(id) ON DELETE SET NULL,
  source_modified_at        TIMESTAMPTZ,
  content_hash              TEXT,
  created_by                INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inbound_order_source_type_chk
    CHECK (source_type IN ('zoho', 'ebay', 'amazon', 'manual')),
  CONSTRAINT inbound_order_receiving_type_chk
    CHECK (receiving_type IN ('PO', 'RETURN', 'TRADE_IN', 'PICKUP', 'REPAIR')),
  CONSTRAINT inbound_order_origin_chk
    CHECK (origin IN ('manual', 'csv', 'chat', 'sync', 'auto_replenish', 'backfill')),
  CONSTRAINT inbound_order_status_chk
    CHECK (status IN ('open', 'partially_received', 'received', 'cancelled')),
  CONSTRAINT inbound_order_priority_chk
    CHECK (priority_tier IS NULL OR priority_tier BETWEEN 0 AND 3),
  CONSTRAINT inbound_order_norm_chk
    CHECK (external_order_id_norm = inbound_order_number_norm(external_order_id)
           AND external_order_id_norm <> ''),
  CONSTRAINT inbound_order_platform_chk
    CHECK (source_platform = lower(btrim(source_platform)) AND source_platform <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_inbound_order_identity
  ON inbound_order (organization_id, source_type, source_platform, external_order_id_norm);

CREATE INDEX IF NOT EXISTS idx_inbound_order_org_norm
  ON inbound_order (organization_id, external_order_id_norm);

CREATE INDEX IF NOT EXISTS idx_inbound_order_org_supplier
  ON inbound_order (organization_id, supplier_id)
  WHERE supplier_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inbound_order_org_expected
  ON inbound_order (organization_id, expected_date)
  WHERE status IN ('open', 'partially_received');

CREATE INDEX IF NOT EXISTS idx_inbound_order_org_replenishment
  ON inbound_order (organization_id, replenishment_request_id)
  WHERE replenishment_request_id IS NOT NULL;

COMMENT ON TABLE inbound_order IS
  'Internal header of an inbound order. Identity = (org, source_type, source_platform, external_order_id_norm). External ids are facts of the order, never its key.';

ALTER TABLE receiving_line
  ADD COLUMN IF NOT EXISTS inbound_order_id BIGINT REFERENCES inbound_order(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS line_key TEXT,
  ADD COLUMN IF NOT EXISTS unit_cost_cents BIGINT,
  ADD COLUMN IF NOT EXISTS currency CHAR(3);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receiving_line_unit_cost_chk') THEN
    ALTER TABLE receiving_line
      ADD CONSTRAINT receiving_line_unit_cost_chk CHECK (unit_cost_cents IS NULL OR unit_cost_cents >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receiving_line_line_key_chk') THEN
    ALTER TABLE receiving_line
      ADD CONSTRAINT receiving_line_line_key_chk
      CHECK (inbound_order_id IS NULL OR (line_key IS NOT NULL AND btrim(line_key) <> ''));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_receiving_line_org_inbound_order
  ON receiving_line (organization_id, inbound_order_id)
  WHERE inbound_order_id IS NOT NULL;

COMMENT ON COLUMN receiving_line.line_key IS
  'Line identity within inbound_order: the source line id, or L1..Ln assigned at ingest. Unique per (org, inbound_order_id).';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('inbound_order');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — inbound_order left without FORCE RLS';
  END IF;
END $$;
