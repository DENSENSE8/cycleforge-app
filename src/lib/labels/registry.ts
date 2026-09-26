/** Label layer — the seeded default registry + tone→class map. */
import { STATE_TONES } from '@cycleforge/design-tokens';
import { LIFECYCLE, STATE_TONE_CLASSES, type StateName } from '@/design-system/tokens/lifecycle';
import type { LabelKind, LabelPresentation, LabelTone } from './types';

/** Runtime guard: is `v` a known tone token? (validates API input). */
export function isLabelTone(v: unknown): v is LabelTone {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(TONE_CLASSES, v);
}

/** Tone token → { pill, dot } classes. The customizable palette (safelisted). */
export const TONE_CLASSES: Record<LabelTone, { pill: string; dot: string }> = {
  slate: { pill: 'bg-surface-canvas text-text-muted ring-border-soft', dot: 'bg-border-emphasis' },
  yellow: { pill: 'bg-yellow-50 text-yellow-700 ring-yellow-200', dot: 'bg-yellow-500' },
  teal: { pill: 'bg-teal-50 text-teal-700 ring-teal-200', dot: 'bg-teal-500' },
  amber: { pill: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-400' },
  red: { pill: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500' },
  blue: { pill: 'bg-blue-50 text-blue-700 ring-blue-200', dot: 'bg-blue-500' },
  indigo: { pill: 'bg-indigo-50 text-indigo-700 ring-indigo-200', dot: 'bg-indigo-500' },
  emerald: { pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  rose: { pill: 'bg-rose-50 text-rose-700 ring-rose-200', dot: 'bg-rose-500' },
  orange: { pill: 'bg-orange-50 text-orange-700 ring-orange-200', dot: 'bg-orange-500' },
  pink: { pill: 'bg-pink-50 text-pink-700 ring-pink-200', dot: 'bg-pink-500' },
  // The fulfillment state tone: theme-registry classes, not a raw palette step.
  purple: {
    pill: `${STATE_TONE_CLASSES.fulfillment.pill} ${STATE_TONE_CLASSES.fulfillment.ring}`,
    dot: STATE_TONE_CLASSES.fulfillment.dot,
  },
};

/** SVG-stroke twin of {@link TONE_CLASSES}'s `dot` shade — the raw hex a hand-built SVG chart (`GaugeDonut` etc.) needs, since SVG… */
export const TONE_SVG_HEX: Record<LabelTone, string> = {
  slate: '#94a3b8',
  yellow: '#eab308',
  teal: '#14b8a6',
  amber: '#fbbf24', // amber-400 (matches the dot's -400 shade, not -500)
  red: '#ef4444',
  blue: '#3b82f6',
  indigo: '#6366f1',
  emerald: '#10b981',
  rose: '#f43f5e',
  orange: '#f97316',
  pink: '#ec4899',
  purple: STATE_TONES.fulfillment.fill,
};

/** Functional state tone → this palette's token (lifecycle states resolve here). */
const LABEL_TONE_FOR_STATE: Record<StateName, LabelTone> = {
  info: 'blue',
  warning: 'orange',
  fulfillment: 'purple',
  danger: 'red',
  success: 'emerald',
};

const PACKED_TONE = LABEL_TONE_FOR_STATE[LIFECYCLE.packed.tone];

/**
 * System‑default presentation per (kind, code).
 * A state LABEL names what HAS happened (operator ruling 2026-08-30): the
 */
export const LABEL_DEFAULTS: Record<LabelKind, Record<string, LabelPresentation>> = {
  unshipped: {
    // 'Needs label', not 'Awaiting Label':
    AWAITING_LABEL: { label: 'Needs label', description: 'Sold — no tracking or label attached yet. Buy or link a label to move it into the queue.', tone: 'slate' },
    PENDING: { label: 'Pending', description: 'Labeled and queued — waiting for test/pack.', tone: 'yellow' },
    TESTED: { label: 'Tested', description: 'Passed the tech scan — ready to pack.', tone: 'teal' },
    PACKED_STAGED: { label: 'Packed', description: 'Packed and staged at the dock — awaiting scan‑out.', tone: PACKED_TONE },
    BLOCKED: { label: 'Out of stock', description: 'Can’t fulfill until restocked — needs attention.', tone: 'red' },
  },
  outbound: {
    PACKED_STAGED: { label: 'In Staging', description: 'Packed and waiting at the dock — not scanned out yet.', tone: PACKED_TONE },
    SCANNED_OUT: { label: 'Scanned Out', description: 'Scanned out at the dock — left the building; carrier hasn’t confirmed custody.', tone: 'blue' },
    IN_CUSTODY: { label: 'In Custody', description: 'Carrier has it — accepted, in transit, or out for delivery.', tone: 'indigo' },
    DELIVERED: { label: 'Delivered', description: 'Carrier confirmed delivery (terminal).', tone: 'emerald' },
    EXCEPTION: { label: 'Exception', description: 'Carrier exception or stalled — no movement.', tone: 'rose' },
    PROCESS_GAP: { label: 'Process Gap', description: 'Scanned out but no pack record — needs backfill / coaching.', tone: 'orange' },
    ORPHAN: { label: 'Orphan', description: 'Carrier took custody, but it was never scanned out internally.', tone: 'pink' },
  },
};
