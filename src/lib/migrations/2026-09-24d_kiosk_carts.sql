-- 2026-09-24d_kiosk_carts.sql
-- kiosk_carts — the counter tablet's ONE cart, written down so the counter can
-- juggle several customers at once and any paired tablet of the org can pick a
-- cart up by its number. Operator 2026-09-24: "recent carts for juggling
-- multiple customers at the same time, IDed for multiple devices".
--
-- This is persistence of the existing kiosk session cart, not a second cart
-- system: the tablet's session store stays the authority while it holds a cart,
-- and the row is its snapshot.
--   id                 the visible cart number ("Cart #42")
--   held_by_device_id  the ONE tablet allowed to save it (single writer). Opening
--                      a cart on another tablet moves the hold; the previous
--                      holder's next save is refused (409) and it lets go.
--   snapshot           lines + customer + ticketChoice + activeCommand
--                      (src/lib/kiosk/kiosk-cart-snapshot.ts). Never the face,
--                      stance or desk-mirror fields — those belong to a screen.
--   label/item_count/total_cents  denormalised for the Recent carts list, so the
--                      list never ships every cart's lines.
--   status             open → done (submitted). A cleared cart is DELETED.
--   version            optimistic-concurrency counter for saves.
--
-- Tenant-scoped from birth: organization_id NOT NULL, enforced via the
-- enforce_tenant_isolation() helper (2026-06-14_rls_enforcement_infra.sql).
-- Safe because the only reader/writer (src/lib/kiosk/kiosk-carts.server.ts, via
-- /api/kiosk/carts[/…]) runs inside withTenantTransaction / tenantQuery (sets
-- app.current_org) AND stamps organization_id explicitly from the device auth
-- context (withKioskAuth), never from a request body.
--
-- ROLLBACK:
--   select relax_tenant_isolation('kiosk_carts');
--   DROP TABLE IF EXISTS kiosk_carts;
--
-- VERIFY:
--   \d kiosk_carts
--   select relrowsecurity, relforcerowsecurity from pg_class where relname = 'kiosk_carts';

CREATE TABLE IF NOT EXISTS kiosk_carts (
  id                BIGSERIAL PRIMARY KEY,
  organization_id   UUID NOT NULL,
  held_by_device_id BIGINT NULL REFERENCES kiosk_devices(id) ON DELETE SET NULL,
  snapshot          JSONB NOT NULL,
  label             TEXT,
  item_count        INT NOT NULL DEFAULT 0,
  total_cents       BIGINT NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'open',
  version           INT NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT kiosk_carts_status_check CHECK (status IN ('open', 'done'))
);

-- The Recent carts list: an org's open carts, newest first.
CREATE INDEX IF NOT EXISTS idx_kiosk_carts_org_status_updated
  ON kiosk_carts (organization_id, status, updated_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('kiosk_carts');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — kiosk_carts left without FORCE RLS';
  END IF;
END $$;
