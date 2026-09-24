-- 2026-09-24c_kiosk_companion_links.sql
-- kiosk_companion_links — a staff phone joined to a counter tablet's repair
-- visit. The tablet shows a QR (a one-link-per-tablet token); a signed-in phone
-- opens /m/repair-scan with it, sees the visit's devices, and scans serial
-- numbers into them. Operator 2026-09-24: "a QR code that you would be able to
-- scan on your phone to join the same repair service session and then scan
-- something like a serial number to input and update the form".
--
-- The TABLET stays the authority for the visit (its cart is local until a desk
-- holds it). This row is only the meeting point:
--   devices          the tablet's last device snapshot — what the phone shows
--                    ([{lineId, title, sku, serialNumber}])
--   pending_serials  serials the phone scanned that the tablet has not applied
--                    yet ([{lineId, serialNumber}]); the tablet's next sync
--                    takes and clears them in one transaction.
-- Only a SHA-256 of the token is stored; the token itself lives in the QR.
--
-- One link per tablet (per org): re-opening rotates the token, so an old QR on
-- a phone stops working the moment a new visit shows a new one.
--
-- Tenant-scoped from birth: organization_id NOT NULL, enforced via the
-- enforce_tenant_isolation() helper (2026-06-14_rls_enforcement_infra.sql).
-- Safe because the only reader/writer (src/lib/kiosk/companion-link.ts, via
-- /api/kiosk/companion[/sync] and /api/counter/companion) runs inside
-- withTenantTransaction / tenantQuery (sets app.current_org) AND stamps
-- organization_id explicitly from the device or staff auth context.
--
-- ROLLBACK:
--   select relax_tenant_isolation('kiosk_companion_links');
--   DROP TABLE IF EXISTS kiosk_companion_links;
--
-- VERIFY:
--   \d kiosk_companion_links
--   select relrowsecurity, relforcerowsecurity from pg_class where relname = 'kiosk_companion_links';

CREATE TABLE IF NOT EXISTS kiosk_companion_links (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,
  device_id       BIGINT NOT NULL REFERENCES kiosk_devices(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL,
  devices         JSONB NOT NULL DEFAULT '[]'::jsonb,
  pending_serials JSONB NOT NULL DEFAULT '[]'::jsonb,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT kiosk_companion_links_org_device_unique UNIQUE (organization_id, device_id)
);

-- The phone's read: the token it scanned, inside the staffer's own org.
CREATE UNIQUE INDEX IF NOT EXISTS uq_kiosk_companion_links_org_token
  ON kiosk_companion_links (organization_id, token_hash);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('kiosk_companion_links');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — kiosk_companion_links left without FORCE RLS';
  END IF;
END $$;
