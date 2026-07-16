-- ============================================================================
-- 2026-07-16_ticket_links_many_links.sql
--
-- Let one support ticket reference MANY entities (the immediate driver: many
-- shipping tracking numbers / STNs per ticket — split shipments, re-ships,
-- multi-box claims), while keeping exactly ONE primary anchor per ticket.
--
-- WHY THIS SHAPE: `ticket_links` is already the ticket↔entity table and already
-- has entity_type='SHIPMENT' with a BIGINT entity_id. The only thing blocking
-- "many" is UNIQUE (organization_id, zendesk_ticket_id). Rather than fork a
-- second ticket↔STN junction, apply the pattern `shipment_links` already
-- invented for the identical problem (2026-06-24_shipment_links.sql): many rows
-- per owner + `is_primary` + a PARTIAL unique index. The invariant is then
-- enforced by an index rather than by convention.
--
-- The partial unique (organization_id, zendesk_ticket_id) WHERE is_primary is
-- STRICTLY EQUIVALENT to today's unique as long as every row is a primary —
-- which the backfill guarantees. That equivalence is why the old constraint can
-- stay in place through this migration: both hold simultaneously, so this file
-- is a pure no-op for every existing reader and writer. A FOLLOW-UP migration
-- drops the old unique only after the writers set is_primary explicitly.
--
-- SAFETY GATING (verified against prod 2026-07-16, read-only audit):
--   • 107 rows / 107 distinct (org, ticket) — one row per ticket holds today, so
--     the backfill can never produce two primaries for one ticket.
--   • entity_type distribution is RECEIVING_LINE (56) + RECEIVING (51) only.
--   • Zero orphaned SHIPMENT rows (there are zero SHIPMENT rows at all — the
--     shipment anchor path has never run in production; this is net-new
--     capability, not a change to live behavior).
--   • ticket_links already has RLS ENABLED + FORCED and the loud-fail GUC
--     default on organization_id, so no tenant work is needed here.
--
-- DELIBERATELY NOT IN THIS MIGRATION:
--   • A named CHECK on entity_type. It is genuinely unconstrained free text
--     (polymorphic-tables.md point 1), but a CHECK is currently more dangerous
--     than valuable: eleven distinct values reach this column from live writers
--     — RECEIVING / RECEIVING_LINE / SHIPMENT / ZENDESK_TICKET (self-link,
--     zendesk-attachments.ts) / SERIAL_UNIT (flag-gated, recordTestVerdict.ts) /
--     'voicemail' (LOWERCASE, voicemail-mutations.ts) — plus anything
--     `entity_threads` allows, because threads/escalate.ts passes thread
--     .entityType STRAIGHT THROUGH to linkTicket(). That passthrough couples this
--     column's vocabulary to SURFACE_ENTITY_TYPES, so a CHECK would break
--     escalation at a distance the next time a thread entity type is added.
--     Unifying the vocabulary (incl. the lowercase outlier) and constraining the
--     passthrough is its own lane.
--   • Parent-delete triggers for RECEIVING / RECEIVING_LINE. Those rows orphan
--     today when their carton/line is deleted (a real, pre-existing gap with 107
--     live rows), but closing them is not this feature's job and deserves its own
--     audit of what "orphaned" should mean for a ticket. Only the SHIPMENT arm —
--     the one THIS migration starts creating rows for — is closed below.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_delete_ticket_links_on_stn_delete ON shipping_tracking_numbers;
--   DROP FUNCTION IF EXISTS fn_delete_ticket_links_on_parent_delete();
--   DROP INDEX IF EXISTS ux_ticket_links_ticket_primary;
--   DROP INDEX IF EXISTS ux_ticket_links_ticket_entity;
--   DROP INDEX IF EXISTS idx_ticket_links_org_entity;
--   ALTER TABLE ticket_links DROP COLUMN IF EXISTS is_primary;
--
-- VERIFY (must both hold after apply):
--   SELECT count(*) FROM ticket_links WHERE NOT is_primary;            -- expect 0
--   SELECT organization_id, zendesk_ticket_id FROM ticket_links
--    WHERE is_primary GROUP BY 1,2 HAVING count(*) > 1;                -- expect 0 rows
-- ============================================================================

BEGIN;

-- ── 1. The primary flag ─────────────────────────────────────────────────────
-- Mirrors shipment_links.is_primary. Non-volatile default ⇒ metadata-only add.
ALTER TABLE ticket_links
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN ticket_links.is_primary IS
  'Exactly one primary anchor per (organization_id, zendesk_ticket_id), enforced by '
  'ux_ticket_links_ticket_primary. Non-primary rows are additional references (e.g. '
  'extra STNs on one ticket). pickTicketLinkAnchor resolves the primary only.';

-- ── 2. Backfill: every pre-existing row becomes its ticket''s primary ───────
-- Written to be IDEMPOTENT and self-limiting rather than a blanket
-- `SET is_primary = true`: it only ever promotes the lowest-id row of a ticket
-- that has no primary yet. Re-running is a no-op, and it can never create a
-- second primary even if non-primary reference rows exist by then (which is what
-- a blanket UPDATE would do on a re-run, violating the partial unique below).
UPDATE ticket_links tl
   SET is_primary = true,
       updated_at = NOW()
 WHERE NOT tl.is_primary
   AND NOT EXISTS (
     SELECT 1 FROM ticket_links p
      WHERE p.organization_id   = tl.organization_id
        AND p.zendesk_ticket_id = tl.zendesk_ticket_id
        AND p.is_primary
   )
   AND tl.id = (
     SELECT MIN(m.id) FROM ticket_links m
      WHERE m.organization_id   = tl.organization_id
        AND m.zendesk_ticket_id = tl.zendesk_ticket_id
   );

-- ── 3. The two invariants ───────────────────────────────────────────────────
-- Created AFTER the backfill so index creation VALIDATES it: if the backfill
-- somehow left two primaries on one ticket, this fails and the whole
-- transaction rolls back rather than shipping a broken invariant.

-- The many: no duplicate (ticket ↔ entity) pair per tenant.
CREATE UNIQUE INDEX IF NOT EXISTS ux_ticket_links_ticket_entity
  ON ticket_links (organization_id, zendesk_ticket_id, entity_type, entity_id);

-- The one: exactly one primary anchor per ticket (mirrors
-- ux_shipment_links_owner_primary). Strictly equivalent to the existing
-- UNIQUE (organization_id, zendesk_ticket_id) while every row is a primary.
CREATE UNIQUE INDEX IF NOT EXISTS ux_ticket_links_ticket_primary
  ON ticket_links (organization_id, zendesk_ticket_id)
  WHERE is_primary;

-- ── 4. Org-led reverse lookup ───────────────────────────────────────────────
-- The existing idx_ticket_links_entity is (entity_type, entity_id) with NO
-- organization_id lead, so "which tickets reference this entity?" has no
-- tenant-scoped selectivity (polymorphic-tables.md point 4: every index leads
-- with organization_id). Every caller already filters on organization_id in the
-- WHERE; this lets the index serve it. The old index is left in place — dropping
-- it belongs with the same follow-up that drops the old unique.
CREATE INDEX IF NOT EXISTS idx_ticket_links_org_entity
  ON ticket_links (organization_id, entity_type, entity_id);

-- ── 5. Parent-delete integrity for the SHIPMENT arm ─────────────────────────
-- ticket_links.entity_id is polymorphic and therefore has NO foreign key, so
-- nothing cleans up an entity_type='SHIPMENT' row when its STN is deleted.
-- shipment_links solved the same problem with a real FK (ON DELETE CASCADE);
-- here the polymorphic column forces the trigger arm of the contract
-- (polymorphic-tables.md point 5) — one CREATE TRIGGER per nameable parent over
-- a shared function dispatching on TG_ARGV[0], exactly as
-- fn_delete_photos_on_parent_delete / fn_delete_shipment_links_on_owner_delete do.
CREATE OR REPLACE FUNCTION fn_delete_ticket_links_on_parent_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM ticket_links
   WHERE entity_type = TG_ARGV[0]
     AND entity_id   = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_delete_ticket_links_on_stn_delete ON shipping_tracking_numbers;
CREATE TRIGGER trg_delete_ticket_links_on_stn_delete
AFTER DELETE ON shipping_tracking_numbers
FOR EACH ROW EXECUTE FUNCTION fn_delete_ticket_links_on_parent_delete('SHIPMENT');

COMMENT ON FUNCTION fn_delete_ticket_links_on_parent_delete() IS
  'Generic parent-delete cleanup for the polymorphic ticket_links.entity_id. '
  'Dispatches on TG_ARGV[0] (the entity_type). Wired for SHIPMENT '
  '(shipping_tracking_numbers); RECEIVING / RECEIVING_LINE remain an open, '
  'pre-existing gap — see this migration''s header.';

COMMIT;
