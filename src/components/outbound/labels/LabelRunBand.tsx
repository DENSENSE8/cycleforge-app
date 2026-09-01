'use client';

/**
 * **LabelRunBand** — the To-ship queue's inline shipping host (R-FLOW-6,
 * host b): the expansion band the outbound lane's `renderRow` mounts BENEATH
 * the active row while label mode is on.
 *
 * The band is deliberately thin: a caption ("Labels · k of n · order"), the
 * Skip / Next and Exit verbs, and the shared {@link OrderShippingPanel}. The
 * panel itself is lazy-loaded (`next/dynamic`) so the rate-shop, the NAS
 * upload tray and their dependencies stay OUT of the To-ship first paint —
 * payload budgets ratchet (law V8) and this band mounts only when the
 * operator invokes the Labels verb.
 *
 * Motion law (M1/M2/M5): the band appears and disappears INSTANTLY — no
 * height tween, no layout animation, nothing here carries a transition. The
 * only movement is the scroll port following the active row
 * (`scrollIntoView`, block `nearest`), which moves the viewport, not the
 * geometry.
 */

import dynamic from 'next/dynamic';
import { useEffect, useRef } from 'react';
import { ChevronRight, Loader2, X } from '@/components/Icons';
import { Button } from '@/design-system/primitives';

const OrderShippingPanel = dynamic(
  () =>
    import('@/components/outbound/labels/OrderShippingPanel').then(
      (m) => m.OrderShippingPanel,
    ),
  {
    ssr: false,
    loading: () => (
      <p className="flex items-center gap-1.5 px-4 py-3 text-role-caption text-text-soft">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Loading the shipping panel…
      </p>
    ),
  },
);

export interface LabelRunBandProps {
  orderId: number;
  orderRef: string;
  /** 1-based position in the run, for the caption. */
  index: number;
  total: number;
  /** A buy committed on this row, or the operator pressed Skip / Next. */
  onAdvance: () => void;
  /** Leave label mode (Esc and the status-bar verb do the same). */
  onExit: () => void;
  /** Refresh the queue's row facts after any write on this order. */
  onFactsChanged: () => void;
}

export function LabelRunBand({
  orderId,
  orderRef,
  index,
  total,
  onAdvance,
  onExit,
  onFactsChanged,
}: LabelRunBandProps) {
  // Scroll follows the band as the run advances. `nearest` so working the
  // next visible row never yanks the whole port; runs only when the ACTIVE
  // order changes, never on data refetches.
  const bandRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bandRef.current?.scrollIntoView({ block: 'nearest' });
  }, [orderId]);

  const last = index >= total;

  return (
    <div
      ref={bandRef}
      data-testid="label-run-band"
      className="border-t border-border-accent bg-surface-sunken"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border-hairline bg-surface-card px-4 py-1.5">
        <p className="min-w-0 text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
          Labels · {index} of {total} ·{' '}
          <span className="font-mono normal-case tracking-normal text-text-default">
            {orderRef}
          </span>
        </p>
        <span className="ml-auto inline-flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            iconRight={<ChevronRight className="h-3.5 w-3.5" aria-hidden />}
            onClick={onAdvance}
            data-testid="label-run-next"
          >
            {last ? 'Finish' : 'Skip / Next'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={<X className="h-3.5 w-3.5" aria-hidden />}
            onClick={onExit}
            aria-keyshortcuts="Escape"
            data-testid="label-run-exit"
          >
            Exit
          </Button>
        </span>
      </div>
      <div className="max-w-3xl px-4 py-3">
        <OrderShippingPanel
          key={orderId}
          orderId={orderId}
          orderRef={orderRef}
          onFactsChanged={onFactsChanged}
          onLabelPurchased={onAdvance}
        />
      </div>
    </div>
  );
}
