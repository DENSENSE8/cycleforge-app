-- Durable "no serial" waiver for the Unbox progress stepper's Serial step.
--
-- The green-check no-serial waiver (NoSerialControl) is the legitimate way to
-- COMPLETE serial capture for cables / bulk parts / returns that carry no
-- serial. Until now it lived ONLY as ephemeral client state in
-- useUnboxLineController (reset per line, invisible to the server), so the
-- stepper's Serial dot — which derives from receiving_line.serials — never
-- flipped done on a waived line, and the waiver was lost on refresh / another
-- device. This promotes it to real columns on receiving_line_testing (the
-- line-facts home that already holds condition_set_at / label_printed_at /
-- serial_projection), so the Serial step derives from the SoT, survives refresh,
-- and is queryable — exactly like the Print step's label_printed_at (2026-07-12).
--
-- serial_absent        — the waiver flag (a serial was intentionally not captured).
-- serial_absent_reason — the Class-D `serial_absent_reason` vocabulary code
--                        (NOT_SERIALIZED / UNREADABLE / MISSING_LABEL / BULK / …).
--                        Org-customizable, validated at the app layer (mirrors
--                        return_reason on receiving_line_return) — no DB CHECK.
--
-- Writer: POST /api/receiving/lines/[id]/serial-absent (toggle: set true+reason,
-- or clear to false+null). NOT first-wins — the operator can turn the waiver on
-- and off, so the upsert writes the exact value passed.
--
-- No backfill: false is the correct default for historical lines — we have no
-- signal that a past line's missing serial was a deliberate waiver vs. a not-yet
-- -captured one, and received lines are out of the unbox queue where the stepper
-- shows. New waivers stamp forward from here.
--
-- receiving_line_testing is already tenant-scoped (organization_id NOT NULL with
-- the GUC default + established tenant_isolation policy), so no
-- enforce_tenant_isolation() call is needed for a plain column add. Read path is
-- a LEFT JOIN on its PK (receiving_line_id), so no new index is required.

BEGIN;

ALTER TABLE receiving_line_testing
  ADD COLUMN IF NOT EXISTS serial_absent boolean NOT NULL DEFAULT false;

ALTER TABLE receiving_line_testing
  ADD COLUMN IF NOT EXISTS serial_absent_reason text;

COMMENT ON COLUMN receiving_line_testing.serial_absent IS
  'Operator waived the serial for this line (no serial: cable/bulk/return). Completes the Unbox stepper Serial step alongside a captured serial. Set by POST /api/receiving/lines/[id]/serial-absent.';

COMMENT ON COLUMN receiving_line_testing.serial_absent_reason IS
  'Class-D serial_absent_reason vocabulary code for the waiver (NOT_SERIALIZED / UNREADABLE / MISSING_LABEL / BULK / org-custom). App-layer validated; NULL when serial_absent is false.';

COMMIT;
