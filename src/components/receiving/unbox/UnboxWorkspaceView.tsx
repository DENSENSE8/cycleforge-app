'use client';

/**
 * Unbox browse workbench — the desk frame over `ReceivingLinesTable` or the all-lines triage table.
 * ## The tabs moved to the top (operator ruling 2026-08-31)
 */

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { UnboxDeskActions } from '@/components/receiving/unbox/UnboxDeskActions';
import { RECEIVING_SELECTION_SCOPE } from '@/components/station/receiving-lines-table-helpers';
import { formatReceivingCopyRow } from '@/lib/receiving/receiving-copy-row';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { UnboxTableCardSkeleton } from '@/components/receiving/unbox/UnboxWorkbenchSkeleton';
import { ReceivingLineRailShell } from '@/components/receiving/rail/ReceivingLineRailShell';
import { ReceivingClaimModal } from '@/components/receiving/workspace/ReceivingClaimModal';
import { TechAllTriageTable } from '@/components/tech/all/TechAllTriageTable';
import { useSurfacePaintMark } from '@/lib/observability/paint-timing';
import { useUnboxWorkspaceTab } from '@/hooks/useUnboxWorkspaceTab';
import { useReceivingLineRailSelection } from '@/hooks/useReceivingLineRailSelection';
import { toast } from '@/lib/toast';
import {
  UNBOX_WORKSPACE_TABS,
  UNBOX_WORKSPACE_TAB_LABEL,
  type UnboxWorkspaceTab,
} from '@/utils/unbox-workspace-state';

const ReceivingLinesTable = dynamic(
  () => import('@/components/station/ReceivingLinesTable'),
  { loading: () => <UnboxTableCardSkeleton /> },
);

export function UnboxWorkspaceView(props: {
  /** Non-null while UnboxLineWorkspace overlays browse — suppress the selection rail. */
  selectedLine: ReceivingLineRow | null;
}) {
  const { unboxView, setUnboxView } = useUnboxWorkspaceTab();
  const isIncoming = unboxView === 'incoming';
  const lineWorkspaceOpen = props.selectedLine != null;

  useSurfacePaintMark('unbox:chrome', true);

  const { selectMode, claimRow, setClaimRow, exitSelectMode } =
    useReceivingLineRailSelection({
      scope: RECEIVING_SELECTION_SCOPE,
      active: true,
      formatCopyRow: formatReceivingCopyRow,
      // R7 exclusivity — line workspace owns Ticket/Claim/tool push stacks.
      publish: !lineWorkspaceOpen,
    });

  const tabs = UNBOX_WORKSPACE_TABS.filter((id) => id !== 'queue').map((id) => ({
    id,
    label: UNBOX_WORKSPACE_TAB_LABEL[id],
  }));

  return (
    <DeskPageLayout
      className="h-full"
      tabs={tabs}
      // `queue` is the default body, so it lights NO tab — `all` is the absence
      // of a narrowing, not a control that means stop. Clicking the lit tab
      // clears back to it, exactly as the foot strip behaved.
      activeTab={unboxView === 'queue' ? '' : unboxView}
      onTabChange={(id) =>
        setUnboxView(id === unboxView ? 'queue' : (id as UnboxWorkspaceTab))
      }
    >
      <UnboxDeskActions />
    <div className="relative flex h-full min-h-0 w-full flex-col">
      <DashboardScrollShell
        // Sheet grids self-scroll (sticky X gutter pins to the sheet floor).
        // Page Y here would bury that gutter under the row stack.
        className="h-full overflow-y-hidden bg-transparent"
      >
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <Suspense fallback={<UnboxTableCardSkeleton />}>
            {unboxView === 'all' ? (
              <TechAllTriageTable scope="unbox" />
            ) : (
              <ReceivingLinesTable
                key={unboxView}
                selectMode={selectMode}
                embedded
              />
            )}
          </Suspense>
        </div>
      </DashboardScrollShell>
      <ReceivingLineRailShell
        surface={isIncoming ? 'incoming' : 'lines'}
        enabled={!lineWorkspaceOpen}
      />

      {claimRow ? (
        <ReceivingClaimModal
          open
          row={claimRow}
          onClose={() => setClaimRow(null)}
          onTicketCreated={(tk) => {
            toast.success(`Claim filed — ${tk}`);
            setClaimRow(null);
            exitSelectMode();
          }}
        />
      ) : null}
    </div>
    </DeskPageLayout>
  );
}
