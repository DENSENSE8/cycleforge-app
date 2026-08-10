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
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
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

const TOGGLE_ICON_CLASS = 'h-3.5 w-3.5';
const TOGGLE_BTN_CLASS = 'shrink-0 text-text-faint hover:text-text-default';

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
    <HoverTooltip label={label} asChild>
      <IconButton
        size="xs"
        tone="neutral"
        ariaLabel={label}
        aria-expanded={open}
        icon={
          open ? (
            <ChevronUp className={TOGGLE_ICON_CLASS} />
          ) : (
            <ChevronDown className={TOGGLE_ICON_CLASS} />
          )
        }
        onClick={onToggle}
        data-testid={testId}
        className={TOGGLE_BTN_CLASS}
      />
    </HoverTooltip>
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
        <div
          className={cn(
            'relative border-b border-r border-border-soft bg-surface-card px-3 py-2',
            className,
          )}
        >
          {children}
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
