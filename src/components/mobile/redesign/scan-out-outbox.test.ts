import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// A minimal localStorage before the module under test reads `window`.
const store = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
};

/**
 * Imported lazily INSIDE the tests, not at the top.
 *
 * The module reads `window.localStorage`, so the shim above has to exist before
 * it loads — and a static import would hoist above the shim. Node caches the
 * module, so every call returns the same instance.
 */
const outbox = () => import('@/components/mobile/redesign/scan-out-outbox');

const AT = '2026-09-05T01:00:00Z';

describe('scan-out outbox', () => {
  beforeEach(async () => {
    const { clearScanOutOutbox } = await outbox();
    store.clear();
    clearScanOutOutbox();
  });

  it('holds a scan the server never saw', async () => {
    const { clearScanOutOutbox, dequeueScanOut, enqueueScanOut, markScanOutAttempt, outboxEntries, OUTBOX_LIMIT } = await outbox();
    void clearScanOutOutbox; void dequeueScanOut; void enqueueScanOut; void markScanOutAttempt; void outboxEntries; void OUTBOX_LIMIT;
    enqueueScanOut('1Z999AA10123456784', AT);
    const [entry] = outboxEntries();
    assert.equal(entry.tracking, '1Z999AA10123456784');
    // The time the operator scanned it, not the time it eventually sends: a
    // package that left at 08:12 must not be recorded as leaving at 09:30.
    assert.equal(entry.scannedAt, AT);
    assert.equal(entry.attempts, 0);
  });

  it('survives a reload — the whole point of persisting it', async () => {
    const { clearScanOutOutbox, dequeueScanOut, enqueueScanOut, markScanOutAttempt, outboxEntries, OUTBOX_LIMIT } = await outbox();
    void clearScanOutOutbox; void dequeueScanOut; void enqueueScanOut; void markScanOutAttempt; void outboxEntries; void OUTBOX_LIMIT;
    enqueueScanOut('AAA', AT);
    // Same backing store, fresh read: no in-memory state carried it.
    assert.equal(outboxEntries().length, 1);
    assert.equal(outboxEntries()[0].tracking, 'AAA');
  });

  it('does not queue the same label twice', async () => {
    const { clearScanOutOutbox, dequeueScanOut, enqueueScanOut, markScanOutAttempt, outboxEntries, OUTBOX_LIMIT } = await outbox();
    void clearScanOutOutbox; void dequeueScanOut; void enqueueScanOut; void markScanOutAttempt; void outboxEntries; void OUTBOX_LIMIT;
    enqueueScanOut('AAA', AT);
    enqueueScanOut('AAA', AT);
    assert.equal(outboxEntries().length, 1);
  });

  it('ignores an empty scan', async () => {
    const { clearScanOutOutbox, dequeueScanOut, enqueueScanOut, markScanOutAttempt, outboxEntries, OUTBOX_LIMIT } = await outbox();
    void clearScanOutOutbox; void dequeueScanOut; void enqueueScanOut; void markScanOutAttempt; void outboxEntries; void OUTBOX_LIMIT;
    enqueueScanOut('   ', AT);
    assert.equal(outboxEntries().length, 0);
  });

  it('drops an entry once it lands', async () => {
    const { clearScanOutOutbox, dequeueScanOut, enqueueScanOut, markScanOutAttempt, outboxEntries, OUTBOX_LIMIT } = await outbox();
    void clearScanOutOutbox; void dequeueScanOut; void enqueueScanOut; void markScanOutAttempt; void outboxEntries; void OUTBOX_LIMIT;
    enqueueScanOut('AAA', AT);
    enqueueScanOut('BBB', AT);
    dequeueScanOut('AAA');
    assert.deepEqual(outboxEntries().map((e) => e.tracking), ['BBB']);
  });

  it('counts a failed attempt without losing the scan', async () => {
    const { clearScanOutOutbox, dequeueScanOut, enqueueScanOut, markScanOutAttempt, outboxEntries, OUTBOX_LIMIT } = await outbox();
    void clearScanOutOutbox; void dequeueScanOut; void enqueueScanOut; void markScanOutAttempt; void outboxEntries; void OUTBOX_LIMIT;
    enqueueScanOut('AAA', AT);
    markScanOutAttempt('AAA');
    markScanOutAttempt('AAA');
    assert.equal(outboxEntries().length, 1);
    assert.equal(outboxEntries()[0].attempts, 2);
  });

  it('caps the queue, keeping the NEWEST scans', async () => {
    const { clearScanOutOutbox, dequeueScanOut, enqueueScanOut, markScanOutAttempt, outboxEntries, OUTBOX_LIMIT } = await outbox();
    void clearScanOutOutbox; void dequeueScanOut; void enqueueScanOut; void markScanOutAttempt; void outboxEntries; void OUTBOX_LIMIT;
    // The newest are the ones an operator can still reconcile against boxes in
    // front of them; an unbounded queue is a quota error at the worst moment.
    for (let i = 0; i < OUTBOX_LIMIT + 10; i += 1) enqueueScanOut(`T${i}`, AT);
    const entries = outboxEntries();
    assert.equal(entries.length, OUTBOX_LIMIT);
    assert.equal(entries[entries.length - 1].tracking, `T${OUTBOX_LIMIT + 9}`);
  });

  it('degrades to empty rather than throwing when storage is unavailable', async () => {
    const { clearScanOutOutbox, dequeueScanOut, enqueueScanOut, markScanOutAttempt, outboxEntries, OUTBOX_LIMIT } = await outbox();
    void clearScanOutOutbox; void dequeueScanOut; void enqueueScanOut; void markScanOutAttempt; void outboxEntries; void OUTBOX_LIMIT;
    const win = (globalThis as unknown as { window: { localStorage: unknown } }).window;
    const real = win.localStorage;
    win.localStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    assert.deepEqual(outboxEntries(), []);
    // Must not throw — a station that cannot queue still has to scan.
    enqueueScanOut('AAA', AT);
    win.localStorage = real;
  });

  it('survives corrupt stored JSON', async () => {
    const { clearScanOutOutbox, dequeueScanOut, enqueueScanOut, markScanOutAttempt, outboxEntries, OUTBOX_LIMIT } = await outbox();
    void clearScanOutOutbox; void dequeueScanOut; void enqueueScanOut; void markScanOutAttempt; void outboxEntries; void OUTBOX_LIMIT;
    store.set('cf.scanOut.outbox.v1', '{not json');
    assert.deepEqual(outboxEntries(), []);
  });
});
