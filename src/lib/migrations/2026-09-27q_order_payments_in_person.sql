-- order_payments + in-person tender — a counter payment (walk-in / pickup) and
-- the card FACTS Square reports for a paid invoice.
--
-- An `in_person` row is recorded already paid: the customer paid at the
-- counter (card on the reader, cash, or other — check, Zelle). CycleForge keeps
-- only the tender facts; the card itself never touches it.
--
-- PCI: no column here may hold a full card number (PAN), CVV/CVC, expiry,
-- track data or PIN. `card_last4` is exactly four digits, `card_brand` is a
-- lowercase slug (no digits at all), and `payment_reference` refuses any run of
-- 13+ digits once spaces / dashes / dots are removed — the same rule the
-- server validates with (src/lib/order-payments/tender.ts `looksLikePan`), so a
-- PAN cannot land even through a writer that skips the app check.
--
-- Changes (additive, roll-forward):
--   • order_payments_method_check widens to include 'in_person'.
--   • tender            — 'card' | 'cash' | 'other' (how it was paid).
--   • card_brand        — 'visa', 'mastercard', 'amex', … (slug).
--   • card_last4        — exactly 4 digits.
--   • card_entry_method — 'tap' | 'chip' | 'swipe' | 'keyed' | 'on_file'.
--   • payment_reference — reader authorization code / check no. / Zelle conf.
--   • receipt_url       — Square's hosted receipt for a read-back payment.
--   • order_payments_in_person_tender_check — an in_person row names its tender.
--   (Who took it = the existing created_by; when = paid_at.)
--
-- Safety gating: order_payments is already tenant-enforced
-- (2026-09-27_order_payments.sql); its writers (src/lib/order-payments/service.ts,
-- src/lib/orders/square-invoice-import.ts) stamp organization_id and run every
-- statement through tenantQuery. Every new column is nullable, no row is
-- rewritten, and no existing row is an in_person row, so the new CHECKs
-- validate trivially. Must apply AFTER 2026-09-27b_order_payments_stripe.sql
-- (the `q` suffix).
--
-- ROLLBACK (only once no in_person rows exist):
--   ALTER TABLE order_payments DROP CONSTRAINT IF EXISTS order_payments_in_person_tender_check;
--   ALTER TABLE order_payments DROP COLUMN IF EXISTS receipt_url,
--                              DROP COLUMN IF EXISTS payment_reference,
--                              DROP COLUMN IF EXISTS card_entry_method,
--                              DROP COLUMN IF EXISTS card_last4,
--                              DROP COLUMN IF EXISTS card_brand,
--                              DROP COLUMN IF EXISTS tender;
--   ALTER TABLE order_payments DROP CONSTRAINT IF EXISTS order_payments_method_check;
--   ALTER TABLE order_payments ADD CONSTRAINT order_payments_method_check
--     CHECK (method IN ('square_link', 'square_invoice', 'square_terminal', 'stripe_link'));
--
-- Verify:
--   \d order_payments
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'order_payments'::regclass AND contype = 'c';

ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS tender TEXT NULL
  CONSTRAINT order_payments_tender_check CHECK (tender IN ('card', 'cash', 'other'));
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS card_brand TEXT NULL
  CONSTRAINT order_payments_card_brand_check CHECK (card_brand ~ '^[a-z_]{2,24}$');
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS card_last4 TEXT NULL
  CONSTRAINT order_payments_card_last4_check CHECK (card_last4 ~ '^[0-9]{4}$');
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS card_entry_method TEXT NULL
  CONSTRAINT order_payments_card_entry_method_check
  CHECK (card_entry_method IN ('tap', 'chip', 'swipe', 'keyed', 'on_file'));
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS payment_reference TEXT NULL
  CONSTRAINT order_payments_payment_reference_check
  CHECK (char_length(payment_reference) <= 120
         AND regexp_replace(payment_reference, '[[:space:].-]', '', 'g') !~ '[0-9]{13}');
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS receipt_url TEXT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'order_payments_method_check'
       AND conrelid = 'order_payments'::regclass
       AND pg_get_constraintdef(oid) LIKE '%in_person%'
  ) THEN
    ALTER TABLE order_payments DROP CONSTRAINT IF EXISTS order_payments_method_check;
    ALTER TABLE order_payments ADD CONSTRAINT order_payments_method_check
      CHECK (method IN ('square_link', 'square_invoice', 'square_terminal', 'stripe_link', 'in_person'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'order_payments_in_person_tender_check'
       AND conrelid = 'order_payments'::regclass
  ) THEN
    ALTER TABLE order_payments ADD CONSTRAINT order_payments_in_person_tender_check
      CHECK (method <> 'in_person' OR tender IS NOT NULL);
  END IF;
END $$;
