/**
 * Shared transform for the Unbox "Unboxed" rail feed (`feed=unboxRecent`,
 * `view=unbox_opened`).
 *
 * ONE SoT so the client fetcher (`buildUnboxReceivedFetcher` in `./feeds`) and
 * the RSC first-paint seed (`seedUnboxRecentRail`) produce byte-identical rows.
 * A divergent `client_event_id` between seed and fetch would flip the rail's
 * AnimatePresence reconcile keys and remount the whole Unboxed list — the same
 * flicker the durable `carton:{id}` key exists to prevent.
 *
 * Server-safe: no `'use client'` imports (the carton key lives in the
 * dependency-free `rail-carton-key`, and `po-group-title` is type-only), so the
 * server seed can call this without pulling client-reference proxies.
 */
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { stampCartonRailTitleContext } from '@/lib/receiving/po-group-title';
import {
  receivingRailCartonKey,
  receivingRailRowKey,
} from '@/lib/receiving/rail/rail-carton-key';

/** Rendered-row cap for the Unbox "Unboxed" rail (also the fetch/seed limit). */
export const UNBOX_SIDEBAR_LIMIT = 50;

/**
 * Dedup `view=unbox_opened` rows by carton (preserving SQL first-open order —
 * never re-sort by time, the server owns that axis), prefer a real line over a
 * stub, stamp carton-level title context, and attach the durable
 * `carton:{receiving_id}` `client_event_id`.
 */
export function transformUnboxOpenedRows(
  opened: ReceivingLineRow[],
): ReceivingLineRow[] {
  const bestByCarton = new Map<number, ReceivingLineRow>();
  const order: number[] = [];
  for (const row of opened) {
    const rid = row.receiving_id;
    if (rid == null || !Number.isFinite(Number(rid))) continue;
    const existing = bestByCarton.get(rid);
    if (!existing) {
      bestByCarton.set(rid, row);
      order.push(rid);
      continue;
    }
    const existingIsStub = existing.id < 0;
    const nextIsStub = row.id < 0;
    if (existingIsStub && !nextIsStub) {
      bestByCarton.set(rid, row);
    }
  }

  // Shipment-first key (`stn:{tracking}`), so the row a tracking scan already
  // put on the rail is the SAME element the authoritative feed returns — the
  // pending stub upgrades in place instead of exiting and re-entering. Rows with
  // no tracking (typed order#, local pickup) keep `carton:{id}`.
  //
  // The `seen` guard is the collision floor: the server resolves a tracking to
  // at most ONE carton (`resolveShipmentForScan`), but nothing in the schema
  // makes `receiving_carton.shipment_id` unique, so two cartons sharing a
  // tracking would otherwise render under one React key. The second one falls
  // back to its carton key rather than silently colliding.
  const seen = new Set<string | number>();
  return stampCartonRailTitleContext(
    opened,
    order.map((rid) => bestByCarton.get(rid)!).slice(0, UNBOX_SIDEBAR_LIMIT),
  ).map((r) => {
    const preferred = receivingRailRowKey(r);
    const key = seen.has(preferred)
      ? receivingRailCartonKey(r.receiving_id as number)
      : preferred;
    seen.add(key);
    return { ...r, client_event_id: String(key) };
  });
}
