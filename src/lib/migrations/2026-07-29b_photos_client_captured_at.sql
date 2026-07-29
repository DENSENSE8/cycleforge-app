-- ============================================================================
-- 2026-07-29b: photos.client_captured_at — device-reported capture instant.
-- ============================================================================
-- WHY: carrier concealed-damage disputes turn on WHEN the evidence photo was
-- taken, and `photos.created_at` is the server-INSERT instant. For a queued
-- mobile upload (src/components/mobile/receiving/PhotoUploadQueue.ts and its
-- unit/packer siblings persist to localStorage and drain on reconnect) that can
-- be minutes-to-hours after the shutter fired. This column records the instant
-- the device reported at capture, so the two facts stop being conflated.
--
-- NOT SERVER-ATTESTED. The value comes from the operator's device clock — the
-- camera-capture wall clock at shutter on the mobile studios, or File.lastModified
-- on the two desktop paths (drag-drop gallery, ticket staging). A warehouse
-- tablet with a drifted clock produces a wrong-but-plausible value. `created_at`
-- remains the only attested time and is unchanged by this migration; anything
-- that needs a defensible server timestamp must keep reading `created_at`.
--
-- WHY NULLABLE, WHY NO BACKFILL, WHY NO DEFAULT:
-- Desktop uploads that hand us no usable File timestamp, legacy-URL attaches,
-- and every row predating this migration genuinely have no capture time. A
-- fabricated value (created_at copied forward, or now()) would look like
-- evidence in a dispute while being pure invention — strictly worse than an
-- honest NULL. So: no NOT NULL, no DEFAULT, no backfill.
--
-- WHY NO INDEX: nothing filters or sorts on this column in this slice. It is
-- read as a per-row fact on an already-selected photo (the viewer/inspector
-- context panels). Add one when a query actually needs it.
--
-- WHY NO enforce_tenant_isolation('photos'): `photos` is a long-existing
-- tenant-scoped table, armed with organization_id NOT NULL + FORCE RLS + the
-- canonical tenant_isolation policy back in
-- 2026-06-22e_enforce_tenant_isolation_core_usav_fallback.sql. This migration
-- only adds a nullable column to it — same reasoning as the header of
-- 2026-07-23b_orders_is_out_of_stock.sql.
--
-- Deliberately NOT reusing photos.deleted_from_blob_at (vestigial from
-- 2026-05-19_google_photos_tier4.sql, referenced nowhere in app code): its name
-- means the opposite of this fact, and overloading it would be a lie in the
-- schema.
--
-- Rollback:
--   ALTER TABLE photos DROP COLUMN IF EXISTS client_captured_at;
-- ----------------------------------------------------------------------------

BEGIN;

ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS client_captured_at TIMESTAMPTZ;

COMMENT ON COLUMN photos.client_captured_at IS
  'Device-reported capture instant (camera shutter wall clock, or File.lastModified). '
  'NULL for desktop/legacy uploads and every row predating 2026-07-29b. '
  'NOT server-attested — photos.created_at remains the server-insert instant '
  'and the only attested time.';

COMMIT;
