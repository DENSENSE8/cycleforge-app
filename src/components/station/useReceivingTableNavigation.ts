'use client';

/**
 * Keyboard / sidebar navigation for the receiving-lines table:
 *   - `receiving-navigate-table` (sidebar chevrons / arrow keys) steps the LINE
 *     selection prev/next through the visible rows (single-select only).
 *   - keeps the active row scrolled into view when selection changes.
 * Extracted from ReceivingLinesTable.
 *
 * Observe openers (Share / Audit / Copy / carton details) live on `/carton/[id]`
 * — not a receiving-details overlay stepped from this table.
 */

import { useEffect } from 'react';
import type { ReceivingLineRow } from './receiving-line-row';

interface UseReceivingTableNavigationArgs {
  orderedVisibleRows: ReceivingLineRow[];
  handleSelectRow: (row: ReceivingLineRow) => void;
  selectedIdRef: React.MutableRefObject<number | null>;
  selectModeRef: React.MutableRefObject<boolean>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  selectedId: number | null;
  /**
   * When false, skip the `receiving-navigate-table` line stepper. Unbox/Triage
   * keep the history table mounted (cache) but route chevrons to the sidebar
   * rail — both surfaces share the same event name, so the table must yield.
   */
  tableNavEnabled?: boolean;
}

export function useReceivingTableNavigation({
  orderedVisibleRows,
  handleSelectRow,
  selectedIdRef,
  selectModeRef,
  scrollRef,
  selectedId,
  tableNavEnabled = true,
}: UseReceivingTableNavigationArgs): void {
  // Sidebar chevrons / arrow keys → move the line selection (History/Incoming only).
  useEffect(() => {
    if (!tableNavEnabled) return;
    const handler = (event: Event) => {
      const direction = (event as CustomEvent<'prev' | 'next'>).detail;
      if (direction !== 'prev' && direction !== 'next') return;
      if (selectModeRef.current) return; // arrow-nav is for single-select only
      if (orderedVisibleRows.length === 0) return;

      const step = direction === 'prev' ? -1 : 1;
      const currentIndex = orderedVisibleRows.findIndex((row) => row.id === selectedIdRef.current);
      if (currentIndex < 0) return;

      const nextRow = orderedVisibleRows[currentIndex + step];
      if (!nextRow) return;
      handleSelectRow(nextRow);
    };
    window.addEventListener('receiving-navigate-table', handler);
    return () => window.removeEventListener('receiving-navigate-table', handler);
  }, [handleSelectRow, orderedVisibleRows, selectedIdRef, selectModeRef, tableNavEnabled]);

  // Keep the active row in view when selection changes from sidebar nav.
  useEffect(() => {
    if (!selectedId || !scrollRef.current) return;
    const rowEl = scrollRef.current.querySelector(
      `[data-line-row-id="${selectedId}"]`,
    ) as HTMLElement | null;
    rowEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId, scrollRef]);
}
