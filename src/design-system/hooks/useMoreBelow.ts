'use client';

import { useCallback, useEffect, useState, type RefCallback } from 'react';

/**
 * Pure metrics → "more content below" for the scroll-edge lip.
 * Threshold absorbs sub-pixel / rubber-band noise at the end.
 */
export function moreBelowFromMetrics(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  thresholdPx = 2,
): boolean {
  if (scrollHeight <= clientHeight + thresholdPx) return false;
  return scrollTop + clientHeight < scrollHeight - thresholdPx;
}

/** Industry-standard scroll affordance: */
export function useMoreBelow(thresholdPx = 2): {
  scrollRef: RefCallback<HTMLElement>;
  moreBelow: boolean;
} {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [moreBelow, setMoreBelow] = useState(false);

  const scrollRef = useCallback<RefCallback<HTMLElement>>((el) => {
    setNode(el);
  }, []);

  useEffect(() => {
    if (!node) {
      setMoreBelow(false);
      return undefined;
    }

    const update = () => {
      setMoreBelow(
        moreBelowFromMetrics(
          node.scrollTop,
          node.clientHeight,
          node.scrollHeight,
          thresholdPx,
        ),
      );
    };

    update();
    node.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(node);
    // Content height changes (rail refetch / edit mode) without the port resizing.
    if (node.firstElementChild instanceof Element) {
      ro.observe(node.firstElementChild);
    }

    return () => {
      node.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [node, thresholdPx]);

  return { scrollRef, moreBelow };
}
