-- ============================================================================
-- 2026-08-10d: locations.display_name — the operator-facing nickname
-- ============================================================================
-- A station has TWO names, and conflating them is what made renaming a bench
-- impossible:
--
--   • `name`         — the warehouse-map identity. Globally UNIQUE (legacy),
--                      referenced by room structure and seed/backfill SQL.
--   • `display_name` — what an operator reads on the floor: the To-ship Station
--                      cell, the Ready-to-Pack chips, the bench facet.
--
-- Why a column and not a rename of `name`: `locations.name` is globally unique,
-- and the exact nickname an operator reaches for FIRST is already taken. The
-- dogfood org has a legacy ROOM row literally called `Packing Station 1`
-- (see 2026-08-09_locations_location_kind.sql), so naming the desk that would
-- 409 on the unique — the operator's most obvious action failing on an
-- invariant they cannot see. A nullable alias sidesteps that without a second
-- name STORE: it is one more field on the same `locations` row, not a bench
-- registry (the `packing_stations` twin the guard bans).
--
-- NULL means "no nickname — read `name`". Resolution is
-- `COALESCE(NULLIF(BTRIM(display_name), ''), name)` at every DISPLAY read; the
-- empty string is treated as NULL so clearing the Settings field restores the
-- canonical name rather than blanking the chip.
--
-- Deliberately NOT unique: two rooms may each hold a bench an operator calls
-- "Station 1", and a nickname is a label, not an identity — the barcode and
-- `name` remain the identity. Nothing joins or looks up on this column.
--
-- Safety: additive, nullable, no default, no backfill — every existing row
-- keeps reading exactly as it does today until someone types a nickname.
--
-- ROLLBACK:
--   ALTER TABLE locations DROP COLUMN IF EXISTS display_name;
-- ============================================================================

BEGIN;

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS display_name TEXT;

COMMENT ON COLUMN locations.display_name IS
  'Operator-facing nickname for this location (station benches especially). NULL = read `name`. Resolve with COALESCE(NULLIF(BTRIM(display_name), ...), name). Not unique — a label, never an identity.';

COMMIT;
