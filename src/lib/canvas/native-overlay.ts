/**
 * Native-overlay reconciliation — the Electron `WebContentsView` problem.
 *
 * ## The problem, stated exactly
 *
 * `electron/vendor-view.js` attaches a `WebContentsView` to the window at
 * **absolute pixel bounds**. It is an OS-level layer above the page: it cannot be
 * clipped by `overflow:hidden`, cannot be z-indexed under a tile, and does not
 * reflow when the DOM does. The renderer's only lever is
 * `setDesktopVendorViewBounds()` (`src/lib/desktop/desktop-host.ts`), which the
 * owning slot calls with a fresh `getBoundingClientRect()`.
 *
 * A tiling canvas moves slots. So either every layout change re-issues the
 * bounds, or the canvas reserves a region the native view owns.
 *
 * ## The decision: re-issue, do not reserve
 *
 * **Reserving is wrong here**, for three reasons that are properties of this
 * codebase rather than preferences:
 *
 * 1. The view is anchored to a slot **inside one tile's subtree** — the Unbox
 *    Listings dropdown inside the Displays column (`ListingVendorViewPanel`).
 *    A reserved global region would outlive the tile that owns it, and the
 *    reserved rectangle would sit over whatever tile happened to be there next.
 * 2. **Tab suspension already solves the hard half.** Exactly one tab is live;
 *    a suspended tile unmounts its subtree, `ListingVendorViewPanel`'s effect
 *    cleanup runs, and it calls `hideDesktopVendorView()` on the way out. A
 *    reserved region would have to reimplement that lifecycle from the outside.
 * 3. `openVendorView` is **lease-renewed** — main drops the view when the
 *    heartbeat stops. A region the canvas reserved but no component was pinging
 *    would be dropped by main anyway, so the reservation would be a rectangle
 *    describing a view that is not there.
 *
 * ## What re-issuing needs, and the one gap it closes
 *
 * `ListingVendorViewPanel` already re-syncs on three signals: a `ResizeObserver`
 * on its own slot, `window.resize`, and a capture-phase `scroll`. Between them
 * they cover almost everything a canvas does — a sash drag, a degrade to a single
 * tile, and a suspension all change the slot's size or scroll position.
 *
 * The gap is a layout change that **moves a slot without resizing it**: a
 * maximize toggle that swaps which tile sits at which offset, a tab moved
 * between panes of equal width, a preset applied that reorders same-sized panes.
 * `ResizeObserver` does not fire for a pure translation, and neither does
 * `window.resize`. The view then paints over the wrong pixels until something
 * else happens to resize it.
 *
 * {@link publishCanvasLayoutChange} closes that gap: the canvas bumps a
 * monotonic epoch and emits one window event on every layout mutation and every
 * measured-geometry change, and any owner of a native overlay re-issues its
 * bounds when it hears it. One listener line per overlay owner — see the
 * component report's `needsOutsideLane` for the exact addition to
 * `ListingVendorViewPanel.tsx`, which is outside this lane.
 *
 * A window `CustomEvent` rather than a store subscription because the audience
 * is "whatever happens to own a native view right now", which is not knowable
 * from here and is deliberately not a registry — a native view is a rare,
 * self-managing thing with a lease, and giving it a registration would create a
 * second lifecycle to keep in sync with main's.
 */

/** The event every native-overlay owner listens for. */
export const CANVAS_LAYOUT_EVENT = 'cf:canvas-layout';

/** Why the layout changed — diagnostics only; no listener should branch on it. */
export type CanvasLayoutChangeReason =
  /** A tree edit: split, close, move, preset, ratio. */
  | 'layout'
  /** The canvas frame was re-measured. */
  | 'frame'
  /** Focus moved between panes (which tile is live changed). */
  | 'focus';

export interface CanvasLayoutEventDetail {
  readonly epoch: number;
  readonly reason: CanvasLayoutChangeReason;
}

let epoch = 0;

/**
 * Monotonic layout generation. Exposed so a consumer can cheaply tell "has the
 * canvas moved since I last measured" without holding a listener.
 */
export function getCanvasLayoutEpoch(): number {
  return epoch;
}

/**
 * Bump the epoch and tell the window.
 *
 * Synchronous and unguarded: this runs on a sash drag frame, so it must not
 * allocate a subscription list or await anything. A listener that throws is
 * swallowed by the DOM's own dispatch, which is the behaviour we want — a broken
 * overlay owner must not take the canvas's layout commit down with it.
 */
export function publishCanvasLayoutChange(reason: CanvasLayoutChangeReason): number {
  epoch += 1;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<CanvasLayoutEventDetail>(CANVAS_LAYOUT_EVENT, {
        detail: { epoch, reason },
      }),
    );
  }
  return epoch;
}

/**
 * Subscribe to layout changes. Returns an unsubscribe.
 *
 * For overlay owners this is the whole integration: call your existing `sync()`
 * (the one that already runs on `ResizeObserver` / `resize` / `scroll`).
 */
export function subscribeCanvasLayout(
  listener: (detail: CanvasLayoutEventDetail) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent<CanvasLayoutEventDetail>).detail;
    if (detail) listener(detail);
  };
  window.addEventListener(CANVAS_LAYOUT_EVENT, handler);
  return () => window.removeEventListener(CANVAS_LAYOUT_EVENT, handler);
}

/** Test-only: reset the epoch so a suite's assertions start from a known number. */
export function resetCanvasLayoutEpoch(): void {
  epoch = 0;
}
