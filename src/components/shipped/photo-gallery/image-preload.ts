'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

interface ImageSize {
  width: number;
  height: number;
}

/** Bytes received for one load; `total` is null when the response does not state its size. */
export interface ImageLoadProgress {
  received: number;
  total: number | null;
  /** `performance.now()` when the load started — drives the estimated fill when `total` is unknown. */
  startedAt: number;
}

interface ImageLoad {
  load: Promise<ImageSize>;
  /** Fetched AND decoded. */
  ready: boolean;
  /** Replaced (never mutated) on every update so it doubles as the store snapshot. */
  progress: ImageLoadProgress;
}

/** Bounded so a long session cannot pin every photo it ever opened. */
const MAX_LOADS = 24;
/** url → fetch+decode, shared by every caller so a tile press and the viewer never fetch twice. */
const loads = new Map<string, ImageLoad>();
const listeners = new Set<() => void>();

function setProgress(entry: ImageLoad, received: number, total: number | null) {
  entry.progress = { received, total, startedAt: entry.progress.startedAt };
  for (const listener of listeners) listener();
}

/** True once `url` has been fetched and decoded here — an `<img>` mounted now paints it on its first frame. */
export function isImageReady(url: string): boolean {
  return loads.get(url)?.ready === true;
}

/**
 * Same-origin bytes are streamed through `fetch` so the viewer can show real
 * progress; the `<img>` decode that follows reads the same immutable response
 * from the HTTP cache. A cross-origin hop without CORS fails the fetch — that
 * load keeps an unknown total and the plain image request still runs.
 */
async function streamBytes(url: string, priority: 'high' | 'low', entry: ImageLoad): Promise<void> {
  if (!url.startsWith('/') || url.startsWith('//')) return;
  try {
    const res = await fetch(url, { priority, credentials: 'same-origin' });
    if (!res.ok || !res.body) return;
    const total = Number(res.headers.get('content-length')) || null;
    let received = 0;
    setProgress(entry, received, total);
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      setProgress(entry, total ? Math.min(received, total) : received, total);
    }
  } catch {
    // Unknown total; the image request below decides success.
  }
}

/**
 * Fetch and decode `url` once per page. A tile press starts it; the viewer's
 * later call joins the same load and swaps in an already-decoded image.
 * Rejects on a broken image and forgets it, so the next call refetches.
 */
export function preloadImage(url: string, priority: 'high' | 'low' = 'high'): Promise<ImageSize> {
  const hit = loads.get(url);
  if (hit) {
    // Re-insert: Map order is the LRU order.
    loads.delete(url);
    loads.set(url, hit);
    return hit.load;
  }
  const entry: ImageLoad = {
    ready: false,
    progress: { received: 0, total: null, startedAt: performance.now() },
    load: Promise.resolve({ width: 0, height: 0 }),
  };
  entry.load = streamBytes(url, priority, entry)
    .then(() => {
      const img = new Image();
      img.fetchPriority = priority;
      img.src = url;
      return img.decode().then(() => ({ width: img.naturalWidth, height: img.naturalHeight }));
    })
    .then(
      (size) => {
        entry.ready = true;
        return size;
      },
      (err: unknown) => {
        loads.delete(url);
        throw err;
      },
    );
  loads.set(url, entry);
  if (loads.size > MAX_LOADS) {
    const oldest = loads.keys().next().value;
    if (oldest !== undefined) loads.delete(oldest);
  }
  return entry.load;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Live byte progress of `url`'s load (null when none is tracked). */
export function useImageLoadProgress(url: string | null): ImageLoadProgress | null {
  return useSyncExternalStore(
    subscribe,
    () => (url ? (loads.get(url)?.progress ?? null) : null),
    () => null,
  );
}

/** Intrinsic pixel size of `url` (null until known) — loads it at low priority. */
export function useImageSize(url: string | null): ImageSize | null {
  const [known, setKnown] = useState<{ url: string; size: ImageSize } | null>(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    preloadImage(url, 'low').then(
      (size) => {
        if (live) setKnown({ url, size });
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [url]);
  return known?.url === url ? known.size : null;
}
