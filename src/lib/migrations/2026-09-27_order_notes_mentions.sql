-- order_notes.mentioned_staff_ids — the staff an order note @mentions.
--
-- What/why: the note composer encodes a mention as `@[Name](staff:ID)` in
-- note_text (src/lib/orders/note-mentions.ts). createOrderNote parses those ids,
-- validates them against active staff in the org, persists them here and fans
-- out a `staff_inbox_items` row (reason 'mentioned', entity_type 'order').
--
-- Safety: additive column with a constant default — metadata-only on PG11+,
-- no rewrite; existing writers (createOrderNotesBulk) keep working unchanged.
-- Tenancy: order_notes is already tenant-enforced; a column inherits its RLS.
-- Rollback: ALTER TABLE order_notes DROP COLUMN IF EXISTS mentioned_staff_ids;

ALTER TABLE order_notes
  ADD COLUMN IF NOT EXISTS mentioned_staff_ids INT[] NOT NULL DEFAULT '{}';
