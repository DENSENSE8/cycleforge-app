-- 2026-09-22a_staff_inbox_support_ticket.sql
--
-- Let the inbox anchor a SUPPORT TICKET, so a thrown ticket task raises a badge.
--
-- WHY
--   `POST /api/tasks` writes a directly-addressed `staff_inbox_items` row
--   (assign-inbox-item.ts). Its `entity_type` CHECK shipped with the seven
--   ops-event parents (2026-07-28d) and `support_ticket` was not one of them,
--   so `isInboxAnchorable()` had to refuse the arm and every ticket task came
--   back `notified: 'skipped_entity'` — the handoff landed and nobody was told.
--   That was named as the one gap between the Ticket band and the Task band
--   (docs/handoff/daily-task-desk-HANDOFF.md §4.1). This closes it.
--
-- WHY A DELETE TRIGGER IN THE SAME CHANGE
--   polymorphic-tables.md: a new discriminator value ships with the trigger
--   that cleans its children, in the same migration. Without it a deleted
--   ticket would leave inbox rows pointing at a row that no longer exists —
--   the exact breakage the other seven parents already have triggers for.
--   `support_tickets.id` is BIGSERIAL and `staff_inbox_items.entity_id` is
--   BIGINT, so the key widths already agree.
--
-- WHAT THIS DELIBERATELY DOES NOT TOUCH
--   `staff_subscriptions_entity_type_chk` and `notification_outbox`. Those are
--   the DERIVED path — `resolveRecipients()` fanning a domain event out to
--   whoever subscribed. A ticket task has an explicit recipient chosen by name,
--   so it bypasses the outbox by design (assign-inbox-item.ts header). Widening
--   the subscription CHECK would advertise a subscribe verb no event feeds.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_inbox_del_on_support_ticket_delete ON support_tickets;
--   DELETE FROM staff_inbox_items WHERE entity_type = 'support_ticket';
--   ALTER TABLE staff_inbox_items DROP CONSTRAINT IF EXISTS staff_inbox_items_entity_type_chk;
--   ALTER TABLE staff_inbox_items ADD CONSTRAINT staff_inbox_items_entity_type_chk
--     CHECK (entity_type IN ('receiving','receiving_line','serial_unit','order',
--                            'fba_shipment','repair','warranty_claim'));
--   (the DELETE is required first — the narrowed CHECK is validated on add.)
--
-- VERIFY:
--   \d staff_inbox_items                    -- CHECK carries support_ticket
--   SELECT tgname FROM pg_trigger WHERE tgrelid = 'support_tickets'::regclass;
--   npm run tenancy:audit

BEGIN;

-- Drop-and-re-add rather than a second CHECK: one constraint per column is the
-- shape every other widening in this schema uses, and two overlapping CHECKs
-- make the failure message ambiguous about which list refused the value.
ALTER TABLE staff_inbox_items
  DROP CONSTRAINT IF EXISTS staff_inbox_items_entity_type_chk;

ALTER TABLE staff_inbox_items
  ADD CONSTRAINT staff_inbox_items_entity_type_chk
  CHECK (entity_type IN (
    'receiving','receiving_line','serial_unit','order',
    'fba_shipment','repair','warranty_claim',
    'support_ticket'
  ));

-- Parent-delete integrity, reusing the function 2026-07-28d already installed
-- for the other seven parents (it reads the entity_type from TG_ARGV).
DROP TRIGGER IF EXISTS trg_inbox_del_on_support_ticket_delete ON support_tickets;
CREATE TRIGGER trg_inbox_del_on_support_ticket_delete
  AFTER DELETE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION fn_delete_staff_inbox_items_on_parent_delete('support_ticket');

COMMIT;
