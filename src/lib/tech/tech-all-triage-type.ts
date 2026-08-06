/**
 * Tech All triage — Type vocabulary for the cross-entity priority list on `/test`.
 * Labels are start-aligned grid labels (not magnitudes).
 */

export const TECH_ALL_TRIAGE_TYPES = [
  'order',
  'repair',
  'pickup',
  'return',
  'purchase_order',
] as const;

export type TechAllTriageType = (typeof TECH_ALL_TRIAGE_TYPES)[number];

export const TECH_ALL_TRIAGE_TYPE_LABEL: Record<TechAllTriageType, string> = {
  order: 'Order',
  repair: 'Repair service',
  pickup: 'Local pickup',
  return: 'Return',
  purchase_order: 'Purchase order',
};
