-- ============================================================================
-- 2026-08-30c_order_release_gates.sql
--
-- CAGED → RELEASED for the To-ship desk.
-- Plan: docs/todo/non-scan-desk-chrome-caged-release-PLAN.md §4.
--
-- WHAT. An order typed at the desk exists before the facts that make it
-- workable exist. Today that half-built row is simply INVISIBLE: the To-ship
-- queue is `fulfillmentScope=true`, which requires `o.shipment_id IS NOT NULL`
-- and a non-blank tracking number, so an order without tracking is dropped by
-- the feed with no name, no count and no way to find it again. These columns
-- give that state a name (CAGED), a gate that opens it (RELEASED), and an
-- audit trail for who opened it.
--
--   release_state      NULL | 'caged' | 'released'
--   released_at        when the gates last passed and staff released
--   released_by        staff.id of who released
--   docs_not_required  G2 exemption — "this item number needs no documents"
--   release_gates      snapshot of the G1/G2/G3 evaluation at release time
--
-- NULL IS "RELEASED". This is the load-bearing choice. `orders` is the hottest
-- table in the app and every existing row predates the cage; if NULL meant
-- caged, applying this migration would empty the To-ship queue for every org
-- on the next deploy. So NULL and 'released' are the same working set, and
-- only a row explicitly stamped 'caged' is held back. Nothing is backfilled.
--
-- SAFETY. Purely additive; every column is nullable or defaulted, and no
-- existing reader selects them. Applying this ahead of the code changes zero
-- behaviour — which is the point of expand → code → contract (AGENTS.md). The
-- reverse (a reader shipped before the column) would 42703 the queue feed.
--
-- TENANCY. `orders` is already tenant-owned (organization_id NOT NULL, RLS
-- enforced by 2026-05-23_org_id_on_business_tables.sql). Adding columns changes
-- no key, index or policy, so no enforce_tenant_isolation() call belongs here.
-- The partial index below leads with organization_id for the same reason every
-- other per-org index on this table does.
--
-- ROLLBACK.
--   DROP INDEX IF EXISTS idx_orders_caged;
--   ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_release_state_chk;
--   ALTER TABLE orders
--     DROP COLUMN IF EXISTS release_state,
--     DROP COLUMN IF EXISTS released_at,
--     DROP COLUMN IF EXISTS released_by,
--     DROP COLUMN IF EXISTS docs_not_required,
--     DROP COLUMN IF EXISTS release_gates;
-- (Drops the cage entirely; caged rows revert to today's behaviour — present in
-- the table, absent from the queue.)
--
-- VERIFY.
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_name = 'orders' AND column_name IN
--      ('release_state','released_at','released_by','docs_not_required','release_gates');
--   SELECT release_state, COUNT(*) FROM orders GROUP BY 1;   -- expect all NULL
-- ============================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS release_state     text,
  ADD COLUMN IF NOT EXISTS released_at       timestamptz,
  ADD COLUMN IF NOT EXISTS released_by       bigint,
  ADD COLUMN IF NOT EXISTS docs_not_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS release_gates     jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_release_state_chk'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_release_state_chk
      CHECK (release_state IS NULL OR release_state IN ('caged', 'released'));
  END IF;
END $$;

-- The caged set is a SMALL minority of a very large table and is read as its
-- own list (the Caged facet on the To-ship desk), so a partial index on just
-- those rows is a few pages rather than a second full index on `orders`.
CREATE INDEX IF NOT EXISTS idx_orders_caged
  ON orders (organization_id, id DESC)
  WHERE release_state = 'caged';

COMMENT ON COLUMN orders.release_state IS
  'Caged→released gate state. NULL or ''released'' = in the live To-ship working set; ''caged'' = held out of it until evaluateReleaseGates() passes (src/lib/orders/release-gates.ts). NULL is deliberately NOT ''caged'': every row predating 2026-08-30c is already working stock and must not vanish from the queue.';

COMMENT ON COLUMN orders.released_at IS
  'When this order was released out of the cage (NULL while caged, and for every row that was never caged).';

COMMENT ON COLUMN orders.released_by IS
  'staff.id of who released this order. Unenforced FK, matching the sibling staff-id columns on this table.';

COMMENT ON COLUMN orders.docs_not_required IS
  'G2 exemption: staff asserted this item number needs no manuals/paperwork. Satisfies the documents gate in place of a document_entity_links row; never inferred, only set by an operator on the triage form.';

COMMENT ON COLUMN orders.release_gates IS
  'Snapshot of the G1/G2/G3 evaluation recorded AT release (shape: EvaluatedReleaseGates in src/lib/orders/release-gates.ts). Audit only — never the live gate answer, which is always recomputed from current facts.';
