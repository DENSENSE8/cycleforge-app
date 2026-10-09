'use client';

/**
 * Unbox › Return found — when the scanned serial traces to an order we packed
 * or shipped, a large bottom-right card rises over a light shadcn scrim (the
 * house Dialog overlay, lightened and fading in) and holds until the operator dismisses it
 * (✕, Esc, or a click on the scrim) or takes its CTA to the Return order tab
 * (operator 2026-10-09: never an inline notice). The tab itself is the order
 * record, whose return reason sits above Fulfillment (`OrderReturnReason`).
 */

import { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { RotateCcw, X } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { elevationClass } from '@/design-system/tokens/shadows';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { formatMonthDayTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { buildReturnOrderModel, type ReturnOrderRow } from './unbox-return-order';

/**
 * The return-found card for one carton. Open the moment the serial resolves to
 * a packed / shipped order; once the operator answers it, that carton + order
 * stays quiet for the session.
 */
export function UnboxReturnFoundToast({
  cartonKey,
  order,
  row,
  onView,
}: {
  cartonKey: string | number;
  order: ShippedOrder | null;
  row: ReturnOrderRow;
  onView: () => void;
}) {
  const [answered, setAnswered] = useState<ReadonlySet<string>>(() => new Set());
  const key = order ? `${cartonKey}:${order.id}` : null;
  const open = key != null && !answered.has(key);
  const answer = () => {
    if (key) setAnswered((prev) => new Set(prev).add(key));
  };
  // The station's own key layers claim Escape before Radix's document listener
  // hears it, so the card answers Esc itself, first, while it is open.
  useEffect(() => {
    if (!open || !key) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setAnswered((prev) => new Set(prev).add(key));
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, key]);
  if (!order) return null;
  const model = buildReturnOrderModel(order, row);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => (next ? undefined : answer())}>
      <DialogPortal>
        <DialogOverlay
          className={cn(
            // A light scrim, never a darkened page (operator 2026-10-09): the floor stays readable behind the card.
            'bg-surface-canvas/40',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-200',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-150',
            'motion-reduce:animate-none',
          )}
        />
        <DialogPrimitive.Content
          data-testid="unbox-return-found-toast"
          className={cn(
            'fixed bottom-6 right-6 z-modal flex w-[min(30rem,calc(100vw-3rem))] flex-col gap-4',
            'rounded-mode border border-border-info bg-surface-card p-5 text-text-default',
            elevationClass('overlay'),
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-bottom-4 data-[state=open]:duration-200',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-150',
            'motion-reduce:animate-none',
          )}
        >
          <header className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-info text-text-info">
              <RotateCcw className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-role-title font-semibold text-text-default">Return found</DialogTitle>
              <DialogDescription className="text-role-body text-text-muted">
                This unit left on order <span className="font-mono text-text-default">{model.orderRef}</span>
                {model.stageAt ? ` — ${model.stage} ${formatMonthDayTimePST(model.stageAt)}` : ''}.
              </DialogDescription>
            </div>
            <DialogPrimitive.Close asChild>
              <IconButton
                icon={<X className="h-4 w-4" />}
                ariaLabel="Dismiss"
                size="sm"
                radius="control"
                data-testid="unbox-return-found-dismiss"
              />
            </DialogPrimitive.Close>
          </header>
          <p className="text-role-body text-text-default">
            Return reason:{' '}
            {model.reason ? (
              <span className="font-semibold text-text-warning">{model.reason.label}</span>
            ) : (
              <span className="italic text-text-muted">No return reason on file</span>
            )}
          </p>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              answer();
              onView();
            }}
            className="w-full justify-center"
            data-testid="unbox-return-found-view"
          >
            View return order
          </Button>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}
