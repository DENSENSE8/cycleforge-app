'use client';

/**
 * The client-side session-write queue — attribution that rides BEHIND the scan.
 *
 * ── THE CONSTRAINT THIS EXISTS TO HONOUR ────────────────────────────────────
 *
 * A barcode wedge delivers ~20 characters plus Enter as a burst of synthetic
 * keystrokes, and the next scan can land while the previous one is still being
 * processed. SESSION ATTRIBUTION MUST NEVER BE ON THAT PATH. If stamping a
 * `session_id` adds a round trip before the operator sees their scan land, the
 * bench slows down and operators start double-scanning — which is how duplicate
 * rows get created in the first place.
 *
 * So the shape is:
 *
 *   wedge keydown → wedgeReduce → commit queue → [YIELD] → onScan
 *                                                            │
 *                                     ┌──────────────────────┤
 *                                     ▼                      ▼
 *                          optimistic UI (hit marker)   enqueue(write)
 *                          — the operator sees it NOW   — never awaited
 *
 * {@link SessionWriteQueue.enqueue} is O(1), synchronous, and CANNOT THROW. The
 * operator's confirmation is optimistic and immediate; the session write is a
 * consequence of the scan, not a precondition for acknowledging it.
 *
 * ── WHY queueOrFetch AND NOT A SECOND QUEUE ─────────────────────────────────
 *
 * `src/lib/offline/write-queue.ts` already implements an IndexedDB queue keyed
 * by `Idempotency-Key`, drained on `online` and on a 30s heartbeat — and it has
 * exactly ONE consumer today. A parallel mechanism beside it is precisely the
 * fork this refactor exists to end, so session writes become its second
 * consumer rather than its competitor. Offline is therefore a first-class path
 * for free: scan offline → queue → reconnect → drain → the server recognises
 * the replay by its `client_event_id` and returns the original result.
 *
 * ── FAIL OPEN, ALWAYS ───────────────────────────────────────────────────────
 *
 * Every failure mode here degrades to "the event is unattributed". An
 * unattributed event is a reporting gap; a blocked scan is a stopped warehouse.
 * Nothing in this module can reject, retry forever, or surface an error into
 * the scan path. What it CAN do is count what it dropped
 * ({@link SessionWriteQueue.stats}) so the gap is visible instead of silent.
 */

import { createFrameCoalescer } from '@/lib/perf/coalesce-frame';
import { yieldToInput, type YieldToInputDeps } from '@/lib/perf/yield-to-input';
import { queueOrFetch } from '@/lib/offline/write-queue';
import {
  coalesceSessionCounters,
  orderScanWrites,
  type ScanWrite,
  type SessionCounterDelta,
} from './scan-write-order';

/**
 * How many times one write is retried before it is dropped as unattributable.
 *
 * Three, not "forever": `queueOrFetch` already owns the durable retry for
 * connectivity loss (it persists to IndexedDB and drains on reconnect). What
 * this counter bounds is the OTHER failure — a 5xx from a healthy connection —
 * and an unbounded retry there turns one broken deploy into a client-side
 * hammer against the failing route.
 */
export const SESSION_WRITE_MAX_ATTEMPTS = 3;

export interface SessionWriteStats {
  /** Writes still waiting to be posted. The operator-facing "queue depth". */
  pending: number;
  /** Writes accepted by the server (including replays it recognised). */
  sent: number;
  /** Writes abandoned after {@link SESSION_WRITE_MAX_ATTEMPTS}. Reporting gap. */
  dropped: number;
}

export interface SessionWriteQueue {
  /**
   * Record a scan against its session. O(1), synchronous, never throws, never
   * awaits. Call it from `onScan` — never from the keydown handler.
   */
  enqueue: (write: ScanWrite) => void;
  stats: () => SessionWriteStats;
  /** Test / shutdown — drain whatever is queued. */
  flush: () => Promise<void>;
  dispose: () => void;
}

export interface SessionWriteQueueOptions {
  /**
   * Applied once per animation frame with the whole burst folded down — NEVER
   * once per scan. A PO receive fires many scans in seconds; this repo has
   * already paid for a per-event publish effect that flooded a realtime channel
   * at >1000 msg/s and had to be re-architected.
   */
  onCounters?: (deltas: SessionCounterDelta[]) => void;
  /** Injectable transport. Defaults to the shared offline write queue. */
  post?: typeof queueOrFetch;
  /** Injectable, so a burst test does not need a browser frame. */
  raf?: (cb: FrameRequestCallback) => number;
  caf?: (id: number) => void;
  yieldToInput?: (deps?: YieldToInputDeps) => Promise<void>;
  /** Endpoint builder — overridable for a differently-mounted API. */
  endpoint?: (write: ScanWrite) => string;
}

const defaultEndpoint = (write: ScanWrite) => `/api/sessions/${write.sessionId}/scans`;

export function createSessionWriteQueue(
  opts: SessionWriteQueueOptions = {},
): SessionWriteQueue {
  const post = opts.post ?? queueOrFetch;
  const endpoint = opts.endpoint ?? defaultEndpoint;
  const yieldFn = opts.yieldToInput ?? yieldToInput;

  const pending: ScanWrite[] = [];
  const attempts = new Map<string, number>();
  let sent = 0;
  let dropped = 0;
  let draining: Promise<void> | null = null;
  let disposed = false;

  const counters = createFrameCoalescer<ScanWrite>({
    // 'all' — every scan must reach the fold, because the fold is what COUNTS
    // them. 'last' would deliver one write per frame and report a burst of
    // fifty as one item.
    mode: 'all',
    raf: opts.raf,
    caf: opts.caf,
    flush: (batch) => {
      if (!opts.onCounters) return;
      opts.onCounters(coalesceSessionCounters(batch));
    },
  });

  async function drain(): Promise<void> {
    if (draining) return draining;
    draining = (async () => {
      try {
        // Hand the main thread back before touching the network. `enqueue` is
        // already called after the wedge listener's yield, but a drain that
        // started mid-burst would otherwise do its work between two scans.
        await yieldFn();

        while (pending.length > 0 && !disposed) {
          // Re-order every pass: a write re-queued after a 5xx must fall back
          // into SCAN order, not onto the end of the line.
          const ordered = orderScanWrites(pending);
          pending.length = 0;
          pending.push(...ordered);

          const write = pending.shift();
          if (!write) break;

          const attempt = (attempts.get(write.clientEventId) ?? 0) + 1;
          try {
            const res = await post({
              url: endpoint(write),
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                // The idempotency anchor, all the way down: this is the header
                // the offline queue keys its IndexedDB record on, and the key
                // the server claim-or-replays against. One value, three layers.
                'Idempotency-Key': write.clientEventId,
              },
              body: JSON.stringify(write),
            });

            // 2xx = accepted. 202 = queued offline, which is also success from
            // here — the offline queue owns it now. 4xx = a deterministic
            // rejection; retrying it would only produce the same answer.
            if (res.ok || (res.status >= 400 && res.status < 500)) {
              attempts.delete(write.clientEventId);
              sent += 1;
              continue;
            }
            throw new Error(`HTTP ${res.status}`);
          } catch {
            // FAIL OPEN. The scan already succeeded and the operator already
            // saw it land; all that is at stake here is the attribution.
            if (attempt >= SESSION_WRITE_MAX_ATTEMPTS) {
              attempts.delete(write.clientEventId);
              dropped += 1;
              continue;
            }
            attempts.set(write.clientEventId, attempt);
            pending.push(write);
            // Stop this pass rather than spinning the whole queue against a
            // route that is currently failing. The next enqueue restarts it.
            break;
          }
        }
      } finally {
        draining = null;
      }
    })();
    return draining;
  }

  return {
    enqueue(write: ScanWrite) {
      if (disposed) return;
      pending.push(write);
      // The operator's counter updates from the coalescer, NOT from the server
      // round trip — that is what makes "N items this session" instant.
      counters.push(write);
      void drain();
    },
    stats: () => ({ pending: pending.length, sent, dropped }),
    flush: drain,
    dispose() {
      disposed = true;
      counters.dispose();
      pending.length = 0;
      attempts.clear();
    },
  };
}
