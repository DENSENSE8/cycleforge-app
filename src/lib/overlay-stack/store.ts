'use client';

/**
 * Overlay stack — "which transient layer currently owns the keyboard".
 *
 * WHY THIS EXISTS
 * Escape had no arbiter. Three listeners can be live at once on the dashboard:
 *
 *   1. `useOutboundQueueKeyboard` — window keydown in **capture** phase, which
 *      closes the order inspector and calls `stopPropagation()`.
 *   2. `RightRailHost`'s `useEscapeClose` — window keydown, **bubble** phase.
 *   3. Any open `AnchoredLayer` (every house Popover / DropdownMenu /
 *      ContextMenu / cell editor / Calendar) — also `useEscapeClose`, bubble.
 *
 * Capture always runs before bubble, and `stopPropagation()` at the window
 * capture stage keeps the event from ever reaching the bubble listeners. So
 * with the inspector open, Escape inside an open condition-grade popover or row
 * info menu closed the **inspector** and left the popover on screen. The
 * queue hook's `isTypingTarget` bail-out hid this for text editors (an input or
 * textarea holds focus) but never for button/menu popovers.
 *
 * THE RULE: **the innermost open overlay owns Escape.** Overlays register here
 * while they are open; ambient keyboard owners (the queue hook, the right-rail
 * host) stand down whenever the stack is non-empty, so the event survives to the
 * overlay's own handler.
 *
 * Deliberately NOT a React context: the queue hook reads it imperatively inside
 * a window listener, and the store must work identically for any future
 * non-React consumer. Same module-store shape as `src/lib/right-rail/store.ts`
 * and `src/lib/scan-hotkey/store.ts`.
 */

const open = new Set<number>();
const listeners = new Set<() => void>();
let token = 0;
/** Cached scalar so `useSyncExternalStore` gets a stable snapshot identity. */
let depthSnapshot = 0;

function emit(): void {
  depthSnapshot = open.size;
  for (const l of listeners) l();
}

/**
 * Claim the keyboard for an overlay that just opened. Returns a release fn that
 * removes exactly this claim (safe to call twice; a stale release is a no-op).
 */
export function pushOverlay(): () => void {
  token += 1;
  const mine = token;
  open.add(mine);
  emit();
  return () => {
    if (open.delete(mine)) emit();
  };
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
