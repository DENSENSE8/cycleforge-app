/** Why a row left the Incoming list — the ONE derivation, and the faces that render it. */

import {
  isZohoReceivedLikeStatus,
  ZOHO_TERMINAL_STATUSES,
} from '@/lib/receiving/zoho-received-status';
import { resolveWatchState } from '@/lib/receiving/watch-state';

/** The six exits. */
// Derived system states bound to code paths, not an operator-authored
// taxonomy — full rationale directly above. reason-codes-hardcoded
export const INCOMING_REMOVAL_REASONS = [
  'unboxed',
  'written_off',
  'dock_scanned',
  'vendor_received',
  'vendor_cancelled',
  'aged_out',
] as const;

export type IncomingRemovalReason = (typeof INCOMING_REMOVAL_REASONS)[number];

/**
 * The raw facts each exit is read from. Every field is evidence the product
 * already records; nothing here is inferred from another field.
 */
export interface IncomingRemovalSignals {
  /** Carrier reported delivery. */
  delivered: boolean;
  /** An operator scanned it at the dock, in any receiving mode. */
  scanned: boolean;
  /** A linked carton was unboxed, or a linked line has received qty. */
  unboxed: boolean;
  /** An OPEN loss exception (`LOSS_EXCEPTION_CODES`) stands against the carton. */
  writtenOff: boolean;
  /** The purchasing source reports the PO received / billed / closed. */
  vendorReceived: boolean;
  /** The purchasing source reports the PO cancelled / rejected. */
  vendorCancelled: boolean;
  /**
   * Delivered, never dock-scanned, and now older than the delivered-unscanned
   * hunt window — so it has dropped off that tile too. This is the only exit
   * nobody performed: it is the passage of time.
   */
  agedOut: boolean;
}

/** Which exit to name when a carton satisfies more than one. */
export function resolveIncomingRemovalReason(
  signals: IncomingRemovalSignals,
): IncomingRemovalReason | null {
  const watch = resolveWatchState({
    known: true,
    delivered: signals.delivered,
    scanned: signals.scanned,
    unboxed: signals.unboxed,
  });

  if (watch === 'done') return 'unboxed';
  if (signals.writtenOff) return 'written_off';
  // `delivered_not_unboxed` IS "delivered + dock-scanned".
  if (watch === 'delivered_not_unboxed' || signals.scanned) return 'dock_scanned';
  if (signals.vendorReceived) return 'vendor_received';
  if (signals.vendorCancelled) return 'vendor_cancelled';
  if (signals.agedOut) return 'aged_out';
  return null;
}

const TERMINAL_SET: ReadonlySet<string> = new Set(ZOHO_TERMINAL_STATUSES);

/** True for a terminal vendor status that is NOT a receipt (cancelled / rejected). */
export function isVendorCancelledStatus(status: string | null | undefined): boolean {
  const s = String(status ?? '').trim().toLowerCase();
  return s.length > 0 && TERMINAL_SET.has(s) && !isZohoReceivedLikeStatus(s);
}

interface IncomingRemovalReasonFace {
  /** Operator wording. Capability nouns only — never a vendor product sentence. */
  label: string;
  /** Semantic chip classes (bg · text · ring), house tokens only. */
  className: string;
  /** One plain line, rendered VISIBLY beside the chip wherever there is room — the bulk-paste residual list is the first consumer. */
  blurb: string;
  /** The `HoverTooltip` body — says what happened and what it means. */
  tip: string;
}

/** Faces for the six exits. */
export const INCOMING_REMOVAL_REASON_FACE: Record<
  IncomingRemovalReason,
  IncomingRemovalReasonFace
> = {
  unboxed: {
    label: 'Unboxed',
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    blurb: 'Someone opened this carton here.',
    tip: 'Someone opened this carton here — it left Incoming the moment its contents were received.',
  },
  written_off: {
    label: 'Written off',
    className: 'bg-rose-50 text-rose-700 ring-rose-200',
    blurb: 'Recorded as lost, stolen, empty or misdelivered. It is not coming.',
    tip: 'An open loss exception stands against this carton (lost, stolen, empty or misdelivered). It is not coming.',
  },
  dock_scanned: {
    label: 'Scanned in',
    className: 'bg-blue-50 text-blue-700 ring-blue-200',
    blurb: 'Scanned at the dock — it moved to the unbox queue.',
    tip: 'Scanned at the dock but not unboxed yet. It left Incoming for the unbox queue.',
  },
  vendor_received: {
    label: 'PO marked received',
    className: 'bg-amber-50 text-amber-800 ring-amber-200',
    blurb: 'The purchasing source marked this PO received — the box may still be here.',
    tip: 'The purchasing source reports this PO received, billed or closed, so Incoming drops it — even when the box is still physically here. The time shown is when we last synced, not when the vendor changed it.',
  },
  vendor_cancelled: {
    label: 'PO cancelled',
    className: 'bg-rose-50 text-rose-700 ring-rose-200',
    blurb: 'The purchasing source cancelled this PO. Nothing is expected against it.',
    tip: 'The purchasing source reports this PO cancelled or rejected, so Incoming drops it. Nothing is expected against it. The time shown is when we last synced, not when the vendor changed it.',
  },
  aged_out: {
    label: 'Aged out',
    className: 'bg-surface-canvas text-text-muted ring-border-soft',
    blurb: 'Delivered but never scanned, and now past the chase window.',
    tip: 'Delivered, never dock-scanned, and now past the hunt window — so it has fallen off the delivered-and-unscanned list too. Nobody removed it; time did.',
  },
};

/** The recency bound on the "recently removed" lane. */
export const INCOMING_REMOVED_WINDOW_DAYS = 7;

/**
 * How long a delivered-but-unscanned carton stays on the hunt queue before
 * {@link IncomingRemovalSignals.agedOut} becomes true. Mirrors the default
 * window `deliveredUnscannedBaseSql` runs with.
 */
export const DELIVERED_UNSCANNED_WINDOW_DAYS = 14;
