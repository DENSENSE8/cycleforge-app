import { toast } from '@/lib/toast';
import { TOAST_DURATION } from '@/design-system/components/toast-theme';

type ZohoVerdict = 'ok' | 'failed' | 'skipped';

type PendingZohoSync = {
  id: string;
  orgId: string;
  lineIds: number[];
  createdAt: number;
  label: string;
};

const STORAGE_KEY = 'receiving.pendingZohoSync.v1';
const TTL_MS = 20 * 60 * 1000;
/** Match TOAST_DURATION.loading — missed Ably settle must not spin forever. */
const LOADING_TOAST_MS = TOAST_DURATION.loading;

const inMemory = new Map<string, PendingZohoSync>();

function now() {
  return Date.now();
}

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readStorage(): PendingZohoSync[] {
  if (!isBrowser()) return [];
  const parsed = safeParseJson<PendingZohoSync[]>(window.localStorage.getItem(STORAGE_KEY));
  return Array.isArray(parsed) ? parsed : [];
}

function writeStorage(list: PendingZohoSync[]) {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function prune(list: PendingZohoSync[]): PendingZohoSync[] {
  const cutoff = now() - TTL_MS;
  const next = list.filter((p) => Boolean(p?.id) && Number(p?.createdAt) >= cutoff);
  // Deduplicate by id (last one wins)
  const byId = new Map<string, PendingZohoSync>();
  for (const p of next) byId.set(p.id, p);
  return Array.from(byId.values());
}

function upsertPending(p: PendingZohoSync) {
  const next = prune([...readStorage().filter((x) => x.id !== p.id), p]);
  writeStorage(next);
  inMemory.set(p.id, p);
}

function removePending(id: string) {
  const next = prune(readStorage().filter((x) => x.id !== id));
  writeStorage(next);
  inMemory.delete(id);
}

function ensureLoadingToast(p: PendingZohoSync) {
  const age = now() - p.createdAt;
  const remaining = Math.max(1_000, LOADING_TOAST_MS - age);
  // Plain message — not toast.loading — so Sonner never mounts a spinner.
  toast.message(p.label, {
    id: p.id,
    duration: remaining,
    icon: null,
    className:
      'group pointer-events-auto relative flex w-auto items-center rounded-lg border border-border-soft bg-surface-card px-3 py-2 text-text-muted shadow-[0_1px_2px_rgba(15,23,42,0.05),0_4px_12px_rgba(15,23,42,0.04)]',
  });
}

export function enqueuePendingZohoSync(input: {
  id: string;
  orgId: string;
  lineIds: number[];
  createdAt?: number;
  label?: string;
}): void {
  if (!isBrowser()) return;
  const lineIds = Array.from(new Set(input.lineIds.filter((n) => Number.isFinite(n) && n > 0)));
  if (lineIds.length === 0) return;
  const p: PendingZohoSync = {
    id: input.id,
    orgId: input.orgId,
    lineIds,
    createdAt: input.createdAt ?? now(),
    label: input.label ?? 'Syncing to inventory…',
  };
  upsertPending(p);
  ensureLoadingToast(p);
}

export function hydratePendingZohoSyncToasts(orgId: string): void {
  if (!isBrowser()) return;
  // Drop anything already past the loading budget before re-showing.
  expireStalePendingZohoSync(LOADING_TOAST_MS);
  const list = prune(readStorage());
  writeStorage(list);

  for (const p of list) {
    if (!p || p.orgId !== orgId) continue;
    if (!inMemory.has(p.id)) inMemory.set(p.id, p);
    ensureLoadingToast(p);
  }
}

export function resolvePendingZohoSync(input: {
  orgId: string;
  lineId: number;
  verdict: ZohoVerdict;
}): void {
  if (!isBrowser()) return;
  const lineId = Number(input.lineId);
  if (!Number.isFinite(lineId) || lineId <= 0) return;

  const pending = prune(readStorage());
  const hit = pending.find((p) => p.orgId === input.orgId && Array.isArray(p.lineIds) && p.lineIds.includes(lineId));
  if (!hit) return;

  if (input.verdict === 'ok') {
    toast.success('Confirmed in inventory', { id: hit.id, duration: 2500 });
  } else if (input.verdict === 'failed') {
    toast.error('Inventory sync failed — saved locally. Open the PO and retry Receive.', {
      id: hit.id,
      duration: 6000,
    });
  } else {
    toast.info('Inventory sync skipped.', { id: hit.id, duration: 2500 });
  }

  removePending(hit.id);
}

/** Resolve any pending sync toasts older than `maxAgeMs` as failed (UI safety net). */
export function expireStalePendingZohoSync(maxAgeMs = LOADING_TOAST_MS): void {
  if (!isBrowser()) return;
  const cutoff = now() - maxAgeMs;
  for (const p of prune(readStorage())) {
    if (p.createdAt >= cutoff) continue;
    toast.error('Inventory sync timed out — saved locally. Open the PO and retry Receive.', {
      id: p.id,
      duration: 6000,
    });
    removePending(p.id);
  }
}
