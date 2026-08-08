-- ============================================================================
-- 2026-08-08b_work_assignment_task_columns.sql
--
-- WHAT
--   Turns work_assignments into a row that can carry a *throwable task*:
--     1. entity_id  INTEGER → BIGINT      (support_tickets.id is BIGSERIAL)
--     2. + assignee_staff_id              (canonical single assignee) + backfill
--     3. + fn_sync_work_assignment_assignee()  (expand-phase mirror trigger)
--     4. + idx_work_assignments_assignee  (org-led "my tasks" read path)
--     5. ~ ux_work_assignments_active_entity   (org-led; FOLLOW_UP exempt)
--     6. ~ fn_cancel_work_assignments_on_entity_delete()  (now cancels OPEN too)
--     7. + trg_cancel_wa_on_support_ticket_delete
--
--   Depends on 2026-08-08a having COMMITTED the 'FOLLOW_UP' / 'SUPPORT_TICKET'
--   labels — steps 3 and 5 both reference 'FOLLOW_UP', and PostgreSQL refuses a
--   new enum label used in the transaction that added it. The runner wraps each
--   file in BEGIN/COMMIT, so "a separate file" is what "a separate transaction"
--   means here.
--
-- WHY (2) — one assignee, restoring the name the table was born with
--   work_assignments shipped with a single `assignee_staff_id`, and
--   2026-03-05 RENAMED it to `assigned_tech_id` and added `assigned_packer_id`
--   beside it. That split is a station-role artifact: it encodes "the tester"
--   and "the packer" as separate slots on a row that is otherwise a generic
--   assignment. A thrown task has one owner and belongs to neither bench, so it
--   has nowhere to sit in that shape.
--
--   This is the EXPAND step of expand → code → contract
--   (.claude/rules/backend-patterns.md). The two station slots are UNTOUCHED and
--   still authoritative for station rows; the new column is derived from them by
--   the trigger below. Nothing is dropped here — a later contract migration
--   removes the slots once every reader has moved, and never before.
--
-- WHY (3) — a trigger, not a code change in every writer
--   `saveWorkOrder`, the station paths and /api/assignments all write the slot
--   columns today. A derived column maintained in application code would be
--   correct only in the writers someone remembered to update; maintained in the
--   database it is correct in all of them, including the ones this lane has not
--   read. Authority is explicit and one-way per row:
--     • station rows (any work_type <> 'FOLLOW_UP') — the slots win, INCLUDING
--       when they go NULL, so an unassign really unassigns rather than leaving
--       a stale owner behind.
--     • FOLLOW_UP rows — assignee_staff_id is authoritative; the slots stay NULL.
--
-- WHY (5) — the uniqueness rule is wrong for ad-hoc work
--   ux_work_assignments_active_entity allows ONE active row per
--   (entity_type, entity_id, work_type). That is right for a bench — an order is
--   tested once at a time — and wrong for a thrown task: two people must be able
--   to be handed the same order for different reasons. FOLLOW_UP is therefore
--   exempt from the constraint rather than squeezed into it.
--
--   The index is also re-led with organization_id, per polymorphic-tables.md
--   ("every unique index leads with organization_id"). This LOOSENS the
--   constraint, so no existing row can violate it, and organization_id is
--   NOT NULL on this table — there is no NULL-distinctness hole. It changes
--   nothing in practice today (entity ids are globally-unique serials); it
--   removes a latent cross-tenant collision the law exists to prevent.
--
-- WHY (6) — an OPEN assignment on a deleted entity leaks, and my feature hits it
--   fn_cancel_work_assignments_on_entity_delete() cancels only 'ASSIGNED' and
--   'IN_PROGRESS'. 'OPEN' was added to assignment_status_enum LATER
--   (2026-03-10) and the function was never widened, so an OPEN row whose parent
--   is deleted stays OPEN forever and keeps appearing in queues. Fixing it is
--   not opportunistic scope: a thrown task is created OPEN, so shipping the new
--   SUPPORT_TICKET trigger onto the unfixed function would ship a known leak.
--   The widening is strictly more correct for the five existing entity types too.
--
-- TENANCY — verified against the live DB, not inferred
--   work_assignments: organization_id UUID NOT NULL, GUC default installed,
--   rowsecurity = true, FORCE rowsecurity = true, and 0 of 7844 rows carry a
--   NULL org. It is fully tenant-enforced. No migration file contains the
--   literal enforce_tenant_isolation('work_assignments') because it was
--   enforced by one of the bulk tenancy sweeps (a DO-block loop over a table
--   list) — grepping for the literal gives a FALSE NEGATIVE here. Check
--   pg_class.relforcerowsecurity, not the migration text.
--
--   support_tickets is likewise org-scoped + FORCE RLS, so the new
--   SUPPORT_TICKET arm anchors to a tenant-enforced parent.
--
--   The backfill below is an UPDATE, never an INSERT, so the loud-fail
--   organization_id default is not evaluated and no row can acquire a NULL org
--   from this migration.
--
-- KNOWN, NOT TOUCHED HERE (stated so it is not mistaken for an omission)
--   • ops_events has organization_id NOT NULL but rowsecurity = false — the one
--     table in this feature's blast radius without RLS. It is the append-only
--     event spine written by triggers; enforcing it is its own decision and is
--     not a side effect of this migration.
--   • The baseline's trg_cancel_wa_on_receiving_delete was created ON receiving
--     — the table that has since become receiving_carton. That trigger is very
--     likely orphaned, which would mean RECEIVING assignments already leak on
--     carton delete. Out of scope here; verify separately before relying on it.
--
-- SAFETY / GATING
--   Additive except (5) and (6), both of which only ever loosen or cancel MORE.
--   Step (1) rewrites the table (ACCESS EXCLUSIVE) — work_assignments is a small
--   ops queue, so this is seconds, but it is a lock: apply it off-peak.
--   No application code reads assignee_staff_id yet; the trigger keeps it true
--   from the moment it exists so the readers that land next have real data.
--
-- ROLLBACK
--   BEGIN;
--     DROP TRIGGER IF EXISTS trg_cancel_wa_on_support_ticket_delete ON support_tickets;
--     DROP TRIGGER IF EXISTS trg_sync_work_assignment_assignee ON work_assignments;
--     DROP FUNCTION IF EXISTS fn_sync_work_assignment_assignee();
--     DROP INDEX IF EXISTS idx_work_assignments_assignee;
--     ALTER TABLE work_assignments DROP COLUMN IF EXISTS assignee_staff_id;
--     DROP INDEX IF EXISTS ux_work_assignments_active_entity;
--     CREATE UNIQUE INDEX ux_work_assignments_active_entity
--       ON work_assignments (entity_type, entity_id, work_type)
--       WHERE status IN ('OPEN','ASSIGNED','IN_PROGRESS');
--   COMMIT;
--   (entity_id stays BIGINT — narrowing back to INTEGER is a second rewrite for
--    no benefit, and BIGINT is the house default for a polymorphic id anyway.
--    The enum labels from 2026-08-08a are not reversible at all; see that file.)
--
-- VERIFY
--   \d work_assignments   -- entity_id bigint, assignee_staff_id integer
--   SELECT count(*) FROM work_assignments
--     WHERE assignee_staff_id IS DISTINCT FROM COALESCE(assigned_tech_id, assigned_packer_id)
--       AND work_type <> 'FOLLOW_UP';        -- expect 0
--   SELECT indexdef FROM pg_indexes WHERE indexname = 'ux_work_assignments_active_entity';
--
-- Law: .claude/rules/polymorphic-tables.md · backend-patterns.md (expand→code→contract)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. entity_id → BIGINT
--    support_tickets.id is BIGSERIAL; polymorphic-tables.md wants BIGINT by
--    default so the column never needs widening when a future parent isn't
--    INTEGER-keyed. Guarded so a re-run is a no-op instead of a second rewrite.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_assignments'
      AND column_name = 'entity_id'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE work_assignments ALTER COLUMN entity_id TYPE BIGINT;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Canonical single assignee + backfill
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE work_assignments
  ADD COLUMN IF NOT EXISTS assignee_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL;

-- Backfill only where it is still unset, so re-running cannot clobber a value
-- the trigger or a new writer has since established.
UPDATE work_assignments
   SET assignee_staff_id = COALESCE(assigned_tech_id, assigned_packer_id)
 WHERE assignee_staff_id IS NULL
   AND COALESCE(assigned_tech_id, assigned_packer_id) IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Keep it true from both directions (expand phase)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_sync_work_assignment_assignee()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.work_type = 'FOLLOW_UP' THEN
    -- A thrown task owns its assignee outright; the station slots stay NULL.
    RETURN NEW;
  END IF;

  -- Station rows mirror their slots exactly — including NULL, so that clearing
  -- an assignment really clears it rather than stranding the previous owner.
  NEW.assignee_staff_id := COALESCE(NEW.assigned_tech_id, NEW.assigned_packer_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_work_assignment_assignee ON work_assignments;
CREATE TRIGGER trg_sync_work_assignment_assignee
  BEFORE INSERT OR UPDATE ON work_assignments
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_work_assignment_assignee();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. "My tasks" read path — org-led, and partial so it stays small
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_work_assignments_assignee
  ON work_assignments (organization_id, assignee_staff_id, status, priority, assigned_at)
  WHERE assignee_staff_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. One active row per entity/work_type — org-led, and not for ad-hoc tasks
-- ─────────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS ux_work_assignments_active_entity;
CREATE UNIQUE INDEX IF NOT EXISTS ux_work_assignments_active_entity
  ON work_assignments (organization_id, entity_type, entity_id, work_type)
  WHERE status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')
    AND work_type <> 'FOLLOW_UP';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Orphan cancel now includes OPEN (see header — this is a real leak fix)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_cancel_work_assignments_on_entity_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE work_assignments
  SET
    status     = 'CANCELED',
    updated_at = NOW()
  WHERE entity_type = TG_ARGV[0]::work_entity_type_enum
    AND entity_id   = OLD.id
    AND status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS');
  RETURN OLD;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. The SUPPORT_TICKET arm of the delete-trigger family
--    polymorphic-tables.md: a new discriminator value ships its trigger in the
--    same change, or it silently has no delete-time behaviour — the gap that
--    left REPAIR / FBA_SHIPMENT / SKU_STOCK unguarded for months.
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_cancel_wa_on_support_ticket_delete ON support_tickets;
CREATE TRIGGER trg_cancel_wa_on_support_ticket_delete
  BEFORE DELETE ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION fn_cancel_work_assignments_on_entity_delete('SUPPORT_TICKET');
