'use client';

import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { resolveClassifyCompact } from './carton-context-bar-layout';

export type CartonContextActionId = 'listing' | 'claim' | 'photos';

/**
 * Responsive layout for {@link CartonContextCard}'s one-row chrome — classify
 * pills collapse to dot-only / shortLabel faces when they collide with
 * identity or actions. Listing, price, and photos stay on the top-right;
 * only Claim parks in `⋯` on a narrow bar.
 *
 * ## Two rules that keep this from oscillating
 *
 * **1. Observe the CONTAINER, never the classify cluster.** The bar's width is
 * the independent variable; the classify cluster's width is the *output* of the
 * decision this hook makes. Observing the output closes the loop — measure →
 * flip `classifyCompact` → labels become shortLabels → cluster width changes →
 * observer fires → measure. `CLASSIFY_EXPAND_HYSTERESIS_PX` damps the
 * steady state but cannot stop a perturbation (a portal mounting, a scrollbar
 * appearing, a font settling) from starting it flapping. While it flaps the
 * pills change width under a stationary pointer, which fires `mouseleave` on
 * whichever one the operator is hovering and makes its menu flash open/closed.
 * The cluster's width is still READ inside `apply()`; it is just not a trigger.
 *
 * **2. `frozen` locks the decision while a cell owns the pointer.** An operator
 * mid-interaction must never have the row reflow under them, whatever the cause.
 * The caller passes `frozen` while any classify menu is open. This is belt to
 * rule 1's braces: rule 1 removes the known loop, rule 2 makes any *future*
 * perturbation harmless for the duration that it would actually be felt.
 */
export function useCartonContextBarLayout(
  barRef: RefObject<HTMLElement | null>,
  frozen = false,
) {
  const [classifyCompact, setClassifyCompact] = useState(false);
  const [overflowActions, setOverflowActions] = useState<CartonContextActionId[]>([]);
  const compactRef = useRef(false);
  const labelWidthRef = useRef(0);
  // Read inside the observer callback, so freezing takes effect without
  // tearing down and re-creating the observer (which would itself re-measure).
  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;
  /** Latest `apply`, so the unfreeze effect can re-measure without re-creating the observer. */
  const applyRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    const apply = (width: number) => {
      if (frozenRef.current) return;
      // Photos, listing, and price stay on the top-right of the bar even
      // when the strip is narrow — they are identity chrome, not overflow
      // verbs. Only Claim parks in ⋯.
      setOverflowActions(width < 520 ? ['claim'] : []);

      const identity = bar.querySelector<HTMLElement>('[data-carton-bar-slot="identity"]');
      const classify = bar.querySelector<HTMLElement>('[data-carton-bar-slot="classify"]');
      const actions = bar.querySelector<HTMLElement>('[data-carton-bar-slot="actions"]');
      if (!identity || !classify || !actions) {
        compactRef.current = false;
        setClassifyCompact(false);
        return;
      }

      const classifyContentWidth = classify.offsetWidth;
      if (!compactRef.current) labelWidthRef.current = classifyContentWidth;

      const next = resolveClassifyCompact({
        barWidth: width,
        identityWidth: identity.offsetWidth,
        classifyContentWidth,
        actionsWidth: actions.offsetWidth,
        currentlyCompact: compactRef.current,
        labelClassifyWidth: labelWidthRef.current,
      });
      if (next === compactRef.current) return;
      compactRef.current = next;
      setClassifyCompact(next);
    };

    applyRef.current = () => apply(bar.clientWidth);
    apply(bar.clientWidth);
    // Batch to the next frame: a ResizeObserver callback that synchronously
    // mutates layout it also observes emits "ResizeObserver loop completed with
    // undelivered notifications" and can re-enter within the same frame.
    let raf = 0;
    const ro = new ResizeObserver(() => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        apply(bar.clientWidth);
      });
    });
    // ONLY the bar. Observing '[data-carton-bar-slot="classify"]' here is what
    // made this self-referential — see the hook docblock, rule 1.
    ro.observe(bar);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      applyRef.current = null;
      ro.disconnect();
    };
  }, [barRef]);

  // A resize that lands while frozen is dropped, not queued — re-measure once
  // the pointer lets go, or the row keeps a stale compact decision until the
  // next unrelated resize.
  useLayoutEffect(() => {
    if (frozen) return;
    applyRef.current?.();
  }, [frozen]);

  return { classifyCompact, overflowActions };
}
