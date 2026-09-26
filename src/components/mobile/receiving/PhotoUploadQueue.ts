'use client';

import { useEffect, useSyncExternalStore } from 'react';
import {
  blobToBase64DataUrl,
  downscaleImageTo720,
} from '@/lib/image/downscale';
import type { PhotoAspect } from '@/lib/photos/photo-aspects';
import {
  receivingPhotoTypeForStage,
  receivingUploadStage,
  type ReceivingPhotoStage,
} from '@/lib/receiving/photo-intent';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { countInFlightEntries } from './photo-upload-in-flight';

/** Module-singleton store for in-flight receiving photo uploads. */

type UploadState = 'queued' | 'uploading' | 'done' | 'failed';

export interface PhotoScope {
  receivingId: number;
  receivingLineId?: number | null;
  /** Human PO reference (Zoho PO number / id) used ONLY to name the file object — e.g. */
  poRef?: string | null;
  /** One-based clean filename suffix for captured photos, e.g. PO123_3.jpg. */
  fileIndex?: number | null;
  /** Evidence stage this capture belongs to (stage × entity matrix: */
  stage?: ReceivingPhotoStage;
  /** What this shot SHOWS within the stage (`@/lib/photos/photo-aspects`). */
  aspect?: PhotoAspect | null;
  /** Device-reported capture instant (epoch ms) — the shutter clock from `CapturedShot.capturedAtMs`, or `captureTimeFromFile()` for a picked… */
  capturedAtMs?: number | null;
  /**
   * When `receivingLineId` is unset: `all` loads PO + every line (matches
   * `photo_count` badges); `po` loads PO-level entity photos only.
   */
  photosListScope?: 'po' | 'all';
}

interface UploadEntry {
  id: string;
  scope: PhotoScope;
  previewUrl: string;
  state: UploadState;
  photoId: number | null;
  photoUrl: string | null;
  error: string | null;
  originalBytes: number;
  finalBytes: number;
  createdAt: number;
}

interface QueueState {
  entries: UploadEntry[];
}

// ─── Storage shape ──────────────────────────────────────────────────────────
const STORAGE_KEY = 'cf.receiving.upload_queue.v1';
// Deliberately NOT bumped when `scope.capturedAtMs` was added:
const STORAGE_VERSION = 1;
// Hard cap on persisted entries to keep localStorage well below the 5 MB
// per-origin quota even on cheap Android Chromes.
const STORAGE_MAX_ENTRIES = 20;

interface PersistedEntry {
  v: number;
  meta: Omit<UploadEntry, 'previewUrl'>;
  dataUrl: string; // downscaled JPEG as data URL
}

// ─── State + subscribers ──────────────────────────────────────────────────── Fired once per photo the moment it's committed (GCS upload…
interface UploadNotice {
  receivingId: number;
  receivingLineId: number | null;
  photoId: number;
  photoUrl: string;
}
let uploadNotifier: ((notice: UploadNotice) => void) | null = null;

/** Fired whenever the absolute in-flight (queued|uploading) count for a carton changes — shutter enqueue, upload done/fail, retry, clearAll. */
interface TakenNotice {
  receivingId: number;
  receivingLineId: number | null;
  inFlight: number;
}
let takenNotifier: ((notice: TakenNotice) => void) | null = null;

const state: QueueState = { entries: [] };
const listeners = new Set<() => void>();
// Original (post-downscale) blob ref so Retry doesn't re-prompt the user.
const blobCache = new Map<string, Blob>();
// Downscaled base64 form mirrored to localStorage on each persist.
const persistedDataUrls = new Map<string, string>();
let rehydrated = false;

function emit() {
  listeners.forEach((fn) => fn());
}

function notifyTaken(receivingId: number, receivingLineId: number | null) {
  if (!takenNotifier) return;
  try {
    takenNotifier({
      receivingId,
      receivingLineId,
      inFlight: countInFlightEntries(state.entries, receivingId),
    });
  } catch {
    /* taken notifier must never break the upload queue */
  }
}

function patch(id: string, partial: Partial<UploadEntry>) {
  state.entries = state.entries.map((e) => (e.id === id ? { ...e, ...partial } : e));
  emit();
  persist();
}

function randomId(): string {
  return safeRandomUUID();
}

// ─── localStorage mirror ────────────────────────────────────────────────────
function persist(): void {
  if (typeof window === 'undefined') return;
  try {
    // Only persist non-`done` entries — done photos are committed server-side
    // and don't need local replay.
    const items: PersistedEntry[] = [];
    for (const e of state.entries) {
      if (e.state === 'done') continue;
      const dataUrl = persistedDataUrls.get(e.id);
      if (!dataUrl) continue;
      const { previewUrl: _omit, ...meta } = e;
      items.push({ v: STORAGE_VERSION, meta, dataUrl });
    }
    if (items.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    // Newest first; cap so storage never blows up.
    const capped = items.slice(-STORAGE_MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
  } catch {
    // QuotaExceeded or storage disabled — fall back to in-memory only.
  }
}

function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const match = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
    if (!match) return null;
    const bin = atob(match[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: match[1] });
  } catch {
    return null;
  }
}

function rehydrate(): void {
  if (rehydrated) return;
  rehydrated = true;
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;

    for (const item of parsed as PersistedEntry[]) {
      if (!item || item.v !== STORAGE_VERSION || !item.dataUrl || !item.meta) continue;
      const blob = dataUrlToBlob(item.dataUrl);
      if (!blob) continue;
      const previewUrl = URL.createObjectURL(blob);
      // Anything that was mid-upload before the refresh resets to queued so it gets re-attempted; the photos endpoint is idempotent via the…
      const restoredState: UploadState =
        item.meta.state === 'uploading' ? 'queued' : item.meta.state;
      const entry: UploadEntry = {
        ...item.meta,
        previewUrl,
        state: restoredState,
      };
      state.entries.push(entry);
      blobCache.set(entry.id, blob);
      persistedDataUrls.set(entry.id, item.dataUrl);
    }

    if (state.entries.length > 0) emit();

    // Resume anything that was queued before the refresh.
    for (const e of state.entries) {
      if (e.state !== 'queued') continue;
      const blob = blobCache.get(e.id);
      if (blob) void processEntry(e.id, blob);
    }
  } catch {
    // Corrupt entry — drop it and move on. Don't block the UI.
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }
}

// ─── Upload pipeline ────────────────────────────────────────────────────────
async function postPhotoViaAdapter(
  entry: UploadEntry,
  blob: Blob,
): Promise<{ id: number; url: string }> {
  const entityType = entry.scope.receivingLineId != null ? 'RECEIVING_LINE' : 'RECEIVING';
  const entityId = entry.scope.receivingLineId ?? entry.scope.receivingId;
  // Stage → photo_type via the SoT, never a local map.
  const stage = receivingUploadStage(entry.scope.receivingLineId, entry.scope.stage);
  const { uploadPhotoClient } = await import('@/lib/photos/upload-client');
  const result = await uploadPhotoClient({
    file: blob,
    entityType,
    entityId,
    photoType: receivingPhotoTypeForStage(stage),
    poRef: entry.scope.poRef ?? undefined,
    clientCapturedAtMs: entry.scope.capturedAtMs ?? null,
    photoAspect: entry.scope.aspect ?? null,
  });
  return { id: result.id, url: result.url };
}

async function postPhoto(
  entry: UploadEntry,
  blob: Blob,
): Promise<{ id: number; url: string }> {
  return postPhotoViaAdapter(entry, blob);
}

async function processEntry(id: string, blob: Blob): Promise<void> {
  const before = state.entries.find((e) => e.id === id);
  patch(id, { state: 'uploading', error: null });
  if (before) {
    // Retry from failed re-enters in-flight; queued→uploading keeps the same count.
    notifyTaken(before.scope.receivingId, before.scope.receivingLineId ?? null);
  }
  try {
    const entry = state.entries.find((e) => e.id === id);
    if (!entry) return;
    const { id: photoId, url } = await postPhoto(entry, blob);
    patch(id, { state: 'done', photoId, photoUrl: url });
    // Announce the commit so strips + feed counts refresh (notifier publishes
    // `receiving_photo_uploaded` over Ably). Wrapped so a notifier error can
    // never fail an otherwise-successful upload.
    try {
      uploadNotifier?.({
        receivingId: entry.scope.receivingId,
        receivingLineId: entry.scope.receivingLineId ?? null,
        photoId,
        photoUrl: url,
      });
    } catch {
      /* notifier must never break the upload */
    }
    notifyTaken(entry.scope.receivingId, entry.scope.receivingLineId ?? null);
    // done — clear localStorage row + drop blob cache (preview still rendered
    // from the existing object URL until the parent revokes it).
    persistedDataUrls.delete(id);
    persist();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'upload failed';
    patch(id, { state: 'failed', error: message });
    const failed = state.entries.find((e) => e.id === id);
    if (failed) {
      notifyTaken(failed.scope.receivingId, failed.scope.receivingLineId ?? null);
    }
  }
}

async function prepareAndUpload(id: string, rawBlob: Blob): Promise<void> {
  let blob = rawBlob;
  let finalBytes = rawBlob.size;
  try {
    const result = await downscaleImageTo720(rawBlob);
    blob = result.blob;
    finalBytes = result.finalBytes;
  } catch {
    // Fall through with the raw blob — never block a receiver on a downscale
    // problem.
  }
  blobCache.set(id, blob);
  patch(id, { finalBytes });

  // Mirror the downscaled blob to localStorage so a refresh can resume.
  try {
    const dataUrl = await blobToBase64DataUrl(blob);
    persistedDataUrls.set(id, dataUrl);
    persist();
  } catch {
    // Persistence is best-effort.
  }

  await processEntry(id, blob);
}

// ─── Public API ─────────────────────────────────────────────────────────────
export const photoUploadQueue = {
  /**
   * Register the post-upload notifier (e.g. an Ably publisher). Set by the
   * capture surface; intentionally NOT cleared on unmount so background
   * uploads that finish after navigation still fire it. Pass null to clear.
   */
  configureNotifier(fn: ((notice: UploadNotice) => void) | null) {
    uploadNotifier = fn;
  },
  /**
   * Register the shutter / in-flight count notifier (Ably `receiving_photo_taken`).
   * Same longevity rules as {@link configureNotifier}.
   */
  configureTakenNotifier(fn: ((notice: TakenNotice) => void) | null) {
    takenNotifier = fn;
  },
  /** Absolute queued+uploading count for a carton (failed/done excluded). */
  inFlightCount(receivingId: number): number {
    return countInFlightEntries(state.entries, receivingId);
  },
  enqueue(scope: PhotoScope, blob: Blob, previewUrl: string): string {
    rehydrate();
    const id = randomId();
    const entry: UploadEntry = {
      id,
      scope,
      previewUrl,
      state: 'queued',
      photoId: null,
      photoUrl: null,
      error: null,
      originalBytes: blob.size,
      finalBytes: 0,
      createdAt: Date.now(),
    };
    state.entries = [...state.entries, entry];
    blobCache.set(id, blob);
    emit();
    // Shutter → desk bump before downscale/upload starts.
    notifyTaken(scope.receivingId, scope.receivingLineId ?? null);
    void prepareAndUpload(id, blob);
    return id;
  },
  retry(id: string) {
    const blob = blobCache.get(id);
    if (!blob) return;
    void processEntry(id, blob);
  },
  clearDone() {
    const remaining = state.entries.filter((e) => e.state !== 'done');
    state.entries.forEach((e) => {
      if (e.state === 'done') {
        try { URL.revokeObjectURL(e.previewUrl); } catch { /* ignore */ }
        blobCache.delete(e.id);
        persistedDataUrls.delete(e.id);
      }
    });
    state.entries = remaining;
    emit();
    persist();
  },
  clearAll() {
    const affected = new Map<number, number | null>();
    for (const e of state.entries) {
      if (e.state === 'queued' || e.state === 'uploading') {
        affected.set(e.scope.receivingId, e.scope.receivingLineId ?? null);
      }
    }
    state.entries.forEach((e) => {
      try { URL.revokeObjectURL(e.previewUrl); } catch { /* ignore */ }
    });
    blobCache.clear();
    persistedDataUrls.clear();
    state.entries = [];
    emit();
    if (typeof window !== 'undefined') {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }
    for (const [receivingId, receivingLineId] of affected) {
      notifyTaken(receivingId, receivingLineId);
    }
  },
  subscribe(fn: () => void) {
    // Subscribe is also where useSyncExternalStore first runs in the browser;
    // a good safe place to rehydrate from localStorage.
    rehydrate();
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  snapshot() {
    return state.entries;
  },
};

// Stable empty reference for the server snapshot. A fresh `[]` per call makes
// useSyncExternalStore think the store changed every render → React throws
// "The result of getServerSnapshot should be cached to avoid an infinite loop".
const EMPTY_ENTRIES: UploadEntry[] = [];
const getServerSnapshot = (): UploadEntry[] => EMPTY_ENTRIES;

export function useUploadQueue(scopeFilter?: PhotoScope): UploadEntry[] {
  const all = useSyncExternalStore(
    photoUploadQueue.subscribe,
    photoUploadQueue.snapshot,
    getServerSnapshot,
  );
  if (!scopeFilter) return all;
  return all.filter((e) => {
    if (e.scope.receivingId !== scopeFilter.receivingId) return false;
    const a = e.scope.receivingLineId ?? null;
    const b = scopeFilter.receivingLineId ?? null;
    return a === b;
  });
}

/**
 * Drop done entries from the queue when the parent unmounts the capture
 * screen. Keeps queued/uploading/failed visible across navigations so the
 * receiver can still retry a failed shot from the gallery later.
 */
export function useClearDoneOnUnmount() {
  useEffect(() => {
    return () => photoUploadQueue.clearDone();
  }, []);
}
