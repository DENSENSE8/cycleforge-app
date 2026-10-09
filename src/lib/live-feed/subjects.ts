/**
 * What a Live feed card id names — the subject a flag, a dismissal or a pair
 * writes against. An order card is its `orders.id`; an unlinked box is the
 * negative shipment id; an unmatched dock scan is `-(1e9 + scan id)` (the
 * first `station_activity_logs.id` of that scanned text in the window, see
 * `load.ts`). Client-safe.
 */

export const UNLINKED_SCAN_ID_BASE = 1_000_000_000;

export const unlinkedPackageId = (shipmentId: number): number => -shipmentId;
export const unlinkedScanId = (scanId: number): number => -(UNLINKED_SCAN_ID_BASE + scanId);

export type CardSubject =
  | { kind: 'order'; orderId: number }
  | { kind: 'package'; shipmentId: number }
  | { kind: 'scan'; scanId: number };

export function cardSubject(cardId: number): CardSubject | null {
  if (!Number.isSafeInteger(cardId) || cardId === 0) return null;
  if (cardId > 0) return { kind: 'order', orderId: cardId };
  if (-cardId > UNLINKED_SCAN_ID_BASE) return { kind: 'scan', scanId: -cardId - UNLINKED_SCAN_ID_BASE };
  return { kind: 'package', shipmentId: -cardId };
}
