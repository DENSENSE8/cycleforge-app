-- Serial projection carries unit_uid (QC instant print,
-- docs/handoff/HANDOFF-qc-instant-print-2026-10-07.md).
--
-- The /test scan station prints a unit label on Pass with zero network round
-- trips, so the label's unit id must already be on the line row's first frame.
-- toSerialProjection (src/lib/receiving/serial-projection.ts) now writes
-- { id, serial_number, condition_grade, unit_uid }; this one-shot backfill
-- stamps unit_uid onto every existing projection element from serial_units.
--
-- Idempotent: re-running rewrites each element with the same unit_uid
-- (jsonb || overwrites the key). Element order is preserved via
-- WITH ORDINALITY. Elements whose serial_unit no longer exists get
-- unit_uid = null (the authoritative ?include=serials read reconciles).
--
-- Safety: data-only rewrite of a tenant-scoped column; joins are org-matched.
-- No DDL beyond the COMMENT.
--
-- Rollback: none needed — readers treat unit_uid as optional; the next
-- refreshLineSerialProjection rewrites the array anyway.
--
-- Verify:
--   SELECT count(*) FROM receiving_line_testing
--    WHERE jsonb_array_length(serial_projection) > 0
--      AND NOT (serial_projection -> 0 ? 'unit_uid');   -- 0

BEGIN;

COMMENT ON COLUMN receiving_line_testing.serial_projection IS
  'Denormalized array of {id, serial_number, condition_grade, unit_uid} for the serials whose CURRENT receiving line is this line. Fast-default for first-frame display; maintained by refreshLineSerialProjection, reconciled by the authoritative ?include=serials path. See docs/todo/receiving-serial-immediate-display-plan.md Tier B2.';

WITH rebuilt AS (
  SELECT t.receiving_line_id,
         jsonb_agg(
           e.elem || jsonb_build_object('unit_uid', su.unit_uid)
           ORDER BY e.ord
         ) AS arr
    FROM receiving_line_testing t
    CROSS JOIN LATERAL jsonb_array_elements(t.serial_projection) WITH ORDINALITY AS e(elem, ord)
    LEFT JOIN serial_units su
      ON su.id = (e.elem ->> 'id')::bigint
     AND su.organization_id = t.organization_id
   WHERE jsonb_typeof(t.serial_projection) = 'array'
     AND jsonb_array_length(t.serial_projection) > 0
   GROUP BY t.receiving_line_id
)
UPDATE receiving_line_testing t
   SET serial_projection = rebuilt.arr,
       updated_at        = now()
  FROM rebuilt
 WHERE rebuilt.receiving_line_id = t.receiving_line_id
   AND t.serial_projection IS DISTINCT FROM rebuilt.arr;

COMMIT;
