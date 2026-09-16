-- ============================================================================
-- 2026-09-12a: WARRANTY_CLAIM + SUPPORT_TICKET join entity_search_docs
-- ============================================================================
-- Phase D of docs/todo/search-10x-index-and-notes-PLAN.md. Two families a
-- customer names on the phone were not records the index could return:
--
--   WARRANTY_CLAIM — warranty_claims is already a mounted PRODUCT_TABLES sheet
--     and an entity_threads anchor, but typing a claim number (WC-YYYY-NNNNN,
--     2026-06-06_warranty_claim_logger.sql:101) resolved nothing.
--   SUPPORT_TICKET — support_tickets was reachable ONLY through the regex
--     bypass in src/lib/search/support-ticket-search.ts:6-25, which maps
--     `#1234` to RECEIVING cartons. The ticket itself was not a record: a
--     caller quoting their ticket number got their carton or nothing.
--
-- The two new discriminators follow 2026-07-03d EXACTLY (the entity_type TEXT +
-- NAMED CHECK on BOTH tables, the generic TG_ARGV[0] enqueue/delete dispatch,
-- double-guarded UPDATE triggers, the pending partial unique as re-cut by
-- 2026-07-04a). No column is added to entity_search_docs: both types fill the
-- typed facet columns that already exist (status, source_platform,
-- tracking_number, serial_number, happened_at).
--
-- ─── TRIGGER INVENTORY (table → event → enqueued entity_type) ───────────────
--   warranty_claims   INSERT                                  → WARRANTY_CLAIM
--                     UPDATE OF (claim_number, serial_number, sku,
--                       product_title, source_system, source_order_id,
--                       source_tracking_number, zendesk_ticket_id, status,
--                       denial_reason_code, denial_notes, notes, customer_id,
--                       deleted_at)                           → WARRANTY_CLAIM
--                     DELETE                                  → drop doc + pending row
--   support_tickets   INSERT                                  → SUPPORT_TICKET
--                     UPDATE OF (provider, external_ticket_id, subject_cache,
--                       status_cache)                         → SUPPORT_TICKET
--                     DELETE                                  → drop doc + pending row
--
-- ─── UPDATE OF / builder mirror law (2026-07-03d:36-37) ────────────────────
-- Each watched list mirrors what the loader SELECTs and the builder reads
-- (src/lib/search/search-outbox-worker.ts LOADER_SQL, build-search-text.ts
-- buildWarrantyClaimDoc / buildSupportTicketDoc). Three NAMED deviations, each
-- deliberate:
--
--   1. warranty_claims.deleted_at is watched although no builder reads it.
--      It is a LOADER predicate: the claim loader ends `AND wc.deleted_at IS
--      NULL`, so a soft-deleted claim (2026-06-09_warranty_zendesk_link.sql:
--      10-12,19 — claims are tombstoned, never dropped) returns NO row, and
--      drainSearchOutbox's parent-missing arm DELETES its doc. Without this
--      column in the trigger, tombstoning a claim would leave it searchable
--      forever. This is the mirror law honored, not broken: the trigger
--      mirrors what decides the doc's content, and NULL content is content.
--   2. warranty_claims.customer_id is watched: it is the join key for the
--      buyer-identity columns (customer_name / email / phone), so re-pointing
--      a claim at another customer must refresh the doc.
--   3. NEITHER table's updated_at is watched, although buildSupportTicketDoc
--      reads updated_at for its happened_at facet. Exact precedent:
--      buildSkuDoc reads sku_catalog.updated_at while the sku_catalog UPDATE
--      trigger omits it (2026-07-03d:260-261). updated_at moves on EVERY
--      write, so watching it would defeat the double-guard and re-embed the
--      row on churn that changed no indexed text.
--
-- ─── NAMED GAPS (not closed here, not silently skipped) ────────────────────
--   a. customers is NOT triggered. A claim's doc carries the buyer's name /
--      email / phone through LEFT JOIN customers, so renaming a customer does
--      not refresh the claim doc until the claim itself is written. This is
--      the EXACT posture the ORDER doc has carried since the buyer-identity
--      join landed (LOADER_SQL.ORDER joins customers; 2026-07-03d installs no
--      customers trigger). Closing it means one customers trigger fanning out
--      to orders + claims — a separate wave, not a silent omission here.
--   b. warranty_claim_events (2026-06-06:167-178) is NOT folded into the claim
--      doc. Its payload is JSONB and its note text is not a field an operator
--      searches by; adding it would need a child trigger and a LEFT-bounded
--      LATERAL, like order_notes got in 2026-09-11b. Out of scope.
--   c. ticket_links is NOT folded into the ticket doc. A ticket indexes its
--      OWN numbers and subject; the linked carton/order remains findable as
--      itself. Folding link targets in would need a ticket_links trigger.
--   d. warranty_claims.rma_id / repair_service_id are cross-links, not text —
--      no builder reads them, so they are correctly absent from both lists.
--
-- ─── ORG RESOLUTION ────────────────────────────────────────────────────────
-- Both tables carry their own organization_id NOT NULL
-- (warranty_claims: 2026-06-06:99-100 — NOT NULL with the app.current_org GUC
-- default; support_tickets: 2026-07-01f:16), so the generic
-- fn_enqueue_entity_search_outbox() (which reads NEW.organization_id and
-- NEW.id) is reused unchanged — no per-table resolver function is needed.
-- Both are also FORCE-RLS'd already (support_tickets: 2026-07-01f:165-172;
-- warranty_claims: 2026-06-28_enforce_tenant_isolation_business_tail.sql:47),
-- so a successful parent write implies the GUC — same posture as
-- 2026-07-03d:20-24.
--
-- Every enqueue targets the LIVE pending partial unique
--   ux_entity_search_outbox_pending (organization_id, entity_type, entity_id)
--   WHERE processed_at IS NULL AND claimed_at IS NULL   (2026-07-04a:50-52)
-- so a parent write during a drain lands a FRESH pending row.
--
-- Idempotent / re-runnable: guarded DROP+ADD CONSTRAINT, DROP TRIGGER IF
-- EXISTS + CREATE TRIGGER, and INSERT … ON CONFLICT DO NOTHING backfills.
-- Nothing writes entity_search_docs directly — the worker owns doc content.
--
-- DEPLOY ORDER: the code that knows these two discriminators
-- (build-search-text.ts BUILDERS + LOADER_SQL) must ship WITH or BEFORE this
-- migration. A worker that predates them dead-letters the rows via markFailed
-- ("unsupported entity_type", search-outbox-worker.ts drain) rather than
-- looping — recoverable, but the docs stay missing until a re-enqueue.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_warranty_claims_ins ON warranty_claims;
--   DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_warranty_claims_upd ON warranty_claims;
--   DROP TRIGGER IF EXISTS trg_delete_search_docs_on_warranty_claims_delete ON warranty_claims;
--   DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_support_tickets_ins ON support_tickets;
--   DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_support_tickets_upd ON support_tickets;
--   DROP TRIGGER IF EXISTS trg_delete_search_docs_on_support_tickets_delete ON support_tickets;
--   DELETE FROM entity_search_outbox WHERE entity_type IN ('WARRANTY_CLAIM','SUPPORT_TICKET');
--   DELETE FROM entity_search_docs   WHERE entity_type IN ('WARRANTY_CLAIM','SUPPORT_TICKET');
--   -- then narrow both CHECKs back to the six 2026-07-03d values (the two
--   -- DELETEs above must run FIRST or the constraint will not validate):
--   ALTER TABLE entity_search_docs   DROP CONSTRAINT IF EXISTS entity_search_docs_entity_type_chk;
--   ALTER TABLE entity_search_docs   ADD  CONSTRAINT entity_search_docs_entity_type_chk
--     CHECK (entity_type IN ('ORDER','SERIAL_UNIT','RECEIVING','SKU','REPAIR','FBA_SHIPMENT'));
--   ALTER TABLE entity_search_outbox DROP CONSTRAINT IF EXISTS entity_search_outbox_entity_type_chk;
--   ALTER TABLE entity_search_outbox ADD  CONSTRAINT entity_search_outbox_entity_type_chk
--     CHECK (entity_type IN ('ORDER','SERIAL_UNIT','RECEIVING','SKU','REPAIR','FBA_SHIPMENT'));
--
-- VERIFY (after apply; <org> is a real org, <claim>/<ticket> real ids in it):
--   -- 1. both CHECKs carry the two new values
--   SELECT conrelid::regclass AS tbl, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conname IN ('entity_search_docs_entity_type_chk',
--                      'entity_search_outbox_entity_type_chk');
--   -- 2. the backfill queued both families
--   SELECT entity_type, COUNT(*) FROM entity_search_outbox
--    WHERE processed_at IS NULL GROUP BY 1;
--   -- 3. a real edit enqueues; a blanket no-op SET does NOT
--   SET LOCAL app.current_org = '<org>';
--   UPDATE warranty_claims SET notes = COALESCE(notes,'') || 'x' WHERE id = <claim>;
--   SELECT COUNT(*) FROM entity_search_outbox
--    WHERE processed_at IS NULL AND entity_type = 'WARRANTY_CLAIM';   -- +1
--   UPDATE warranty_claims SET status = status WHERE id = <claim>;
--   SELECT COUNT(*) FROM entity_search_outbox
--    WHERE processed_at IS NULL AND entity_type = 'WARRANTY_CLAIM';   -- unchanged
--   UPDATE support_tickets SET status_cache = status_cache WHERE id = <ticket>;
--   SELECT COUNT(*) FROM entity_search_outbox
--    WHERE processed_at IS NULL AND entity_type = 'SUPPORT_TICKET';   -- unchanged
--   -- 4. soft-delete REMOVES the doc (enqueue → loader misses → drain deletes)
--   UPDATE warranty_claims SET deleted_at = now() WHERE id = <claim>;
--   -- …drain /api/cron/search-outbox…
--   SELECT COUNT(*) FROM entity_search_docs
--    WHERE entity_type = 'WARRANTY_CLAIM' AND entity_id = <claim>;     -- 0
--   -- 5. after a drain, a claim number and a ticket number are findable
--   SELECT entity_id, title, LEFT(search_text, 120) FROM entity_search_docs
--    WHERE entity_type = 'WARRANTY_CLAIM' AND search_text ILIKE '%WC-%' LIMIT 5;
--   SELECT entity_id, title, LEFT(search_text, 120) FROM entity_search_docs
--    WHERE entity_type = 'SUPPORT_TICKET' LIMIT 5;
-- ============================================================================

BEGIN;

-- ── 1. entity_type CHECK: BOTH tables, or the trigger fails at runtime ──────
-- The docs CHECK guards the worker's upsert; the OUTBOX CHECK guards the
-- trigger's INSERT. Widening only one would let the enqueue succeed and the
-- drain explode (or the reverse) — they are recreated together, here.
-- DROP IF EXISTS + ADD makes this re-runnable; the duplicate_object guard
-- covers a concurrent add of the same constraint name.
DO $$ BEGIN
  ALTER TABLE entity_search_docs DROP CONSTRAINT IF EXISTS entity_search_docs_entity_type_chk;
  ALTER TABLE entity_search_docs ADD CONSTRAINT entity_search_docs_entity_type_chk
    CHECK (entity_type IN ('ORDER','SERIAL_UNIT','RECEIVING','SKU','REPAIR',
                           'FBA_SHIPMENT','WARRANTY_CLAIM','SUPPORT_TICKET'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE entity_search_outbox DROP CONSTRAINT IF EXISTS entity_search_outbox_entity_type_chk;
  ALTER TABLE entity_search_outbox ADD CONSTRAINT entity_search_outbox_entity_type_chk
    CHECK (entity_type IN ('ORDER','SERIAL_UNIT','RECEIVING','SKU','REPAIR',
                           'FBA_SHIPMENT','WARRANTY_CLAIM','SUPPORT_TICKET'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. warranty_claims → WARRANTY_CLAIM ─────────────────────────────────────
-- Generic dispatch (2026-07-03d:160-172, re-cut for the claim window at
-- 2026-07-04a:60-73): organization_id and id come off NEW, the discriminator
-- off TG_ARGV[0]. No bespoke function.
DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_warranty_claims_ins ON warranty_claims;
CREATE TRIGGER trg_enqueue_search_outbox_on_warranty_claims_ins
  AFTER INSERT ON warranty_claims
  FOR EACH ROW EXECUTE FUNCTION fn_enqueue_entity_search_outbox('WARRANTY_CLAIM');

-- DOUBLE-GUARDED (`UPDATE OF` AND `WHEN … IS DISTINCT FROM …`): the warranty
-- clock recompute sweep re-SETs claim rows on a cron (the
-- idx_warranty_claims_recompute partial index exists for exactly that walk,
-- 2026-06-06:160-163), so `UPDATE OF` alone would re-embed every open claim
-- every interval for a clock field the doc does not even index.
DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_warranty_claims_upd ON warranty_claims;
CREATE TRIGGER trg_enqueue_search_outbox_on_warranty_claims_upd
  AFTER UPDATE OF claim_number, serial_number, sku, product_title,
    source_system, source_order_id, source_tracking_number, zendesk_ticket_id,
    status, denial_reason_code, denial_notes, notes, customer_id, deleted_at
  ON warranty_claims
  FOR EACH ROW
  WHEN (OLD.claim_number           IS DISTINCT FROM NEW.claim_number
     OR OLD.serial_number          IS DISTINCT FROM NEW.serial_number
     OR OLD.sku                    IS DISTINCT FROM NEW.sku
     OR OLD.product_title          IS DISTINCT FROM NEW.product_title
     OR OLD.source_system          IS DISTINCT FROM NEW.source_system
     OR OLD.source_order_id        IS DISTINCT FROM NEW.source_order_id
     OR OLD.source_tracking_number IS DISTINCT FROM NEW.source_tracking_number
     OR OLD.zendesk_ticket_id      IS DISTINCT FROM NEW.zendesk_ticket_id
     OR OLD.status                 IS DISTINCT FROM NEW.status
     OR OLD.denial_reason_code     IS DISTINCT FROM NEW.denial_reason_code
     OR OLD.denial_notes           IS DISTINCT FROM NEW.denial_notes
     OR OLD.notes                  IS DISTINCT FROM NEW.notes
     OR OLD.customer_id            IS DISTINCT FROM NEW.customer_id
     OR OLD.deleted_at             IS DISTINCT FROM NEW.deleted_at)
  EXECUTE FUNCTION fn_enqueue_entity_search_outbox('WARRANTY_CLAIM');

-- ── 3. support_tickets → SUPPORT_TICKET ─────────────────────────────────────
DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_support_tickets_ins ON support_tickets;
CREATE TRIGGER trg_enqueue_search_outbox_on_support_tickets_ins
  AFTER INSERT ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION fn_enqueue_entity_search_outbox('SUPPORT_TICKET');

-- The Zendesk poller refreshes subject_cache / status_cache on every sweep
-- with the provider's current values — unchanged more often than not — so the
-- WHEN guard is what keeps a quiet ticket from re-embedding on a schedule.
-- created_by is NOT watched: no builder reads it.
DROP TRIGGER IF EXISTS trg_enqueue_search_outbox_on_support_tickets_upd ON support_tickets;
CREATE TRIGGER trg_enqueue_search_outbox_on_support_tickets_upd
  AFTER UPDATE OF provider, external_ticket_id, subject_cache, status_cache
  ON support_tickets
  FOR EACH ROW
  WHEN (OLD.provider           IS DISTINCT FROM NEW.provider
     OR OLD.external_ticket_id IS DISTINCT FROM NEW.external_ticket_id
     OR OLD.subject_cache      IS DISTINCT FROM NEW.subject_cache
     OR OLD.status_cache       IS DISTINCT FROM NEW.status_cache)
  EXECUTE FUNCTION fn_enqueue_entity_search_outbox('SUPPORT_TICKET');

-- ── 4. Parent-delete integrity: EVERY discriminator, no silent gaps ─────────
-- Contract point 5 (2026-07-03d:320-337): the shared TG_ARGV[0] dispatch drops
-- the doc AND any pending outbox row, so the worker cannot resurrect a doc for
-- a row that is gone. warranty_claims is normally SOFT-deleted (handled by the
-- deleted_at arm of the UPDATE trigger above); this covers the hard DELETE —
-- an admin purge, or a FK cascade — which the soft path never sees.
DROP TRIGGER IF EXISTS trg_delete_search_docs_on_warranty_claims_delete ON warranty_claims;
CREATE TRIGGER trg_delete_search_docs_on_warranty_claims_delete
  AFTER DELETE ON warranty_claims
  FOR EACH ROW EXECUTE FUNCTION fn_delete_entity_search_docs_on_parent_delete('WARRANTY_CLAIM');

DROP TRIGGER IF EXISTS trg_delete_search_docs_on_support_tickets_delete ON support_tickets;
CREATE TRIGGER trg_delete_search_docs_on_support_tickets_delete
  AFTER DELETE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION fn_delete_entity_search_docs_on_parent_delete('SUPPORT_TICKET');

-- ── 5. Backfill: seed both families through the OUTBOX ──────────────────────
-- Enqueue only — never a direct write to entity_search_docs. A new entity type
-- has no existing docs to re-enqueue, so the seed reads the parent tables;
-- the worker still builds every title/subtitle/facet/embedding through the one
-- builder. ON CONFLICT targets the live pending predicate (2026-07-04a:50-52).
--
-- Soft-deleted claims are EXCLUDED: a tombstoned claim must never be indexed,
-- and enqueueing one would only burn a drain slot to delete a doc that was
-- never written. Both organization_id columns are NOT NULL, so no org filter
-- is needed (unlike the join-table paths in 2026-09-11a/b, whose children can
-- carry a NULL or absent org).
INSERT INTO entity_search_outbox (organization_id, entity_type, entity_id)
SELECT wc.organization_id, 'WARRANTY_CLAIM', wc.id
  FROM warranty_claims wc
 WHERE wc.deleted_at IS NULL
ON CONFLICT (organization_id, entity_type, entity_id)
WHERE processed_at IS NULL AND claimed_at IS NULL
DO NOTHING;

INSERT INTO entity_search_outbox (organization_id, entity_type, entity_id)
SELECT st.organization_id, 'SUPPORT_TICKET', st.id
  FROM support_tickets st
ON CONFLICT (organization_id, entity_type, entity_id)
WHERE processed_at IS NULL AND claimed_at IS NULL
DO NOTHING;

COMMIT;
