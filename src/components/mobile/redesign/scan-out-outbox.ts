/**
 * Store-and-forward for scan-out commits.
 *
 * ## The failure this exists for
 *
 * A loading dock is the canonical wifi dead zone, and the commit was
 * fire-and-forget: `postScanOut(...).catch(...)` produced one red row and threw
 * the scan away. The package had physically left the building; the only record
 * of it was a line on a phone saying it had not. Nothing retried, nothing
 * persisted, and a reload erased even the red row.
 *
 * So a scan that fails to reach the server is not a failed scan — it is a scan
 * that has not been sent YET. It goes here, survives a reload, and drains when
 * the device is online again.
 *
 * ## Why localStorage and not a query cache
 *
 * The queue has to outlive the tab. An operator whose phone drops signal walks
 * the length of a dock, the browser reclaims the page, and they come back to
 * the station — the pending confirms have to still be there. `sessionStorage`
 * dies with the tab and an in-memory list dies with the route.
 *
 * Every read and write is guarded: private-mode Safari throws on access, and a
 * station that cannot queue must still scan.
 *
 * Pure module: no React. Unit-tested in `scan-out-outbox.test.ts`.
 */

const KEY = 'cf.scanOut.outbox.v1';

/**
 * Cap on queued scans.
 *
 * A dead zone that swallows more than this is not a network blip, and an
 * unbounded queue on a phone is a storage quota error at the worst moment.
 * Oldest are dropped first — the newest scans are the ones the operator can
 * still physically reconcile against boxes in front of them.
 */
export const OUTBOX_LIMIT = 200;

/**
 * How long to wait before re-attempting a stalled drain.
 *
 * The `online` event is not the same thing as a working connection — a phone
 * reports the interface up the moment it associates, well before a dock's wifi
 * actually carries a request. Long enough not to hammer a dead link, short
 * enough that an operator who walks back into coverage sees the queue empty
 * before they finish the next package.
 */
export const OUTBOX_RETRY_MS = 15_000;

export interface OutboxEntry {
  /** The raw scanned value. The only thing the commit actually needs. */
  tracking: string;
  /** When the operator scanned it — NOT when it eventually sends. */
  scannedAt: string;
  /** How many send attempts have failed. Kept for diagnosis, never a gate. */
  attempts: number;
}

function read(): OutboxEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is OutboxEntry =>
        !!e && typeof (e as OutboxEntry).tracking === 'string' && !!(e as OutboxEntry).tracking,
    );
  } catch {
    return [];
  }
}

function write(entries: OutboxEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries.slice(-OUTBOX_LIMIT)));
  } catch {
    /* quota or private mode — the station still scans, it just cannot queue */
  }
}

/** Everything waiting to be sent, oldest first. */
export function outboxEntries(): OutboxEntry[] {
  return read();
}

/**
 * Queue a scan that did not reach the server.
 *
 * Deduped on the raw value: re-firing the same label while it is already queued
 * would send it twice when the network returns. The server is idempotent, so
 * the cost is a spurious `dup` row rather than a double ship — but a queue that
 * lies about its own depth makes the pending count useless.
 */
export function enqueueScanOut(tracking: string, scannedAt = new Date().toISOString()): void {
  const value = tracking.trim();
  if (!value) return;
  const entries = read();
  if (entries.some((e) => e.tracking === value)) return;
  write([...entries, { tracking: value, scannedAt, attempts: 0 }]);
}

/** Drop one entry — it landed. */
export function dequeueScanOut(tracking: string): void {
  write(read().filter((e) => e.tracking !== tracking));
}

/** Record a failed attempt without losing the entry. */
export function markScanOutAttempt(tracking: string): void {
  write(
    read().map((e) => (e.tracking === tracking ? { ...e, attempts: e.attempts + 1 } : e)),
  );
}

/** Empty it. Used by tests and by an explicit operator discard. */
export function clearScanOutOutbox(): void {
  write([]);
}
