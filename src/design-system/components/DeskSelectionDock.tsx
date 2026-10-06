'use client';

/**
 * `DeskSelectionDock` — a ledger and the pane that reviews its SELECTION
 * (owner 2026-10-04, Labels & docs › Bulk). Not a record host: nothing opens,
 * no record header, no page-chrome hand-off — the pane is the selection's
 * review-and-act surface, so it lives beside {@link DeskRecordPlane} rather
 * than inside it (a mode there would branch every record effect: focus seat,
 * focus return, `data-desk-record-open`, the stage's Esc ladder).
 *
 * Measured on its OWN box (ResizeObserver), never the viewport:
 * - dock ≥ {@link DESK_SELECTION_DOCK_MIN_REM} (ledger 36rem + pane 24rem):
 *   one grid — ledger `minmax(36rem, 1fr)`, pane 24–34rem (28rem preferred),
 *   one hairline seam, both `min-w-0`; the pane never covers the ledger;
 * - narrower: the ledger keeps the full width and the pane opens as a
 *   full-height drawer at the right edge ({@link DeskStageOverlay}, with its
 *   scrim and Esc) — `pane('drawer')` paints its own close control.
 *
 * `open` is the host's: the pane shows only while there is something to
 * review. `onDismiss` is the drawer's close (scrim / Esc) — it hides the
 * drawer; it never clears the host's selection.
 */

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import {
  DESK_SELECTION_DOCK_GRID_CLASS,
  DESK_SELECTION_DOCK_MIN_REM,
  DESK_SELECTION_DRAWER_CARD_CLASS,
  DESK_SELECTION_PANE_CLASS,
} from '../tokens/desk-stage';
import { DeskStageOverlay } from './DeskStageOverlay';

export type DeskSelectionPaneMode = 'dock' | 'drawer';

export function DeskSelectionDock({
  ledger,
  pane,
  open,
  onDismiss,
  label,
  testId = 'desk-selection-dock',
}: {
  /** The ledger — mounted once, never remounted when the pane docks or drawers. */
  ledger: ReactNode;
  /** The pane's body for the mode it is painted in. */
  pane: (mode: DeskSelectionPaneMode) => ReactNode;
  /** Something to review: the pane shows. */
  open: boolean;
  /** The drawer's scrim / Esc: hide the drawer (never the selection). */
  onDismiss: () => void;
  /** The pane's accessible name. */
  label: string;
  testId?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<DeskSelectionPaneMode>('dock');

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      // The threshold is in rem, so it follows the root font size (a zoomed or enlarged UI drawers sooner).
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const next: DeskSelectionPaneMode = host.clientWidth >= DESK_SELECTION_DOCK_MIN_REM * rem ? 'dock' : 'drawer';
      setMode((current) => (current === next ? current : next));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    measure();
    return () => observer.disconnect();
  }, []);

  const docked = open && mode === 'dock';
  return (
    <div
      ref={hostRef}
      data-testid={testId}
      data-selection-pane={open ? mode : 'closed'}
      className={cn('relative min-h-0 min-w-0 flex-1', docked ? DESK_SELECTION_DOCK_GRID_CLASS : 'flex')}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{ledger}</div>
      {docked ? (
        <aside aria-label={label} data-testid={`${testId}-pane`} className={DESK_SELECTION_PANE_CLASS}>
          {pane('dock')}
        </aside>
      ) : null}
      {open && mode === 'drawer' ? (
        <DeskStageOverlay
          open
          onClose={onDismiss}
          title={label}
          showHeader={false}
          testId={`${testId}-drawer`}
          className="justify-end p-0 sm:p-0"
          cardClassName={DESK_SELECTION_DRAWER_CARD_CLASS}
        >
          {pane('drawer')}
        </DeskStageOverlay>
      ) : null}
    </div>
  );
}
