-- ============================================================================
-- 2026-09-13b: persist counter visit retail lines
-- ============================================================================
-- Def of done this closes: "select product, add to cart, print receipt". The
-- direct kiosk-intake path (POST /api/kiosk/intake → submitCounterTransaction)
-- wrote the counter_transactions HEADER and staged the provider order, but the
-- retail lines themselves were persisted NOWHERE — they lived only inside the
-- staged Square order. loadCounterVisit then read lines from the counter
-- SESSION (which the direct kiosk path deliberately does not create), so every
-- kiosk walk-in receipt printed the money with "No items on this visit."
--
-- This table is the receipt's itemized truth for session-less visits:
--   RETAIL   lines (positive cents) — the walk-in sale
--   BUYBACK  lines (negative cents) — trade-in credit on the same cart
-- Repairs are deliberately NOT written here: repair_service rows are the
-- repair record (findDevices reads them, the receipt prints them as devices),
-- and duplicating them would double-print.
--
-- Idempotency: UNIQUE (counter_transaction_id, line_uuid) + the route's
-- Idempotency-Key contract means a retried submit cannot double-write lines.
-- ============================================================================

CREATE TABLE IF NOT EXISTS counter_transaction_lines (
  id                     BIGSERIAL PRIMARY KEY,
  organization_id        UUID NOT NULL,
  counter_transaction_id BIGINT NOT NULL REFERENCES counter_transactions(id) ON DELETE CASCADE,
  -- Client-minted identity (same uuid the cart line carried).
  line_uuid              TEXT NOT NULL,
  -- RETAIL | BUYBACK. Repairs never ride this table (see header).
  line_type              TEXT NOT NULL,
  title                  TEXT NOT NULL,
  sku                    TEXT,
  variation_id           TEXT,
  quantity               INTEGER NOT NULL DEFAULT 1,
  -- Minor units; negative for buyback credit — never clamped.
  unit_amount_cents      INTEGER NOT NULL,
  sort_index             INTEGER NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (counter_transaction_id, line_uuid)
);

CREATE INDEX IF NOT EXISTS idx_counter_transaction_lines_org_tx
  ON counter_transaction_lines (organization_id, counter_transaction_id);

COMMENT ON TABLE counter_transaction_lines IS
  'Itemized retail/buyback lines for a counter visit, written at submit. The receipt truth for session-less (direct kiosk) visits; session visits keep reading counter_session_lines.';
