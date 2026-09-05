'use client';

/**
 * Approve / reject squares for the CAGED To-ship queue, painted in the desk's
 * right stage gutter — outside the table card, scroll-synced to the rows.
 *
 * **Why outside the grid.** A Google Sheet sync lands caged orders on the LIVE
 * `UnshippedTable` (`?cage=1`), not on a second grid — the display law in
 * `docs/todo/sheets-sync-gutter-overlay-IMPLEMENTATION-PROMPT.md`. Adding an
 * `actions` track to the Orders compound columns to carry the verdict would
 * change the sheet's width and fork the column model for one facet, so the
 * squares ride the leftover space beside the 1152px card instead. The table is
 * pixel-identical to a normal To-ship visit.
 *
 * **How it tracks rows.** `OrdersQueueTableRow` already stamps
 * `data-order-row-id` on every painted row, so this reads geometry straight off
 * the DOM the virtualizer produced — no row renderer, no DataTable binding, no
 * shared ref. Rows outside the scroll port are clipped away, so the layer never
 * paints over the column header or past the card's floor.
 *
 * **The verdict is a session decision, not a release.** Approve accepts the
 * sheet row into intake; it does NOT open the cage (G1–G3 stay the gate, and
 * `POST /api/orders/[id]/cage-release` stays the only thing that releases).
 * Pressing an active square again clears it — `nextSheetTriageDecision` owns
 * that law, shared with the staging board's own squares.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImportDecisionSquare } from '@/components/outbound/orders/import-staging/ImportDecisionSquare';
import { COMPOUND_ROW_PX } from '@/components/tables/compound/compound-row-chrome';
import { nextSheetTriageDecision } from '@/lib/orders-sync/sheets-inline-triage';
import type { TableImportRowDecision } from '@/lib/tables/import/types';

/** Gap between the table card's right edge and the first square. */
const GUTTER_GAP_PX = 8;

interface RowBox {
  id: string;
  top: number;
  height: number;
}

/**
 * The grid's scrolling body box — the clip region for the squares.
 *
 * NOT the whole `[data-cf-grid]` surface: LedgerGrid keeps the column header as
 * a flex sibling ABOVE the scroll port, so clipping to the surface let a row
 * sliding under the header keep a square painted beside the header itself.
 * The scrolling descendant is the box whose top edge is the first data pixel.
 */
function findPort(grid: HTMLElement): HTMLElement {
  for (const el of grid.querySelectorAll<HTMLElement>('*')) {
    if (el.scrollHeight <= el.clientHeight + 4) continue;
    const overflowY = getComputedStyle(el).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') return el;
  }
  return grid;
}

/** Visible `[data-order-row-id]` rows, in viewport coordinates, clipped to the port. */
function measureRows(grid: HTMLElement): { left: number; rows: RowBox[] } | null {
  const port = findPort(grid);
  const portRect = port.getBoundingClientRect();
  if (portRect.width === 0) return null;
  const rows: RowBox[] = [];
  for (const el of grid.querySelectorAll<HTMLElement>('[data-order-row-id]')) {
    const id = el.dataset.orderRowId;
    if (!id) continue;
    const rect = el.getBoundingClientRect();
    if (rect.height === 0) continue;
    // Whole-square clipping: a row only half-out of the port would otherwise
    // paint a 48px square across the header hairline or the footer bar.
    if (rect.top < portRect.top || rect.bottom > portRect.bottom) continue;
    rows.push({ id, top: rect.top, height: rect.height });
  }
  return { left: grid.getBoundingClientRect().right + GUTTER_GAP_PX, rows };
}

export function SheetTriageGutterOverlay({
  containerRef,
}: {
  /** The desk body that holds the table — the overlay's search root. */
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  const [layer, setLayer] = useState<{ left: number; rows: RowBox[] } | null>(null);
  const [verdicts, setVerdicts] = useState<ReadonlyMap<string, TableImportRowDecision>>(
    () => new Map(),
  );
  const frame = useRef<number | null>(null);

  const sync = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const grid = containerRef.current?.querySelector<HTMLElement>('[data-cf-grid]');
      setLayer(grid ? measureRows(grid) : null);
    });
  }, [containerRef]);

  useEffect(() => {
    sync();
    // Scroll is captured because the virtualizer's port is a descendant, and a
    // desk can scroll the page under it too.
    window.addEventListener('scroll', sync, true);
    window.addEventListener('resize', sync);
    const host = containerRef.current;
    const observer = host ? new MutationObserver(sync) : null;
    observer?.observe(host!, { childList: true, subtree: true });
    return () => {
      window.removeEventListener('scroll', sync, true);
      window.removeEventListener('resize', sync);
      observer?.disconnect();
      // Clearing the handle matters as much as cancelling it: this ref IS the
      // throttle, so a cleanup that leaves a stale id behind latches `sync`
      // closed and every later scroll / mutation returns early — the overlay
      // then never measures again and paints nothing at all.
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
    };
  }, [sync, containerRef]);

  const decide = useCallback((id: string, action: 'approve' | 'reject') => {
    setVerdicts((prev) => {
      const next = new Map(prev);
      const decision = nextSheetTriageDecision(prev.get(id), action);
      if (decision === null) next.delete(id);
      else next.set(id, decision);
      return next;
    });
  }, []);

  // Y approves, N or X rejects — on the row holding focus, so the operator can
  // triage from the keyboard without a new chord or a Tab stop per square.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      const action = key === 'y' ? 'approve' : key === 'n' || key === 'x' ? 'reject' : null;
      if (!action) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      const row = target?.closest<HTMLElement>('[data-order-row-id]');
      const id = row?.dataset.orderRowId;
      if (!id) return;
      event.preventDefault();
      decide(id, action);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [decide]);

  if (!layer || layer.rows.length === 0 || typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-testid="sheet-triage-gutter"
      className="pointer-events-none fixed inset-0 z-dropdown"
    >
      {layer.rows.map((row) => {
        const verdict = verdicts.get(row.id);
        return (
          <div
            key={row.id}
            // The row this pair belongs to — the overlay's only join back to
            // the table, and what a test asserts alignment against.
            data-triage-row={row.id}
            className="pointer-events-auto absolute flex"
            style={{ left: layer.left, top: row.top, height: row.height || COMPOUND_ROW_PX }}
          >
            <ImportDecisionSquare
              tone="approve"
              active={verdict === 'approved'}
              sizeClass="w-12"
              label={verdict === 'approved' ? 'Unapprove this order' : 'Approve this order'}
              onPress={() => decide(row.id, 'approve')}
            />
            <ImportDecisionSquare
              tone="reject"
              active={verdict === 'rejected'}
              sizeClass="w-12"
              label={verdict === 'rejected' ? 'Clear the rejection' : 'Reject this order'}
              onPress={() => decide(row.id, 'reject')}
            />
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
