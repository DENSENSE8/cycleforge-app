/**
 * Ordering and coalescing for session writes that ride BEHIND the scan.
 *
 * PURE. No DB, no scheduler, no clock. The queue that actually posts these
 * lives in ./session-write-queue.ts; this module is the part that has to be
 * provably right, so it is the part with no I/O in it.
 *
 * ── WHY ORDER IS NOT ARRIVAL ORDER ──────────────────────────────────────────
 *
 * Session attribution is asynchronous by design: the wedge listener yields the
 * main thread before `onScan` runs, the UI confirms the scan optimistically,
 * and the session write is enqueued and never awaited. That is what keeps a
 * PO receive at wedge speed — but it means six scans fired in two seconds
 * arrive at the server in whatever order the network delivered, and a retried
 * write arrives after scans that happened later than it did.
 *
 * So ORDER IS CARRIED, NOT OBSERVED. `occurredAt` is minted on the client when
 * the wedge fires and travels with the write; nothing downstream may re-derive
 * it from arrival time, insertion id, or `now()` at the server. A serial
 * BIGSERIAL id is exactly the wrong tiebreak here — it records when the row
 * landed, which is the thing async writes scramble.
 *
 * TIES BREAK BY `clientEventId`. Two scans inside the same millisecond are
 * ordinary on a fast wedge, and an unstable sort would let the same burst
 * render in two different orders on two devices. The uuid is arbitrary but it
 * is the SAME arbitrary on every consumer, which is all a tiebreak has to be.
 *
 * ── WHY DEDUPE HERE AS WELL AS AT THE DB ────────────────────────────────────
 *
 * `client_event_id` is UNIQUE on both spines and the server claim-or-replays,
 * so a duplicate can never double-write. But a duplicate still in the local
 * pending list would double-COUNT in the burst fold below — the operator's
 * "14 items this session" would read 15 after a reconnect replayed one write.
 * The DB protects the data; this protects the number the operator is watching.
 */

import type { OpsEntityType } from '@/lib/ops-event-types';
import type { SessionEventType } from './attribution';

/**
 * `ops_events.event_type` for a session-attributed scan.
 *
 * One value, not one per surface: the surface is already carried by
 * `session_type`, and a per-surface event type would put the same fact in two
 * columns that can disagree.
 */
export const SESSION_SCAN_EVENT = 'SESSION_SCAN';

/**
 * One queued session-attribution write.
 *
 * Deliberately flat and JSON-shaped: these are persisted in IndexedDB by the
 * offline queue and replayed after a reload, so the type has to survive
 * `JSON.parse` with no revival step. No Date objects, no class instances.
 */
export interface ScanWrite {
  /**
   * Idempotency anchor AND ordering tiebreak. Minted once at the wedge, reused
   * verbatim on every retry — a replay must be a no-op that returns the
   * original result, which is what makes "enqueue and forget" safe.
   */
  clientEventId: string;
  /**
   * CLIENT-minted at scan time. This is the ordering key. Never overwritten by
   * the server, and never mixed with the DB-clock timestamps that
   * ./session-metrics.ts folds into durations.
   */
  occurredAt: string;
  sessionId: number;
  sessionType: SessionEventType;
  /** The scanned payload, verbatim. */
  value: string;
  surfaceKey: string | null;
  deviceId: string | null;
  /**
   * What the scan turned out to be about, WHEN THE CLIENT ALREADY KNOWS.
   *
   * Often it does not — resolving a barcode to a unit is a lookup, and making
   * the wedge wait for one is the round trip this whole design removes. An
   * unresolved scan is still a real fact about the session ("someone scanned
   * something here at 10:04"), so it is written with `entity_type: 'other'`
   * pointed at the session itself rather than dropped. `ops_events.entity_id`
   * is NOT NULL, so there is no "no subject" to write.
   */
  entity?: { type: OpsEntityType; id: number } | null;
}

function at(write: ScanWrite): number {
  const parsed = Date.parse(write.occurredAt);
  // An unparseable timestamp sorts LAST rather than throwing or sorting first.
  // A malformed write is still a write the operator made; losing its place in
  // the burst is a smaller failure than dropping it, and putting it first would
  // let one bad row reorder every good one around it.
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

/**
 * Scan order: by client-minted `occurredAt`, ties broken by `clientEventId`.
 * Duplicates (same `clientEventId`) collapse to the FIRST occurrence — a replay
 * carries the same facts, and keeping the later copy would prefer the retry's
 * metadata over the original's.
 *
 * Total and stable: the same pending set always yields the same sequence, on
 * any device, in any arrival order.
 */
export function orderScanWrites(pending: readonly ScanWrite[]): ScanWrite[] {
  const seen = new Set<string>();
  const unique: ScanWrite[] = [];
  for (const write of pending) {
    if (seen.has(write.clientEventId)) continue;
    seen.add(write.clientEventId);
    unique.push(write);
  }

  return unique.sort((a, b) => {
    const delta = at(a) - at(b);
    if (delta !== 0 && Number.isFinite(delta)) return delta;
    if (delta !== 0) return at(a) === Number.POSITIVE_INFINITY ? 1 : -1;
    return a.clientEventId < b.clientEventId ? -1 : a.clientEventId > b.clientEventId ? 1 : 0;
  });
}

// ── Burst coalescing ────────────────────────────────────────────────────────

/**
 * The whole visible result of a burst, per session — ONE object, however many
 * scans it took.
 *
 * This exists because a PO receive fires many scans in seconds and every one of
 * them wants to update a "N items this session" readout. Calling `setState`
 * per scan is how this repo once flooded a realtime channel at >1000 msg/s and
 * had to be re-architected; the same shape applied to React re-renders would
 * drop frames on the exact surface an operator is watching to know their scan
 * landed.
 */
export interface SessionCounterDelta {
  sessionId: number;
  sessionType: SessionEventType;
  /** How many DISTINCT scans this burst added. Replays do not increment it. */
  scans: number;
  /** The last scan in SCAN order — the one worth echoing back to the operator. */
  lastValue: string;
  lastOccurredAt: string;
}

/**
 * Fold a burst into at most one delta per session.
 *
 * Grouped by session rather than summed globally because two benches can be
 * scanning at once on one device (a lead resuming a parked session beside their
 * own), and a single counter would credit both to whichever is on screen.
 *
 * Pure, so a test can assert "50 scans in, 1 delta out" without a scheduler.
 * ./session-write-queue.ts is what puts it behind a frame coalescer.
 */
export function coalesceSessionCounters(
  pending: readonly ScanWrite[],
): SessionCounterDelta[] {
  const bySession = new Map<number, SessionCounterDelta>();

  // Ordered first so `lastValue` is the last scan the OPERATOR made, not the
  // last write the network happened to deliver.
  for (const write of orderScanWrites(pending)) {
    const existing = bySession.get(write.sessionId);
    if (!existing) {
      bySession.set(write.sessionId, {
        sessionId: write.sessionId,
        sessionType: write.sessionType,
        scans: 1,
        lastValue: write.value,
        lastOccurredAt: write.occurredAt,
      });
      continue;
    }
    existing.scans += 1;
    existing.lastValue = write.value;
    existing.lastOccurredAt = write.occurredAt;
  }

  return [...bySession.values()].sort((a, b) => a.sessionId - b.sessionId);
}
