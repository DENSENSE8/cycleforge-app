'use client';

/** Overlay stack — "which transient layer currently owns the keyboard". */

const open = new Set<number>();
const listeners = new Set<() => void>();
let token = 0;
/** Cached scalar so `useSyncExternalStore` gets a stable snapshot identity. */
let depthSnapshot = 0;

function emit(): void {
  depthSnapshot = open.size;
  for (const l of listeners) l();
}

/** One overlay's hold on the keyboard, from `claimOverlay()`. */
export interface OverlayClaim {
  /** Remove exactly this claim (safe to call twice; a stale release is a no-op). */
  release: () => void;
  /** True while this claim is the most recently opened one still held — the overlay on top. */
  isTopmost: () => boolean;
}

/** Claim the keyboard for an overlay that just opened. */
export function claimOverlay(): OverlayClaim {
  token += 1;
  const mine = token;
  open.add(mine);
  emit();
  return {
    release: () => {
      if (open.delete(mine)) emit();
    },
    // Tokens only grow, so the newest held claim is the largest.
    isTopmost: () => open.has(mine) && Math.max(...open) === mine,
  };
}

/**
 * Claim the keyboard for an overlay that just opened. Returns a release fn that
 * removes exactly this claim (safe to call twice; a stale release is a no-op).
 */
export function pushOverlay(): () => void {
  return claimOverlay().release;
}

/** True while any overlay is open — the signal for ambient owners to stand down. */
export function hasOpenOverlay(): boolean {
  return depthSnapshot > 0;
}

export function subscribeOverlayStack(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getOverlayDepth(): number {
  return depthSnapshot;
}

/** Server snapshot: overlays are client-only chrome, so nothing is open on SSR. */
export function getServerOverlayDepth(): number {
  return 0;
}
