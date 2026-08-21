'use client';

/**
 * Workbench sheet-chrome KPI snap-collapse — Band 2 binary open/closed.
 *
 * **Instant** — no height/opacity tween. Warehouse ops chrome must snap; a
 * layout animation that pushes the sheet open/closed is banned here (and for
 * sibling Band-2 doors). Children stay mounted while closed (`hidden`) so KPI
 * queries do not remount on every Hide→Show.
 *
 * Compose with {@link WorkbenchTriageBand} `kpiToggle` =
 * {@link WorkbenchKpiCollapseToggle} (right-side view-toggle zone, immediately
 * left of the inspector `trailing` when present). Persist via
 * {@link useWorkbenchKpiCollapsed} → `staff_preferences.kpiCollapsed[surface]`.
 *
 * Not continuous resize — drag the bottom hairline past a snap threshold, or
 * use the Band 3 toggle. Golden consumer: Unbox History.
 */

import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { ChevronDown, ChevronUp } from '@/components/Icons';
import { WORKBENCH_BAND_INSET_X } from '@/components/dashboard/workbench-shell';
import {
  WorkbenchBandControl,
  WORKBENCH_BAND_CONTROL_GLYPH_CLASS,
} from '@/components/dashboard/workbench-band-control';
import { cn } from '@/utils/_cn';

/** Surface ids for `staff_preferences.kpiCollapsed`. Cohort ports add keys here. */
export const WORKBENCH_KPI_SURFACE = {
  unbox: 'unbox',
  testing: 'testing',
  shipping: 'shipping',
  pack: 'pack',
  triage: 'triage',
  labels: 'labels',
  outbound: 'outbound',
  incoming: 'incoming',
} as const;

export type WorkbenchKpiSurfaceId =
  (typeof WORKBENCH_KPI_SURFACE)[keyof typeof WORKBENCH_KPI_SURFACE];

/** Drag ΔY (px) past which pointer-up snaps open ↔ closed. */
const KPI_SNAP_THRESHOLD_PX = 40;

/**
 * The Band-2 card face — flush strip, seam below, `py-2` for the vertical
 * rhythm, and the shared {@link WORKBENCH_BAND_INSET_X} horizontally.
 *
 * Four surfaces had hand-typed this exact string (FBA twice, Locations bins,
 * Walk-in sales) rather than composing the band, so each carried its own copy
 * of a recipe that is a property of the BAND, not of what is in it — and none
 * of them inherited the empty-strip collapse below.
 */
const WORKBENCH_BAND2_CARD_CLASS = cn(
  'relative border-b border-r border-border-soft bg-surface-card py-2',
  // Horizontal inset comes from the shared band token, not from here: the tile
  // face already owns `px-2 py-1`, so a card inset stacked on top of it put
  // Band 2's labels at 20px while the search glyph one band down sat at 8px.
  WORKBENCH_BAND_INSET_X,
);

/**
 * The probe the `globals.css` rule reads. `display: contents` contributes no
 * box, so a strip lays out exactly as if it were a direct child.
 */
function WorkbenchBandBody({ children }: { children: ReactNode }) {
  return (
    <div data-workbench-kpi-body="" className="contents">
      {children}
    </div>
  );
}

/**
 * Band 2 as a RAW card — the same face and the same empty-collapse as
 * {@link WorkbenchKpiBand}, minus the snap. Compose this for a strip that is
 * **mode-scoped** rather than a per-staff preference (FBA's disposition tiles
 * change with the tab and filter the board, so a collapse pref would be the
 * wrong control), or for a pane that seats its own Band 2 outside the sheet
 * shell (Walk-in).
 *
 * An empty strip paints nothing here too — same rule, same attribute.
 */
export function WorkbenchBand2Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-workbench-kpi-band=""
      className={cn(WORKBENCH_BAND2_CARD_CLASS, 'shrink-0', className)}
    >
      <WorkbenchBandBody>{children}</WorkbenchBandBody>
    </div>
  );
}

export function WorkbenchKpiCollapseToggle({
  open,
  onToggle,
  hideLabel = 'Hide metrics',
  showLabel = 'Show metrics',
  testId = 'workbench-kpi-collapse-toggle',
}: {
  open: boolean;
  onToggle: () => void;
  hideLabel?: string;
  showLabel?: string;
  testId?: string;
}) {
  const label = open ? hideLabel : showLabel;
  return (
    // No `lit`: the chevron's direction already says which way the band is, and
    // a fill on top of it would be the same fact told twice — worse, KPI is
    // open by default, so a lit-when-open control would be blue on every load.
    <WorkbenchBandControl
      label={label}
      aria-expanded={open}
      icon={
        open ? (
          <ChevronUp className={WORKBENCH_BAND_CONTROL_GLYPH_CLASS} />
        ) : (
          <ChevronDown className={WORKBENCH_BAND_CONTROL_GLYPH_CLASS} />
        )
      }
      onClick={onToggle}
      data-testid={testId}
    />
  );
}

function KpiSnapHandle({
  open,
  onSnapCollapse,
  onSnapExpand,
}: {
  open: boolean;
  onSnapCollapse: () => void;
  onSnapExpand: () => void;
}) {
  const startYRef = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    startYRef.current = e.clientY;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const startY = startYRef.current;
      startYRef.current = null;
      setDragging(false);
      if (startY == null) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      const delta = e.clientY - startY;
      if (open && -delta >= KPI_SNAP_THRESHOLD_PX) {
        onSnapCollapse();
      } else if (!open && delta >= KPI_SNAP_THRESHOLD_PX) {
        onSnapExpand();
      }
    },
    [onSnapCollapse, onSnapExpand, open],
  );

  const onPointerCancel = useCallback(() => {
    startYRef.current = null;
    setDragging(false);
  }, []);

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label={open ? 'Drag up to hide metrics' : 'Drag down to show metrics'}
      data-testid="workbench-kpi-snap-handle"
      data-kpi-open={open ? '' : undefined}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className={cn(
        // 8px hit target centered on the hairline; does not consume layout height.
        'absolute inset-x-0 bottom-0 z-raised h-2 translate-y-1/2 cursor-row-resize touch-none',
        'bg-transparent',
        dragging && 'bg-border-soft/40',
      )}
    />
  );
}

/**
 * Band 2 shell — open: KPI chrome + snap-drag hairline; closed: thin residual
 * grab strip so drag-down can expand (Band 3 toggle remains the primary door).
 *
 * Instant binary snap (`hidden` ↔ visible). Children stay mounted while closed
 * so KPI queries and layout don't remount on every Hide→Show.
 */
export function WorkbenchKpiBand({
  open,
  onSnapCollapse,
  onSnapExpand,
  children,
  className,
}: {
  open: boolean;
  onSnapCollapse: () => void;
  onSnapExpand: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="relative shrink-0" data-workbench-kpi-band="" data-open={open ? '' : undefined}>
      <div
        // Instant: no motion / collapseHeight / transition. `hidden` keeps the
        // React tree mounted (queries stay warm) while freeing layout height.
        hidden={!open}
        aria-hidden={!open}
        className={cn(!open && 'pointer-events-none')}
      >
        <div className={cn(WORKBENCH_BAND2_CARD_CLASS, className)}>
          {/*
            The probe sits INSIDE the card and the snap handle stays outside it:
            a band with nothing in it must not offer a handle to collapse.
          */}
          <WorkbenchBandBody>{children}</WorkbenchBandBody>
          {open ? (
            <KpiSnapHandle
              open
              onSnapCollapse={onSnapCollapse}
              onSnapExpand={onSnapExpand}
            />
          ) : null}
        </div>
      </div>
      {!open ? (
        <div
          className="relative h-0 border-b border-r border-border-soft"
          aria-hidden
        >
          <KpiSnapHandle
            open={false}
            onSnapCollapse={onSnapCollapse}
            onSnapExpand={onSnapExpand}
          />
        </div>
      ) : null}
    </div>
  );
}
