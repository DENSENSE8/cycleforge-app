-- 2026-09-17_order_flags_discrepancy.sql
-- Add the durable floor-triage fact used when a physical item, order, or
-- label does not agree. This is a named shared flag, never a free-text note.

BEGIN;

ALTER TABLE order_flags DROP CONSTRAINT IF EXISTS order_flags_flag_chk;
ALTER TABLE order_flags ADD CONSTRAINT order_flags_flag_chk
  CHECK (flag IN ('priority', 'hold', 'damaged', 'discrepancy', 'awaiting_customer', 'ready'));

COMMIT;
