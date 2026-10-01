import type { RecordStateFace } from './record';

/**
 * A repair ticket's stored status as the card and the badges read it (owner
 * 2026-09-29): the rail + status tone, the glyph and the short code. Tones are
 * `STATE_TONE_CLASSES` names; this is the ONE repair status → tone map
 * (`@/lib/repair-status` badges read their hue from it). Keys are the stored
 * `repair_service.status` values; operator wording stays in `@/lib/repair-status`.
 */
export const REPAIR_STATUS: Readonly<Record<string, RecordStateFace>> = {
  'Incoming Shipment': { id: 'Incoming Shipment', code: 'INC', label: 'Incoming Shipment', tone: 'info', icon: 'truck' },
  'Pending Repair': { id: 'Pending Repair', code: 'RPR', label: 'Pending Repair', tone: 'info', icon: 'circle-dot' },
  'Awaiting Parts': { id: 'Awaiting Parts', code: 'PRT', label: 'Awaiting Parts', tone: 'warning', icon: 'clock' },
  'Awaiting Additional Parts Payment': {
    id: 'Awaiting Additional Parts Payment',
    code: 'PPAY',
    label: 'Awaiting Additional Parts Payment',
    tone: 'warning',
    icon: 'clock',
  },
  'Repaired, Contact Customer': {
    id: 'Repaired, Contact Customer',
    code: 'CALL',
    label: 'Repaired, Contact Customer',
    tone: 'info',
    icon: 'package-check',
  },
  'Awaiting Payment': { id: 'Awaiting Payment', code: 'PAY', label: 'Awaiting Payment', tone: 'danger', icon: 'alarm-clock' },
  'Awaiting Pickup': { id: 'Awaiting Pickup', code: 'PICK', label: 'Awaiting Pickup', tone: 'success', icon: 'package' },
  Shipped: { id: 'Shipped', code: 'SHP', label: 'Shipped', tone: 'neutral', icon: 'truck' },
  'Picked Up': { id: 'Picked Up', code: 'PKU', label: 'Picked Up', tone: 'neutral', icon: 'package-check' },
  Done: { id: 'Done', code: 'DONE', label: 'Done', tone: 'success', icon: 'package-check' },
  Cancelled: { id: 'Cancelled', code: 'CXL', label: 'Cancelled', tone: 'neutral', icon: 'package-x' },
};

/** A status nobody mapped (free-text legacy values) — neutral, labelled as stored. */
export function repairStatusFace(status: string | null | undefined): RecordStateFace {
  const stored = (status || '').trim();
  return REPAIR_STATUS[stored] ?? { id: stored || 'unknown', code: 'RS', label: stored || 'No status', tone: 'neutral', icon: 'circle-dot' };
}
