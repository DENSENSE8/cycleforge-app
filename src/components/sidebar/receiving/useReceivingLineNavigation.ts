'use client';

/** Sibling-line navigation for the receiving sidebar: */

import { useCallback, useEffect, useMemo, type Dispatch, type SetStateAction } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { focusWithinListKeyOwner, isListKeyRegionOpen } from '@/lib/keyboard/list-key-scope';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { filterLinesByPoGroup } from '@/lib/receiving/po-group-title';
import {
  receivingSiblingsQueryKey,
  seedReceivingSiblingsCache,
} from '@/lib/queries/receiving-queries';

interface UseReceivingLineNavigationArgs {
  selectedLine: ReceivingLineRow | null;
  scanMatchedRows: ReceivingLineRow[];
  setSelectedLine: Dispatch<SetStateAction<ReceivingLineRow | null>>;
  setScanMatchedRows: Dispatch<SetStateAction<ReceivingLineRow[]>>;
  setLineAccordionBootstrap: Dispatch<SetStateAction<'default' | 'all'>>;
}

function applySiblingPool(
  rows: ReceivingLineRow[],
  selectedLine: ReceivingLineRow,
  setScanMatchedRows: Dispatch<SetStateAction<ReceivingLineRow[]>>,
  setSelectedLine: Dispatch<SetStateAction<ReceivingLineRow | null>>,
): void {
  const scoped = filterLinesByPoGroup(rows, selectedLine);
  const pool = scoped.length > 0 ? scoped : rows;
  setScanMatchedRows(pool);
  setSelectedLine((prev) => {
    if (!prev) return prev;
    const hit = pool.find((r) => r.id === prev.id);
    if (!hit) return prev;
    return hit.serials == null && prev.serials != null
      ? { ...hit, serials: prev.serials }
      : hit;
  });
}

export function useReceivingLineNavigation({
  selectedLine,
  scanMatchedRows,
  setSelectedLine,
  setScanMatchedRows,
  setLineAccordionBootstrap,
}: UseReceivingLineNavigationArgs) {
  const queryClient = useQueryClient();

  // PO-scoped sibling list for nav + progress. Defensive: even if the store
  // briefly holds a full carton, the UI only walks the active PO group.
  const navRows = useMemo(() => {
    if (!selectedLine) return scanMatchedRows;
    return filterLinesByPoGroup(scanMatchedRows, selectedLine);
  }, [selectedLine, scanMatchedRows]);

  // When the user row-clicks a line in the dashboard table, scanMatchedRows is empty — which would disable the up/down nav.
  useEffect(() => {
    const receivingId = selectedLine?.receiving_id;
    if (!receivingId || !selectedLine) return;

    if (scanMatchedRows.some((r) => r.id === selectedLine.id)) {
      const scoped = filterLinesByPoGroup(scanMatchedRows, selectedLine);
      if (scoped.length > 0 && scoped.length !== scanMatchedRows.length) {
        setScanMatchedRows(scoped);
      }
      return;
    }

    const cached = queryClient.getQueryData<{
      success?: boolean;
      receiving_lines?: ReceivingLineRow[];
    }>(receivingSiblingsQueryKey(receivingId));
    const cachedRows = cached?.receiving_lines;
    if (cachedRows && cachedRows.some((r) => r.id === selectedLine.id)) {
      applySiblingPool(cachedRows, selectedLine, setScanMatchedRows, setSelectedLine);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/receiving-lines?receiving_id=${receivingId}`);
        const data = await res.json();
        if (cancelled) return;
        const rows = Array.isArray(data?.receiving_lines)
          ? (data.receiving_lines as ReceivingLineRow[])
          : [];
        if (rows.length > 0) {
          // Preserve any serials already seeded on the siblings cache / selection.
          const withSerials = rows.map((r) => {
            const prior =
              cachedRows?.find((c) => c.id === r.id)?.serials ??
              (selectedLine.id === r.id ? selectedLine.serials : undefined);
            return prior != null && r.serials == null
              ? ({ ...r, serials: prior } as ReceivingLineRow)
              : r;
          });
          seedReceivingSiblingsCache(queryClient, receivingId, withSerials, data?.receiving_package);
          applySiblingPool(withSerials, selectedLine, setScanMatchedRows, setSelectedLine);
        }
      } catch { /* silent — nav stays disabled if fetch fails */ }
    })();
    return () => { cancelled = true; };
  }, [selectedLine, scanMatchedRows, setScanMatchedRows, setSelectedLine, queryClient]);

  // Navigation + progress derived from the PO-scoped sibling list.
  const { currentIndex, canPrev, canNext, progressReceived, progressTotal } = useMemo(() => {
    if (!selectedLine || navRows.length === 0) {
      return { currentIndex: -1, canPrev: false, canNext: false, progressReceived: 0, progressTotal: 0 };
    }
    const idx = navRows.findIndex((r) => r.id === selectedLine.id);
    let receivedUnits = 0;
    let totalUnits = 0;
    for (const r of navRows) {
      const expected = Math.max(0, Number(r.quantity_expected ?? 0));
      const received = Math.max(0, Number(r.quantity_received ?? 0));
      const isDone = String(r.workflow_status || '').toUpperCase() === 'DONE';
      const expectedSafe = expected > 0 ? expected : 1;
      totalUnits += expectedSafe;
      receivedUnits += isDone ? expectedSafe : Math.min(received, expectedSafe);
    }
    return {
      currentIndex: idx,
      canPrev: idx > 0,
      canNext: idx >= 0 && idx < navRows.length - 1,
      progressReceived: receivedUnits,
      progressTotal: totalUnits,
    };
  }, [selectedLine, navRows]);

  // Prev/next flips the local selectedLine and fires the dedicated receiving-highlight-line event so the dashboard table's blue row…
  const goPrevLine = useCallback(() => {
    if (currentIndex <= 0) return;
    const target = navRows[currentIndex - 1];
    if (target) {
      setLineAccordionBootstrap('default');
      setSelectedLine(target);
      window.dispatchEvent(new CustomEvent('receiving-highlight-line', { detail: target.id }));
    }
  }, [currentIndex, navRows, setLineAccordionBootstrap, setSelectedLine]);

  const goNextLine = useCallback(() => {
    if (currentIndex < 0 || currentIndex >= navRows.length - 1) return;
    const target = navRows[currentIndex + 1];
    if (target) {
      setLineAccordionBootstrap('default');
      setSelectedLine(target);
      window.dispatchEvent(new CustomEvent('receiving-highlight-line', { detail: target.id }));
    }
  }, [currentIndex, navRows, setLineAccordionBootstrap, setSelectedLine]);

  // Arrow keys move the main table selection (same as carton header chevrons).
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      if (!selectedLine) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      // A focused list (e.g. the Station Displays index) owns ↑/↓ — don't step
      // the carton table + pop its peek out from under it.
      if (focusWithinListKeyOwner(event.target)) return;
      // …and while an open Displays push column is up, the table behind it stands
      // down regardless of focus (the `←|` toggle keeps focus out in the pane).
      if (isListKeyRegionOpen()) return;
      event.preventDefault();
      window.dispatchEvent(
        new CustomEvent('receiving-navigate-table', {
          detail: event.key === 'ArrowUp' ? 'prev' : 'next',
        }),
      );
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedLine]);

  return { currentIndex, canPrev, canNext, progressReceived, progressTotal, goPrevLine, goNextLine };
}
