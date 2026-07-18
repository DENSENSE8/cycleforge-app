-- ============================================================================
-- kiosk_devices — enrolled customer-facing tablet as a DEVICE PRINCIPAL
--   (FOH/BOH surface split — doc 06: /kiosk unattended device auth)
--
-- WHAT / WHY
--   A public intake tablet (/kiosk) is NEVER signed in as a person. It
--   authenticates as ITSELF — an org-scoped device principal — and the
--   customer using it runs anonymously on top of that device credential.
--   Staff step up with a PIN only for privileged moments so those writes carry
--   a real staffId. One row per enrolled tablet.
--
--   Lifecycle (status):
--     enrolled → a manager minted a short-lived, single-use pairing CODE
--                (enroll_code_hash); no device token yet.
--     active   → the tablet exchanged the code for a long-lived device TOKEN
--                (device_token_hash); the pairing code is cleared.
--     revoked  → a lost/retired tablet; its token dies server-side instantly.
--
--   Only HASHES are stored — never the raw pairing code or device token (same
--   discipline as staff.pin_hash / share-pack tokens). The token/code IS the
--   capability; the hash lets us verify a presented secret without holding it.
--
-- PRE-AUTH IDENTITY TABLE (mirrors staff_sessions)
--   Device auth resolves a presented token to an org BEFORE any tenant GUC is
--   set, so the lookup runs on the OWNER pool (FORCE-inert → never broken,
--   exactly like session.ts:loadSession by sid — see
--   2026-06-28e_..._wave9_preauth.sql). The org is read FROM THE ROW, never
--   trusted from the request subdomain. The two capability lookups
--   (device_token_hash, enroll_code_hash) therefore carry GLOBAL partial-unique
--   indexes — the hash is a 32-byte-random SHA-256, globally unique by
--   construction, analogous to staff_sessions.sid being a global PK. All
--   MANAGEMENT keys still lead with organization_id.
--
-- TENANCY / SAFETY GATING
--   Tenant-from-birth: organization_id UUID NOT NULL with NO DDL default;
--   enforce_tenant_isolation() in this same migration installs the loud-fail
--   GUC default + FORCE RLS + the canonical policy. Safe to enforce now: the
--   ONLY writers are the new /api/kiosk/{enroll,pair,revoke} handlers (this
--   change), which stamp organization_id explicitly (enroll/revoke inside
--   withTenantTransaction; pair reads org from the row it just matched). No
--   legacy writers exist (the table is new). FORCE is behavior-identical for a
--   single-tenant org today and only adds isolation for future tenants.
--
-- IDEMPOTENCY / ROLLBACK
--   Idempotent DDL (IF NOT EXISTS + guarded DO blocks). Rollback:
--     SELECT relax_tenant_isolation('kiosk_devices');
--     DROP TABLE IF EXISTS kiosk_devices;
--
-- VERIFY (after /db-migrate)
--   npm run tenancy:coverage   -- picks up org_id / RLS / FORCE state
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS kiosk_devices (
  id                    BIGSERIAL PRIMARY KEY,
  organization_id       UUID NOT NULL,               -- no default; enforce_tenant_isolation() installs it
  label                 TEXT NOT NULL,               -- operator-facing tablet name ("Front counter iPad")
  status                TEXT NOT NULL DEFAULT 'enrolled',  -- CHECK below: enrolled | active | revoked
  enroll_code_hash      TEXT,                        -- SHA-256 of the one-time pairing code (cleared on pair)
  enroll_code_expires_at TIMESTAMPTZ,                -- pairing window; NULL once paired
  device_token_hash     TEXT,                        -- SHA-256 of the long-lived device token (NULL until paired)
  enrolled_by_staff_id  INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  last_seen_at          TIMESTAMPTZ,                 -- bumped on each successful device-auth
  revoked_at            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT kiosk_devices_label_len CHECK (char_length(label) BETWEEN 1 AND 120)
);

DO $$ BEGIN
  ALTER TABLE kiosk_devices ADD CONSTRAINT kiosk_devices_status_chk
    CHECK (status IN ('enrolled', 'active', 'revoked'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Capability lookups (pre-auth, owner pool): the secret's hash is globally
-- unique by construction, mirroring staff_sessions.sid. Partial so multiple
-- rows may sit at NULL (a paired device has no code; an enrolled one has no
-- token).
CREATE UNIQUE INDEX IF NOT EXISTS ux_kiosk_devices_token_hash
  ON kiosk_devices (device_token_hash)
  WHERE device_token_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_kiosk_devices_enroll_code_hash
  ON kiosk_devices (enroll_code_hash)
  WHERE enroll_code_hash IS NOT NULL;

-- Management keys ALWAYS lead with organization_id.
CREATE INDEX IF NOT EXISTS idx_kiosk_devices_org_status
  ON kiosk_devices (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_kiosk_devices_org_live
  ON kiosk_devices (organization_id, created_at, id);

COMMENT ON TABLE kiosk_devices IS
  'Enrolled customer-facing tablet as an org-scoped device principal (/kiosk). Pre-auth identity table (owner-pool lookup by hash, mirrors staff_sessions). Only hashes stored. Tenant-scoped from birth.';

-- Tenant-from-birth enforcement (installs loud-fail GUC default + FORCE RLS +
-- canonical tenant_isolation policy). Guarded so the migration is a no-op where
-- the function is absent (fresh/partial envs).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('kiosk_devices');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — kiosk_devices left without FORCE RLS';
  END IF;
END $$;

COMMIT;
