-- ============================================================================
-- 2026-07-29h — DROP legacy operations/media saved_views tables
--
-- WHY: code cutover in the same PR retargets all readers/writers to the
-- polymorphic `saved_views` table (2026-07-29g). Historical CREATE migrations
-- stay on disk (immutable applied files); this migration removes the live
-- duplicates after data has been copied.
--
-- SAFETY GATE: only apply after g has copied rows AND application code no
-- longer references operations_saved_views / media_library_saved_views
-- (ops + photos query wrappers hit `saved_views` with surface discriminators).
--
-- ROLLBACK (dev only): re-create from 2026-06-24_operations_saved_views.sql /
-- 2026-07-01_media_library_saved_views.sql and reverse-copy from saved_views
-- WHERE surface IN ('operations','media_library'). Production: roll forward.
--
-- VERIFY: \dt *saved_views* → only `saved_views` remains.
-- ============================================================================

BEGIN;

DROP TABLE IF EXISTS operations_saved_views CASCADE;
DROP TABLE IF EXISTS media_library_saved_views CASCADE;

COMMIT;
