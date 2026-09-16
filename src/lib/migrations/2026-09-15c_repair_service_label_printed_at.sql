-- repair_service.label_printed_at — the 2x1 internal-insurance label stamp.
--
-- WHAT: one nullable timestamptz on repair_service recording when the counter
-- printed the 2x1 REP-{id} sticker (printRepairLabel). NULL = the label still
-- needs printing; that is the "Needs label" queue facet (repair-service list
-- API `?needsLabel=1`). Deliberately a DATA facet, not a new status value —
-- repair_service.status is free text with two live spellings of "released"
-- (see docs/todo/repair-chain-closure-GEMINI-RESEARCH-BRIEFING.md G6) and this
-- must not add a third.
--
-- WRITER: POST /api/repair-service/[id]/label-printed (org-scoped, audited,
-- stamps only when NULL so a reprint does not move the first-print time).
--
-- SAFETY: additive nullable column; no writer is broken by it. Reads coalesce
-- in the query layer. Idempotent.
--
-- ROLLBACK: `ALTER TABLE repair_service DROP COLUMN IF EXISTS label_printed_at;`
-- VERIFY: `\d repair_service` shows the column; the list API returns it on
-- every RSRecord.

ALTER TABLE repair_service
  ADD COLUMN IF NOT EXISTS label_printed_at TIMESTAMPTZ;
