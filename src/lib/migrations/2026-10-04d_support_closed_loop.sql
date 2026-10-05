-- ============================================================================
-- 2026-10-04d_support_closed_loop.sql
--
-- The local-first customer-support loop inside Tasks → Support.
--
-- ONE local model, no third conversation store:
--   • support_tickets      = the Support item (local identity + optional
--                            external-provider binding). Gains purpose
--                            (customer_conversation | internal_record |
--                            unclassified, staff-acknowledged), lifecycle
--                            (open | waiting_customer | snoozed | resolved),
--                            requester, platform/account, primary order,
--                            primary task, reply bookkeeping, sync state and
--                            resolution facts. provider widens to the
--                            transports that feed the one ingest waist
--                            (ingestSupportMessage).
--   • entity_threads       gains the 'SUPPORT_TICKET' anchor: the canonical
--                            conversation of a Support item is the thread
--                            (SUPPORT_TICKET, support_tickets.id).
--   • thread_messages      gains direction, provider message id, the inbound
--                            reply disposition (pending | answered |
--                            no_reply_required, with the answering outbound
--                            message or the acknowledging staff) and the
--                            outbound delivery state (pending | sent | failed
--                            | copied | logged). provider widens like above.
--   • support_drafts       NEW — stored AI drafts with confidence, citations,
--                            warnings, missing facts, model and the source
--                            message boundary. Never sent automatically.
--   • work_assignment_follow_ups gains channel 'message' and the
--                            thread_message_id it records (one row per
--                            message — a reply logs itself exactly once).
--   • ticket_links         gains external_reference (the pasted order
--                            number / listing URL / tracking kept as metadata
--                            beside the exact orders.id link).
--   • order_support_follow_ups NEW — per-order post-purchase check-in
--                            projection pointing at orders.id, the Support
--                            item, the task, the triggering milestone, the
--                            satisfying outbound message and the latest
--                            inbound message.
--   • support_ticket_assignments is DEPRECATED as an ownership source: its
--                            rows are copied onto the primary task's
--                            work_assignment_assignees (task assignees are
--                            authoritative). The table stays until no reader
--                            remains; nothing writes it after this change.
--
-- Safety gating:
--   • Every ALTER widens a CHECK or adds a nullable / defaulted column; no
--     existing row is invalidated. thread_messages had 0 rows at authoring.
--   • support_drafts and order_support_follow_ups are tenant-from-birth and
--     FORCE-enforced: their only writers (src/lib/support/drafts/**,
--     src/lib/support/check-ins/**) run under withTenantTransaction with the
--     org from the auth context or the cron's per-org loop.
--   • Backfills are UPDATE … WHERE … IS NULL / INSERT … ON CONFLICT DO
--     NOTHING — re-running lands the same state.
--
-- ROLLBACK (inverse DDL; only after the readers are cut):
--   DROP TABLE IF EXISTS order_support_follow_ups;
--   DROP TABLE IF EXISTS support_drafts;
--   DROP TRIGGER IF EXISTS trg_delete_entity_threads_on_support_ticket_delete ON support_tickets;
--   DELETE FROM entity_threads WHERE entity_type = 'SUPPORT_TICKET';
--   ALTER TABLE entity_threads DROP CONSTRAINT entity_threads_entity_type_chk;
--   ALTER TABLE entity_threads ADD CONSTRAINT entity_threads_entity_type_chk CHECK (entity_type IN
--     ('RECEIVING','RECEIVING_LINE','SERIAL_UNIT','ORDER','FBA_SHIPMENT','REPAIR','WARRANTY_CLAIM','TASK_DOCUMENT'));
--   ALTER TABLE thread_messages DROP COLUMN direction, … (each column added below);
--   ALTER TABLE support_tickets DROP COLUMN kind, … (each column added below);
--   restore support_tickets_provider_check / thread_messages_provider_chk /
--   work_assignment_follow_ups_channel_chk to their previous lists.
--
-- VERIFY:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname IN ('support_tickets_provider_check','thread_messages_provider_chk',
--                      'entity_threads_entity_type_chk','work_assignment_follow_ups_channel_chk');
--   SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
--    WHERE relname IN ('support_drafts','order_support_follow_ups');
--   SELECT count(*) FROM support_tickets WHERE primary_task_id IS NOT NULL;
-- ============================================================================

BEGIN;

-- ── Support item (support_tickets) ─────────────────────────────────────────

ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS support_tickets_provider_check;
ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_provider_check
  CHECK (provider IN (
    'zendesk','internal','ebay','amazon','ecwid','email','website','phone','walk_in','manual'
  ));

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'conversation',
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'unclassified',
  ADD COLUMN IF NOT EXISTS purpose_source TEXT NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS purpose_suggestion TEXT,
  ADD COLUMN IF NOT EXISTS purpose_suggestion_reason TEXT,
  ADD COLUMN IF NOT EXISTS purpose_acknowledged_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS purpose_acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lifecycle TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS lifecycle_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS requester_name TEXT,
  ADD COLUMN IF NOT EXISTS requester_email TEXT,
  ADD COLUMN IF NOT EXISTS requester_handle TEXT,
  ADD COLUMN IF NOT EXISTS account_label TEXT,
  ADD COLUMN IF NOT EXISTS platform_account_id BIGINT REFERENCES platform_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS primary_order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS primary_task_id INTEGER REFERENCES work_assignments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pending_inbound_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_outbound_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_state TEXT,
  ADD COLUMN IF NOT EXISTS sync_error TEXT,
  ADD COLUMN IF NOT EXISTS sync_failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolution_reason TEXT,
  ADD COLUMN IF NOT EXISTS resolution_override BOOLEAN NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_kind_chk
    CHECK (kind IN ('conversation','post_purchase_check_in'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_purpose_chk
    CHECK (purpose IN ('unclassified','customer_conversation','internal_record'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_purpose_source_chk
    CHECK (purpose_source IN ('default','staff','program'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_purpose_suggestion_chk
    CHECK (purpose_suggestion IS NULL OR purpose_suggestion IN ('customer_conversation','internal_record'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A classified purpose always carries its acknowledgement instant.
DO $$ BEGIN
  ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_purpose_ack_chk
    CHECK (purpose = 'unclassified' OR purpose_acknowledged_at IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_lifecycle_chk
    CHECK (lifecycle IN ('open','waiting_customer','snoozed','resolved'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_sync_state_chk
    CHECK (sync_state IS NULL OR sync_state IN ('ok','failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_pending_inbound_chk
    CHECK (pending_inbound_count >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- An override resolution always says why.
DO $$ BEGIN
  ALTER TABLE support_tickets ADD CONSTRAINT support_tickets_resolution_override_chk
    CHECK (NOT resolution_override OR length(btrim(coalesce(resolution_reason, ''))) > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_support_tickets_org_lifecycle
  ON support_tickets (organization_id, lifecycle, id DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_org_requester_email
  ON support_tickets (organization_id, lower(requester_email))
  WHERE requester_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_tickets_primary_order
  ON support_tickets (organization_id, primary_order_id)
  WHERE primary_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_support_tickets_primary_task
  ON support_tickets (organization_id, primary_task_id)
  WHERE primary_task_id IS NOT NULL;

-- ── Canonical thread anchor ───────────────────────────────────────────────

ALTER TABLE entity_threads DROP CONSTRAINT IF EXISTS entity_threads_entity_type_chk;
ALTER TABLE entity_threads ADD CONSTRAINT entity_threads_entity_type_chk
  CHECK (entity_type IN (
    'RECEIVING','RECEIVING_LINE','SERIAL_UNIT','ORDER',
    'FBA_SHIPMENT','REPAIR','WARRANTY_CLAIM','TASK_DOCUMENT','SUPPORT_TICKET'
  ));

DROP TRIGGER IF EXISTS trg_delete_entity_threads_on_support_ticket_delete ON support_tickets;
CREATE TRIGGER trg_delete_entity_threads_on_support_ticket_delete
AFTER DELETE ON support_tickets
FOR EACH ROW EXECUTE FUNCTION fn_delete_entity_threads_on_parent_delete('SUPPORT_TICKET');

-- ── Canonical messages (thread_messages) ──────────────────────────────────

ALTER TABLE thread_messages DROP CONSTRAINT IF EXISTS thread_messages_provider_chk;
ALTER TABLE thread_messages ADD CONSTRAINT thread_messages_provider_chk
  CHECK (provider IN (
    'internal','zendesk','system','ebay','amazon','ecwid','email','website','phone','walk_in','manual'
  ));

ALTER TABLE thread_messages
  ADD COLUMN IF NOT EXISTS direction TEXT,
  ADD COLUMN IF NOT EXISTS external_message_id TEXT,
  ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS author_label TEXT,
  ADD COLUMN IF NOT EXISTS reply_disposition TEXT,
  ADD COLUMN IF NOT EXISTS answered_by_message_id BIGINT REFERENCES thread_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS disposition_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS disposition_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disposition_reason TEXT,
  ADD COLUMN IF NOT EXISTS delivery_state TEXT,
  ADD COLUMN IF NOT EXISTS delivery_error TEXT;

DO $$ BEGIN
  ALTER TABLE thread_messages ADD CONSTRAINT thread_messages_direction_chk
    CHECK (direction IS NULL OR direction IN ('inbound','outbound','internal'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Only inbound customer messages carry a reply disposition; an answered one
-- always names the outbound message that answered it.
DO $$ BEGIN
  ALTER TABLE thread_messages ADD CONSTRAINT thread_messages_reply_disposition_chk
    CHECK (
      reply_disposition IS NULL
      OR (direction = 'inbound' AND reply_disposition IN ('pending','answered','no_reply_required'))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE thread_messages ADD CONSTRAINT thread_messages_answered_by_chk
    CHECK (reply_disposition IS DISTINCT FROM 'answered' OR answered_by_message_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Only outbound messages carry a delivery state.
DO $$ BEGIN
  ALTER TABLE thread_messages ADD CONSTRAINT thread_messages_delivery_state_chk
    CHECK (
      delivery_state IS NULL
      OR (direction = 'outbound' AND delivery_state IN ('pending','sent','failed','copied','logged'))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A provider message is stored once per org and transport.
CREATE UNIQUE INDEX IF NOT EXISTS ux_thread_messages_external
  ON thread_messages (organization_id, provider, external_message_id)
  WHERE external_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_thread_messages_pending_reply
  ON thread_messages (organization_id, thread_id)
  WHERE reply_disposition = 'pending' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_thread_messages_open_delivery
  ON thread_messages (organization_id, thread_id)
  WHERE delivery_state IN ('pending','failed','copied') AND deleted_at IS NULL;

-- ── Stored AI drafts ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS support_drafts (
  id                     BIGSERIAL PRIMARY KEY,
  organization_id        UUID NOT NULL,
  support_ticket_id      BIGINT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  kind                   TEXT NOT NULL DEFAULT 'reply',
  status                 TEXT NOT NULL DEFAULT 'pending',
  -- Boundary: the newest inbound message the draft saw (NULL for a
  -- proactive check-in draft written before any customer message).
  source_message_id      BIGINT REFERENCES thread_messages(id) ON DELETE SET NULL,
  source_message_count   INTEGER,
  body                   TEXT,
  confidence             TEXT,
  citations              JSONB NOT NULL DEFAULT '[]'::jsonb,
  warnings               JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_facts          JSONB NOT NULL DEFAULT '[]'::jsonb,
  model                  TEXT,
  error                  TEXT,
  stale_reason           TEXT,
  requested_by_staff_id  INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  used_message_id        BIGINT REFERENCES thread_messages(id) ON DELETE SET NULL,
  attempts               INTEGER NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at           TIMESTAMPTZ,
  stale_at               TIMESTAMPTZ,
  CONSTRAINT support_drafts_kind_chk CHECK (kind IN ('reply','check_in')),
  CONSTRAINT support_drafts_status_chk
    CHECK (status IN ('pending','ready','stale','used','discarded','failed')),
  CONSTRAINT support_drafts_confidence_chk
    CHECK (confidence IS NULL OR confidence IN ('high','medium','low')),
  CONSTRAINT support_drafts_ready_body_chk
    CHECK (status NOT IN ('ready','used') OR length(btrim(coalesce(body, ''))) > 0)
);

-- One live (pending | ready) draft per item, kind and source boundary — a
-- retried enqueue is a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS ux_support_drafts_live_boundary
  ON support_drafts (organization_id, support_ticket_id, kind, COALESCE(source_message_id, 0))
  WHERE status IN ('pending','ready');
CREATE INDEX IF NOT EXISTS idx_support_drafts_item
  ON support_drafts (organization_id, support_ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_drafts_pending
  ON support_drafts (organization_id, created_at)
  WHERE status = 'pending';

-- ── Follow-up log records the message it was ──────────────────────────────

ALTER TABLE work_assignment_follow_ups DROP CONSTRAINT IF EXISTS work_assignment_follow_ups_channel_chk;
ALTER TABLE work_assignment_follow_ups ADD CONSTRAINT work_assignment_follow_ups_channel_chk
  CHECK (channel IN ('email','call','ticket','note','message'));

ALTER TABLE work_assignment_follow_ups
  ADD COLUMN IF NOT EXISTS thread_message_id BIGINT REFERENCES thread_messages(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_work_assignment_follow_ups_message
  ON work_assignment_follow_ups (organization_id, thread_message_id)
  WHERE thread_message_id IS NOT NULL;

-- ── Pasted references stay as metadata beside the exact link ──────────────

ALTER TABLE ticket_links ADD COLUMN IF NOT EXISTS external_reference TEXT;

-- ── Per-order post-purchase check-in projection ───────────────────────────

CREATE TABLE IF NOT EXISTS order_support_follow_ups (
  id                         BIGSERIAL PRIMARY KEY,
  organization_id            UUID NOT NULL,
  order_id                   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  program                    TEXT NOT NULL DEFAULT 'post_purchase',
  state                      TEXT NOT NULL DEFAULT 'not_due',
  trigger_kind               TEXT,
  trigger_ref                TEXT,
  trigger_at                 TIMESTAMPTZ,
  due_at                     TIMESTAMPTZ,
  support_ticket_id          BIGINT REFERENCES support_tickets(id) ON DELETE SET NULL,
  assignment_id              INTEGER REFERENCES work_assignments(id) ON DELETE SET NULL,
  contacted_at               TIMESTAMPTZ,
  contact_message_id         BIGINT REFERENCES thread_messages(id) ON DELETE SET NULL,
  contact_follow_up_id       BIGINT REFERENCES work_assignment_follow_ups(id) ON DELETE SET NULL,
  latest_inbound_message_id  BIGINT REFERENCES thread_messages(id) ON DELETE SET NULL,
  next_follow_up_at          TIMESTAMPTZ,
  chase_count                INTEGER NOT NULL DEFAULT 0,
  disposition                TEXT,
  disposition_reason         TEXT,
  closed_at                  TIMESTAMPTZ,
  closed_by_staff_id         INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  not_applicable_reason      TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT order_support_follow_ups_program_chk CHECK (program IN ('post_purchase')),
  CONSTRAINT order_support_follow_ups_state_chk CHECK (state IN (
    'not_due','due','contacted','customer_replied','staff_reply_due','waiting_customer',
    'follow_up_due','resolved','no_response_closed','not_applicable'
  )),
  CONSTRAINT order_support_follow_ups_trigger_chk
    CHECK (trigger_kind IS NULL OR trigger_kind IN ('delivered','picked_up','shipped_fallback')),
  -- "Followed up" only with a real outbound message or a logged contact.
  CONSTRAINT order_support_follow_ups_contact_proof_chk
    CHECK (contacted_at IS NULL OR contact_message_id IS NOT NULL OR contact_follow_up_id IS NOT NULL),
  -- A closed loop always says why.
  CONSTRAINT order_support_follow_ups_closed_reason_chk
    CHECK (state NOT IN ('no_response_closed','not_applicable')
           OR length(btrim(coalesce(disposition_reason, not_applicable_reason, ''))) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_order_support_follow_ups_order
  ON order_support_follow_ups (organization_id, order_id, program);
CREATE INDEX IF NOT EXISTS idx_order_support_follow_ups_state_due
  ON order_support_follow_ups (organization_id, state, due_at);
CREATE INDEX IF NOT EXISTS idx_order_support_follow_ups_ticket
  ON order_support_follow_ups (organization_id, support_ticket_id)
  WHERE support_ticket_id IS NOT NULL;

-- ── Backfills ─────────────────────────────────────────────────────────────

-- Primary task: the oldest live SUPPORT_TICKET follow-up task of each item.
UPDATE support_tickets st
   SET primary_task_id = pick.task_id
  FROM (
    SELECT DISTINCT ON (wa.organization_id, wa.entity_id)
           wa.organization_id, wa.entity_id, wa.id AS task_id
      FROM work_assignments wa
     WHERE wa.entity_type = 'SUPPORT_TICKET'
       AND wa.work_type = 'FOLLOW_UP'
       AND wa.status <> 'CANCELED'
     ORDER BY wa.organization_id, wa.entity_id, wa.id
  ) pick
 WHERE st.primary_task_id IS NULL
   AND st.organization_id = pick.organization_id
   AND st.id = pick.entity_id;

-- Lifecycle follows the LOCAL task, never the provider's "solved".
UPDATE support_tickets st
   SET lifecycle = 'resolved',
       lifecycle_changed_at = COALESCE(wa.completed_at, wa.updated_at),
       resolved_at = COALESCE(wa.completed_at, wa.updated_at),
       resolved_by_staff_id = COALESCE(wa.completed_by_tech_id, wa.assignee_staff_id),
       resolution_reason = 'Task was done before the Support loop (2026-10-04 backfill).'
  FROM work_assignments wa
 WHERE st.primary_task_id = wa.id
   AND st.organization_id = wa.organization_id
   AND wa.status = 'DONE'
   AND st.lifecycle = 'open'
   AND st.resolved_at IS NULL;

-- Purpose stays staff-owned: the operations tags only SUGGEST internal.
UPDATE support_tickets
   SET purpose_suggestion = 'internal_record',
       purpose_suggestion_reason = 'Tagged as an operations ticket (receiving claim, vendor or trade-in).'
 WHERE purpose = 'unclassified'
   AND purpose_suggestion IS NULL
   AND tags IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM unnest(tags) t
      WHERE t IN ('receiving_claim','trade_in','api_test') OR t LIKE 'claim\_%'
   );

UPDATE support_tickets
   SET purpose = 'internal_record',
       purpose_source = 'program',
       purpose_acknowledged_at = created_at
 WHERE provider = 'internal'
   AND purpose = 'unclassified'
   AND kind = 'conversation'
   AND EXISTS (SELECT 1 FROM ticket_links tl
                WHERE tl.support_ticket_id = support_tickets.id
                  AND tl.entity_type IN ('RECEIVING','RECEIVING_LINE','SERIAL_UNIT'));

-- support_ticket_assignments → the primary task's assignees (authoritative).
INSERT INTO work_assignment_assignees (organization_id, assignment_id, staff_id)
SELECT sta.organization_id, st.primary_task_id, sta.assigned_staff_id
  FROM support_ticket_assignments sta
  JOIN support_tickets st
    ON st.organization_id = sta.organization_id
   AND st.provider = 'zendesk'
   AND st.external_ticket_id = sta.zendesk_ticket_id::text
 WHERE st.primary_task_id IS NOT NULL
ON CONFLICT DO NOTHING;

COMMENT ON TABLE support_ticket_assignments IS
  'DEPRECATED 2026-10-04 (support closed loop): ownership lives on the Support item''s primary task (work_assignment_assignees). Rows were copied there by 2026-10-04d; nothing writes this table.';

COMMENT ON TABLE support_tickets IS
  'The local Support item (UI: Support item / Conversation). provider = the transport that feeds or carries it; external_ticket_id = optional provider metadata. Canonical chat = entity_threads (SUPPORT_TICKET, id). Writer waist: ingestSupportMessage (src/lib/support/conversation).';

COMMENT ON TABLE order_support_follow_ups IS
  'Per-order post-purchase check-in projection: points at orders.id, the Support item, its task, the triggering milestone, the satisfying outbound message and the latest inbound message. Never duplicates order or message truth.';

-- ── Tenancy ───────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('support_drafts');
    PERFORM enforce_tenant_isolation('order_support_follow_ups');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — support_drafts / order_support_follow_ups left without FORCE RLS';
  END IF;
END $$;

COMMIT;
