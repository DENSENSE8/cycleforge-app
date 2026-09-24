-- 2026-09-24f_shipping_label_purchases.sql
-- shipping_label_purchases — one row per INTENDED ShipStation label purchase,
-- keyed by the client's idempotency key (clientEventId).
--
-- Why: `POST /api/shipping/order-labels/purchase` used the label DOCUMENT
-- (`documents.document_data->>'sourceHash' = clientEventId`) as its only
-- idempotency record. The document is written AFTER the irreversible
-- ShipStation charge, so a purchase that succeeded but died before (or during)
-- the document store left no trace, and the operator's retry bought a second
-- label. This table is claimed BEFORE the charge:
--
--   claim   INSERT … status='pending' ON CONFLICT DO NOTHING (loser → 409 / replay)
--   bought  UPDATE status='purchased' + label id, tracking, cost, label URL
--           — written immediately after ShipStation answers, before any
--           byte download or document store, so a retry short-circuits and
--           only backfills the missing document.
--   failed  ShipStation refused the purchase (nothing was charged) → the row
--           is deleted so the same key may try again.
--   voided  the void route stamps it; the client mints a fresh key after a
--           void, so a voided key is never bought against again.
--
-- A `pending` row that never resolves means the process died mid-charge: the
-- retry answers 409 "check ShipStation before buying again" instead of
-- guessing — a stuck key is recoverable, a double charge is not.
--
-- Tenant-scoped from birth: organization_id NOT NULL, enforced via
-- enforce_tenant_isolation(). Safe because the only writer
-- (`src/lib/shipping/label-purchase-ledger.ts`) goes through tenantQuery (sets
-- app.current_org) AND stamps organization_id explicitly.
--
-- ROLLBACK: select relax_tenant_isolation('shipping_label_purchases');
--           DROP TABLE IF EXISTS shipping_label_purchases;

CREATE TABLE IF NOT EXISTS shipping_label_purchases (
  id                        BIGSERIAL PRIMARY KEY,
  organization_id           UUID NOT NULL,          -- no DEFAULT here; helper installs the loud-fail GUC default
  order_id                  INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  client_event_id           TEXT NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'pending',
  rate_id                   TEXT,
  label_id                  TEXT,
  tracking_number           TEXT,
  carrier_code              TEXT,
  service_code              TEXT,
  cost                      NUMERIC(12, 2),
  currency                  TEXT,
  label_format              TEXT,
  label_url                 TEXT,
  label_document_id         INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  shipment_id               INTEGER,
  purchased_by              INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shipping_label_purchases_status_check
    CHECK (status IN ('pending', 'purchased', 'voided')),
  -- Per-org idempotency — ALWAYS lead the natural key with organization_id.
  CONSTRAINT shipping_label_purchases_org_client_event_unique
    UNIQUE (organization_id, client_event_id)
);

CREATE INDEX IF NOT EXISTS idx_shipping_label_purchases_org_order
  ON shipping_label_purchases (organization_id, order_id);

CREATE INDEX IF NOT EXISTS idx_shipping_label_purchases_org_label
  ON shipping_label_purchases (organization_id, label_id)
  WHERE label_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('shipping_label_purchases');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — shipping_label_purchases left without FORCE RLS';
  END IF;
END $$;
