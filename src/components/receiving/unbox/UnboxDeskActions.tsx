'use client';

/**
 * Unbox page-header CTAs — **Unbox** (resume last carton) and **Check**
 * (unreceived-orders rail).
 *
 * They used to live on Band 1 (`ReceivingBoxChromeActions`). The desk frame
 * moved the primary action to the title row (`DeskPageChrome` addSlot); this
 * registers into that slot so the buttons sit top-right, not on the tab row.
 *
 * - **Check** opens `IncomingDeskRightRail` (`kind: 'check'`) — the same
 *   RightRailHost occupant Incoming uses for receipts.
 * - **Unbox** re-opens the most recently unboxed carton (Unboxed-rail MRU) and
 *   re-arms the scan bar. Opening the carton claims the station Displays
 *   column; that is the right rail for Unbox's own components, and it yields
 *   the Check occupant (one right edge).
 */

import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ClipboardList, ReceivingModeUnbox } from '@/components/Icons';
import { DeskActionSlotRegistrar } from '@/design-system/components/DeskActionSlot';
import { Button } from '@/design-system/primitives';
import {
  IncomingDeskRightRail,
  type IncomingDeskRailTool,
} from '@/components/sidebar/receiving/incoming/IncomingDeskRightRail';
import { parseStaffParam } from '@/hooks/useStaffFilter';
import { useUnboxWorkspaceTab } from '@/hooks/useUnboxWorkspaceTab';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { fetchUnboxOpenedRows } from '@/lib/receiving/rail/feeds';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

export function UnboxDeskActions() {
  const searchParams = useSearchParams();
  const staffId = parseStaffParam(searchParams.get('staff') ?? searchParams.get('staffId'));
  const { setUnboxView } = useUnboxWorkspaceTab();
  const [deskRail, setDeskRail] = useState<IncomingDeskRailTool | null>(null);

  const handleCheck = useCallback(() => {
    setDeskRail((current) =>
      current?.kind === 'check' ? null : { kind: 'check', checkOnly: true },
    );
  }, []);

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
        <Button
          variant="execute"
          size="md"
          radius="pill"
          icon={<ClipboardList />}
          ariaLabel="Check unreceived orders"
          onClick={handleCheck}
          data-testid="receiving-box-check"
        >
          Check
        </Button>
        <Button
          variant="primary"
          size="md"
          radius="pill"
          icon={<ReceivingModeUnbox />}
          onClick={handleUnbox}
          data-testid="receiving-box-resume"
        >
          Unbox
        </Button>
      </div>
    ),
    [handleCheck, handleUnbox],
  );

  return (
    <>
      <DeskActionSlotRegistrar>{control}</DeskActionSlotRegistrar>
      <IncomingDeskRightRail tool={deskRail} onClose={() => setDeskRail(null)} />
    </>
  );
}
