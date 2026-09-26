'use client';

/** To-ship's **Past imports** header action — opens the per-day import record. */

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { History } from '@/components/Icons';
import {
  DeskActionSlotRegistrar,
  DeskHeaderAction,
} from '@/design-system/components/DeskActionSlot';
import { SHIPPING_ORDERS_PATH } from '@/lib/shipping/orders-desk';

export function OrdersDeskPastImportsAction() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const open = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('imports', 'true');
    // The records view owns the desk body; drop the surfaces that also claim it
    // in the same replace so two paint flags cannot race.
    params.delete('import');
    params.delete('ingest');
    params.delete('paperwork');
    router.replace(`${SHIPPING_ORDERS_PATH}?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  // Memoized: the registrar re-registers on child identity, so a fresh element
  // every render loops through the provider.
  const control = useMemo(
    () => (
      <div className="flex shrink-0" data-testid="orders-desk-past-imports">
        <DeskHeaderAction
          type="button"
          variant="secondary"
          size="sm"
          icon={<History aria-hidden className="h-3.5 w-3.5" />}
          onClick={open}
        >
          Past imports
        </DeskHeaderAction>
      </div>
    ),
    [open],
  );

  return <DeskActionSlotRegistrar role="overall">{control}</DeskActionSlotRegistrar>;
}
