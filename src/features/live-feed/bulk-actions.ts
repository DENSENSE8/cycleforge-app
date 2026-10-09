/**
 * The Live feed bulk bar's domain facts — which verbs a selection may take
 * and how a scan-out run is planned. Every write rides an existing path:
 * Assign picker → `POST /api/orders/assign` (via `useOrderAssignment`),
 * Print labels / documents → the Labels & docs packets (`PrintPacketsDialog`),
 * Scan out → `POST /api/shipped/scan-out`
 * (`postScanOut`, the dock's own writer — it still refuses a cancelled box),
 * Flag → `live_feed_flags`, Remove from list → `order_list_removals` for
 * orders, `live_feed_dismissals` for the cards no order owns.
 * Client-safe.
 */

import type { PackageCard, PackageLink } from '@/lib/live-feed/types';
import type { PackageStage } from '@/lib/live-feed/stages';
import type { ScanOutResult } from '@/lib/outbound/scan-out-client';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Distinct `orders.id`s of the selection, in selection order — an unlinked card (no order) has none. */
export function selectedOrderRowIds(cards: readonly (Pick<PackageCard, 'orderRowId'> & Partial<Pick<PackageCard, 'link'>>)[]): number[] {
  return [...new Set(cards.filter((card) => (card.link ?? 'order') === 'order').map((card) => card.orderRowId))];
}

/**
 * The order rows a Remove from list may take: order cards still in the
 * building (To pick, Picked, Packed) — a box that left is already off the list.
 */
export function removableOrderRowIds(cards: readonly Pick<PackageCard, 'orderRowId' | 'link' | 'stage'>[]): number[] {
  return [...new Set(cards.filter((card) => card.link === 'order' && card.stage !== 'scanned_out').map((card) => card.orderRowId))];
}

/** Distinct card ids of the selection (an unlinked card's id is negative) — what a Flag writes. */
export function selectedCardIds(cards: readonly Pick<PackageCard, 'orderRowId'>[]): number[] {
  return [...new Set(cards.map((card) => card.orderRowId))];
}

/** The distinct kinds of card selected — a Flag offers only the reasons that fit all of them. */
export function selectedLinks(cards: readonly Pick<PackageCard, 'link'>[]): PackageLink[] {
  return [...new Set(cards.map((card) => card.link))];
}

export const MIXED_REMOVAL_REASON = 'Select only orders or only unlinked packages';

/**
 * What a Remove from list takes: the orders still in the building
 * (`order_list_removals`), or the cards no order owns (`live_feed_dismissals`).
 * The two ask different reasons, so a selection holding both is `mixed` — the
 * verb stays disabled with {@link MIXED_REMOVAL_REASON}.
 */
export type RemovalPlan =
  | { kind: 'orders'; ids: number[] }
  | { kind: 'unlinked'; ids: number[] }
  | { kind: 'mixed' }
  | { kind: 'none' };

export function planRemoval(cards: readonly Pick<PackageCard, 'orderRowId' | 'link' | 'stage'>[]): RemovalPlan {
  const orders = removableOrderRowIds(cards);
  const unlinked = selectedCardIds(cards.filter((card) => card.link !== 'order'));
  if (orders.length > 0 && unlinked.length > 0) return { kind: 'mixed' };
  if (orders.length > 0) return { kind: 'orders', ids: orders };
  if (unlinked.length > 0) return { kind: 'unlinked', ids: unlinked };
  return { kind: 'none' };
}

/**
 * Every selected package sits in `stage` — a stage-bound verb shows only then:
 * Assign picker on To pick, Scan out on Packed.
 */
export function selectionInStage(cards: readonly Pick<PackageCard, 'stage'>[], stage: PackageStage): boolean {
  return cards.length > 0 && cards.every((card) => card.stage === stage);
}

export interface ScanOutPlan {
  /** One label per box — box mates share a shipment, and a box leaves once. */
  labels: string[];
  /** Selected packages with no tracking on file. */
  unlabeled: number;
}

export function planScanOut(cards: readonly Pick<PackageCard, 'shipmentId' | 'tracking'>[]): ScanOutPlan {
  const seen = new Set<string>();
  const labels: string[] = [];
  let unlabeled = 0;
  for (const card of cards) {
    const tracking = card.tracking?.trim();
    if (!tracking) {
      unlabeled += 1;
      continue;
    }
    const box = card.shipmentId != null ? `s:${card.shipmentId}` : `t:${tracking}`;
    if (seen.has(box)) continue;
    seen.add(box);
    labels.push(tracking);
  }
  return { labels, unlabeled };
}

/** The toast for a finished run; `null` results are labels whose request failed. */
export function describeScanOut(
  results: readonly (ScanOutResult | null)[],
  unlabeled: number,
): { ok: boolean; message: string } {
  let sent = 0;
  let already = 0;
  let refused = 0;
  let failed = 0;
  for (const result of results) {
    if (result == null) failed += 1;
    else if (result.blocked || result.matched === false) refused += 1;
    else if (result.duplicate) already += 1;
    else sent += 1;
  }
  const notes: string[] = [];
  if (already > 0) notes.push(`${plural(already, 'box', 'boxes')} already scanned out`);
  if (refused > 0) notes.push(`${plural(refused, 'box', 'boxes')} refused — not packed or cancelled`);
  if (failed > 0) notes.push(`${plural(failed, 'box', 'boxes')} failed — retry`);
  if (unlabeled > 0) notes.push(`${plural(unlabeled, 'package')} skipped — no label`);
  const tail = notes.join(' · ');
  if (sent === 0) return { ok: false, message: tail || 'Nothing to scan out' };
  return { ok: true, message: `Scanned out ${plural(sent, 'box', 'boxes')}${tail ? ` · ${tail}` : ''}` };
}
