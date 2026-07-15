-- ============================================================================
-- 2026-07-15_thread_crud_connections.sql
--
-- Full-CRUD + cross-entity "connecting dots" for Entity Threads
-- (docs/todo/entity-threads-conversation-plan.md; base pair shipped in
-- 2026-07-14_entity_threads.sql). Adds:
--
--   1. Soft-delete tombstones — entity_threads.deleted_at + thread_messages
--      .deleted_at, so DELETE is confirm-then-commit and NON-destructive (the
--      per-message ops_events / audit trail already emitted stays intact).
--      Reads filter `deleted_at IS NULL` in the domain layer.
--   2. thread_assignments — one staff OWNER per thread (conversation ownership,
--      distinct from work_assignments' work-queue semantics). Mirrors
--      support_ticket_assignments (2026-06-24): upsert-to-reassign, delete-to-
--      clear, org-led. UNIQUE(org, thread_id) = one owner per thread (v1).
--   3. thread_links — curated cross-entity links so a thread "also concerns"
--      other entities (tracking-resolved order, sibling serials, a SKU).
--      Modeled on photo_entity_links (the cleanest polymorphic hub): a hub id
--      (thread_id) + (entity_type, entity_id) + a link_role second axis. The
--      CHECK reuses the 7 canonical UPPERCASE anchor values PLUS 'SKU'
--      (entity_id = sku_catalog.id — the stable SKU anchor; NEVER the SKU
--      string, per the items-vs-sku_catalog trap). Derivable dots
--      (order→tracking/serial) are resolved read-side via resolveOrderAnchors;
--      this table is for the MANUAL / non-derivable "this thread also concerns
--      X" links only.
--
-- Contract: .claude/rules/polymorphic-tables.md — BIGINT ids, entity_type/
-- entity_id naming, named CHECK discriminator, org-led unique+lookup indexes,
-- FK ON DELETE CASCADE on the non-polymorphic parent (thread_id), tenant-from-
-- birth via enforce_tenant_isolation() in THIS migration. thread_links'
-- polymorphic entity side is validated app-side (domain helper), never a DB
-- trigger (contract point 6), and needs no parent-delete trigger family: it
-- CASCADEs from entity_threads (thread_id FK), which itself cascade-deletes
-- when its own anchor parent is deleted (2026-07-14 trigger family).
--
-- Idempotent (IF NOT EXISTS / guarded DO-blocks). Rollback:
--   ALTER TABLE entity_threads DROP COLUMN deleted_at;
--   ALTER TABLE thread_messages DROP COLUMN deleted_at;
--   SELECT relax_tenant_isolation('thread_assignments');
--   SELECT relax_tenant_isolation('thread_links');
--   DROP TABLE thread_assignments; DROP TABLE thread_links;
-- Safety gate: both new tables are written ONLY by src/lib/threads/* helpers
-- under withTenantTransaction (GUC-scoped) with explicit organization_id, so
-- FORCE RLS from birth is safe.
-- ============================================================================

BEGIN;

-- 1. Soft-delete tombstones ---------------------------------------------------
ALTER TABLE entity_threads  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE thread_messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. thread_assignments (one owner per thread) --------------------------------
CREATE TABLE IF NOT EXISTS thread_assignments (
  id                BIGSERIAL PRIMARY KEY,
  organization_id   UUID NOT NULL,                 -- enforce_tenant_isolation installs the GUC default
  thread_id         BIGINT NOT NULL REFERENCES entity_threads(id) ON DELETE CASCADE,
  assigned_staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  assigned_by       INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, thread_id)
);
CREATE INDEX IF NOT EXISTS idx_thread_assignments_staff
  ON thread_assignments (organization_id, assigned_staff_id);

-- 3. thread_links (curated cross-entity connections) --------------------------
CREATE TABLE IF NOT EXISTS thread_links (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,
  thread_id       BIGINT NOT NULL REFERENCES entity_threads(id) ON DELETE CASCADE,
  entity_type     TEXT NOT NULL,
  entity_id       BIGINT NOT NULL,
  link_role       TEXT NOT NULL DEFAULT 'related',
  created_by      INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE thread_links ADD CONSTRAINT thread_links_entity_type_chk
    CHECK (entity_type IN (
      'RECEIVING','RECEIVING_LINE','SERIAL_UNIT','ORDER',
      'FBA_SHIPMENT','REPAIR','WARRANTY_CLAIM','SKU'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE thread_links ADD CONSTRAINT thread_links_link_role_chk
    CHECK (link_role IN ('related','tracking','order','sku','serial','duplicate','follow_up'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_thread_links_natural
  ON thread_links (organization_id, thread_id, entity_type, entity_id, link_role);
CREATE INDEX IF NOT EXISTS idx_thread_links_entity
  ON thread_links (organization_id, entity_type, entity_id);

COMMENT ON TABLE thread_assignments IS
  'Conversation OWNER (one staff per thread) for entity_threads — distinct from work_assignments (work-queue). Upsert-to-reassign, delete-to-clear. Tenant-from-birth.';
COMMENT ON TABLE thread_links IS
  'Curated cross-entity links: a thread also concerns entity X (entity_type incl. SKU = sku_catalog.id). Manual/non-derivable links only; order→tracking/serial resolve read-side. Cascades from entity_threads. Tenant-from-birth.';

-- 4. Tenant-from-birth enforcement -------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('thread_assignments');
    PERFORM enforce_tenant_isolation('thread_links');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — thread_assignments/thread_links left without FORCE RLS';
  END IF;
END $$;

COMMIT;
