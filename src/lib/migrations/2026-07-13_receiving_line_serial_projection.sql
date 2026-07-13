-- Denormalized serial projection on the receiving line read-model.
--
-- Goal (docs/todo/receiving-serial-immediate-display-plan.md, Tier B2): make a
-- line's serial numbers a NATIVE column of the read model so EVERY open path —
-- row-click, cold deep-link, arrow-nav — paints serial chips on the FIRST frame
-- with zero extra query. Until now serials were resolved only on the heavy
-- `?include=serials` two-round-trip path (fetchSerialsForLines), which the
-- row-click path lazily fired AFTER the workspace mounted — the visible lag.
--
-- Shape: a compact jsonb array of { id, serial_number, condition_grade } — the
-- exact display subset PoLineRow renders. `rlt` (receiving_line_testing) is
-- already LEFT JOINed in every receiving-lines SELECT, so surfacing this column
-- is free (no new join, reading a jsonb column costs nothing at read time).
--
-- Maintained by refreshLineSerialProjection (src/lib/receiving/serial-projection.ts),
-- called whenever a serial attaches / detaches / re-grades / auto-sorts. The
-- authoritative `?include=serials` path stays as the reconcile that self-heals
-- any projection drift on open — the projection is only the fast default.
--
-- receiving_line_testing is already tenant-scoped (organization_id NOT NULL with
-- the GUC default + established tenant_isolation policy), so no
-- enforce_tenant_isolation() call is needed for a plain column add. Read path is
-- a LEFT JOIN on its PK (receiving_line_id), so no new index is required.

BEGIN;

ALTER TABLE receiving_line_testing
  ADD COLUMN IF NOT EXISTS serial_projection jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN receiving_line_testing.serial_projection IS
  'Denormalized array of {id, serial_number, condition_grade} for the serials whose CURRENT receiving line is this line. Fast-default for first-frame display; maintained by refreshLineSerialProjection, reconciled by the authoritative ?include=serials path. See docs/todo/receiving-serial-immediate-display-plan.md Tier B2.';

-- One-time backfill: populate serial_projection for existing lines from the
-- serials whose CURRENT line resolves to that line. "Current line" is the most
-- recent inventory_events touch, falling back to the frozen RECEIVING_LINE
-- provenance origin — the SAME resolution resolveCurrentReceivingLineIds /
-- currentLineIsMatchSql use, so a returned-then-re-received serial backfills onto
-- the line it's actually on now, not its first-ever PO. Idempotent for a one-shot
-- run; lines with no serials keep the '[]' default. Mirrors the label_printed_at
-- backfill precedent (2026-07-12).
WITH resolved AS (
  SELECT
    su.organization_id,
    su.id,
    su.serial_number,
    su.condition_grade,
    su.created_at,
    COALESCE(
      (SELECT ie.receiving_line_id
         FROM inventory_events ie
        WHERE ie.serial_unit_id = su.id
          AND ie.receiving_line_id IS NOT NULL
          AND ie.organization_id = su.organization_id
        ORDER BY ie.occurred_at DESC, ie.id DESC
        LIMIT 1),
      (SELECT p.origin_id
         FROM serial_unit_provenance p
        WHERE p.serial_unit_id = su.id
          AND p.origin_type = 'RECEIVING_LINE'
          AND p.origin_id IS NOT NULL
          AND p.organization_id = su.organization_id
        ORDER BY p.occurred_at ASC, p.id ASC
        LIMIT 1)
    ) AS line_id
  FROM serial_units su
),
agg AS (
  SELECT organization_id, line_id,
         jsonb_agg(
           jsonb_build_object(
             'id', id,
             'serial_number', serial_number,
             'condition_grade', condition_grade
           )
           ORDER BY created_at ASC, id ASC
         ) AS arr
    FROM resolved
   WHERE line_id IS NOT NULL
   GROUP BY organization_id, line_id
)
UPDATE receiving_line_testing t
   SET serial_projection = agg.arr,
       updated_at        = now()
  FROM agg
 WHERE agg.line_id = t.receiving_line_id
   AND agg.organization_id = t.organization_id;

COMMIT;
