'use client';

/** Outbound bridge from the sidebar's selection state to the right-pane `ReceivingLineWorkspace`. */

import { useEffect, useMemo, useRef } from 'react';
import {
  dispatchReceivingWorkspaceOpen,
  dispatchReceivingWorkspaceClose,
  dispatchReceivingWorkspaceNavState,
} from '@/utils/events';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { ReceivingMode } from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { filterLinesByPoGroup } from '@/lib/receiving/po-group-title';

interface UseReceivingWorkspaceBridgeArgs {
  /** Active sidebar mode — table-only modes must not dispatch workspace-open. */
  mode: ReceivingMode;
  selectedLine: ReceivingLineRow | null;
  lineAccordionBootstrap: 'default' | 'all';
  scanDriven: boolean;
  /** False when a browse-feed click opened the line — see `readSelectLineDetail`. */
  recordView?: boolean;
  /** Preview stance — carried onto WorkspaceState so the pane renders inert. */
  preview?: boolean;
  scanMatchedRows: ReceivingLineRow[];
  currentIndex: number;
  canPrev: boolean;
  canNext: boolean;
}

export function useReceivingWorkspaceBridge({
  mode,
  selectedLine,
  lineAccordionBootstrap,
  scanDriven,
  recordView = true,
  preview = false,
  scanMatchedRows,
  currentIndex,
  canPrev,
  canNext,
}: UseReceivingWorkspaceBridgeArgs): void {
  const isTableOnlyMode = mode === 'history' || mode === 'incoming';

  // PO-scoped count for "Line N of M" / Receive-all — mixed-PO cartons must not
  // advertise sibling lines from a different PO.
  const poScopedTotal = useMemo(() => {
    if (!selectedLine) return scanMatchedRows.length;
    const scoped = filterLinesByPoGroup(scanMatchedRows, selectedLine);
    return scoped.length > 0 ? scoped.length : scanMatchedRows.length;
  }, [selectedLine, scanMatchedRows]);

  // A close only makes sense to reverse a prior open.
  const hasOpenedRef = useRef(false);

  // Open / close: dispatch whenever the selected line, scan-driven flag, or
  // bootstrap mode changes. Null clears the workspace pane. History/Incoming
  // are table-only — never push workspace-open while those modes are active.
  useEffect(() => {
    if (isTableOnlyMode || !selectedLine) {
      if (hasOpenedRef.current) dispatchReceivingWorkspaceClose();
      return;
    }
    hasOpenedRef.current = true;
    dispatchReceivingWorkspaceOpen({
      row: selectedLine,
      accordionBootstrap: lineAccordionBootstrap,
      scanDriven,
      recordView,
      preview,
    });
  }, [isTableOnlyMode, selectedLine, lineAccordionBootstrap, scanDriven, recordView, preview]);

  // Nav state mirror: workspace header reads prev/next + Line N of M from these
  // events instead of having scanMatchedRows lifted up.
  useEffect(() => {
    if (!selectedLine) return;
    dispatchReceivingWorkspaceNavState({
      currentIndex,
      total: poScopedTotal,
      canPrev,
      canNext,
    });
  }, [selectedLine, currentIndex, poScopedTotal, canPrev, canNext]);
}
