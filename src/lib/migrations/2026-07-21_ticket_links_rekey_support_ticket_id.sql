-- ============================================================================
-- 2026-07-21_ticket_links_rekey_support_ticket_id.sql
--
-- EXPAND phase of re-keying ticket_links from the provider-native
-- zendesk_ticket_id onto the platform-agnostic support_ticket_id (the internal
-- registry, 2026-07-01f_support_tickets.sql). This is follow-up #2 of
-- docs/todo/ticket-stn-many-link-plan.md and Phase 2 of the Support Station
-- full-waist initiative (docs/todo/support-station-full-waist-handoff.md).
--
-- WHY: today every ticket_links unique index leads on zendesk_ticket_id, and the
-- column is NOT NULL — so a provider='internal' support ticket (which has no
-- zendesk id) CANNOT own a ticket_links row at all. threads/escalate.ts says so
-- in its own header: the internal path "Never touches ticket_links, so it
-- sidesteps that table's NOT NULL zendesk_ticket_id". Re-keying onto
-- support_ticket_id makes internal tickets first-class in the polymorphic hub and
-- gives every ticket ONE anchor invariant regardless of provider.
--
-- THIS FILE IS PURELY ADDITIVE + PERMISSIVE — safe to apply at ANY time,
-- including with the currently-deployed code running:
--   • Backfill is INSERT…ON CONFLICT / UPDATE…WHERE NULL only (idempotent).
--   • support_ticket_id SET NOT NULL: every existing row has a NOT-NULL
--     zendesk_ticket_id (today's constraint), and the backfill maps each one to a
--     support_tickets row, so no row is left null. Fails LOUD if an orphan
--     remains — the desired fail-closed.
--   • zendesk_ticket_id DROP NOT NULL: a LOOSENING. Every current writer still
--     supplies it, so nothing breaks; it merely lets the new internal path insert
--     a NULL provider id.
--   • The two NEW support-led unique indexes are EQUIVALENT to the existing
--     zendesk-led ones while support_ticket_id ↔ zendesk_ticket_id is 1:1 (which
--     ux_support_tickets_provider_external guarantees for zendesk rows), so both
--     families coexist. ON CONFLICT on the support-led arbiter is safe with the
--     zendesk-led indexes present: an equivalent conflict resolves on the same
--     row via the arbiter; internal rows (NULL zendesk id) only ever conflict on
--     the support-led index. No zendesk-led index is dropped here.
--   • ticket_links already has RLS ENABLED + FORCED + the loud-fail GUC default
--     on organization_id (2026-07-16 header), so no tenant work is needed.
--
-- DEPLOY ORDER (expand/contract discipline — the migration runner applies every
-- pending file at once, so read this before applying):
--   1. APPLY THIS FILE FIRST. It is safe under the currently-deployed code.
--   2. THEN deploy the code that writes via linkSupportTicketEntity (support-led
--      ON CONFLICT (organization_id, support_ticket_id, entity_type, entity_id))
--      + the escalate internal-link path. That code REQUIRES
--      ux_ticket_links_support_entity to exist, so it must not ship before (1).
--
-- DELIBERATELY DEFERRED to a later, deploy-gated CONTRACT migration (do NOT write
-- that file until the support-led writers are DEPLOYED):
--   • DROP the zendesk-led uniques (ux_ticket_links_ticket_entity /
--     _ticket_primary / _ticket_anchor) — dropping the ON CONFLICT target of
--     still-running code is a total link outage (see 2026-07-16c's header).
--   • Re-key the READERS that resolve by zendesk_ticket_id (getTicketEntity,
--     listTicketShipmentReferences, removeTicketShipmentReference,
--     promoteShipmentTicketToReceiving) onto support_ticket_id. They stay correct
--     for zendesk tickets in the meantime (the column is still populated).
--   • is_primary → link_role contract (drop is_primary + its sync trigger).
--
-- ALSO STILL OPEN (a pre-existing gap, unchanged by this file — same audit
-- 2026-07-16 deferred): parent-delete triggers for RECEIVING / RECEIVING_LINE.
-- ticket_links rows orphan when their carton/line is deleted. Closing them needs
-- an explicit audit of the right parent table (receiving vs receiving_carton,
-- receiving_line vs receiving_lines) and what "orphaned" should mean — see
-- docs/partial/HUMAN-TODO.md.
--
-- ROLLBACK (safe — nothing is dropped that had data-bearing dependents):
--   DROP INDEX IF EXISTS ux_ticket_links_support_anchor;
--   DROP INDEX IF EXISTS ux_ticket_links_support_entity;
--   ALTER TABLE ticket_links ALTER COLUMN zendesk_ticket_id SET NOT NULL;  -- only if no internal rows written yet
--   ALTER TABLE ticket_links ALTER COLUMN support_ticket_id DROP NOT NULL;
--
-- VERIFY (must all hold after apply):
--   SELECT count(*) FROM ticket_links WHERE support_ticket_id IS NULL;            -- expect 0
--   SELECT organization_id, support_ticket_id FROM ticket_links
--    WHERE link_role = 'anchor' GROUP BY 1,2 HAVING count(*) > 1;                 -- expect 0 rows
-- ============================================================================

BEGIN;

-- ── 1. Backfill support_ticket_id for any row that still lacks it ────────────
-- Mirrors 2026-07-01f backfill-1. Idempotent: only fills NULLs, ON CONFLICT DO
-- NOTHING on the registry. Runs while zendesk_ticket_id is still NOT NULL, so
-- every existing row has a provider id to map from.
INSERT INTO support_tickets (organization_id, provider, external_ticket_id, created_by)
SELECT DISTINCT tl.organization_id, 'zendesk', tl.zendesk_ticket_id::text, tl.created_by
  FROM ticket_links tl
 WHERE tl.support_ticket_id IS NULL
   AND tl.zendesk_ticket_id IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE ticket_links tl
   SET support_ticket_id = st.id,
       updated_at        = NOW()
  FROM support_tickets st
 WHERE tl.support_ticket_id IS NULL
   AND st.organization_id = tl.organization_id
   AND st.provider = 'zendesk'
   AND st.external_ticket_id = tl.zendesk_ticket_id::text;

-- ── 2. support_ticket_id becomes the required key ───────────────────────────
-- Fails LOUD if any row is still null after the backfill (fail-closed).
ALTER TABLE ticket_links
  ALTER COLUMN support_ticket_id SET NOT NULL;

-- ── 3. zendesk_ticket_id becomes a nullable provider cache ──────────────────
-- Permissive loosening — lets provider='internal' tickets (no Zendesk id) own a
-- ticket_links row. Every existing writer still supplies it.
ALTER TABLE ticket_links
  ALTER COLUMN zendesk_ticket_id DROP NOT NULL;

-- ── 4. Support-led invariants (equivalent to the zendesk-led ones) ──────────
-- The many: no duplicate (support ticket ↔ entity) pair per tenant. This is the
-- ON CONFLICT arbiter for linkSupportTicketEntity.
CREATE UNIQUE INDEX IF NOT EXISTS ux_ticket_links_support_entity
  ON ticket_links (organization_id, support_ticket_id, entity_type, entity_id);

-- The one: exactly one anchor per support ticket — the provider-agnostic mirror
-- of ux_ticket_links_ticket_anchor, and the FIRST index that enforces the
-- one-anchor rule for INTERNAL tickets (whose NULL zendesk id makes the
-- zendesk-led partial index non-enforcing).
CREATE UNIQUE INDEX IF NOT EXISTS ux_ticket_links_support_anchor
  ON ticket_links (organization_id, support_ticket_id)
  WHERE link_role = 'anchor';

COMMENT ON COLUMN ticket_links.support_ticket_id IS
  'Platform-agnostic ticket key (support_tickets.id). NOT NULL as of '
  '2026-07-21. Anchor writes conflict on ux_ticket_links_support_entity; the '
  'one-anchor rule is ux_ticket_links_support_anchor (WHERE link_role=''anchor''). '
  'zendesk_ticket_id is now a nullable provider cache.';

COMMIT;
