-- Carton delete: a receiving scan may go only with its own carton.
--
-- Why: 2026-10-06d_carton_delete_drops_scans.sql let any transaction that
-- sets app.receiving_carton_delete = on delete ANY receiving_scans row. The
-- intent was narrower: deleting a carton takes its arrival scans with it
-- (the ON DELETE CASCADE from receiving_carton), so test cartons and mistaken
-- scans are fully deletable. A scan whose carton still exists is still
-- evidence, so the armed setting no longer covers a direct scan delete.
--
-- Mechanics: the cascade deletes the scans after the carton row is gone in
-- the same statement, so the guard sees NOT EXISTS for the carton and lets the
-- row go. A direct DELETE FROM receiving_scans finds its carton and is refused.
-- The lookup runs as the invoking role; under tenant RLS it sees the session's
-- org, which is the scan's own org (receiving_scans is FORCE RLS too).
--
-- Safety: function body only (CREATE OR REPLACE); no table or trigger change.
-- Every other table on this guard stays append-only. The E2E fixture branch
-- is unchanged. The only writer that arms the setting is
-- deleteReceivingCartons in src/app/api/receiving-logs/route.ts, which deletes
-- cartons, never scans.
--
-- Verify:
--   BEGIN; SELECT set_config('app.receiving_carton_delete','on',true);
--   DELETE FROM receiving_scans WHERE receiving_id = <live carton>;  -- refused
--   DELETE FROM receiving_carton WHERE id = <that carton>;           -- succeeds
--   ROLLBACK;
--
-- Rollback: re-run the function body from
-- 2026-10-06d_carton_delete_drops_scans.sql.

CREATE OR REPLACE FUNCTION public.guard_evidence_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'receiving_scans'
     AND TG_OP = 'DELETE'
     AND current_setting('app.receiving_carton_delete', true) = 'on'
     AND NOT EXISTS (
       SELECT 1 FROM public.receiving_carton rc WHERE rc.id = OLD.receiving_id
     ) THEN
    RETURN OLD;
  END IF;

  IF TG_TABLE_NAME = 'receiving_scans'
     AND TG_OP = 'DELETE'
     AND current_setting('app.receiving_e2e_cleanup', true) = 'on'
     AND OLD.tracking_number ILIKE 'E2E-%' THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION
    '% is append-only evidence: % is refused. Append a correction event instead (master plan 2.2).',
    TG_TABLE_NAME,
    TG_OP;
END;
$$;
