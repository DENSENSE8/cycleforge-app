'use client';

/**
 * Unbox page-header CTAs — **Unbox** (resume last carton), **Check**
 * (unreceived-orders rail), and on the Inbound tab **Add purchase order**
 * (inline intake band under the Incoming embed).
 */

import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ClipboardList, Package, ReceivingModeUnbox } from '@/components/Icons';
import { DeskActionSlotRegistrar, DeskHeaderAction } from '@/design-system/components/DeskActionSlot';
import {
  IncomingDeskRightRail,
  type IncomingDeskRailTool,
} from '@/components/sidebar/receiving/incoming/IncomingDeskRightRail';
import { parseStaffParam } from '@/hooks/useStaffFilter';
import { useUnboxWorkspaceTab } from '@/hooks/useUnboxWorkspaceTab';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { fetchUnboxOpenedRows } from '@/lib/receiving/rail/feeds';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { openPoIntake } from '@/lib/inbound/po-intake-store';

export function UnboxDeskActions() {
  const searchParams = useSearchParams();
  const staffId = parseStaffParam(searchParams.get('staff') ?? searchParams.get('staffId'));
  const { unboxView, setUnboxView } = useUnboxWorkspaceTab();
  const [deskRail, setDeskRail] = useState<IncomingDeskRailTool | null>(null);
  const isIncoming = unboxView === 'incoming';

  const handleCheck = useCallback(() => {
    setDeskRail((current) =>
      current?.kind === 'check' ? null : { kind: 'check', checkOnly: true },
    );
  }, []);

  const handleAddPo = useCallback(() => {
    setUnboxView('incoming', { clearLine: false });
    openPoIntake({ reset: true });
  }, [setUnboxView]);

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
      <IncomingDeskRightRail tool={deskRail} onClose={() => setDeskRail(null)} />
    </>
  );
}
