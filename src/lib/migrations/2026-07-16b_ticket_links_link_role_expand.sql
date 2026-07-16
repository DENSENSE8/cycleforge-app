-- ============================================================================
-- 2026-07-16b_ticket_links_link_role_expand.sql
--
-- EXPAND phase: introduce `link_role` alongside `is_primary`, keeping both
-- columns correct at all times. The CONTRACT phase (drop is_primary + the sync
-- trigger) is a LATER, deploy-gated migration — see the bottom of this header.
--
-- WHY link_role INSTEAD OF is_primary:
--   `is_primary` (added same-day by 2026-07-16_ticket_links_many_links.sql,
--   mirroring shipment_links) encodes ONE relationship kind as a boolean. But
--   ticket_links genuinely carries more than one kind per (entity_type,
--   entity_id) pair — an ANCHOR ("what is this ticket about", resolved by
--   pickTicketLinkAnchor) and a REFERENCE ("another shipment it touches"). That
--   is exactly the case polymorphic-tables.md names for a second discriminator
--   axis, citing photo_entity_links.link_role ('primary' | 'claim_evidence' |
--   'insurance_share') as the house precedent. A TEXT role also leaves room for
--   further kinds (duplicate_of, caused_by …) that a boolean cannot express —
--   the same conclusion Jira reached with issuelinktype rather than a flag.
--   shipment_links' is_primary was the sibling precedent; photo_entity_links is
--   the better-matching one for this table's job.
--
-- WHY EXPAND/CONTRACT RATHER THAN A RENAME:
--   A hard swap has a broken window in BOTH orderings — migrate-then-deploy
--   leaves running code reading a dropped is_primary; deploy-then-migrate leaves
--   new code reading an absent link_role. Keeping both columns, reconciled by a
--   trigger, removes the window entirely: code writing EITHER column produces a
--   correct row, so the migration and the deploy no longer have to be ordered
--   relative to each other at all.
--
-- SAFETY GATING — this file is safe to apply at ANY time, including with the
-- current production code running:
--   • Purely additive: no column is dropped, no constraint is removed.
--   • The sync trigger is bidirectional, so the CURRENTLY DEPLOYED code (which
--     writes is_primary and knows nothing of link_role) keeps producing correct
--     rows, and so will the next deploy (which writes link_role and may stop
--     setting is_primary).
--   • ux_ticket_links_ticket_primary (WHERE is_primary) and the new
--     ux_ticket_links_ticket_anchor (WHERE link_role = 'anchor') are EQUIVALENT
--     under the trigger, so both can hold simultaneously.
--   • Verified against prod 2026-07-16: 108 rows, every one is_primary = true,
--     no ticket with two primaries.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_sync_ticket_links_link_role ON ticket_links;
--   DROP FUNCTION IF EXISTS fn_sync_ticket_links_link_role();
--   DROP INDEX IF EXISTS ux_ticket_links_ticket_anchor;
--   ALTER TABLE ticket_links DROP COLUMN IF EXISTS link_role;
--
-- FOLLOW-UP (CONTRACT — do NOT write that file until the link_role code is
-- DEPLOYED, because the migration runner applies every pending file at once):
--   drop trg_sync_ticket_links_link_role + fn_sync_ticket_links_link_role();
--   drop ux_ticket_links_ticket_primary; drop column is_primary;
--   and register ('ticket_links','is_primary') in
--   scripts/schema-drift-manifest.json so the guard fails any code still
--   referencing it.
--
-- VERIFY (must both hold after apply):
--   SELECT count(*) FROM ticket_links WHERE (link_role = 'anchor') <> is_primary;  -- expect 0
--   SELECT count(*) FROM ticket_links WHERE link_role NOT IN ('anchor','reference'); -- expect 0
-- ============================================================================

BEGIN;

-- ── 1. The role column ──────────────────────────────────────────────────────
-- Defaults to 'reference' so a row is only ever an anchor deliberately; the
-- backfill below promotes the existing rows, every one of which is an anchor.
ALTER TABLE ticket_links
  ADD COLUMN IF NOT EXISTS link_role TEXT NOT NULL DEFAULT 'reference';

DO $$ BEGIN
  ALTER TABLE ticket_links ADD CONSTRAINT ticket_links_link_role_chk
    CHECK (link_role IN ('anchor', 'reference'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN ticket_links.link_role IS
  'Relationship kind for this (ticket, entity) pair. ''anchor'' = what the ticket '
  'is ABOUT (at most one per ticket, enforced by ux_ticket_links_ticket_anchor; '
  'resolved by pickTicketLinkAnchor''s line > carton > shipment ladder). '
  '''reference'' = another entity the ticket touches (e.g. extra STNs). Second '
  'discriminator axis per polymorphic-tables.md, mirroring photo_entity_links.link_role.';

-- ── 2. Backfill from is_primary (idempotent — re-running is a no-op) ────────
UPDATE ticket_links
   SET link_role = CASE WHEN is_primary THEN 'anchor' ELSE 'reference' END,
       updated_at = NOW()
 WHERE link_role IS DISTINCT FROM (CASE WHEN is_primary THEN 'anchor' ELSE 'reference' END);

-- ── 3. Bidirectional sync — this is what removes the deploy-ordering window ──
-- Whichever column a writer sets, the other follows. Today's deployed code sets
-- is_primary; tomorrow's sets link_role; both produce identical rows, so the
-- migration and the deploy are independent. Removed in the CONTRACT migration
-- once no writer sets is_primary.
CREATE OR REPLACE FUNCTION fn_sync_ticket_links_link_role()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  role_from_flag TEXT := CASE WHEN NEW.is_primary THEN 'anchor' ELSE 'reference' END;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- An explicit non-default link_role wins; otherwise derive it from is_primary.
    IF NEW.link_role IS DISTINCT FROM 'reference' THEN
      NEW.is_primary := (NEW.link_role = 'anchor');
    ELSE
      NEW.link_role := role_from_flag;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: whichever column actually changed is the intent; if both changed,
  -- link_role wins (it is the forward-looking column).
  IF NEW.link_role IS DISTINCT FROM OLD.link_role THEN
    NEW.is_primary := (NEW.link_role = 'anchor');
  ELSIF NEW.is_primary IS DISTINCT FROM OLD.is_primary THEN
    NEW.link_role := role_from_flag;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_ticket_links_link_role ON ticket_links;
CREATE TRIGGER trg_sync_ticket_links_link_role
BEFORE INSERT OR UPDATE ON ticket_links
FOR EACH ROW EXECUTE FUNCTION fn_sync_ticket_links_link_role();

-- ── 4. The link_role-shaped anchor invariant ────────────────────────────────
-- Equivalent to ux_ticket_links_ticket_primary while the trigger holds the two
-- columns together; both indexes coexist until the CONTRACT migration drops the
-- is_primary one.
CREATE UNIQUE INDEX IF NOT EXISTS ux_ticket_links_ticket_anchor
  ON ticket_links (organization_id, zendesk_ticket_id)
  WHERE link_role = 'anchor';

COMMIT;
