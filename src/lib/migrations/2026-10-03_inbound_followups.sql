-- 2026-10-03_inbound_followups.sql
-- Staff follow-up tags on pasted inbound numbers — replaces the "Unreceived
-- Tracking" Google Sheet's 'Check and resolve' column and its NEED CLAIM /
-- DOUBLE CHECK color tags. One row per (org, canonical ref key); the key is the
-- upper-alnum PO number when the pasted ref resolved to one, else the ref
-- itself (`inboundFollowupKey` in src/lib/receiving/inbound-followups.ts).
-- An untagged number has no row; clearing a tag deletes the row.
--
-- Tenant-scoped from birth: organization_id NOT NULL, enforced via the
-- enforce_tenant_isolation() helper (2026-06-14_rls_enforcement_infra.sql) so the
-- loud-fail DEFAULT + FORCE RLS + canonical tenant_isolation policy land in one shot.
-- Safe because the only writer (src/lib/receiving/inbound-followups-store.ts)
-- runs inside withTenantTransaction (sets app.current_org) AND stamps
-- organization_id explicitly. The table is new, so there are no prior writers.
--
-- ROLLBACK: select relax_tenant_isolation('inbound_followups'); then DROP TABLE IF EXISTS inbound_followups;
-- VERIFY:   \d inbound_followups  → PK (organization_id, ref_key), tag CHECK, RLS forced.

CREATE TABLE IF NOT EXISTS inbound_followups (
  organization_id UUID NOT NULL,                       -- no DEFAULT here; helper installs the loud-fail GUC default
  ref_key         TEXT NOT NULL,
  tag             TEXT NOT NULL
                  CONSTRAINT inbound_followups_tag_chk
                  CHECK (tag IN ('need_claim', 'double_check', 'chasing_seller', 'acknowledged')),
  note            TEXT,
  set_by          INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  set_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, ref_key)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('inbound_followups');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — inbound_followups left without FORCE RLS';
  END IF;
END $$;
