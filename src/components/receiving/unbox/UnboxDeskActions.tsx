'use client';

/**
 * Unbox page-header CTAs — **Unbox** (resume last carton), **Check**
 * (unreceived-orders rail), and on the Inbound tab **Add purchase order**
 * (inline Incoming add walk on the Incoming embed).
 */

import { useCallback, useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
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
import {
  parseIncomingIntake,
  writeIncomingIntake,
} from '@/lib/inbound/incoming-intake';
import { normalizeUnboxWorkspaceTabParams } from '@/utils/unbox-workspace-state';
import { receivingSurfaceBasePath } from '@/lib/receiving/surface-path';

export function UnboxDeskActions() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const staffId = parseStaffParam(searchParams.get('staff') ?? searchParams.get('staffId'));
  const { unboxView, setUnboxView } = useUnboxWorkspaceTab();
  const [deskRail, setDeskRail] = useState<IncomingDeskRailTool | null>(null);
  const isIncoming = unboxView === 'incoming';
  const intakeOpen = parseIncomingIntake(searchParams.get('intake')) != null;

  const handleCheck = useCallback(() => {
    setDeskRail((current) =>
      current?.kind === 'check' ? null : { kind: 'check', checkOnly: true },
    );
  }, []);

  const handleAddPo = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (parseIncomingIntake(params.get('intake'))) {
      writeIncomingIntake(params, null);
    } else {
      normalizeUnboxWorkspaceTabParams(params, 'incoming');
      writeIncomingIntake(params, 'po');
    }
    const qs = params.toString();
    const base = receivingSurfaceBasePath(pathname) || '/unbox';
    router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
  }, [pathname, router, searchParams]);

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
            ariaLabel={intakeOpen ? 'Close add purchase order' : 'Add purchase order'}
            onClick={handleAddPo}
            aria-pressed={intakeOpen}
            data-testid="incoming-add-purchase-order"
          >
            {intakeOpen ? 'Close add purchase order' : 'Add purchase order'}
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
    [handleCheck, handleUnbox, handleAddPo, isIncoming, intakeOpen],
  );

  return (
    <>
      <DeskActionSlotRegistrar>{control}</DeskActionSlotRegistrar>
      <IncomingDeskRightRail tool={deskRail} onClose={() => setDeskRail(null)} />
    </>
  );
}
