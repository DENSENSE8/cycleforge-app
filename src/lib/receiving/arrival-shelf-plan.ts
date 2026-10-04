/**
 * Arrival urgency shelves — the pure half: which shelf a carton goes on, whether
 * a scanned shelf is an acceptable place, and the order Unbox works the shelves.
 *
 * Shelves are `locations` rows with `arrival_priority_tier` set (migration
 * 2026-10-03). The IO half is `arrival-shelves.ts`.
 */

import { arrivalTierLabel, type ArrivalTier } from '@/lib/receiving/arrival-tier';

export interface ArrivalShelf {
  id: number;
  /** Printed label value — what the operator scans. */
  barcode: string;
  /** Operator-facing face (display name, else name). */
  face: string;
  tier: ArrivalTier;
  /** `locations.capacity` in cartons; null = no limit. */
  capacity: number | null;
  /** Arrived, not-yet-opened cartons on this shelf now (the carton being placed excluded). */
  occupied: number;
  sortOrder: number;
}

export type ShelfSuggestion =
  | { kind: 'no_shelves'; wantedTier: ArrivalTier; message: string }
  | { kind: 'full'; wantedTier: ArrivalTier; message: string }
  | {
      kind: 'shelf';
      wantedTier: ArrivalTier;
      shelf: ArrivalShelf;
      /** The shelf is less urgent than the carton (wanted tier full or absent). */
      overflow: boolean;
      message: string;
    };

export const NO_URGENCY_SHELVES_MESSAGE = 'No urgency shelves configured';

function hasRoom(shelf: ArrivalShelf): boolean {
  return shelf.capacity == null || shelf.occupied < shelf.capacity;
}

function byShelfOrder(a: ArrivalShelf, b: ArrivalShelf): number {
  return a.tier - b.tier || a.sortOrder - b.sortOrder || a.id - b.id;
}

/**
 * The shelf for a carton of `wantedTier`: the first shelf of that tier with
 * room (shelf order); when that tier is full or has no shelf, the next
 * LESS-urgent tier with room, flagged as overflow. Never a more-urgent shelf —
 * a cheap carton on the Priority shelf jumps the unbox queue.
 */
export function suggestArrivalShelf(
  shelves: readonly ArrivalShelf[],
  wantedTier: ArrivalTier,
): ShelfSuggestion {
  if (shelves.length === 0) {
    return { kind: 'no_shelves', wantedTier, message: NO_URGENCY_SHELVES_MESSAGE };
  }
  const ordered = shelves.filter((s) => s.tier >= wantedTier).sort(byShelfOrder);
  const pick = ordered.find(hasRoom);
  const wantedLabel = arrivalTierLabel(wantedTier);
  if (!pick) {
    const any = ordered.length > 0;
    return {
      kind: 'full',
      wantedTier,
      message: any
        ? `Every ${wantedLabel}-or-lower shelf is full`
        : `No ${wantedLabel}-or-lower shelf is set up`,
    };
  }
  const overflow = pick.tier !== wantedTier;
  const wantedExists = ordered.some((s) => s.tier === wantedTier);
  return {
    kind: 'shelf',
    wantedTier,
    shelf: pick,
    overflow,
    message: overflow
      ? `${wantedLabel} shelf ${wantedExists ? 'full' : 'not set up'} — overflow to ${arrivalTierLabel(pick.tier)}`
      : `Place on ${pick.face} · ${wantedLabel}`,
  };
}

export type ShelfConfirmVerdict =
  | { ok: true; shelf: ArrivalShelf }
  | { ok: false; reason: 'not_arrival_shelf' | 'wrong_tier' | 'shelf_full' | 'no_shelves'; message: string };

/**
 * May the carton go on the shelf the operator scanned? It must be an active
 * urgency shelf, of the tier the suggestion chose (any shelf of that tier — a
 * rack may hold two Priority shelves), with room. When every acceptable shelf
 * is full the operator may still double-stack on a shelf of the wanted tier or
 * lower: the box is physically somewhere and the system must say where.
 */
export function checkShelfConfirm(
  scanned: ArrivalShelf | null,
  suggestion: ShelfSuggestion,
): ShelfConfirmVerdict {
  if (suggestion.kind === 'no_shelves') {
    return { ok: false, reason: 'no_shelves', message: NO_URGENCY_SHELVES_MESSAGE };
  }
  if (!scanned) {
    return {
      ok: false,
      reason: 'not_arrival_shelf',
      message: 'That label is not an urgency shelf',
    };
  }
  if (suggestion.kind === 'full') {
    return scanned.tier >= suggestion.wantedTier
      ? { ok: true, shelf: scanned }
      : {
          ok: false,
          reason: 'wrong_tier',
          message: `${scanned.face} is ${arrivalTierLabel(scanned.tier)} — this carton is ${arrivalTierLabel(suggestion.wantedTier)}`,
        };
  }
  const target = suggestion.shelf;
  if (scanned.tier !== target.tier) {
    return {
      ok: false,
      reason: 'wrong_tier',
      message: `Wrong shelf — ${scanned.face} is ${arrivalTierLabel(scanned.tier)}; place on ${target.face} (${arrivalTierLabel(target.tier)})`,
    };
  }
  if (scanned.id !== target.id && !hasRoom(scanned)) {
    return { ok: false, reason: 'shelf_full', message: `${scanned.face} is full — place on ${target.face}` };
  }
  return { ok: true, shelf: scanned };
}

export interface UnboxNextSortKey {
  receivingId: number;
  /** The tier the carton is worked at: its shelf's tier, else its own resolved tier. */
  tier: ArrivalTier;
  /** Shelf order (null = not on an urgency shelf → after the shelved cartons of its tier). */
  shelfSortOrder: number | null;
  shelfId: number | null;
  /** ISO time the carton came through the door; null sorts last. */
  doorReceivedAt: string | null;
}

/**
 * Unbox-next order: most urgent tier first; within a tier shelf by shelf
 * (rack order), unshelved last; within a shelf oldest first — a physical
 * shelf is FIFO, the box that has waited longest is at the front.
 */
function compareUnboxNext(a: UnboxNextSortKey, b: UnboxNextSortKey): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  const aShelved = a.shelfId != null;
  const bShelved = b.shelfId != null;
  if (aShelved !== bShelved) return aShelved ? -1 : 1;
  if (aShelved && bShelved) {
    const bySort = (a.shelfSortOrder ?? 0) - (b.shelfSortOrder ?? 0);
    if (bySort !== 0) return bySort;
    if (a.shelfId !== b.shelfId) return (a.shelfId ?? 0) - (b.shelfId ?? 0);
  }
  const at = a.doorReceivedAt ? Date.parse(a.doorReceivedAt) : Number.POSITIVE_INFINITY;
  const bt = b.doorReceivedAt ? Date.parse(b.doorReceivedAt) : Number.POSITIVE_INFINITY;
  if (at !== bt) return at < bt ? -1 : 1;
  return a.receivingId - b.receivingId;
}

export function orderUnboxNext<T extends UnboxNextSortKey>(rows: readonly T[]): T[] {
  return [...rows].sort(compareUnboxNext);
}
