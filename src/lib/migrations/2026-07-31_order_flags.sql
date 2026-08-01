-- ============================================================================
-- 2026-07-31_order_flags.sql
--
-- WHAT: `order_flags` — the operator-set triage tag that tints an order's row
--       in the outbound queue ("Priority", "Hold", "Damaged", …).
--
-- WHY:  a dispatch queue is scanned, not read. Isolating "the two that are
--       blocked" currently means re-reading seven columns per row, so the
--       operator's working set lives in their head and dies at shift change.
--       Row tint is the cheapest carrier for that state and every ops
--       spreadsheet in the category ships it (Airtable record coloring, Sheets
--       conditional fill).
--
-- ORG-WIDE, NOT PER-STAFF: the key is (organization_id, order_id) with no
--       staff column in it, so the next shift sees what this shift flagged.
--       That is the whole value; a private highlight cannot survive a handoff.
--       `set_by_staff_id` is therefore attribution, not identity — a shared
--       signal with no author is an anonymous claim nobody can question.
--
-- ONE FLAG PER ORDER: enforced by `ux_order_flags_org_order`, so the writer is
--       an idempotent upsert and the reader is a scalar join. A row cannot be
--       two colours at once, and a multi-tag model would need a second surface
--       to render it — that is a different feature, not a bigger version of
--       this one.
--
-- DISCRIMINATOR: `flag` carries a NAMED CHECK rather than shipping as free
--       text (`.claude/rules/polymorphic-tables.md`). The app-side vocabulary
--       is `src/lib/orders/order-row-flags.ts`; the two lists must be extended
--       in the same change. A CHECK (not a pg ENUM) because this set is
--       expected to grow with the floor's vocabulary, and `ALTER TYPE … ADD
--       VALUE` is the awkward one to get right.
--
-- READER SAFETY: an unknown value renders as UNFLAGGED in the UI
--       (`resolveOrderRowFlag` returns null), so a newer deploy writing a value
--       this deploy has not learned yet degrades to "no colour" rather than
--       painting a row some colour the operator never chose.
--
-- TENANT-FROM-BIRTH: `organization_id UUID NOT NULL` with no DEFAULT in the
--       DDL; `enforce_tenant_isolation()` installs the loud-fail GUC default,
--       FORCE RLS, and the canonical policy. This table ships ahead of its
--       writers, so enforcing at birth cannot loud-fail an existing code path
--       and forces the first writer to be correct by construction.
--
-- PARENT-DELETE INTEGRITY: single non-polymorphic parent, so a real FK
--       `ON DELETE CASCADE` — no trigger family needed.
--
-- ROLLBACK: select relax_tenant_isolation('order_flags');
--           DROP TABLE IF EXISTS order_flags;
--
-- VERIFY:
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'order_flags';
--   SELECT column_default FROM information_schema.columns
--    WHERE table_name = 'order_flags' AND column_name = 'organization_id';
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS order_flags (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,                       -- no DEFAULT; helper installs the loud-fail GUC default
  order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  flag             TEXT NOT NULL,
  set_by_staff_id  INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE order_flags ADD CONSTRAINT order_flags_flag_chk
    CHECK (flag IN ('priority', 'hold', 'damaged', 'awaiting_customer', 'ready'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One flag per order, org-led: this is both the uniqueness rule and the index
-- the upsert's ON CONFLICT target and the queue's scalar join both ride.
CREATE UNIQUE INDEX IF NOT EXISTS ux_order_flags_org_order
  ON order_flags (organization_id, order_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('order_flags');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — order_flags left without FORCE RLS';
  END IF;
END $$;

COMMIT;
