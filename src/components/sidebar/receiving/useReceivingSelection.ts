'use client';

/** Selection hub for the receiving sidebar — the source of truth for the line the operator is working: */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  readSelectLineDetail,
  type ReceivingMode,
} from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { resolveLiveReceivingMode } from '@/lib/surface-isolation';
import { UNBOX_SURFACE_ROUTE } from '@/lib/receiving/surface-path';
import { mergeReceivingPackageMetaIntoRow } from '@/components/station/receiving-lines-table-helpers';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { useReceivingEvents } from '@/hooks/useReceivingEvents';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { dispatchReceivingWorkspaceClose } from '@/utils/events';

interface UseReceivingSelectionArgs {
  mode: ReceivingMode;
  /** Reset the full scan session (PO context + serial inputs). */
  clearScanSession: () => void;
}

interface ReceivingSelectionState {
  selectedLine: ReceivingLineRow | null;
  setSelectedLine: React.Dispatch<React.SetStateAction<ReceivingLineRow | null>>;
  scanMatchedRows: ReceivingLineRow[];
  setScanMatchedRows: React.Dispatch<React.SetStateAction<ReceivingLineRow[]>>;
  /** `'all'` when the line was chosen from the main table — expands FlowSections. */
  lineAccordionBootstrap: 'default' | 'all';
  setLineAccordionBootstrap: React.Dispatch<React.SetStateAction<'default' | 'all'>>;
  /** True when a scan (not a row click) opened the line → LineEditPanel compact. */
  scanDriven: boolean;
  setScanDriven: React.Dispatch<React.SetStateAction<boolean>>;
  /**
   * Whether the open that produced `selectedLine` should stamp the operator's
   * recents. False only for a browse-feed click — see `readSelectLineDetail`.
   */
  recordView: boolean;
  /** Preview stance open — pane paints, but nothing may be edited or written. */
  preview: boolean;
}

export function useReceivingSelection({
  mode,
  clearScanSession,
}: UseReceivingSelectionArgs): ReceivingSelectionState {
  const router = useRouter();
  const [selectedLine, setSelectedLine] = useState<ReceivingLineRow | null>(null);
  const [lineAccordionBootstrap, setLineAccordionBootstrap] = useState<'default' | 'all'>(
    'default',
  );
  const [scanDriven, setScanDriven] = useState(false);
  const [recordView, setRecordView] = useState(true);
  const [preview, setPreview] = useState(false);
  const [scanMatchedRows, setScanMatchedRows] = useState<ReceivingLineRow[]>([]);

  // Refs the handlers read so the single subscription never re-binds on selection/mode change:
  const selectedLineRef = useRef<ReceivingLineRow | null>(selectedLine);
  selectedLineRef.current = selectedLine;
  const modeRef = useRef<ReceivingMode>(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Inbound cross-pane bus (typed).
  useReceivingEvents({
    // Workspace X-button → clear our own state so both panes converge on empty.
    'receiving-workspace-close': () => {
      setSelectedLine(null);
      setLineAccordionBootstrap('default');
      setScanDriven(false);
      setScanMatchedRows([]);
      clearScanSession();
    },
    // Full deselect — fired on mode switch and the triage Found/Unfound flip.
    // Clear the panel selection too so the rail highlight resets and the new
    // list auto-selects its own top instead of pinning the prior pick.
    'receiving-clear-line': () => {
      setSelectedLine(null);
      setScanDriven(false);
      setScanMatchedRows([]);
      clearScanSession();
    },
    // Line deleted → if it was the active line, converge both panes on empty so
    // the Recent rail can't re-pin it from the stale `selectedLine`.
    'receiving-line-deleted': ({ id }) => {
      if (typeof id !== 'number') return;
      setScanMatchedRows((rows) => rows.filter((r) => r.id !== id));
      if (selectedLineRef.current?.id === id) dispatchReceivingWorkspaceClose();
    },
    // Whole carton deleted → if the active line belongs to it, converge on empty
    // so the Recent rail auto-selects the most-recent survivor.
    'receiving-entry-deleted': (cartonId) => {
      const id = Number(cartonId);
      if (!Number.isFinite(id)) return;
      setScanMatchedRows((rows) => rows.filter((r) => r.receiving_id !== id));
      if (selectedLineRef.current?.receiving_id === id) dispatchReceivingWorkspaceClose();
    },
    // Table/rail click or deep-link restore. Browse clicks always open LineEdit;
    // a History-mode click has no workspace mount, so deep-link into Unbox
    // (same contract as cmd+k / search hits).
    'receiving-select-line': (detail) => {
      const { row, expandFlowSections, recordView: shouldRecordView, preview: isPreview } =
        readSelectLineDetail(detail);
      const liveMode =
        typeof window !== 'undefined'
          ? resolveLiveReceivingMode(
              window.location.pathname,
              new URLSearchParams(window.location.search),
            )
          : modeRef.current;
      if (liveMode === 'history' && row != null) {
        const cartonId = row.receiving_id;
        router.replace(
          cartonId != null
            ? `${UNBOX_SURFACE_ROUTE}?openReceivingId=${cartonId}`
            : UNBOX_SURFACE_ROUTE,
        );
        return;
      }
      const expand = Boolean(row != null && expandFlowSections);
      setLineAccordionBootstrap(expand ? 'all' : 'default');
      setSelectedLine(row);
      // Row clicks always open the full LineEditPanel (scan-driven → compact).
      setScanDriven(false);
      // Clearing (row === null) must not leave a stale "don't record" behind for
      // the next scan — reset to the default whenever the selection empties.
      setRecordView(row == null ? true : shouldRecordView);
      // Same reset rule as recordView: clearing must not leave a stale
      // read-only lease over the NEXT carton the operator actually scans.
      setPreview(row != null && isPreview);
      setScanMatchedRows([]);
    },
    'receiving-line-updated': (updated) => {
      if (!updated || typeof updated.id !== 'number') return;
      setSelectedLine((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
      setScanMatchedRows((rows) =>
        rows.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)),
      );
    },
    'receiving-package-updated': (detail) => {
      if (!detail || detail.receiving_id == null) return;
      setSelectedLine((prev) => {
        if (!prev || prev.receiving_id !== detail.receiving_id) return prev;
        return mergeReceivingPackageMetaIntoRow(prev, detail) ?? prev;
      });
      setScanMatchedRows((rows) =>
        rows.map((r) => mergeReceivingPackageMetaIntoRow(r, detail) ?? r),
      );
    },
    // Mirror selectedLine from workspace-open so the rail highlights restored lines (localStorage + most-recent fallback dispatch open…
    'receiving-workspace-open': (detail) => {
      const row = detail?.row;
      if (!row || typeof row.id !== 'number') return;
      const liveMode =
        typeof window !== 'undefined'
          ? resolveLiveReceivingMode(
              window.location.pathname,
              new URLSearchParams(window.location.search),
            )
          : modeRef.current;
      if (liveMode === 'history' || liveMode === 'incoming') return;
      setSelectedLine((prev) => (prev?.id === row.id ? prev : row));
    },
  });

  // Selection must NOT carry across modes.
  const prevModeForResetRef = useRef<ReceivingMode | null>(null);
  useEffect(() => {
    const prev = prevModeForResetRef.current;
    prevModeForResetRef.current = mode;
    if (prev === null || prev === mode) return;
    setSelectedLine(null);
    setLineAccordionBootstrap('default');
    setScanDriven(false);
    setRecordView(true);
    setScanMatchedRows([]);
    clearScanSession();
    emitReceiving('receiving-clear-line');
  }, [mode, clearScanSession]);

  return {
    selectedLine,
    setSelectedLine,
    scanMatchedRows,
    setScanMatchedRows,
    lineAccordionBootstrap,
    setLineAccordionBootstrap,
    scanDriven,
    setScanDriven,
    recordView,
    preview,
  };
}
