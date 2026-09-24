-- 2026-09-24d_entity_videos.sql
-- entity_videos — videos attached to any photo entity (entity_type/entity_id
-- are the SAME polymorphic pair photo_entity_links uses; PHOTO_ENTITY_TYPES in
-- src/lib/photos/types.ts is the vocabulary, validated at the route edge like
-- photo uploads). First surface: repair evidence on /m/rs/{id}/photos
-- (operator 2026-09-24: "GCS storage — you must make the video routes";
-- "ensure for video uploads it's able to use the same routing").
--
-- Same routing as photos: same bucket (resolveGcsBucket), same org-rooted key
-- layout one level down — `{org}/videos/{entity flow}/{id}.{ext}`
-- (buildGcsVideoObjectKey) — same upload gate (uploadPermissionFor(entityType))
-- and the same per-entity realtime dispatch (publishEntityMediaInsert).
--
-- Why videos are NOT rows in `photos` / `photo_storage`: every photo path
-- assumes an image — sharp thumbnails and the thumb variant of
-- /api/photos/{id}/content, analyze jobs, Zendesk attach, share packs, the
-- photo library and zip download. A video row there would leak into each of
-- them. This table is the whole video model.
--
-- Two-step upload, so bytes never pass through a function:
--   1. POST /api/photos/upload/video inserts a 'pending' row and returns a V4
--      signed PUT for exactly `object_key` (content type + size range signed).
--   2. POST /api/photos/upload/video/{id}/finalize reads GCS object metadata,
--      stores the REAL size, flips status → 'ready' and stamps uploaded_at.
--      Only 'ready' rows are listed or played.
-- Duration is never stored — the player reads it from the file.
-- An abandoned 'pending' row points at no (or a partial) object and is never
-- shown; it is safe to sweep by created_at.
--
-- entity_id is BIGINT to match photo_entity_links.entity_id.
--
-- Tenant-scoped from birth: organization_id NOT NULL, enforced via the
-- enforce_tenant_isolation() helper (2026-06-14_rls_enforcement_infra.sql).
-- Safe because the only reader/writer (src/lib/photos/videos.ts) runs inside
-- withTenantTransaction (sets app.current_org) AND stamps organization_id
-- explicitly from the auth context.
--
-- ROLLBACK:
--   select relax_tenant_isolation('entity_videos');
--   DROP TABLE IF EXISTS entity_videos;
--   -- then delete the orphaned objects under {org}/videos/ in the photos bucket.
--
-- VERIFY:
--   \d entity_videos
--   select relrowsecurity, relforcerowsecurity from pg_class where relname = 'entity_videos';

CREATE TABLE IF NOT EXISTS entity_videos (
  id                  BIGSERIAL PRIMARY KEY,
  organization_id     UUID NOT NULL,
  entity_type         TEXT NOT NULL,
  entity_id           BIGINT NOT NULL,
  -- History outlives a removed staff row (mirrors photos.taken_by_staff_id).
  staff_id            INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'pending',
  bucket              TEXT NOT NULL,
  object_key          TEXT NOT NULL,
  content_type        TEXT NOT NULL,
  -- What the browser claimed at create-upload (the signed size range caps it).
  declared_size_bytes BIGINT NOT NULL,
  -- What GCS stored, read at finalize. NULL while pending.
  file_size_bytes     BIGINT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_at         TIMESTAMPTZ,
  CONSTRAINT entity_videos_status_check CHECK (status IN ('pending', 'ready')),
  CONSTRAINT entity_videos_ready_stamped CHECK (
    status = 'pending' OR (uploaded_at IS NOT NULL AND file_size_bytes IS NOT NULL)
  ),
  CONSTRAINT entity_videos_org_object_unique UNIQUE (organization_id, object_key)
);

-- The entity screen read: ready videos on one entity, oldest first.
CREATE INDEX IF NOT EXISTS idx_entity_videos_org_entity_ready
  ON entity_videos (organization_id, entity_type, entity_id, uploaded_at)
  WHERE status = 'ready';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('entity_videos');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — entity_videos left without FORCE RLS';
  END IF;
END $$;
