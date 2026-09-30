-- Local mirror of helpdesk tickets + their full comment thread, so the ticket
-- detail panel (bundle / comments / receiving claim thread) renders from our own
-- DB in one round trip instead of a live Zendesk getTicket + listComments +
-- users fan-out on every open.
--
--   • support_tickets gains the mirrored ticket fields: the raw provider ticket
--     object (`ticket_payload`, returned verbatim so the DTO is unchanged), the
--     promoted scalar fields we filter/join on, and `mirrored_at` (last FULL
--     mirror incl. comments; NULL = never mirrored → read path fetches live once).
--   • support_ticket_comments (new) holds every comment of a mirrored ticket,
--     one row per provider comment, keyed per org by the provider comment id.
--     Author identity is NOT stored here — it resolves at read time from
--     zendesk_users + helpdesk_comment_staff + staff, so a staff binding written
--     after a post (recordStaffForPostedComment) shows without a re-mirror.
--
-- Single writer: src/lib/support/ticket-mirror.ts (writeTicketMirror) — runs via
-- tenantQuery / withTenantTransaction (sets app.current_org) AND stamps
-- organization_id explicitly, so enforcing tenant isolation on the new table
-- from birth is safe. support_tickets is already enforced (2026-07-01f); the
-- ADD COLUMNs below are nullable and change no writer's contract.
--
-- ROLLBACK (revert src/lib/support/ticket-mirror.ts + its readers first):
--   select relax_tenant_isolation('support_ticket_comments');
--   DROP TABLE IF EXISTS support_ticket_comments;
--   ALTER TABLE support_tickets DROP COLUMN IF EXISTS ticket_payload,
--     DROP COLUMN IF EXISTS requester_zendesk_user_id, … (every column added below);
--
-- VERIFY:
--   \d support_ticket_comments   -- FORCE RLS + support_ticket_comments_tenant_isolation policy
--   SELECT count(*) FILTER (WHERE mirrored_at IS NOT NULL) FROM support_tickets;

BEGIN;

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS ticket_payload             JSONB,
  ADD COLUMN IF NOT EXISTS requester_zendesk_user_id  BIGINT,
  ADD COLUMN IF NOT EXISTS assignee_zendesk_user_id   BIGINT,
  ADD COLUMN IF NOT EXISTS priority                   TEXT,
  ADD COLUMN IF NOT EXISTS ticket_type                TEXT,
  ADD COLUMN IF NOT EXISTS tags                       TEXT[],
  -- The provider ticket's own `external_id` (e.g. "receiving:123") — the
  -- getTicketEntity fallback anchor. Not to be confused with external_ticket_id.
  ADD COLUMN IF NOT EXISTS provider_external_id       TEXT,
  ADD COLUMN IF NOT EXISTS external_created_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS external_updated_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mirrored_at                TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS support_ticket_comments (
  id                      BIGSERIAL PRIMARY KEY,
  organization_id         UUID NOT NULL,          -- helper installs the loud-fail GUC default
  support_ticket_id       BIGINT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  external_comment_id     BIGINT NOT NULL,
  author_zendesk_user_id  BIGINT,
  comment_type            TEXT,
  audit_id                BIGINT,
  body                    TEXT,
  html_body               TEXT,
  plain_body              TEXT,
  is_public               BOOLEAN NOT NULL,
  attachments             JSONB NOT NULL DEFAULT '[]'::jsonb,
  via                     JSONB,
  metadata                JSONB,
  -- Any provider comment keys not promoted above, so the read returns the
  -- identical object the provider sent.
  extra                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  external_created_at     TIMESTAMPTZ NOT NULL,
  mirrored_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT support_ticket_comments_org_external_unique
    UNIQUE (organization_id, external_comment_id)
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_comments_org_ticket_created
  ON support_ticket_comments (organization_id, support_ticket_id, external_created_at);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('support_ticket_comments');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — support_ticket_comments left without FORCE RLS';
  END IF;
END $$;

COMMIT;
