/**
 * One print press on the Labels & docs desk, planned before anything prints
 * (owner 2026-09-27: two stations, two stocks). Documents keep the order they
 * were given (card order), split by STOCK; each stock goes to ITS station:
 *
 *   this computer          → the one local pipeline (`printDocuments`)
 *   another named station  → one bridge job per stock (labels batch · paperwork batch),
 *                            cut into jobs of at most `maxPerJob` documents (the wire's cap)
 *   a blocked station      → nothing sent; the press says why
 *
 * Pure — the desk runs the plan.
 */

import type { DeskDocument } from '@/lib/label-prints/print-labels';
import type { PrintStock } from '@/lib/label-prints/print-route';

export interface PressStation {
  stationId: string;
  stationName: string;
  thisComputer: boolean;
}

export interface PressPlan {
  /** Every stock whose station is this computer — one local run, card order kept. */
  local: DeskDocument[];
  /** Bridge jobs for each stock whose station is another computer — one per stock unless it passes the wire cap. */
  remote: Array<{ stock: PrintStock; station: PressStation; documents: DeskDocument[] }>;
  /** A stock that cannot print right now, and why. */
  blocked: Array<{ stock: PrintStock; count: number; reason: string }>;
}

export const PRINT_STOCKS: readonly PrintStock[] = ['label', 'paper'];

export function planPress(
  documents: readonly DeskDocument[],
  target: Record<PrintStock, PressStation | null>,
  blockedReason: (stock: PrintStock) => string | null,
  maxPerJob: number,
): PressPlan {
  const plan: PressPlan = { local: [], remote: [], blocked: [] };
  for (const stock of PRINT_STOCKS) {
    const docs = documents.filter((doc) => doc.stock === stock);
    if (docs.length === 0) continue;
    const station = target[stock];
    // No station picked or heard: this computer prints (its own route ladder ends at the dialog).
    if (!station || station.thisComputer) {
      plan.local.push(...docs);
      continue;
    }
    const reason = blockedReason(stock);
    if (reason) plan.blocked.push({ stock, count: docs.length, reason });
    else for (let at = 0; at < docs.length; at += maxPerJob) plan.remote.push({ stock, station, documents: docs.slice(at, at + maxPerJob) });
  }
  // Local documents print in the order given, whichever stock comes first.
  const order = new Map(documents.map((doc, index) => [doc.key, index]));
  plan.local.sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0));
  return plan;
}

/**
 * "Print all (labels + paperwork)" and the check-set's both-stocks verb: the
 * labels in card order, then the paperwork in the SAME card order so a packer
 * marries label ↔ slip by position; paperwork for orders with no label card
 * follows in its own queue order.
 */
export function marryByCardOrder(
  labelDocs: readonly DeskDocument[],
  paperDocs: readonly DeskDocument[],
): DeskDocument[] {
  const rank = new Map<number, number>();
  for (const doc of labelDocs) if (doc.orderId != null && !rank.has(doc.orderId)) rank.set(doc.orderId, rank.size);
  const indexed = paperDocs.map((doc, index) => ({ doc, index }));
  indexed.sort((a, b) => {
    const ra = a.doc.orderId != null ? (rank.get(a.doc.orderId) ?? Infinity) : Infinity;
    const rb = b.doc.orderId != null ? (rank.get(b.doc.orderId) ?? Infinity) : Infinity;
    return ra === rb ? a.index - b.index : ra - rb;
  });
  return [...labelDocs, ...indexed.map((entry) => entry.doc)];
}
