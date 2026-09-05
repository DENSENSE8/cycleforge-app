/**
 * Label layer — the seeded default registry + tone→class map.
 *
 * `LABEL_DEFAULTS` is the single system seed for every lifecycle label that was
 * previously a hand‑written `*_STATE_META` map + inline lane order/icon. Phase 2
 * copies these rows into `reason_codes` as the system defaults; the per‑org
 * overrides layer over them through `resolveLabel`.
 *
 * `TONE_CLASSES` reproduces the EXACT Tailwind strings the old `*_STATE_META`
 * used (verified byte‑identical by `labels/resolve.test.ts`), so moving the data
 * here is zero visual change. Every class below already appears in the codebase,
 * so Tailwind's content scan still generates them.
 */
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
};

/**
 * SVG-stroke twin of {@link TONE_CLASSES}'s `dot` shade — the raw hex a hand-built
 * SVG chart (`GaugeDonut` etc.) needs, since SVG `stroke`/`fill` ignore Tailwind
 * utility classes (see `charts/chart-theme.ts` for the same sanctioned exception).
 * Each hex is the Tailwind default for that tone's dot shade, so a KPI donut arc
 * and the matching status dot in the board render the *same* hue from the *same*
 * seeded tone. Keep these in lock-step with the `dot:` shades above.
 */
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
};

/**
 * System‑default presentation per (kind, code). PACKED_STAGED appears in BOTH
 * kinds with different labels ('Packed' inbound seam vs 'In Staging' outbound)
 * — exactly why labels key on (kind, code), not code alone. The
 * no‑two‑dots‑share‑a‑hue invariant is preserved by the distinct tones.
 *
 * A state LABEL names what HAS happened (operator ruling 2026-08-30): the
 * To‑ship pill reads 'Packed', never 'Packed · Staged' — the next step is the
 * queue's job, and the staging detail stays in the description. The outbound
 * kind's 'In Staging' is a different desk (the dock legend) and stays.
 */
export const LABEL_DEFAULTS: Record<LabelKind, Record<string, LabelPresentation>> = {
  unshipped: {
    // 'Needs label', not 'Awaiting Label': this state now sits IN the To-ship
    // queue beside Pending / Tested / Packed (2026-08-30), where the pill has
    // to say what the operator must DO about the row, not what has passively
    // happened to it. Every neighbour on that pill names an act.
    AWAITING_LABEL: { label: 'Needs label', description: 'Sold — no tracking or label attached yet. Buy or link a label to move it into the queue.', tone: 'slate' },
    PENDING: { label: 'Pending', description: 'Labeled and queued — waiting for test/pack.', tone: 'yellow' },
    TESTED: { label: 'Tested', description: 'Passed the tech scan — ready to pack.', tone: 'teal' },
    PACKED_STAGED: { label: 'Packed', description: 'Packed and staged at the dock — awaiting scan‑out.', tone: 'amber' },
    BLOCKED: { label: 'Out of stock', description: 'Can’t fulfill until restocked — needs attention.', tone: 'red' },
  },
  outbound: {
    PACKED_STAGED: { label: 'In Staging', description: 'Packed and waiting at the dock — not scanned out yet.', tone: 'amber' },
    // Parcel network faces (EasyPost / AfterShip): Pre-Transit = handed off,
    // no first scan; In Transit = carrier custody. Dock columns still say
    // Scanned out — this is the STATUS pill, not the station stamp.
    SCANNED_OUT: { label: 'Pre-Transit', description: 'Handed to the carrier — waiting for the first network scan.', tone: 'blue' },
    IN_CUSTODY: { label: 'In Transit', description: 'Carrier has it — picked up, in transit, or out for delivery.', tone: 'indigo' },
    DELIVERED: { label: 'Delivered', description: 'Carrier confirmed delivery (terminal).', tone: 'emerald' },
    EXCEPTION: { label: 'Exception', description: 'Carrier exception or stalled — no movement.', tone: 'rose' },
    PROCESS_GAP: { label: 'Process Gap', description: 'Scanned out but no pack record — needs backfill / coaching.', tone: 'orange' },
    ORPHAN: { label: 'Orphan', description: 'Carrier took custody, but it was never scanned out internally.', tone: 'pink' },
  },
};
