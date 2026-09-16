-- 2026-09-14b_sku_staff_pairings.sql
--
-- ITEM NUMBER ↔ STAFF OWNERSHIP — the input that turns one shared pick queue
-- into per-picker lists that generate themselves.
--
-- OPERATOR MODEL (2026-09-14): "this item number is paired to this staff, this
-- staff then auto generates their own assigned pick list and they're able to
-- see all the pick list. If they are done with their pick list or if someone
-- else needs help, then they can view all of it."
--
-- WHY ONE OWNER PER SKU (`ux_sku_staff_pairings_sku`, UNIQUE on
-- (organization_id, sku)): the pairing exists to make a list DETERMINISTIC
-- without a planner. Two owners for one item number would put the same
-- allocation on two lists, and two pickers would walk to the same bin for the
-- same unit — the exact double-pick this table exists to prevent. Coverage is
-- deliberately partial: an unpaired SKU is not an error, its allocations land
-- in the UNPAIRED bucket that every picker can see and claim. That is why
-- there is no NOT NULL pairing requirement anywhere downstream.
--
-- WHY SKU AND NOT `sku_catalog_id`: the floor reads the item number off the
-- label, and provisional / uncatalogued SKUs must be pairable on the day they
-- arrive. `sku_catalog_id` is nullable across this schema for that reason, so
-- keying on it would silently drop exactly the new items that most need an
-- owner. TEXT here matches `serial_units.sku` and `orders.sku`.
--
-- NO FK ON `staff_id`: `staff` rows are soft-managed across this schema and a
-- restrict-on-delete FK would block offboarding a picker. An orphaned pairing
-- reads as UNPAIRED (the join finds no active staff), which is the correct
-- degradation — work stays visible instead of vanishing with the employee.
--
-- STATIC OWNERSHIP IS NOT THE WHOLE STRATEGY. Small-footprint research is
-- explicit that strict zone/owner picking creates idle time in a cross-trained
-- team; the operator's "view all / help others" rule is the documented
-- correction, so `scope=all` is a first-class read path, not a fallback.
--
-- TENANT FROM BIRTH: organization_id NOT NULL, every key org-first, FORCE RLS
-- via enforce_tenant_isolation.

BEGIN;

CREATE TABLE IF NOT EXISTS sku_staff_pairings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL,
  sku                   TEXT NOT NULL,
  staff_id              INTEGER NOT NULL,
  -- Free-text note so a pairing can carry its reason ("owns audio bench").
  note                  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_staff_id   INTEGER,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sku_staff_pairings_sku_present_chk CHECK (btrim(sku) <> '')
);

-- One owner per item number per tenant (see header).
CREATE UNIQUE INDEX IF NOT EXISTS ux_sku_staff_pairings_sku
  ON sku_staff_pairings (organization_id, sku);

-- "My list" reads by staff; "all lists" groups by staff. Both are org-first.
CREATE INDEX IF NOT EXISTS idx_sku_staff_pairings_staff
  ON sku_staff_pairings (organization_id, staff_id, sku);

COMMENT ON TABLE sku_staff_pairings IS
  'Item number → owning picker. Drives per-staff pick list generation; unpaired SKUs are claimable by anyone.';

-- ─── Tenant isolation ───────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('sku_staff_pairings');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — sku_staff_pairings left without FORCE RLS';
  END IF;
END $$;

COMMIT;
