'use client';

/**
 * Unbox browse workbench — the desk frame over `ReceivingLinesTable` or the
 * all-lines triage table.
 *
 * ## The tabs moved to the top (operator ruling 2026-08-31)
 *
 * They footed the page in a {@link TableTabs} strip, on the spreadsheet
 * argument: sheet tabs live at the bottom, so an operator already knows where
 * to look. The operator overruled it — every station now wears the SAME frame
 * the Shipping desk does ({@link DeskPageChrome}, the design system's page
 * chrome): title top-left, primary action top-right, tabs on their own row
 * underneath, and a detachment gap before the table.
 *
 * That is the whole point of the frame being the design system's. A station
 * that kept its own tab strip would be the second page-chrome vocabulary in a
 * product that just finished collapsing to one.
 *
 * The title is not written here — it is the nav entry's own label, threaded by
 * `DeskPageLayout`, so the header and the spine cannot drift.
 *
 * Multi-select opens `ReceivingLineRailShell` on RightRailHost (no bottom
 * capsule). When the line workspace overlays browse, publishing + the shell
 * are suppressed so Ticket/Claim/tool stacks keep the right edge.
 */

import { Suspense, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import { DeskPageLayout } from '@/components/desk/DeskPageLayout';
import { RECEIVING_SELECTION_SCOPE } from '@/components/station/receiving-lines-table-helpers';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { UnboxTableCardSkeleton } from '@/components/receiving/unbox/UnboxWorkbenchSkeleton';
import { ReceivingLineRailShell } from '@/components/receiving/rail/ReceivingLineRailShell';
import { ReceivingClaimModal } from '@/components/receiving/workspace/ReceivingClaimModal';
import { TechAllTriageTable } from '@/components/tech/all/TechAllTriageTable';
import { useSurfacePaintMark } from '@/lib/observability/paint-timing';
import { useUnboxWorkspaceTab } from '@/hooks/useUnboxWorkspaceTab';
import { useReceivingLineRailSelection } from '@/hooks/useReceivingLineRailSelection';
import { incomingDetailsTargetFromRow } from '@/lib/receiving/incoming-details-target';
import { dispatchReceivingOpenIncomingDetails } from '@/utils/events';
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
  const isIncoming = unboxView === 'incoming';
  const lineWorkspaceOpen = props.selectedLine != null;
  const recordInspectOpen = Boolean(props.recordInspectOpen);


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
    </DeskPageLayout>
  );
}
