-- order_payments + Stripe — a second provider on the same order-payment rail.
-- A `stripe_link` request is a Stripe Checkout Session (payment mode) created
-- on the TENANT's own Stripe account (vault credential), never the platform's
-- billing account. The card is only ever entered on Stripe's hosted page.
--
-- Changes (additive, roll-forward):
--   • order_payments_method_check widens to include 'stripe_link'.
--   • stripe_checkout_session_id — the session a Stripe webhook / poll names;
--     the Square id columns are provider-specific and not reusable.
--   • stripe_payment_intent_id — recorded when the session is paid (the
--     Stripe-side handle staff refund from).
--   • per-org partial index on the session id (webhook lookup).
--
-- Safety gating: order_payments is already tenant-enforced
-- (2026-09-27_order_payments.sql); its only writer
-- (src/lib/order-payments/service.ts) stamps organization_id and runs every
-- statement through tenantQuery. The new columns are nullable; no row is
-- rewritten. Must apply AFTER 2026-09-27_order_payments.sql (the `b` suffix).
--
-- ROLLBACK (only once no stripe_link rows exist):
--   DROP INDEX IF EXISTS idx_order_payments_org_stripe_session;
--   ALTER TABLE order_payments DROP COLUMN IF EXISTS stripe_payment_intent_id,
--                              DROP COLUMN IF EXISTS stripe_checkout_session_id;
--   ALTER TABLE order_payments DROP CONSTRAINT IF EXISTS order_payments_method_check;
--   ALTER TABLE order_payments ADD CONSTRAINT order_payments_method_check
--     CHECK (method IN ('square_link', 'square_invoice', 'square_terminal'));
--
-- Verify:
--   \d order_payments
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'order_payments_method_check';

ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT NULL;
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'order_payments_method_check'
       AND conrelid = 'order_payments'::regclass
       AND pg_get_constraintdef(oid) LIKE '%stripe_link%'
  ) THEN
    ALTER TABLE order_payments DROP CONSTRAINT IF EXISTS order_payments_method_check;
    ALTER TABLE order_payments ADD CONSTRAINT order_payments_method_check
      CHECK (method IN ('square_link', 'square_invoice', 'square_terminal', 'stripe_link'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_order_payments_org_stripe_session
  ON order_payments (organization_id, stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
