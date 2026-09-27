-- order_payments — one row per payment request for an outbound order (phone
-- orders first): a Square payment link, a Square invoice, or (later) a Square
-- Terminal checkout. The card is only ever entered on a Square-hosted page;
-- this table holds the request, its Square object ids, its hosted URL and its
-- status — never card data.
--
-- Amounts are computed server-side from the order's own rows at request time
-- (`lines` is that snapshot: sku, title, qty, unit/line cents). Nothing here is
-- ever typed by the assistant model.
--
-- Status lifecycle: pending (row claimed, Square call in flight / link live)
-- → sent (invoice published / link shared) → paid | failed | cancelled, and
-- paid → refunded. Webhooks (/api/webhooks/square) and the polling refresh move
-- it; `paid_at` / `cancelled_at` stamp the terminal moves.
--
-- One OPEN request per order (`order_payments_one_open_per_order`): a double
-- click or a retried tool call cannot mint two live links for one order.
-- `idempotency_key` is the caller's key, unique per org.
--
-- Tenant-scoped from birth: organization_id NOT NULL, enforced via the
-- enforce_tenant_isolation() helper (2026-06-14_rls_enforcement_infra.sql).
-- Safe because the only writer (src/lib/order-payments/store.ts) runs every
-- statement through tenantQuery (sets app.current_org) AND stamps
-- organization_id explicitly; the webhook resolves the org first, then writes
-- through the same module.
--
-- Additive only: a new table, no change to any existing table or row.
--
-- ROLLBACK: select relax_tenant_isolation('order_payments'); DROP TABLE IF EXISTS order_payments;
--
-- Verify:
--   \d order_payments
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'order_payments';

CREATE TABLE IF NOT EXISTS order_payments (
  id                     BIGSERIAL PRIMARY KEY,
  organization_id        UUID NOT NULL,
  -- orders.order_id — one order number spans N line rows, so no FK.
  order_number           TEXT NOT NULL,
  -- orders.id of every line row the amount was computed from.
  order_ids              INTEGER[] NOT NULL DEFAULT '{}',
  customer_id            INTEGER NULL,
  method                 TEXT NOT NULL
    CONSTRAINT order_payments_method_check
    CHECK (method IN ('square_link', 'square_invoice', 'square_terminal')),
  status                 TEXT NOT NULL DEFAULT 'pending'
    CONSTRAINT order_payments_status_check
    CHECK (status IN ('pending', 'sent', 'paid', 'failed', 'cancelled', 'refunded')),
  amount_cents           INTEGER NOT NULL CHECK (amount_cents > 0),
  currency               TEXT NOT NULL DEFAULT 'USD',
  -- Server-computed snapshot of what is being charged: [{sku,title,qty,unitPriceCents,lineCents}].
  lines                  JSONB NOT NULL DEFAULT '[]'::jsonb,
  square_order_id        TEXT NULL,
  square_payment_link_id TEXT NULL,
  square_invoice_id      TEXT NULL,
  square_invoice_version INTEGER NULL,
  square_customer_id     TEXT NULL,
  square_payment_id      TEXT NULL,
  -- The Square-hosted page the customer pays on (checkout link / invoice page).
  url                    TEXT NULL,
  idempotency_key        TEXT NOT NULL,
  last_error             TEXT NULL,
  created_by             INTEGER NULL,
  paid_at                TIMESTAMPTZ NULL,
  cancelled_at           TIMESTAMPTZ NULL,
  last_checked_at        TIMESTAMPTZ NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT order_payments_org_idempotency_unique UNIQUE (organization_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS order_payments_one_open_per_order
  ON order_payments (organization_id, order_number)
  WHERE status IN ('pending', 'sent');

CREATE INDEX IF NOT EXISTS idx_order_payments_org_order
  ON order_payments (organization_id, order_number, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_payments_org_square_order
  ON order_payments (organization_id, square_order_id)
  WHERE square_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_payments_org_square_invoice
  ON order_payments (organization_id, square_invoice_id)
  WHERE square_invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_order_payments_org_square_payment
  ON order_payments (organization_id, square_payment_id)
  WHERE square_payment_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('order_payments');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — order_payments left without FORCE RLS';
  END IF;
END $$;
