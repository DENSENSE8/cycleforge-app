-- 2026-07-14c: shorten NOT_SERIALIZED display label for narrow chip width
--
-- The committed no-serial bar truncates long labels; "Not serialized" → "No Serial"
-- matches the built-in registry (serial-absent-reasons.ts) and fits the control.
-- Idempotent: only rows still carrying the old built-in label are touched.

UPDATE reason_codes
   SET label = 'No Serial'
 WHERE flow_context = 'serial_absent_reason'
   AND code = 'NOT_SERIALIZED'
   AND label = 'Not serialized';
