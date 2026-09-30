'use client';

/**
 * Unbox page-header CTAs — **Unbox** (resume last carton), **Check**
 * (unreceived-orders rail), and on the Inbound tab **Add purchase order**
 * (navigates to `/incoming/new?type=PO`, the form the Inbound desk's Add opens).
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ClipboardList, Package, ReceivingModeUnbox } from '@/components/Icons';
import { DeskActionSlotRegistrar, DeskHeaderAction } from '@/design-system/components/DeskActionSlot';
import { IncomingBulkTrackingPanel } from '@/components/sidebar/receiving/incoming/IncomingBulkTrackingPanel';
import { parseStaffParam } from '@/lib/station/table-url-params';
import { useUnboxWorkspaceTab } from '@/hooks/useUnboxWorkspaceTab';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { fetchUnboxOpenedRows } from '@/lib/receiving/rail/feeds';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { newInboundOrderHref } from '@/lib/inbound/new-inbound-order-path';

export function UnboxDeskActions() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const staffId = parseStaffParam(searchParams.get('staff') ?? searchParams.get('staffId'));
  const { unboxView, setUnboxView } = useUnboxWorkspaceTab();
  const [checkOpen, setCheckOpen] = useState(false);
  const isIncoming = unboxView === 'incoming';

  const handleCheck = useCallback(() => {
    setCheckOpen((open) => !open);
  }, []);
  const closeCheck = useCallback(() => setCheckOpen(false), []);

  const handleAddPo = useCallback(() => {
    router.push(newInboundOrderHref('PO'));
  }, [router]);

  const handleUnbox = useCallback(() => {
    void (async () => {
      let mru: ReceivingLineRow | undefined;
      try {
        const rows = await fetchUnboxOpenedRows({ staffId });
        mru = rows[0];
      } catch {
        // Feed unreachable: still land Recent and re-arm scan rather than a
        // dead click. Never clear an open carton on a failed lookup.
      }
      setUnboxView('recent', { clearLine: false });
      if (mru) {
        emitReceiving('receiving-select-line', { row: mru });
      }
      setTimeout(() => {
        emitReceiving('receiving-focus-scan');
      }, 60);
    })();
  }, [setUnboxView, staffId]);

  const control = useMemo(
    () => (
      <div className="flex shrink-0 items-center gap-2" data-testid="unbox-desk-actions">
        {isIncoming ? (
          <DeskHeaderAction
            variant="primary"
            size="md"
            icon={<Package className="h-3.5 w-3.5" aria-hidden />}
            ariaLabel="Add purchase order"
            onClick={handleAddPo}
            data-testid="incoming-add-purchase-order"
          >
            Add purchase order
          </DeskHeaderAction>
        ) : null}
        <DeskHeaderAction
          variant="execute"
          size="md"
          icon={<ClipboardList />}
          ariaLabel="Check unreceived orders"
          onClick={handleCheck}
          data-testid="receiving-box-check"
        >
          Check
        </DeskHeaderAction>
        <DeskHeaderAction
          variant={isIncoming ? 'secondary' : 'primary'}
          size="md"
          icon={<ReceivingModeUnbox />}
          onClick={handleUnbox}
          data-testid="receiving-box-resume"
        >
          Unbox
        </DeskHeaderAction>
      </div>
    ),
    [handleCheck, handleUnbox, handleAddPo, isIncoming],
  );

  return (
    <>
      <DeskActionSlotRegistrar>{control}</DeskActionSlotRegistrar>
      <IncomingBulkTrackingPanel open={checkOpen} checkOnly onClose={closeCheck} />
    </>
  );
}
