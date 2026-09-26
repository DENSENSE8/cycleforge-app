/**
 * Why a row left the Incoming list — the ONE derivation, and the faces that
 * render it.
 *
 * A carton vanishes from Incoming for five different reasons and, until this
 * module, the product named none of them: the row was simply gone. That is the
 * defect the "recently removed" lane and the bulk-paste residual report both
 * exist to fix, and they must give the SAME answer for the same carton — so
 * there is one registry and two consumers, never a `CASE` in the lane's SQL and
 * a second ladder in the panel.
 *
 * **Composed, not re-derived.** The `unboxed` and `dock_scanned` rungs read
 * {@link resolveWatchState} — the warehouse-membership answer the Check rail
 * already shipped — rather than re-testing `unboxed_at IS NOT NULL` here. If a
 * rung's shape does not fit, GROW that function; a parallel ladder is the fork
 * this file is written to prevent.
 *
 * Pure + dependency-light on purpose: the panel is a client component, and the
 * lane resolves reasons on the row rather than in SQL (views stay dumb —
 * kinetic-ledger law 4).
 */

import {
  isZohoReceivedLikeStatus,
  ZOHO_TERMINAL_STATUSES,
} from '@/lib/receiving/zoho-received-status';
import { resolveWatchState } from '@/lib/receiving/watch-state';

/**
 * The six exits. Ordered here as they are ranked — see
 * {@link resolveIncomingRemovalReason} for why physical evidence leads.
 *
 * NOT a tenant vocabulary, and it must not become one. Every value is DERIVED
 * from evidence the system already holds (an unbox stamp, a dock scan, a mirror
 * status) and is bound to a specific arm of both the ladder below and the
 * lane's SQL. A tenant cannot add a seventh way for a row to leave Incoming,
 * and relabelling one in `reason_codes` would rename a derivation rather than a
 * choice. Contrast `receiving_exceptions`, which records what an operator
 * DECIDED and is correctly tenant-relabellable.
 */
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
  /**
   * The purchasing source reports the PO cancelled / rejected.
   *
   * A SEPARATE signal from {@link vendorReceived}, and the reason there are six
   * exits rather than the five the brief listed: both statuses drop the row from
   * Incoming (`ZOHO_TERMINAL_STATUSES` covers them together), but telling an
   * operator a cancelled PO was "received upstream" is precisely the false claim
   * this lane exists to stop making. `zoho-received-status.ts` already keeps the
   * two lists apart for the same reason — a cancelled PO is emphatically not a
   * received one.
   */
  vendorCancelled: boolean;
  /**
   * Delivered, never dock-scanned, and now older than the delivered-unscanned
   * hunt window — so it has dropped off that tile too. This is the only exit
   * nobody performed: it is the passage of time.
   */
  agedOut: boolean;
}

/**
 * Which exit to name when a carton satisfies more than one.
 *
 * **Physical first.** A carton that was unboxed AND marked received upstream
 * left because someone opened it; the ERP status is a second fact about the
 * same box, not the reason it is off the list. That ordering is the house's
 * existing stance — `delivered-unscanned.ts` forbids ERP status from hiding an
 * unscanned box precisely because the floor's own evidence outranks the
 * vendor's — and applying it here keeps one story across both surfaces.
 *
 * Returns `null` when no exit applies: the row has not left, and a lane that
 * showed it would be claiming a removal that never happened.
 */
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
  // `delivered_not_unboxed` IS "delivered + dock-scanned". The bare `scanned`
  // arm catches the carton an operator scanned at the dock before the carrier
  // got round to reporting delivery — physically here either way, and
  // `resolveWatchState` calls that one `in_flight` because it answers a
  // carrier-shaped question. Read the scan directly rather than re-ordering
  // that function: its callers depend on the carrier reading.
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
  /**
   * One plain line, rendered VISIBLY beside the chip wherever there is room —
   * the bulk-paste residual list is the first consumer.
   *
   * A chip has to be short enough for a grid column, which is exactly why it
   * cannot carry the explanation: an operator reading nine hidden rows should
   * not have to hover nine times to learn why each one left. The {@link tip}
   * stays the fuller answer for the grid, where only a chip fits.
   */
  blurb: string;
  /** The `HoverTooltip` body — says what happened and what it means. */
  tip: string;
}

/**
 * Faces for the six exits.
 *
 * **The labels name the THING that changed, not a direction** (reworded
 * 2026-08-03). `vendor_received` / `vendor_cancelled` read "Received upstream"
 * and "Cancelled upstream" until an operator asked, in as many words, what the
 * difference between them was. "Upstream" is our word for the purchasing
 * source, and it is invisible from the floor: it says a direction rather than
 * naming an actor or an object, so the pair read as two shades of one thing.
 * They are not — one is a receipt and the other is a cancellation, and keeping
 * them apart is the entire reason there are six exits rather than five.
 *
 * Saying **PO** instead fixes it at the root: the purchase order is the object
 * whose status flipped, the box is untouched by either, and an operator holds
 * POs in their hands all day. "PO marked received" also keeps the hedge the
 * next paragraph is about — a PO can be marked received while the carton is
 * still sitting on the dock, which is precisely when this chip appears.
 *
 * `vendor_received`'s wording is deliberately hedged: `zoho_po_mirror` records
 * `last_synced_at` (when WE polled), never when the vendor flipped the status,
 * so the product cannot say "received 2h ago" without inventing a transition
 * time. It says what it actually knows — *seen received at the last sync* —
 * until `status_changed_at` exists. Do not tighten this copy before the column
 * does; a fabricated timestamp is worse than an absent one.
 */
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

/**
 * The recency bound on the "recently removed" lane.
 *
 * One constant, not an operator filter: the lane answers *"where did the thing
 * I was just looking at go"*, and a date picker on it would turn a lookup into
 * a report. Widen the constant if the question changes; do not add a control.
 */
export const INCOMING_REMOVED_WINDOW_DAYS = 7;

/**
 * How long a delivered-but-unscanned carton stays on the hunt queue before
 * {@link IncomingRemovalSignals.agedOut} becomes true. Mirrors the default
 * window `deliveredUnscannedBaseSql` runs with.
 */
export const DELIVERED_UNSCANNED_WINDOW_DAYS = 14;
