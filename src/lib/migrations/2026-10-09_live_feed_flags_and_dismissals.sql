-- ============================================================================
-- 2026-10-09_live_feed_flags_and_dismissals.sql
--
-- WHAT: two Live feed operator stores, one subject shape each:
--   * `live_feed_flags` — a staffer flags ANY card on the Live feed (an order,
--     a box no order owns, or a dock scan that never matched a box) with a
--     REASON ("Damaged", "Label problem", "Unknown package", …), an optional
--     note, who and when. Clearable (`cleared_at` / `cleared_by_staff_id`);
--     history is kept. Several reasons may be active on one card, one row each.
--   * `live_feed_dismissals` — "Remove from list" for the cards
--     `order_list_removals` cannot hold: an unlinked box (`shipment_id`) or an
--     unmatched dock scan (`scan_key`). Restorable (`restored_at`); history kept.
--   Reason ids are code-owned (src/lib/live-feed/flags.ts, dismissals.ts);
--   the tables only check their shape, so a new reason needs no migration.
--
-- SUBJECT: exactly one of `order_id` (orders.id), `shipment_id`
--   (shipping_tracking_numbers.id) or `scan_key` (UPPER(BTRIM(scan_ref)) of the
--   SHIP_CONFIRM scan, the board's own grouping key; `#<sal.id>` when the scan
--   carried no text). Dismissals never take `order_id` — an order leaves the
--   list through `order_list_removals`.
--
-- TENANT-FROM-BIRTH: `organization_id UUID NOT NULL`, no DEFAULT in the DDL;
--   enforce_tenant_isolation() installs the loud-fail GUC default, FORCE RLS
--   and the canonical policy. Safe at birth: no writers yet; the only writers
--   (src/lib/live-feed/flag-store.ts, dismissal-store.ts, pair.ts) run in
--   withTenantTransaction and stamp organization_id explicitly.
--
-- ORDER: the Live feed read (src/lib/live-feed/load.ts) reads both tables —
--   apply this before that code serves.
--
-- ROLLBACK: select relax_tenant_isolation('live_feed_flags');
--           select relax_tenant_isolation('live_feed_dismissals');
--           DROP TABLE IF EXISTS live_feed_flags, live_feed_dismissals;
--
-- VERIFY:
--   SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
--    WHERE relname IN ('live_feed_flags', 'live_feed_dismissals');
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS live_feed_flags (
  id                  BIGSERIAL PRIMARY KEY,
  organization_id     UUID NOT NULL,                   -- no DEFAULT; helper installs the loud-fail GUC default
  order_id            INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  shipment_id         BIGINT REFERENCES shipping_tracking_numbers(id) ON DELETE CASCADE,
  scan_key            TEXT,
  reason              TEXT NOT NULL,
  note                TEXT,
  flagged_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  flagged_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  cleared_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  cleared_at          TIMESTAMPTZ,
  CONSTRAINT live_feed_flags_one_subject CHECK (num_nonnulls(order_id, shipment_id, scan_key) = 1),
  CONSTRAINT live_feed_flags_scan_key_shape CHECK (scan_key IS NULL OR char_length(scan_key) BETWEEN 1 AND 200),
  CONSTRAINT live_feed_flags_reason_shape CHECK (reason ~ '^[a-z][a-z0-9_]{1,39}$'),
  CONSTRAINT live_feed_flags_note_shape CHECK (note IS NULL OR char_length(note) <= 500)
);

-- One ACTIVE row per subject and reason; also the board's per-card probe.
CREATE UNIQUE INDEX IF NOT EXISTS ux_live_feed_flags_active_order
  ON live_feed_flags (organization_id, order_id, reason)
  WHERE cleared_at IS NULL AND order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_live_feed_flags_active_shipment
  ON live_feed_flags (organization_id, shipment_id, reason)
  WHERE cleared_at IS NULL AND shipment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_live_feed_flags_active_scan
  ON live_feed_flags (organization_id, scan_key, reason)
  WHERE cleared_at IS NULL AND scan_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS live_feed_dismissals (
  id                   BIGSERIAL PRIMARY KEY,
  organization_id      UUID NOT NULL,                  -- no DEFAULT; helper installs the loud-fail GUC default
  shipment_id          BIGINT REFERENCES shipping_tracking_numbers(id) ON DELETE CASCADE,
  scan_key             TEXT,
  reason               TEXT NOT NULL,
  note                 TEXT,
  dismissed_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  dismissed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  restored_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  restored_at          TIMESTAMPTZ,
  CONSTRAINT live_feed_dismissals_one_subject CHECK (num_nonnulls(shipment_id, scan_key) = 1),
  CONSTRAINT live_feed_dismissals_scan_key_shape CHECK (scan_key IS NULL OR char_length(scan_key) BETWEEN 1 AND 200),
  CONSTRAINT live_feed_dismissals_reason_shape CHECK (reason ~ '^[a-z][a-z0-9_]{1,39}$'),
  CONSTRAINT live_feed_dismissals_note_shape CHECK (note IS NULL OR char_length(note) <= 500)
);

-- One ACTIVE dismissal per subject — also the board's NOT EXISTS probe.
CREATE UNIQUE INDEX IF NOT EXISTS ux_live_feed_dismissals_active_shipment
  ON live_feed_dismissals (organization_id, shipment_id)
  WHERE restored_at IS NULL AND shipment_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_live_feed_dismissals_active_scan
  ON live_feed_dismissals (organization_id, scan_key)
  WHERE restored_at IS NULL AND scan_key IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('live_feed_flags');
    PERFORM enforce_tenant_isolation('live_feed_dismissals');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — live_feed_flags / live_feed_dismissals left without FORCE RLS';
  END IF;
END $$;

COMMIT;
