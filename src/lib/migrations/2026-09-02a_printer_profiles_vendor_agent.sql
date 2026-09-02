-- 2026-09-02a_printer_profiles_vendor_agent.sql
-- Pack-scan print via NAS media agent: allow vendor='agent' on printer_profiles
-- (CUPS queue name in external_id). Seed one outbound profile for the dogfood
-- org so pack print can dispatch without PrintNode.
--
-- ROLLBACK:
--   DELETE FROM printer_profiles
--    WHERE vendor = 'agent' AND default_for = 'outbound'
--      AND organization_id = '00000000-0000-0000-0000-000000000001';
--   ALTER TABLE printer_profiles DROP CONSTRAINT IF EXISTS printer_profiles_vendor_chk;
--   ALTER TABLE printer_profiles ADD CONSTRAINT printer_profiles_vendor_chk
--     CHECK (vendor IN ('printnode','loftware'));

BEGIN;

ALTER TABLE printer_profiles
  DROP CONSTRAINT IF EXISTS printer_profiles_vendor_chk;

ALTER TABLE printer_profiles
  ADD CONSTRAINT printer_profiles_vendor_chk
  CHECK (vendor IN ('printnode', 'loftware', 'agent'));

COMMENT ON COLUMN printer_profiles.vendor IS
  'printnode | loftware | agent (NAS media agent / CUPS on the office print host)';

-- Default outbound target for USAV. external_id is the CUPS queue name the
-- agent uses when PRINT_QUEUE_* env is unset for a type (paper fallback).
-- Ops can rename external_id to match `lpstat -a` on the agent Mac.
INSERT INTO printer_profiles (
  name,
  external_id,
  vendor,
  default_for,
  is_active,
  organization_id
)
SELECT
  'Office NAS agent (outbound)',
  'Canon_PRO_200S_series',
  'agent',
  'outbound',
  true,
  '00000000-0000-0000-0000-000000000001'::uuid
WHERE EXISTS (
  SELECT 1 FROM organizations WHERE id = '00000000-0000-0000-0000-000000000001'::uuid
)
AND NOT EXISTS (
  SELECT 1
    FROM printer_profiles
   WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid
     AND default_for = 'outbound'
     AND is_active = true
);

COMMIT;
