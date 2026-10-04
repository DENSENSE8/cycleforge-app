-- 2026-10-03_items_sent_support_ticket_items.sql
-- support_ticket_items — what we SENT the customer on a support ticket, as
-- structured data (task-principles P7: "the ticket is the system of record for
-- what we did for the customer"). One row per product picked in the ticket
-- composer's `+` → "Product sent to customer": which SKU (sku_catalog_id, the
-- identity-law key), why (role: replacement / return / exchange / sent), how
-- many (qty), who (staff_id), when (created_at), and the helpdesk comment the
-- pick rode on (zendesk_comment_id — the thread paints the product card under
-- that comment by reading THIS row at view time, P6 "reference, never copy").
-- order_id / shipping_label_purchase_id are optional pointers for when the
-- shipment is known; nothing writes them yet beyond an explicit caller.
--
-- Filename sorts before 2026-10-03_locations_arrival_priority_tier.sql (another
-- lane's pending file) only so `--only` can land this one without applying it.
--
-- Idempotency: a retried POST carries the same client_event_id; the UNIQUE
-- (organization_id, client_event_id) collapses it to one row.
--
-- Tenant-scoped from birth: organization_id NOT NULL, every key leads with it,
-- enforced via enforce_tenant_isolation() (2026-06-14_rls_enforcement_infra.sql)
-- so the loud-fail DEFAULT + FORCE RLS + canonical tenant_isolation policy land
-- in one shot. Safe because the only writer (src/lib/support/ticket-items.ts)
-- runs inside withTenantTransaction (sets app.current_org) AND stamps
-- organization_id explicitly. The table is new, so there are no prior writers.
--
-- ROLLBACK: select relax_tenant_isolation('support_ticket_items'); then DROP TABLE IF EXISTS support_ticket_items;
-- VERIFY:   \d support_ticket_items → role CHECK, qty CHECK, UNIQUE (org, client_event_id),
--           idx (org, support_ticket_id, created_at DESC), RLS forced.

CREATE TABLE IF NOT EXISTS support_ticket_items (
  id                          BIGSERIAL PRIMARY KEY,
  organization_id             UUID NOT NULL,           -- no DEFAULT here; helper installs the loud-fail GUC default
  support_ticket_id           BIGINT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sku_catalog_id              INTEGER NOT NULL REFERENCES sku_catalog(id),
  role                        TEXT NOT NULL
                              CONSTRAINT support_ticket_items_role_chk
                              CHECK (role IN ('replacement', 'return', 'exchange', 'sent')),
  qty                         INTEGER NOT NULL
                              CONSTRAINT support_ticket_items_qty_chk CHECK (qty > 0),
  order_id                    INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  shipping_label_purchase_id  BIGINT REFERENCES shipping_label_purchases(id) ON DELETE SET NULL,
  zendesk_comment_id          BIGINT,
  note                        TEXT,
  staff_id                    INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  client_event_id             TEXT NOT NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT support_ticket_items_org_client_event_unique UNIQUE (organization_id, client_event_id)
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_items_org_ticket
  ON support_ticket_items (organization_id, support_ticket_id, created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('support_ticket_items');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — support_ticket_items left without FORCE RLS';
  END IF;
END $$;
