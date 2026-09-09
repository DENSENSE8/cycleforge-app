'use client';

/**
 * To-ship's **Past imports** header action — opens the per-day import record.
 *
 * `role="overall"` and not `primary`: this is a COLLECTION action ("show me
 * what arrived"), not the desk's create verb. Sync Google Sheet keeps `primary`
 * and the Labels walk keeps `leading`, so all three coexist rather than
 * evicting each other (`DeskActionSlot` — last writer wins PER ROLE). To-ship
 * tucks its CSV export into the Sync dropdown (`copyExportPlacement: 'menu'`),
 * which is what leaves `overall` free for this.
 *
 * The button only writes `?imports` — the desk body decides what to paint from
 * it, the same split `?import=csv` already uses. `imports` / `importDay` /
 * `importFrom` / `importTo` are declared in `ORDERS_ROUTE_PARAMS`; an
 * undeclared param is stripped by `useSurfaceParamHygiene` on the operator's
 * next keystroke, which is the bug `ingest` and `paperwork` each paid for once.
 */

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
      <div className="shrink-0" data-testid="orders-desk-past-imports">
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
