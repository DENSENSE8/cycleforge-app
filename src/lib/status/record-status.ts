/**
 * Record status — THE one vocabulary for where a record is, per direction
 * (docs/refactors/records/PROMPT-records-sheet.md, Phase 1 slice 5). Every
 * surface that paints, filters, sorts or resolves a record's status reads its
 * key, word, tone and precedence here. Pure and client-safe.
 *
 * Two axes, painted side by side (a finished record shows two greens:
 * Scanned out + Delivered, or Delivered + Received):
 *
 * - INTERNAL — what the warehouse has done.
 *   Outbound: To pick → Picked → Packed → Scanned out (Allocate's words),
 *   plus On hold and Buyer cancel. Inbound: Awaiting tracking → Not received
 *   → Unboxed → Received (operator ruling 2026-10-06).
 * - EXTERNAL — what the carrier says. ONE set for both directions: Label
 *   created → On the way → In transit → Out for delivery → Delivered, plus
 *   Exception and Returned.
 *
 * Inbound, aligned with the receiving workflow's coarse line status
 * (`deriveReceivingLineStatus` in `src/lib/receiving/workflow-stages.ts`:
 * INCOMING → SCANNED → UNBOXED → RECEIVED):
 * - Awaiting tracking = an order with no tracking yet (reason `open_po`
 *   "Ordered · no tracking"; Incoming `?state=AWAITING_TRACKING`).
 * - Not received = not yet opened here: owed, in transit, carrier-delivered,
 *   or sitting scanned at the dock (reasons `in_transit`, `warehouse_owed`,
 *   `delivered_not_scanned`, `scanned`). Reconcile's "delivered" is NOT an
 *   internal status: it is Not received + external Delivered.
 * - Unboxed = the carton was opened (reason `unboxed`; coarse UNBOXED).
 * - Received = units counted into stock — past unboxing (reason
 *   `received_here`; coarse RECEIVED: awaiting test → done).
 *
 * ACCEPTED (the carrier's first acceptance / origin scan / pickup) is
 * **On the way**: the carrier has it and it is leaving us. **In transit** is
 * IN_TRANSIT — moving through the carrier network after acceptance. UNKNOWN
 * maps to no status (nothing is painted rather than a guess).
 */

import type { NormalizedShipmentStatus } from '@/lib/shipping/types';

// ─── Tone ────────────────────────────────────────────────────────────────────

/**
 * A status's tone — a hue key (light vibrant ground + dark ink), mapped to
 * classes ONLY in {@link RECORD_STATUS_TONE_CLASSES}. Hue-named because the
 * operator's spec is hue-named (In transit yellow vs Returned orange; Picked
 * light blue vs On the way blue) and the six lifecycle `StateName` tones
 * cannot tell those apart.
 */
export const RECORD_STATUS_TONES = ['gray', 'blue', 'sky', 'yellow', 'teal', 'green', 'red', 'orange', 'violet'] as const;
export type RecordStatusTone = (typeof RECORD_STATUS_TONES)[number];

export interface RecordStatusToneClasses {
  /** Tinted ground + ink — the pill. */
  pill: string;
  /** Pill ring colour (pair with `ring-1`). */
  ring: string;
  /** Pill / outline border colour (pair with a `border` width). */
  border: string;
  /** The saturated dot / solid fill. */
  dot: string;
  /** Ink on white. */
  ink: string;
}

/**
 * Tone → classes. The `*-50` ground, `*-700` ink and `*-200` ring/border are
 * the audited pairs re-stepped under `html[data-color-scheme='dark']` in
 * `src/styles/globals.css` (the same pairs as `ticket-status.ts` /
 * `task-status.ts`); gray is the semantic surface tokens.
 */
export const RECORD_STATUS_TONE_CLASSES: Readonly<Record<RecordStatusTone, RecordStatusToneClasses>> = {
  gray: {
    pill: 'bg-surface-sunken text-text-secondary',
    ring: 'ring-border-soft',
    border: 'border-border-soft',
    dot: 'bg-text-faint',
    ink: 'text-text-secondary',
  },
  blue: { pill: 'bg-blue-50 text-blue-700', ring: 'ring-blue-200', border: 'border-blue-200', dot: 'bg-blue-500', ink: 'text-blue-700' },
  sky: { pill: 'bg-sky-50 text-sky-700', ring: 'ring-sky-200', border: 'border-sky-200', dot: 'bg-sky-500', ink: 'text-sky-700' },
  yellow: {
    pill: 'bg-yellow-50 text-yellow-700',
    ring: 'ring-yellow-200',
    border: 'border-yellow-200',
    dot: 'bg-yellow-500',
    ink: 'text-yellow-700',
  },
  teal: { pill: 'bg-teal-50 text-teal-700', ring: 'ring-teal-200', border: 'border-teal-200', dot: 'bg-teal-500', ink: 'text-teal-700' },
  green: {
    pill: 'bg-emerald-50 text-emerald-700',
    ring: 'ring-emerald-200',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
    ink: 'text-emerald-700',
  },
  red: { pill: 'bg-red-50 text-red-700', ring: 'ring-red-200', border: 'border-red-200', dot: 'bg-red-500', ink: 'text-red-700' },
  orange: {
    pill: 'bg-orange-50 text-orange-700',
    ring: 'ring-orange-200',
    border: 'border-orange-200',
    dot: 'bg-orange-500',
    ink: 'text-orange-700',
  },
  violet: {
    pill: 'bg-violet-50 text-violet-700',
    ring: 'ring-violet-200',
    border: 'border-violet-200',
    dot: 'bg-violet-500',
    ink: 'text-violet-700',
  },
};

// ─── Shape ───────────────────────────────────────────────────────────────────

export interface RecordStatusSpec {
  label: string;
  tone: RecordStatusTone;
  /**
   * Rank when one record carries several of this axis's statuses (lines,
   * packages, overlapping signals): the LOWEST precedence is painted.
   */
  precedence: number;
}

/** The status painted for a set of keys: the lowest {@link RecordStatusSpec.precedence}; null for none. */
export function leadStatus<K extends string>(table: Readonly<Record<K, RecordStatusSpec>>, keys: Iterable<K>): K | null {
  let best: K | null = null;
  for (const key of keys) {
    if (best === null || table[key].precedence < table[best].precedence) best = key;
  }
  return best;
}

// ─── Outbound internal ───────────────────────────────────────────────────────

/** The outbound pipeline, in walk order — the Live feed's columns, Allocate's stages, the sort order. */
export const OUTBOUND_PIPELINE = ['to_pick', 'picked', 'packed', 'scanned_out'] as const;
export const OUTBOUND_INTERNAL_STATUSES = [...OUTBOUND_PIPELINE, 'on_hold', 'buyer_cancel'] as const;
export type OutboundInternalStatus = (typeof OUTBOUND_INTERNAL_STATUSES)[number];

/**
 * Precedence: Buyer cancel wins over everything (the order left Allocate);
 * then the furthest physical step — Scanned out — then On hold (a held order
 * may not be picked or packed further), then Packed › Picked › To pick.
 */
export const OUTBOUND_INTERNAL_STATUS: Readonly<Record<OutboundInternalStatus, RecordStatusSpec>> = {
  buyer_cancel: { label: 'Buyer cancel', tone: 'red', precedence: 0 },
  scanned_out: { label: 'Scanned out', tone: 'green', precedence: 1 },
  on_hold: { label: 'On hold', tone: 'orange', precedence: 2 },
  packed: { label: 'Packed', tone: 'violet', precedence: 3 },
  picked: { label: 'Picked', tone: 'sky', precedence: 4 },
  to_pick: { label: 'To pick', tone: 'gray', precedence: 5 },
};

export interface OutboundInternalSignals {
  buyerCancelled: boolean;
  /** Dock SHIP_CONFIRM. */
  scannedOut: boolean;
  /** The operator's Hold flag / out of stock / exceptions desk — nobody may pick or pack it yet. */
  onHold?: boolean;
  /** Pack scan. */
  packed: boolean;
  /** Pick scan or serial taken. */
  picked: boolean;
}

/** One order's outbound internal status from its signals, by {@link OUTBOUND_INTERNAL_STATUS} precedence. */
export function resolveOutboundInternalStatus(signals: OutboundInternalSignals): OutboundInternalStatus {
  const held: OutboundInternalStatus[] = ['to_pick'];
  if (signals.buyerCancelled) held.push('buyer_cancel');
  if (signals.scannedOut) held.push('scanned_out');
  if (signals.onHold) held.push('on_hold');
  if (signals.packed) held.push('packed');
  if (signals.picked) held.push('picked');
  return leadStatus(OUTBOUND_INTERNAL_STATUS, held)!;
}

// ─── Inbound internal ────────────────────────────────────────────────────────

/** The inbound pipeline, in walk order — Received comes AFTER Unboxed. */
export const INBOUND_INTERNAL_STATUSES = ['awaiting_tracking', 'not_received', 'unboxed', 'received'] as const;
export type InboundInternalStatus = (typeof INBOUND_INTERNAL_STATUSES)[number];

/**
 * Precedence: the furthest physical fact wins (reconcile's physical-first
 * rule — an unbox or a receive can only advance a record). Tones (operator
 * 2026-10-06): Awaiting tracking gray, Not received yellow, Unboxed teal,
 * Received green.
 */
export const INBOUND_INTERNAL_STATUS: Readonly<Record<InboundInternalStatus, RecordStatusSpec>> = {
  received: { label: 'Received', tone: 'green', precedence: 0 },
  unboxed: { label: 'Unboxed', tone: 'teal', precedence: 1 },
  not_received: { label: 'Not received', tone: 'yellow', precedence: 2 },
  awaiting_tracking: { label: 'Awaiting tracking', tone: 'gray', precedence: 3 },
};

export interface InboundInternalSignals {
  /** The line (or its carton) carries a tracking number. */
  hasTracking: boolean;
  /** Carton opened: `unboxed_at`, or coarse UNBOXED. */
  unboxed: boolean;
  /** Units counted into stock: `quantity_received > 0`, `received_done_at`, or coarse RECEIVED. */
  received: boolean;
}

/** One inbound line's internal status from its signals, by {@link INBOUND_INTERNAL_STATUS} precedence. */
export function resolveInboundInternalStatus(signals: InboundInternalSignals): InboundInternalStatus {
  const held: InboundInternalStatus[] = [signals.hasTracking ? 'not_received' : 'awaiting_tracking'];
  if (signals.unboxed) held.push('unboxed');
  if (signals.received) held.push('received');
  return leadStatus(INBOUND_INTERNAL_STATUS, held)!;
}

// ─── External (carrier) ──────────────────────────────────────────────────────

/** The carrier's walk, in order (Exception / Returned are off the walk). */
export const CARRIER_PIPELINE = ['label_created', 'on_the_way', 'in_transit', 'out_for_delivery', 'delivered'] as const;
export const CARRIER_STATUSES = [...CARRIER_PIPELINE, 'exception', 'returned'] as const;
export type CarrierStatus = (typeof CARRIER_STATUSES)[number];

/**
 * Where the package is relative to the carrier: `pre` = a label, not
 * tendered; `moving` = the carrier has it on the way; `terminal` = the
 * carrier is done with it; `problem` = an exception overlay.
 */
export type CarrierPhase = 'pre' | 'moving' | 'terminal' | 'problem';

export interface CarrierStatusSpec extends RecordStatusSpec {
  phase: CarrierPhase;
}

/**
 * Precedence across a record's packages: what needs a person first
 * (Exception, Returned), then the package furthest BEHIND — a delivered box
 * never hides one still in transit, so Delivered paints only when every
 * package is delivered.
 */
export const CARRIER_STATUS: Readonly<Record<CarrierStatus, CarrierStatusSpec>> = {
  exception: { label: 'Exception', tone: 'red', precedence: 0, phase: 'problem' },
  returned: { label: 'Returned', tone: 'orange', precedence: 1, phase: 'terminal' },
  label_created: { label: 'Label created', tone: 'gray', precedence: 2, phase: 'pre' },
  on_the_way: { label: 'On the way', tone: 'blue', precedence: 3, phase: 'moving' },
  in_transit: { label: 'In transit', tone: 'yellow', precedence: 4, phase: 'moving' },
  out_for_delivery: { label: 'Out for delivery', tone: 'teal', precedence: 5, phase: 'moving' },
  delivered: { label: 'Delivered', tone: 'green', precedence: 6, phase: 'terminal' },
};

/** The normalized carrier category (`shipping_tracking_numbers.latest_status_category`) → its status; UNKNOWN → none. */
export const CARRIER_STATUS_OF_CATEGORY: Readonly<Record<NormalizedShipmentStatus, CarrierStatus | null>> = {
  LABEL_CREATED: 'label_created',
  ACCEPTED: 'on_the_way',
  IN_TRANSIT: 'in_transit',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  EXCEPTION: 'exception',
  RETURNED: 'returned',
  UNKNOWN: null,
};

/** A stored category (any case, or an unknown word) → its status, or null. */
export function carrierStatusOfCategory(category: string | null | undefined): CarrierStatus | null {
  const key = String(category ?? '').trim().toUpperCase();
  return Object.hasOwn(CARRIER_STATUS_OF_CATEGORY, key) ? CARRIER_STATUS_OF_CATEGORY[key as NormalizedShipmentStatus] : null;
}

/** A stored category → its word ("On the way"), or null when it names no status. */
export function carrierStatusLabel(category: string | null | undefined): string | null {
  const status = carrierStatusOfCategory(category);
  return status ? CARRIER_STATUS[status].label : null;
}

/** A stored category → its carrier phase, or null — the category predicates (custody, moved) read this. */
export function carrierPhaseOfCategory(category: string | null | undefined): CarrierPhase | null {
  const status = carrierStatusOfCategory(category);
  return status ? CARRIER_STATUS[status].phase : null;
}
