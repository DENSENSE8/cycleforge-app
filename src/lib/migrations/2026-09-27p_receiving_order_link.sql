-- ============================================================================
-- 2026-09-27p: receiving_order_link — the inbound ↔ outbound order edge
-- ============================================================================
-- The carton-level order-identity edge of docs/carton-order-identity-plan.md
-- (P4), built now for its first relation:
--
--   relation = 'fulfills' — a purchase order (inbound_order + its receiving
--     carton) was bought FOR an outbound order: "this PO is for order 1125".
--     Written by the chat PO import (draft card "For order") and by
--     `link_po_to_order`; read by the order record and the carton record so
--     each names the other.
--   relation = 'identity' — reserved for P4 proper (the carton IS this order:
--     a return, a sale imported by number). No writer yet.
--
-- The PO end: inbound_order_id (the internal PO header, 2026-09-27d) and the
-- PO's inbound carton when it has one; po_number is the number the operator
-- sees. The order end: external_order_id (orders.order_id — one order may be
-- several line rows) and local_order_id (FK orders.id, the bridge the plan
-- says does not exist) + channel (orders.account_source).
--
-- Tenant-from-birth: the only writers (src/lib/orders/po-order-link.ts) run
-- inside withTenantTransaction and stamp organization_id explicitly.
-- Purely additive: one new table and its indexes.
--
-- ROLLBACK:
--   select relax_tenant_isolation('receiving_order_link');
--   DROP TABLE IF EXISTS receiving_order_link;
--
-- VERIFY (after apply): npm run tenancy:coverage
-- ============================================================================

CREATE TABLE IF NOT EXISTS receiving_order_link (
  id                   BIGSERIAL PRIMARY KEY,
  organization_id      UUID NOT NULL,
  relation             TEXT NOT NULL DEFAULT 'fulfills',
  receiving_id         INTEGER REFERENCES receiving_carton(id) ON DELETE CASCADE,
  receiving_line_id    INTEGER REFERENCES receiving_line(id) ON DELETE CASCADE,
  inbound_order_id     BIGINT REFERENCES inbound_order(id) ON DELETE CASCADE,
  po_number            TEXT,
  external_order_id    TEXT NOT NULL,
  channel              TEXT,
  platform_account_id  BIGINT REFERENCES platform_accounts(id) ON DELETE SET NULL,
  local_order_id       INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  source               TEXT NOT NULL DEFAULT 'assistant',
  created_by_staff_id  INTEGER,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT receiving_order_link_relation_chk CHECK (relation IN ('fulfills', 'identity')),
  CONSTRAINT receiving_order_link_anchor_chk
    CHECK (receiving_id IS NOT NULL OR receiving_line_id IS NOT NULL OR inbound_order_id IS NOT NULL)
);

-- One edge per (PO, order): a re-link is a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS ux_receiving_order_link_natural
  ON receiving_order_link (
    organization_id,
    relation,
    COALESCE(inbound_order_id, 0),
    COALESCE(receiving_id, 0),
    upper(external_order_id)
  );

-- The order record's read: by line row or by order number.
CREATE INDEX IF NOT EXISTS idx_receiving_order_link_org_local_order
  ON receiving_order_link (organization_id, local_order_id)
  WHERE local_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_receiving_order_link_org_external_order
  ON receiving_order_link (organization_id, upper(external_order_id));

-- The carton record's read.
CREATE INDEX IF NOT EXISTS idx_receiving_order_link_org_receiving
  ON receiving_order_link (organization_id, receiving_id)
  WHERE receiving_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_receiving_order_link_org_inbound_order
  ON receiving_order_link (organization_id, inbound_order_id)
  WHERE inbound_order_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('receiving_order_link');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — receiving_order_link left without FORCE RLS';
  END IF;
END $$;
