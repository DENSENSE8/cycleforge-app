-- photo_jobs: allow job_type 'packer_nas_backup'.
--
-- What + why: the Media library "Back up packer photos" button copies pack-
-- station photos to the office NAS (/Volumes/USAV Media/Packing/Shipping
-- Packing Photos/<date packed>/<order id | tracking>/) through the same NAS
-- agent /archive call the Unbox claim archive uses. Each copied photo gets a
-- 'completed' photo_jobs row of this type so the next run resumes where the last
-- one stopped and never re-copies a photo.
--
-- Safety gating: CHECK widening only — every existing row still satisfies it.
-- The only writer (src/lib/photos/packer-nas-backup.ts) passes organization_id.
--
-- Rollback (only once no 'packer_nas_backup' rows remain):
--   ALTER TABLE photo_jobs DROP CONSTRAINT chk_photo_jobs_type;
--   ALTER TABLE photo_jobs ADD CONSTRAINT chk_photo_jobs_type
--     CHECK (job_type IN ('analyze', 'nas_mirror', 'export_drive'));
--
-- Verify:
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'chk_photo_jobs_type';

ALTER TABLE photo_jobs DROP CONSTRAINT IF EXISTS chk_photo_jobs_type;
ALTER TABLE photo_jobs ADD CONSTRAINT chk_photo_jobs_type
  CHECK (job_type IN ('analyze', 'nas_mirror', 'export_drive', 'packer_nas_backup'));

CREATE INDEX IF NOT EXISTS idx_photo_jobs_packer_nas_backup_done
  ON photo_jobs (organization_id, photo_id)
  WHERE job_type = 'packer_nas_backup' AND status = 'completed';
