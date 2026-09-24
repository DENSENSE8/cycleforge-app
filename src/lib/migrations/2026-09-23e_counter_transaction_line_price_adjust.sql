-- ============================================================================
-- 2026-09-23e: counter line price adjustments, comps and item notes
-- ============================================================================
-- The counter tablet gains Square's per-line money verbs: a Price adjustment,
-- a Keypad (custom) amount and a Comp, each authorized by a staff PIN holding
-- walk_in.adjust_price, plus an item note. A visit line used to store only the
-- price it was sold at, so "what did this cost before someone changed it, why,
-- and who said so" had no answer anywhere but a Square order.
--
--   original_unit_amount_cents  the catalog price before the change; NULL for a
--                               custom amount (no catalog price) and for every
--                               line whose price was never touched
--   price_adjust_kind           adjust | custom | comp; NULL = catalog price
--   price_adjust_reason         the reason the staffer picked on the tablet
--   price_adjusted_by_staff_id  whose PIN authorized it
--   note                        the item note (Square OrderLineItem.note, <= 2000)
--
-- Written by submitCounterTransaction from claims the kiosk route has already
-- verified (lib/kiosk/price-approval). The per-line audit row
-- (counter_session.line.price_override / .comp) carries the same facts.
--
-- Safety: additive, nullable columns; no backfill (every existing line was
-- sold at its catalog price, which NULL states). The table is already
-- tenant-scoped (organization_id NOT NULL); nothing about scoping changes.
--
-- Rollback:
--   ALTER TABLE counter_transaction_lines
--     DROP CONSTRAINT IF EXISTS counter_transaction_lines_price_adjust_kind_chk,
--     DROP COLUMN IF EXISTS original_unit_amount_cents,
--     DROP COLUMN IF EXISTS price_adjust_kind,
--     DROP COLUMN IF EXISTS price_adjust_reason,
--     DROP COLUMN IF EXISTS price_adjusted_by_staff_id,
--     DROP COLUMN IF EXISTS note;
--
-- Verify: \d counter_transaction_lines — five new nullable columns + the kind CHECK.
-- ============================================================================

ALTER TABLE counter_transaction_lines
  ADD COLUMN IF NOT EXISTS original_unit_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS price_adjust_kind          TEXT,
  ADD COLUMN IF NOT EXISTS price_adjust_reason        TEXT,
  ADD COLUMN IF NOT EXISTS price_adjusted_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS note                       TEXT;

DO $$
BEGIN
  ALTER TABLE counter_transaction_lines
    ADD CONSTRAINT counter_transaction_lines_price_adjust_kind_chk
    CHECK (price_adjust_kind IS NULL OR price_adjust_kind IN ('adjust', 'custom', 'comp'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN counter_transaction_lines.original_unit_amount_cents IS
  'Catalog unit price before a PIN-authorized adjustment or comp; NULL when untouched or a custom amount.';
COMMENT ON COLUMN counter_transaction_lines.price_adjust_kind IS
  'adjust | custom | comp — NULL means the line sold at its catalog price.';
COMMENT ON COLUMN counter_transaction_lines.note IS
  'Item note typed on the counter tablet; prints on the receipt and rides the staged Square order.';
