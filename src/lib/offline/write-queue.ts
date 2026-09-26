'use client';

import { toast } from '@/lib/toast';

/** Offline write queue. */

// ─── IndexedDB shim (tiny, deps-free) ──────────────────────────────────────

const DB_NAME = 'cf-offline-queue';
const STORE = 'requests';
const DB_VERSION = 1;

type QueueStatus = 'pending' | 'rejected' | 'dead_letter';

interface QueuedRequest {
  id: string;
  url: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  headers: Record<string, string>;
  body: string;
  idempotencyKey: string;
  aggregateKey: string;
  status: QueueStatus;
  attempts: number;
  enqueuedAt: number;
  nextAttemptAt: number;
  /** Last error message — diagnostic / queue UI. */
  lastError?: string | null;
}

function openDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function writeRecord(
  operation: (store: IDBObjectStore) => void,
): Promise<boolean> {
  const db = await openDB();
  if (!db) return false;
  return new Promise<boolean>((resolve) => {
    const transaction = db.transaction(STORE, 'readwrite');
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => resolve(false);
    transaction.onabort = () => resolve(false);
    try {
      operation(transaction.objectStore(STORE));
    } catch {
      transaction.abort();
    }
  });
}

async function putRecord(record: QueuedRequest): Promise<boolean> {
  return writeRecord((store) => { store.put(record); });
}

async function deleteRecord(id: string): Promise<boolean> {
  return writeRecord((store) => { store.delete(id); });
}

async function listRecords(): Promise<QueuedRequest[]> {
  const db = await openDB();
  if (!db) return [];
  return new Promise<QueuedRequest[]>((resolve) => {
    const t = db.transaction(STORE, 'readonly');
    const store = t.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(((req.result as QueuedRequest[]) ?? []).map((record) => ({
      ...record,
      aggregateKey: record.aggregateKey ?? record.url,
      status: record.status ?? 'pending',
      nextAttemptAt: record.nextAttemptAt ?? 0,
    })));
    req.onerror = () => resolve([]);
  });
}

// ─── Public API ────────────────────────────────────────────────────────────

export const OFFLINE_QUEUE_EVENT = 'offline-queue-changed';
const MAX_ATTEMPTS = 8;

function broadcast(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(OFFLINE_QUEUE_EVENT));
  } catch {
    /* no-op */
  }
}

export function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

/** Drop-in replacement for `fetch()` on mutating endpoints. */
export async function queueOrFetch(input: {
  url: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  headers: Record<string, string>;
  body: string;
  /** Stable entity identity; preserves FIFO order for writes to the same stock/order/carton. */
  aggregateKey: string;
}): Promise<Response> {
  const idempotencyKey = input.headers['Idempotency-Key'];
  if (!idempotencyKey) {
    throw new Error('queueOrFetch: Idempotency-Key header is required');
  }

  // First mutating call arms the online/heartbeat drainer (banner hook retired).
  installOfflineQueueDrainer();

  // Try the network first when we think we have signal.
  if (isOnline()) {
    try {
      const res = await fetch(input.url, {
        method: input.method,
        headers: input.headers,
        body: input.body,
      });
      return res;
    } catch {
      // Network error mid-flight — fall through to queue path.
    }
  }

  // Offline (or fetch threw): persist + return a synthetic 202.
  const record: QueuedRequest = {
    id: idempotencyKey,
    url: input.url,
    method: input.method,
    headers: input.headers,
    body: input.body,
    idempotencyKey,
    aggregateKey: input.aggregateKey,
    status: 'pending',
    attempts: 0,
    enqueuedAt: Date.now(),
    nextAttemptAt: Date.now(),
    lastError: null,
  };
  if (!(await putRecord(record))) {
    throw new Error('Offline change could not be stored safely on this device');
  }
  broadcast();

  return new Response(
    JSON.stringify({
      success: true,
      queued: true,
      message:
        'You appear to be offline. Your change is queued and will sync the moment you reconnect.',
    }),
    {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

/**
 * Drain automatically on `window.online` and on a slow heartbeat so the queue
 * still retries when `navigator.onLine` lies.
 */
async function drainUnlocked(): Promise<{ flushed: number; remaining: number }> {
  if (!isOnline()) return { flushed: 0, remaining: (await listRecords()).length };
  const now = Date.now();
  const pending = (await listRecords())
    .filter((record) => record.status === 'pending' && record.nextAttemptAt <= now)
    .sort((a, b) => a.enqueuedAt - b.enqueuedAt);
  const blockedAggregates = new Set<string>();
  let flushed = 0;
  for (const record of pending) {
    if (blockedAggregates.has(record.aggregateKey)) continue;
    try {
      const res = await fetch(record.url, {
        method: record.method,
        headers: record.headers,
        body: record.body,
      });
      if (res.ok) {
        if (await deleteRecord(record.id)) flushed += 1;
      } else if (res.status >= 400 && res.status < 500) {
        blockedAggregates.add(record.aggregateKey);
        const lastError = `HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`;
        await putRecord({
          ...record,
          status: 'rejected',
          lastError,
        });
        toast.error('An offline inventory change needs attention', {
          description: lastError,
          action: { label: 'Retry', onClick: () => { void retryRecord(record.id); } },
        });
      } else {
        blockedAggregates.add(record.aggregateKey);
        const attempts = record.attempts + 1;
        const dead = attempts >= MAX_ATTEMPTS;
        await putRecord({
          ...record,
          status: dead ? 'dead_letter' : 'pending',
          attempts,
          nextAttemptAt: now + Math.min(60_000, 1_000 * 2 ** attempts),
          lastError: `HTTP ${res.status}`,
        });
        if (dead) {
          toast.error('An inventory change could not sync', {
            description: 'The change is saved on this device.',
            action: { label: 'Retry', onClick: () => { void retryRecord(record.id); } },
          });
        }
      }
    } catch (err) {
      blockedAggregates.add(record.aggregateKey);
      const attempts = record.attempts + 1;
      const dead = attempts >= MAX_ATTEMPTS;
      await putRecord({
        ...record,
        status: dead ? 'dead_letter' : 'pending',
        attempts,
        nextAttemptAt: now + Math.min(60_000, 1_000 * 2 ** attempts),
        lastError: err instanceof Error ? err.message : 'Network error',
      });
      if (dead) {
        toast.error('An inventory change could not sync', {
          description: 'The change is saved on this device.',
          action: { label: 'Retry', onClick: () => { void retryRecord(record.id); } },
        });
      }
    }
  }
  broadcast();
  const remaining = (await listRecords()).length;
  return { flushed, remaining };
}

let drainPromise: Promise<{ flushed: number; remaining: number }> | null = null;

async function drainOnce(): Promise<{ flushed: number; remaining: number }> {
  if (drainPromise) return drainPromise;
  const run = async () => {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      const result = await navigator.locks.request(
        'cf-offline-queue-drain',
        { ifAvailable: true },
        (lock) => lock ? drainUnlocked() : null,
      );
      if (result) return result;
      return { flushed: 0, remaining: (await listRecords()).length };
    }
    return drainUnlocked();
  };
  drainPromise = run().finally(() => { drainPromise = null; });
  return drainPromise;
}

export async function getOfflineQueueSnapshot() {
  const records = await listRecords();
  return {
    pending: records.filter((record) => record.status === 'pending').length,
    rejected: records.filter((record) => record.status === 'rejected').length,
    deadLetter: records.filter((record) => record.status === 'dead_letter').length,
  };
}

async function retryRecord(id: string): Promise<void> {
  const record = (await listRecords()).find((item) => item.id === id);
  if (!record) return;
  await putRecord({
    ...record,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: Date.now(),
    lastError: null,
  });
  broadcast();
  await drainOnce();
}

let installed = false;

function installOfflineQueueDrainer(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  // Drain when the browser flips online.
  window.addEventListener('online', () => {
    void drainOnce();
  });

  // Heartbeat — recover from captive portals + `navigator.onLine` lying.
  setInterval(() => {
    void drainOnce();
  }, 30_000);

  // Initial drain (covers reload-while-online with pending items).
  void drainOnce();
}
