/** ops_events vocabulary — the PURE half, split out of `ops-events.ts`. */

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
  'location',
] as const;

export type OpsEntityType = (typeof OPS_EVENT_ENTITY_TYPES)[number];
