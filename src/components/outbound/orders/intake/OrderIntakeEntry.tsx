'use client';

/**
 * The new-order entry at the top of the To-ship list (`?triage=new`, sidebar
 * "Add one order"): the intake form, inline — no dialog. It sits in the list's
 * scroll at card width; Cancel / Esc (discard check when dirty) folds it away.
 * `?triage=<id>` reopens a saved caged order in the same place.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Stack } from '@/design-system/primitives/Stack';
import {
  ORDER_PREFILL_PARAM,
  clearStashedOrderPrefill,
  decodeOrderPrefill,
  manualOrderDraftToIntake,
  readStashedOrderPrefill,
} from '@/lib/orders/manual-order-draft';
import { OrderIntakeForm } from './OrderIntakeForm';

export function OrderIntakeEntry({
  orderId,
  onClose,
  onOrderCreated,
}: {
  /** Saved order the entry works on; `null` = a new order. */
  orderId: number | null;
  /** Clears `?triage=` (Cancel, Esc, released). */
  onClose: () => void;
  /** Binds `?triage=` to the saved (or opened-existing) order. */
  onOrderCreated: (orderId: number) => void;
}) {
  // `?prefill=` — a phone order drafted in the chat. The desk rewrites its URL
  // on mount and drops params it does not own, so the value is captured ONCE —
  // from the URL, else from "Open in form"'s same-tab stash.
  const searchParams = useSearchParams();
  const [prefillRaw] = useState(() =>
    orderId == null ? (searchParams.get(ORDER_PREFILL_PARAM) ?? readStashedOrderPrefill()) : null,
  );
  const initialDraft = useMemo(() => {
    const draft = decodeOrderPrefill(prefillRaw);
    return draft ? manualOrderDraftToIntake(draft) : undefined;
  }, [prefillRaw]);
  const close = () => {
    clearStashedOrderPrefill();
    onClose();
  };

  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rootRef.current?.scrollIntoView({ block: 'start' });
  }, []);

  return (
    <Stack ref={rootRef} className="rounded-mode bg-surface-sunken p-3" data-testid="order-intake-entry">
      <OrderIntakeForm
        // The form reads its prefill once; binding to the saved order keeps the same session.
        key={prefillRaw ?? 'blank'}
        orderId={orderId}
        initialDraft={initialDraft}
        onOrderCreated={(id) => {
          clearStashedOrderPrefill();
          onOrderCreated(id);
        }}
        onReleased={close}
        onCancel={close}
      />
    </Stack>
  );
}
