-- ============================================================================
-- 2026-08-30e — helpdesk_comment_staff
--
-- WHAT
--   Maps a helpdesk (Zendesk) comment id to the Cycle Forge staffer who posted
--   it from this app. Comments posted through the API token otherwise show up
--   as the shared Zendesk integration user; the thread should show our staff
--   avatar + name. Comments typed in Zendesk itself have no row here and keep
--   the Zendesk identity unless staff.email matches the agent.
--
-- WHY
--   The inlined claim / ticket stream is the one identity surface. Zendesk
--   photos bleeding through for our own replies is a fork of staff identity.
--
-- SAFETY
--   New table, writers land with this migration's companion code. Org-stamped
--   from birth. FORCE RLS via enforce_tenant_isolation.
--
-- ROLLBACK (dev only)
--   SELECT relax_tenant_isolation('helpdesk_comment_staff');
--   DROP TABLE IF EXISTS helpdesk_comment_staff CASCADE;
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS helpdesk_comment_staff (
  organization_id     UUID NOT NULL,
  zendesk_ticket_id   BIGINT NOT NULL,
  zendesk_comment_id  BIGINT NOT NULL,
  staff_id            INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT helpdesk_comment_staff_org_comment_unique
    UNIQUE (organization_id, zendesk_comment_id)
);

CREATE INDEX IF NOT EXISTS idx_helpdesk_comment_staff_org_ticket
  ON helpdesk_comment_staff (organization_id, zendesk_ticket_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('helpdesk_comment_staff');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — helpdesk_comment_staff left without FORCE RLS';
  END IF;
END $$;

COMMIT;
