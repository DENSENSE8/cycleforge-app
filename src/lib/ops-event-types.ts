/**
 * ops_events vocabulary — the PURE half, split out of `ops-events.ts`.
 *
 * `ops-events.ts` imports the Neon pool, so anything importing it inherits that
 * graph. This list is a plain string array that client bundles, pure helpers,
 * and DB-free unit tests all need, so it lives in its own dependency-free
 * module and `ops-events.ts` re-exports it — the documented altitude fix in
 * .claude/rules/build-gotchas.md ("put pure label/format helpers in their own
 * dependency-free module; the heavy module re-exports them so server callers
 * keep their import path").
 *
 * The `ops_events.entity_type` vocabulary itself is unchanged and remains the
 * deploy-time-fixed "what business object" axis, pinned byte-for-byte against
 * the DB CHECK by `ops-events.test.ts`.
 */

export const OPS_EVENT_ENTITY_TYPES = [
  'receiving',
  'receiving_line',
  'serial_unit',
  'shipment',
  'order',
  'fba_shipment',
  'repair',
  'warranty_claim',
  'other',
] as const;

export type OpsEntityType = (typeof OPS_EVENT_ENTITY_TYPES)[number];
