-- ============================================================================
-- 2026-08-02b_notification_outbox_payload.sql
--
-- Repair the ops_events spine: add the notification_outbox.payload column that
-- fn_enqueue_notification_outbox() has referenced since 2026-07-29.
--
-- THE OUTAGE. Every INSERT INTO ops_events has thrown since
-- 2026-07-29 05:36:55 — for every tenant, on every event type:
--
--   ERROR: column "payload" of relation "notification_outbox" does not exist
--   CONTEXT: PL/pgSQL function fn_enqueue_notification_outbox() line 6
--
-- Last successful ops_events row: 2026-07-29 05:34:59 — under two minutes
-- before 2026-07-28d_notification_outbox_and_staff_inbox_items.sql was recorded
-- applied (05:36:55). The failure window opens exactly at that apply.
--
-- HOW A GREEN MIGRATION BROKE IT. 2026-07-28d is internally consistent: it
-- declares notification_outbox WITH `payload JSONB`, and its trigger function
-- writes NEW.payload into it. But it pairs
--
--   CREATE TABLE IF NOT EXISTS notification_outbox (... payload JSONB ...)
--   CREATE OR REPLACE FUNCTION fn_enqueue_notification_outbox() ...
--
-- and by the time it was recorded applied the table ALREADY EXISTED without
-- `payload` (its oldest row is 2026-07-28 07:53:44, ~22h earlier, alongside the
-- 2026-07-28* siblings that applied at 07:51:58). So IF NOT EXISTS silently
-- skipped the table — and OR REPLACE installed the new trigger anyway. The two
-- guards have opposite failure modes: one yields to existing state, the other
-- overwrites it. Used together on a table and its trigger, they let the trigger
-- advance to a shape the table never reached. `IF NOT EXISTS` does not reconcile
-- columns, and nothing in the migration asked whether it had.
--
-- WHY IT WAS INVISIBLE FOR FOUR DAYS. Every caller treats an event-spine write
-- as fire-and-forget, exactly as designed: recordEntitySignal wraps the pair in
-- SAVEPOINT entity_signal_emit and rolls back to it, and emitEntitySignalSafe
-- downgrades the throw to a console.warn so "a signal failure must never fail
-- the domain action" holds. That contract did its job — scans, unboxes and
-- ticket links all kept succeeding — so the spine went silent without a single
-- user-visible error. The savepoint rollback also takes the entity_signals row
-- with it, which is why triage_outcome produced 0 rows even once its own gate
-- was satisfied (docs/todo/triage-complete-never-true-HANDOFF.md).
--
-- WHY THE COLUMN, NOT THE TRIGGER. The column is what the repo already believes
-- exists: 2026-07-28d declares it, src/lib/drizzle/schema.ts models it
-- (notificationOutbox.payload), and src/lib/notifications/fanout-worker.ts reads
-- the collapse PARENT id out of it so line-level churn folds onto one carton
-- row. Dropping `payload` from the trigger instead would compile and would
-- silently break that collapse — the outbox would enqueue, and the worker would
-- fan out one inbox item per line event. The trigger is right; the table is
-- behind it.
--
-- NO BACKFILL. Events lost between 2026-07-29 05:36:55 and this migration are
-- gone — ops_events is append-only and nothing buffered the rejected inserts.
-- The domain tables they mirror (receiving_carton, receiving_triage,
-- entity_signals' own callers) are intact, so the operational record survives;
-- only the spine's copy of that window is missing. Reconstructing it would mean
-- inventing occurred_at values no one observed, so this migration deliberately
-- does not.
--
-- SAFETY GATING: additive, nullable, no default. Existing rows read NULL, which
-- the worker already tolerates (payload is optional render/collapse context, not
-- a delivery key). notification_outbox carries organization_id with FORCE RLS
-- from 2026-07-28d, so an ALTER needs no enforce_tenant_isolation call.
--
-- ROLLBACK:
--   ALTER TABLE notification_outbox DROP COLUMN IF EXISTS payload;
--   -- NOTE: rolling back re-opens the outage. Drop the trigger too if you must:
--   --   DROP TRIGGER IF EXISTS trg_enqueue_notification_outbox_on_ops_events
--   --     ON ops_events;
--
-- VERIFY:
--   \d+ notification_outbox          -- payload jsonb NULL
--   -- the insert that has been failing since 2026-07-29 now succeeds:
--   INSERT INTO ops_events (organization_id, occurred_at, event_type,
--     entity_type, entity_id, client_event_id, payload)
--   VALUES ('<org>'::uuid, NOW(), 'signal_recorded', 'receiving', 1,
--     'verify-probe', '{}'::jsonb);
--   SELECT payload FROM notification_outbox WHERE client_event_id='verify-probe';
-- ============================================================================

BEGIN;

ALTER TABLE notification_outbox
  ADD COLUMN IF NOT EXISTS payload JSONB;

COMMENT ON COLUMN notification_outbox.payload IS
  'Copied from ops_events.payload by fn_enqueue_notification_outbox(). The fanout worker reads the collapse PARENT id out of it (e.g. payload.receivingId on a line event) so line churn folds onto one inbox row. Declared by 2026-07-28d but never reached this table, whose pre-existing shape made CREATE TABLE IF NOT EXISTS a no-op while CREATE OR REPLACE FUNCTION advanced the trigger — every ops_events INSERT threw from 2026-07-29 05:36:55 until 2026-08-02b.';

COMMIT;
