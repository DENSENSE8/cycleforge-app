-- ============================================================================
-- 2026-09-28_receiving_exceptions_carton_scope.sql
--
-- A ticket filed from a carton always carries a reason (owner 2026-09-28), and
-- that reason is a receiving_exceptions row. A lineless carton (an unfound
-- placeholder: 203 of the 237 carton-anchored tickets today) has no line to
-- key the row on, so receiving_line_id becomes nullable: NULL = a carton-level
-- exception keyed by receiving_id. The CHECK keeps every row anchored.
--
-- SAFETY: additive. Existing rows all carry a line id (the CHECK validates
-- them). Every existing reader filters by receiving_line_id = <a line> or by
-- receiving_id, so a NULL-line row is invisible to line readers by
-- construction (NULL never equals a line id). Writer: recordReceivingException
-- (src/lib/receiving/exceptions.ts) via recordTicketReason.
--
-- ROLLBACK: DELETE FROM receiving_exceptions WHERE receiving_line_id IS NULL;
--           ALTER TABLE receiving_exceptions DROP CONSTRAINT IF EXISTS receiving_exceptions_anchor_chk;
--           ALTER TABLE receiving_exceptions ALTER COLUMN receiving_line_id SET NOT NULL;
-- VERIFY: \d receiving_exceptions → receiving_line_id nullable, anchor CHECK present.
-- ============================================================================

ALTER TABLE receiving_exceptions ALTER COLUMN receiving_line_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'receiving_exceptions_anchor_chk'
       AND conrelid = 'receiving_exceptions'::regclass
  ) THEN
    ALTER TABLE receiving_exceptions
      ADD CONSTRAINT receiving_exceptions_anchor_chk
      CHECK (receiving_line_id IS NOT NULL OR receiving_id IS NOT NULL);
  END IF;
END $$;

COMMENT ON COLUMN receiving_exceptions.receiving_line_id IS
  'The line the exception is on; NULL = carton-level (keyed by receiving_id, e.g. a lineless unfound carton).';
