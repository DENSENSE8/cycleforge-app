'use client';

import { useEffect, useRef } from 'react';

/**
 * "Is this render an entity→entity swap inside an ALREADY-OPEN overlay?"
 *
 * The answer drives all three halves of the opaque cover-replace contract on a
 * station overlay — `AnimatePresence mode`, the child's `initial`, and the
 * entering sibling's stacking:
 *
 *   const hardCut = useOverlaySwapHardCut(showOverlay);
 *   <AnimatePresence initial={false} mode={hardCut ? 'sync' : 'wait'}>
 *     <motion.div
 *       initial={hardCut ? false : panePresence.initial}
 *       style={{ zIndex: zIndex.panel + (hardCut ? 1 : 0) }}
 *
 * `false` on the first open (browse→overlay: wait + enter fade) and on close;
 * `true` only while the overlay stays open across a key change (sync + hard-cut
 * enter, new pane covering the old one). Law:
 * `docs/rules/display/motion-crossfade.md` → Carton→carton uses `mode="sync"`.
 *
 * **The previous-open flag is committed in an effect, never assigned during
 * render.** Four surfaces used to write it inline —
 * `wasOpenRef.current = open` on the line after reading it — which is not a
 * pure render: React's dev double-invoke re-runs the body with the ref already
 * advanced, so the second pass answers `true` where the first answered `false`.
 * On `/unbox`, whose overlay is server-rendered open on cold land, that split
 * landed as a real hydration mismatch on every load — the server emitted
 * `z-index: 100` and the hydrating client `zIndex: 101`, which React reports
 * and then refuses to patch up. Reading a ref during render is fine; writing
 * one is what makes the render answer depend on how many times it ran.
 *
 * Effect timing is not a hazard here: React flushes pending passive effects
 * before it begins the next render pass, so a swap can never observe a stale
 * flag — and the mount render, the only one hydration compares, is exactly the
 * one that must answer `false`.
 */
export function useOverlaySwapHardCut(overlayOpen: boolean): boolean {
  const committedOpenRef = useRef(false);
  const hardCut = overlayOpen && committedOpenRef.current;
  useEffect(() => {
    committedOpenRef.current = overlayOpen;
  });
  return hardCut;
}
