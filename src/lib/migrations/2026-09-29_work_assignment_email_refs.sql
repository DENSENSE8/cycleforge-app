-- 2026-09-29_work_assignment_email_refs.sql
--
-- EMAIL REFERENCES on a thrown task (owner ruling R3, 2026-09-29): which
-- customer email a task — and its follow-ups — came from. A REFERENCE, never
-- the email itself: no body, no thread, no attachments. One row names
--
--   customer_email    — the customer's address (lower-cased by the writer)
--   mailbox           — the inbound channel it arrived on: a full address
--                       (`sales@usavsolutions.com`) or a bare local part
--                       (`sales`) when the org has no letterhead domain
--   order_number      — the order it is about, when the customer has one
--   reference_number  — OR, when there is no order yet, a reference number
--   subject           — the subject line, optional
--
-- Not a `work_assignment_links` kind: a link is ONE label naming ONE record
-- (order / ticket / tracking / repair) under a single-column natural key; an
-- email reference is four operator-edited facts about an inbound message and
-- is updated in place (full CRUD), which links never are.
--
-- SAFETY: new table, tenant-from-birth. The only writer
-- (src/lib/tasks/task-email-refs-db.ts via /api/tasks/[id]/email-refs) runs
-- through the GUC wrappers in @/lib/tenancy/db and stamps organization_id from
-- the auth context, so the loud-fail org default and FORCE RLS are safe from
-- day one. Until this file is applied the route answers 503 `not_set_up` and
-- the UI shows "not set up yet" (the reader catches 42P01 on this table only).
--
-- ROLLBACK:
--   SELECT relax_tenant_isolation('work_assignment_email_refs');
--   DROP TABLE IF EXISTS work_assignment_email_refs;
--
-- VERIFY:
--   \d+ work_assignment_email_refs
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'work_assignment_email_refs'::regclass;
--   npm run tenancy:coverage
--   Then add a reference from a task's Links tab and GET /api/tasks/<id>/email-refs.

BEGIN;

CREATE TABLE IF NOT EXISTS work_assignment_email_refs (
  id                  BIGSERIAL PRIMARY KEY,
  organization_id     UUID NOT NULL,
  assignment_id       INTEGER NOT NULL REFERENCES work_assignments(id) ON DELETE CASCADE,
  customer_email      TEXT NOT NULL,
  mailbox             TEXT NOT NULL,
  order_number        TEXT,
  reference_number    TEXT,
  subject             TEXT,
  created_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT work_assignment_email_refs_customer_email_len
    CHECK (char_length(customer_email) BETWEEN 3 AND 320),
  CONSTRAINT work_assignment_email_refs_mailbox_len
    CHECK (char_length(mailbox) BETWEEN 1 AND 320),
  CONSTRAINT work_assignment_email_refs_order_number_len
    CHECK (order_number IS NULL OR char_length(order_number) BETWEEN 1 AND 100),
  CONSTRAINT work_assignment_email_refs_reference_number_len
    CHECK (reference_number IS NULL OR char_length(reference_number) BETWEEN 1 AND 100),
  CONSTRAINT work_assignment_email_refs_subject_len
    CHECK (subject IS NULL OR char_length(subject) BETWEEN 1 AND 300),
  -- An order number OR a reference number (no order yet), never both.
  CONSTRAINT work_assignment_email_refs_one_number
    CHECK (order_number IS NULL OR reference_number IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_work_assignment_email_refs_assignment
  ON work_assignment_email_refs (organization_id, assignment_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('work_assignment_email_refs');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — work_assignment_email_refs left without FORCE RLS';
  END IF;
END $$;

COMMIT;
