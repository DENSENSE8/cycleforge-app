-- Room zone letters identify a room inside one organization, not globally.
-- Keeping the unique index tenant-scoped also lets automatic assignment read
-- only the current tenant while remaining race-safe.
DROP INDEX IF EXISTS idx_locations_zone_letter_unique_active;

CREATE UNIQUE INDEX IF NOT EXISTS locations_org_zone_letter_unique_active
  ON locations (organization_id, zone_letter)
  WHERE zone_letter IS NOT NULL AND is_active = true;
