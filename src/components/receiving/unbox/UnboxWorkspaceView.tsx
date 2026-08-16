'use client';

/**
 * Unbox browse workbench — pinned three-band chrome over `ReceivingLinesTable`
 * or the TradingView-like compare host:
 *
 *   Band 1  tabs · Check · return-to-scan CTA
 *   Band 2  KPI canvas (snap-collapsible)
 *   Band 3  the LEAN row — find (refine in-field) · KPI collapse · inspector
 *
 * **Band 3 hosts no `right` slot and no controls portal** (ruled 2026-08-08).
 * Layout chrome — compare panes, spreadsheet zoom, ▦ column display, row paint,
 * Drill|List — lives on the inspector View cluster
 * ({@link HistoryViewTopicsCluster}) on EVERY tab, not just History, which is
 * why `controlsEl` and `zoom` are read unconditionally from the view-chrome
 * context below rather than from a tab-dependent local.
 *
 * Multi-select opens `ReceivingLineRailShell` on RightRailHost (no bottom
 * capsule). When the line workspace overlays browse, publishing + the shell
 * are suppressed so Ticket/Claim/tool stacks keep the right edge.
 */

import { Suspense, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import {
  WORKBENCH_SHEET_CHROME,
  WORKBENCH_SHEET_HOST,
} from '@/components/dashboard/workbench-shell';
import { RECEIVING_SELECTION_SCOPE } from '@/components/station/receiving-lines-table-helpers';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import ReceivingLinesTable from '@/components/station/ReceivingLinesTable';
import { UnboxTableCardSkeleton } from '@/components/receiving/unbox/UnboxWorkbenchSkeleton';
import { UnboxWorkspaceHeader } from '@/components/receiving/unbox/UnboxWorkspaceHeader';
import { ReceivingLineRailShell } from '@/components/receiving/rail/ReceivingLineRailShell';
import { ReceivingClaimModal } from '@/components/receiving/workspace/ReceivingClaimModal';
import { UnboxCompareHost } from '@/components/receiving/unbox/compare/UnboxCompareHost';
import { useHistoryViewChromeOptional } from '@/components/receiving/history/history-view-chrome-context';
import { TechAllTriageTable } from '@/components/tech/all/TechAllTriageTable';
import {
  GRID_ZOOM_DEFAULT,
  gridZoomStyle,
} from '@/design-system/components/grid/grid-zoom';
import {
  parseUnboxCompareLayout,
  UNBOX_COMPARE_LAYOUT_PARAM,
} from '@/lib/receiving/unbox-compare-layout';
import { useSurfacePaintMark } from '@/lib/observability/paint-timing';
import { useUnboxWorkspaceTab } from '@/hooks/useUnboxWorkspaceTab';
import { useReceivingLineRailSelection } from '@/hooks/useReceivingLineRailSelection';
import { incomingDetailsTargetFromRow } from '@/lib/receiving/incoming-details-target';
import { dispatchReceivingOpenIncomingDetails } from '@/utils/events';
import { toast } from '@/lib/toast';

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
  /**
   * A carton is picked in the `detail:history` inspector — keep the batch shell
   * off for a single-row inspect. **The View-only shell is deliberately NOT
   * folded in here:** it owns no row selection, so suppressing multi-select
   * bulk actions for it would cost print / claim / copy to reach the ▦.
   */
  recordInspectOpen?: boolean;
  /** Either inspector state — drives the Band 3 toggle's open face. */
  inspectorOpen?: boolean;
}) {
  const { unboxView, setUnboxView } = useUnboxWorkspaceTab();
  const historyViewChrome = useHistoryViewChromeOptional();
  const isIncoming = unboxView === 'incoming';
  const searchParams = useSearchParams();
  const compareLayout = parseUnboxCompareLayout(
    searchParams.get(UNBOX_COMPARE_LAYOUT_PARAM),
  );
  const isCompare = compareLayout !== 'single' && !isIncoming;
  const lineWorkspaceOpen = props.selectedLine != null;
  const recordInspectOpen = Boolean(props.recordInspectOpen);

  // The ▦ portal host and the zoom value live on the inspector View cluster on
  // EVERY tab now — Band 3 hosts neither. The provider wraps the whole Unbox
  // subtree (ReceivingRightPane → UnboxHistoryHost), so the optional read is
  // never null on /unbox; the fallbacks are for a stray mount elsewhere.
  const controlsEl = historyViewChrome?.controlsEl ?? null;
  const zoom = historyViewChrome?.zoom ?? GRID_ZOOM_DEFAULT;

  useSurfacePaintMark('unbox:chrome', true);

  const { selectMode, selectedRows, claimRow, setClaimRow, exitSelectMode } =
    useReceivingLineRailSelection({
      scope: RECEIVING_SELECTION_SCOPE,
      active: true,
      formatCopyRow: formatReceivingCopyRow,
      // R7 exclusivity — line workspace owns Ticket/Claim/tool push stacks.
      publish: !lineWorkspaceOpen,
    });

  // Inbound tab: 1-check → Incoming details (same occupancy as `/incoming`).
  const blockedIncomingToastRowIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isIncoming) {
      blockedIncomingToastRowIdRef.current = null;
      return;
    }
    if (selectedRows.length !== 1) {
      blockedIncomingToastRowIdRef.current = null;
      return;
    }
    const row = selectedRows[0];
    if (!row) return;
    const resolved = incomingDetailsTargetFromRow(row);
    if (!resolved.ok) {
      if (blockedIncomingToastRowIdRef.current !== row.id) {
        blockedIncomingToastRowIdRef.current = row.id;
        toast.info(resolved.toast);
      }
      return;
    }
    blockedIncomingToastRowIdRef.current = null;
    const t = resolved.target;
    dispatchReceivingOpenIncomingDetails({
      poId: t.poId,
      poNumber: t.poNumber,
      shipmentId: t.shipmentId,
      inboundSourceType: t.inboundSourceType,
      inboundSourceOrderId: t.inboundSourceOrderId,
      receivingId: t.receivingId,
      receivingLineId: t.receivingLineId,
    });
  }, [isIncoming, selectedRows]);

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
              inspectorOpen={Boolean(props.inspectorOpen)}
              // Middle region only while the browse is the middle. A carton
              // covers this view (kept mounted, `visibility: hidden`), and the
              // station bench is the other `middle` claimant —
              // `registerNavRegion` keys by region id, so two live registrations
              // would silently fight over `⌘; m`.
              navRegionId={lineWorkspaceOpen ? null : 'middle'}
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
        surface={isIncoming ? 'incoming' : 'lines'}
        enabled={!lineWorkspaceOpen}
        // Only a PICKED carton claims the slot. The View-only shell owns no row
        // selection, so folding it in here would silently cost print / claim /
        // copy on selected rows the moment an operator opened it to reach ▦.
        inspectOpen={recordInspectOpen}
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
