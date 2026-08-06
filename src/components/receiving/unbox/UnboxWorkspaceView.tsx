'use client';

/**
 * Unbox browse workbench — pinned two-row chrome (row 1: tabs · KPI cluster ·
 * return-to-scan CTA; row 2: search · refine/week filters — the data-table
 * triage band) over `ReceivingLinesTable` or TradingView-like compare host.
 *
 * History tab: Band 3 is find + Refine funnel (staff · scope · field · week) +
 * inspector park; View topics own layout chrome only
 * ({@link HistoryViewTopicsCluster}).
 *
 * Multi-select opens `ReceivingLineRailShell` on RightRailHost (no bottom
 * capsule). When the line workspace overlays browse, publishing + the shell
 * are suppressed so Ticket/Claim/tool stacks keep the right edge.
 */

import { Suspense, useCallback, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import {
  WORKBENCH_SHEET_CHROME,
  WORKBENCH_SHEET_HOST,
} from '@/components/dashboard/workbench-shell';
import { RECEIVING_SELECTION_SCOPE } from '@/components/station/receiving-lines-table-helpers';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { UnboxTableCardSkeleton } from '@/components/receiving/unbox/UnboxWorkbenchSkeleton';
import { UnboxWorkspaceHeader } from '@/components/receiving/unbox/UnboxWorkspaceHeader';
import { ReceivingLineRailShell } from '@/components/receiving/rail/ReceivingLineRailShell';
import { ReceivingClaimModal } from '@/components/receiving/workspace/ReceivingClaimModal';
import { UnboxCompareHost } from '@/components/receiving/unbox/compare/UnboxCompareHost';
import { UnboxCompareChrome } from '@/components/receiving/unbox/compare/UnboxCompareChrome';
import { useHistoryViewChromeOptional } from '@/components/receiving/history/history-view-chrome-context';
import { TechAllTriageTable } from '@/components/tech/all/TechAllTriageTable';
import {
  gridZoomStyle,
  type GridZoomPercent,
} from '@/design-system/components/grid/grid-zoom';
import {
  parseUnboxCompareLayout,
  UNBOX_COMPARE_LAYOUT_PARAM,
} from '@/lib/receiving/unbox-compare-layout';
import { useSurfacePaintMark } from '@/lib/observability/paint-timing';
import { useUnboxWorkspaceTab } from '@/hooks/useUnboxWorkspaceTab';
import { useReceivingLineRailSelection } from '@/hooks/useReceivingLineRailSelection';
import { toast } from '@/lib/toast';

const ReceivingLinesTable = dynamic(
  () => import('@/components/station/ReceivingLinesTable'),
  { loading: () => <UnboxTableCardSkeleton /> },
);

/** Copy line for a receiving carton/line: PO • SKU • tracking. */
function formatReceivingCopyRow(r: ReceivingLineRow): string {
  const po = (r.zoho_purchaseorder_number || r.zoho_purchaseorder_id || '').trim();
  const sku = (r.sku || '').trim();
  const tracking = (r.tracking_number || '').trim();
  return [po && `PO ${po}`, sku && `SKU ${sku}`, tracking && `TRK ${tracking}`]
    .filter(Boolean)
    .join(' • ');
}

export function UnboxWorkspaceView(props: {
  /** Non-null while UnboxLineWorkspace overlays browse — suppress the selection rail. */
  selectedLine: ReceivingLineRow | null;
  /** History triage inspect open — keep batch shell off for a single-row inspect. */
  historyTriageOpen?: boolean;
}) {
  const { unboxView, setUnboxView } = useUnboxWorkspaceTab();
  const historyViewChrome = useHistoryViewChromeOptional();
  const isHistory = unboxView === 'history';
  const [band3ControlsEl, setBand3ControlsEl] = useState<HTMLDivElement | null>(null);
  const [localZoom, setLocalZoom] = useState<GridZoomPercent>(100);
  const searchParams = useSearchParams();
  const compareLayout = parseUnboxCompareLayout(
    searchParams.get(UNBOX_COMPARE_LAYOUT_PARAM),
  );
  const isCompare = compareLayout !== 'single';
  const lineWorkspaceOpen = props.selectedLine != null;
  const historyTriageOpen = Boolean(props.historyTriageOpen);

  // History: week/▦ portal + zoom live on the inspector View cluster.
  const controlsEl = isHistory
    ? (historyViewChrome?.controlsEl ?? null)
    : band3ControlsEl;
  const zoom = isHistory ? (historyViewChrome?.zoom ?? localZoom) : localZoom;

  useSurfacePaintMark('unbox:chrome', true);

  const { selectMode, claimRow, setClaimRow, exitSelectMode } =
    useReceivingLineRailSelection({
      scope: RECEIVING_SELECTION_SCOPE,
      active: true,
      formatCopyRow: formatReceivingCopyRow,
      // R7 exclusivity — line workspace owns Ticket/Claim/tool push stacks.
      publish: !lineWorkspaceOpen,
    });

  const onZoomChange = useCallback((percent: GridZoomPercent) => {
    setLocalZoom(percent);
  }, []);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col">
      <DashboardScrollShell
        // Sheet grids self-scroll (sticky X gutter pins to the sheet floor).
        // Page Y here would bury that gutter under the row stack.
        className="h-full overflow-y-hidden bg-transparent"
        chrome={
          <div className={WORKBENCH_SHEET_CHROME}>
            <UnboxWorkspaceHeader
              tab={unboxView}
              onSelectTab={setUnboxView}
              controlsSlotRef={isHistory ? undefined : setBand3ControlsEl}
              historyTriageOpen={historyTriageOpen}
              compareChrome={
                isHistory ? undefined : (
                  <UnboxCompareChrome onZoomChange={onZoomChange} />
                )
              }
            />
          </div>
        }
      >
        <div
          className={WORKBENCH_SHEET_HOST}
          style={gridZoomStyle(zoom)}
          data-grid-zoom={zoom}
        >
          <Suspense fallback={<UnboxTableCardSkeleton />}>
            {unboxView === 'all' ? (
              <TechAllTriageTable scope="unbox" columnTriggerPortalTarget={controlsEl} />
            ) : isCompare ? (
              <UnboxCompareHost selectMode={selectMode} />
            ) : (
              <ReceivingLinesTable
                key={unboxView}
                selectMode={selectMode}
                embedded
                toolbarPortalTarget={controlsEl}
              />
            )}
          </Suspense>
        </div>
      </DashboardScrollShell>

      <ReceivingLineRailShell
        surface="lines"
        enabled={!lineWorkspaceOpen}
        inspectOpen={historyTriageOpen}
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
  );
}
