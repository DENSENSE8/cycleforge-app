-- ============================================================================
-- 2026-07-28_order_notes.sql
--
-- WHAT: `order_notes` — internal operational annotations on an order
--       ("box arrived damaged", "packer forgot the cable").
--
-- WHY:  the shared `entity_notes` table keys on `entity_id UUID`, but
--       `orders.id` is `SERIAL` (INTEGER). A polymorphic table cannot span two
--       primary-key types, so orders were silently excluded from the notes
--       waist. The alternatives were both worse: migrating `orders.id` to UUID
--       touches the entire operational spine, and casting INTEGER→TEXT to fit
--       the UUID column destroys index usability. A purpose-built child table
--       sidesteps the mismatch without either cost.
--       Decision D10, docs/todo/order-details-page-EXECUTION-PLAN.md.
--
-- SCOPE BOUNDARY (read before adding a writer): this is the THIRD note home in
--       the codebase (`entity_notes`, Entity Threads, now `order_notes`), and
--       `ThreadPanel entityType="ORDER"` is already mounted on the order record.
--       Two homes are only legitimate while they do genuinely different jobs:
--         • `order_notes`  = INTERNAL OPS annotations, staff-authored, never
--                            customer-visible.
--         • Entity Threads = the customer / support CONVERSATION.
--       If that line blurs in practice, collapse onto threads and drop this
--       table — do not let the same note become writable in two places.
--
-- TENANT-FROM-BIRTH: `organization_id UUID NOT NULL` with no DEFAULT in the DDL;
--       `enforce_tenant_isolation()` installs the loud-fail GUC default, FORCE
--       RLS, and the canonical policy.
--
-- SAFETY GATE: the skill's rule is "do not enforce a table whose writers don't
--       yet stamp org." This table has NO writers at all — it ships ahead of its
--       API — so enforcing at birth cannot loud-fail an existing code path, and
--       it forces the first writer to be correct by construction. That is
--       strictly safer than retrofitting FORCE onto a table that already has
--       unscoped inserts.
--
-- ROLLBACK: select relax_tenant_isolation('order_notes');
--           DROP TABLE IF EXISTS order_notes;
--
-- VERIFY:
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'order_notes';
--   SELECT column_default FROM information_schema.columns
--    WHERE table_name = 'order_notes' AND column_name = 'organization_id';
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS order_notes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL,                       -- no DEFAULT; helper installs the loud-fail GUC default
  order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  note_text        TEXT NOT NULL,
  author_staff_id  INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Org-led, per the polymorphic/tenant contract: the read path is always
-- "this org's notes for this order, newest first".
CREATE INDEX IF NOT EXISTS idx_order_notes_org_order
  ON order_notes (organization_id, order_id, created_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('order_notes');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — order_notes left without FORCE RLS';
  END IF;
END $$;

COMMIT;
