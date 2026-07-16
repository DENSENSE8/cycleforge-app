-- ============================================================================
-- 2026-07-16c_ticket_links_drop_legacy_unique.sql
--
-- Drop UNIQUE (organization_id, zendesk_ticket_id) — the one-entity-per-ticket
-- constraint. THIS IS THE MIGRATION THAT ACTUALLY ENABLES MANY-STN LINKING:
-- everything before it was additive and inert, because this constraint rejected
-- the second row for a ticket no matter what the application asked for.
--
-- ⚠ DEPLOY-GATED — WHY THIS FILE DID NOT EXIST UNTIL NOW:
--   `npm run db:migrate` applies EVERY pending file, so merely creating this file
--   early would arm it. The pre-2026-07-16 code upserted with
--   `ON CONFLICT (organization_id, zendesk_ticket_id) DO UPDATE`; dropping the
--   constraint under that code makes Postgres raise "there is no unique or
--   exclusion constraint matching the ON CONFLICT specification" on EVERY link —
--   a total outage of ticket linking, not a degraded path.
--   It is safe now, and only now, because the replacement code is LIVE in
--   production (deployment cycleforge-brpd0dmor, target=production, aliased to
--   app.cycleforge.ai, 2026-07-16 16:26 PDT). That code infers the NATURAL key
--   (ux_ticket_links_ticket_entity) instead, and never names this constraint.
--
-- WHAT STILL HOLDS THE INVARIANTS AFTERWARDS (nothing is loosened by accident):
--   • ux_ticket_links_ticket_entity (org, ticket, entity_type, entity_id)
--     — no duplicate (ticket ↔ entity) pair; this is the ON CONFLICT target.
--   • ux_ticket_links_ticket_primary (org, ticket) WHERE is_primary
--     AND ux_ticket_links_ticket_anchor (org, ticket) WHERE link_role='anchor'
--     — still exactly ONE anchor per ticket. The one-entity rule is not being
--       removed, it is being narrowed from "one ROW per ticket" to "one ANCHOR
--       per ticket", which is the actual business rule.
--
-- ALSO DROPS the pre-org-led idx_ticket_links_entity (entity_type, entity_id):
-- superseded by idx_ticket_links_org_entity (2026-07-16), which leads with
-- organization_id per polymorphic-tables.md point 4. Kept until now so the
-- previously-deployed code never lost its reverse-lookup index mid-flight.
--
-- KNOWN BEHAVIOUR CHANGE THIS UNLOCKS (deliberate, flag-gated, documented):
--   recordTestVerdict.ts:351 auto-links a failed unit's serial to the carton's
--   primary ticket with `ON CONFLICT DO NOTHING`. Because the ticket ALWAYS
--   already had a row, that conflict fired every time and the insert has never
--   once landed — the feature has been silently dead since it shipped. With this
--   constraint gone it starts inserting SERIAL_UNIT rows at is_primary=false /
--   link_role='reference' (correct: the anchor stays the receiving line). It is
--   behind CF_TESTING_AUTO_LINK_TICKET, which defaults to FALSE, so nothing
--   changes until that flag is turned on.
--
-- ROLLBACK (safe only while every ticket still has ≤1 row — i.e. before any
-- reference row is written; after that the constraint cannot be re-added
-- without deleting rows):
--   ALTER TABLE ticket_links
--     ADD CONSTRAINT ticket_links_organization_id_zendesk_ticket_id_key
--     UNIQUE (organization_id, zendesk_ticket_id);
--   CREATE INDEX IF NOT EXISTS idx_ticket_links_entity
--     ON ticket_links (entity_type, entity_id);
--
-- VERIFY:
--   -- the anchor rule must survive the drop:
--   SELECT organization_id, zendesk_ticket_id FROM ticket_links
--    WHERE link_role = 'anchor' GROUP BY 1,2 HAVING count(*) > 1;   -- expect 0 rows
--   -- and a second STN must now be insertable (it was not, before this file).
-- ============================================================================

BEGIN;

ALTER TABLE ticket_links
  DROP CONSTRAINT IF EXISTS ticket_links_organization_id_zendesk_ticket_id_key;

DROP INDEX IF EXISTS idx_ticket_links_entity;

COMMIT;
