-- ============================================================================
-- 2026-10-03_entity_threads_task_document_anchor.sql
--
-- Comments on a task DOCUMENT (the "Docs" tab on the task record and the
-- phone's document view). Principle P6 (local task-principles): comments
-- anchor to the document, attributed — so a document gets its own
-- conversation in the existing entity_threads / thread_messages pair instead
-- of a second comments table.
--
--   • entity_threads_entity_type_chk gains 'TASK_DOCUMENT'
--     (entity_id = work_assignment_documents.id). One thread per document
--     through the existing natural key ux_entity_threads_natural
--     (organization_id, entity_type, entity_id).
--   • Each comment is one thread_messages row; its `meta` jsonb carries the
--     quoted passage: {docId, quote, headingSlug} (+ resolvedAt/resolvedBy
--     when resolved). No column change — meta already exists (2026-07-14).
--   • Parent-delete integrity: the existing dispatch-on-TG_ARGV[0] function
--     fn_delete_entity_threads_on_parent_delete() gets one more trigger, on
--     work_assignment_documents. Deleting a task cascades its documents
--     through their FK, which fires this row trigger too, so a task delete
--     also drops its document threads (messages cascade via thread_id FK).
--
-- Deliberately NOT changed:
--   • SURFACE_ENTITY_TYPES (src/lib/surfaces/registry.ts) and the CHECKs it
--     pins (feed_memberships, staff_rail_exclusions, entity_signals): a task
--     document is not a feed/signal anchor. The thread-only anchor vocab lives
--     in src/lib/threads/types.ts (THREAD_ANCHOR_EXTRA).
--   • ops_events_entity_type_chk: document-comment messages emit their
--     THREAD_MESSAGE spine row with entity_type 'other' (already allowed).
--   • thread_links_entity_type_chk / ticket_links: untouched.
--
-- Safety gating: widening a CHECK never invalidates an existing row; the new
-- trigger only fires on DELETE of work_assignment_documents. The only writer
-- of TASK_DOCUMENT threads (src/lib/tasks/task-document-comments*.ts via
-- /api/tasks/[id]/documents/comments) runs under withTenantTransaction and
-- stamps organization_id from the auth context. Both tables are already
-- FORCE-RLS (2026-07-14); nothing to enforce here.
--
-- ROLLBACK (only once no TASK_DOCUMENT thread remains):
--   DELETE FROM entity_threads WHERE entity_type = 'TASK_DOCUMENT';
--   DROP TRIGGER IF EXISTS trg_delete_entity_threads_on_task_document_delete
--     ON work_assignment_documents;
--   ALTER TABLE entity_threads DROP CONSTRAINT entity_threads_entity_type_chk;
--   ALTER TABLE entity_threads ADD CONSTRAINT entity_threads_entity_type_chk
--     CHECK (entity_type IN ('RECEIVING','RECEIVING_LINE','SERIAL_UNIT','ORDER',
--                            'FBA_SHIPMENT','REPAIR','WARRANTY_CLAIM'));
--
-- VERIFY:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'entity_threads_entity_type_chk';
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'work_assignment_documents'::regclass AND NOT tgisinternal;
-- ============================================================================

BEGIN;

-- Redefine (drop + add) — idempotent: re-running lands the same definition.
ALTER TABLE entity_threads DROP CONSTRAINT IF EXISTS entity_threads_entity_type_chk;
ALTER TABLE entity_threads ADD CONSTRAINT entity_threads_entity_type_chk
  CHECK (entity_type IN (
    'RECEIVING','RECEIVING_LINE','SERIAL_UNIT','ORDER',
    'FBA_SHIPMENT','REPAIR','WARRANTY_CLAIM','TASK_DOCUMENT'
  ));

DROP TRIGGER IF EXISTS trg_delete_entity_threads_on_task_document_delete ON work_assignment_documents;
CREATE TRIGGER trg_delete_entity_threads_on_task_document_delete
AFTER DELETE ON work_assignment_documents
FOR EACH ROW EXECUTE FUNCTION fn_delete_entity_threads_on_parent_delete('TASK_DOCUMENT');

COMMENT ON TABLE entity_threads IS
  'Ticket-optional conversation anchored to a canonical entity (docs/todo/entity-threads-conversation-plan.md). entity_type CHECK = SURFACE_ENTITY_TYPES (src/lib/surfaces/registry.ts) + thread-only anchors (THREAD_ANCHOR_EXTRA in src/lib/threads/types.ts: TASK_DOCUMENT = work_assignment_documents.id, 2026-10-03); one thread per (org, entity_type, entity_id) in v1; support_ticket_id = later Zendesk/internal attach seam (ticket_links untouched). Tenant-scoped from birth.';

COMMIT;
