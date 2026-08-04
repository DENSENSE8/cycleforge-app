'use client';

/**
 * LedgerGrid parent→child drill host — WMS-wide SoT.
 *
 * Linked dual panes: left parent map selection **drives** the right child
 * collection. Compose this from any table family (receiving · orders ·
 * pickup · catalog hierarchies · …). Domain adapters supply:
 * - parent map content (`parents` slot — usually {@link LedgerDrillParentMap})
 * - child LedgerGrid / surface (`children` when a parent is selected)
 * - URL contract for durable parent key (see `ledger-drill-layout.ts`)
 *
 * **Not** fold (in-grid expand) and **not** compare (independent panes).
 * Resize via {@link useHorizontalEdgeResize} — never a twin drag SoT.
 * Narrow viewports: list-OR-detail (same grammar as master-detail).
 *
 * Parent-pane collapse: filter-bar trailing {@link RailFilterCollapseButton}
 * (via {@link useLedgerDrillCollapse}) parks the left map to a slim expand
 * strip — same Family-B grammar as the context rail.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { LeftDockCollapseStrip } from '@/components/sidebar/tech/left-dock-toggle';
import { HorizontalEdgeResizeHandle } from '@/design-system/components/HorizontalEdgeResizeHandle';
import {
  EDGE_RESIZE_COLLAPSE_SLACK_PX,
  useHorizontalEdgeResize,
} from '@/design-system/hooks';
import { useLocalStorage } from '@/hooks';
import { cn } from '@/utils/_cn';

const DEFAULT_NARROW_BREAKPOINT_PX = 720;

type LedgerDrillCollapseApi = {
  collapse: () => void;
};

const LedgerDrillCollapseContext = createContext<LedgerDrillCollapseApi | null>(
  null,
);

/** Returns null outside {@link LedgerDrillHost}. */
export function useLedgerDrillCollapse(): LedgerDrillCollapseApi | null {
  return useContext(LedgerDrillCollapseContext);
}

export type LedgerDrillHostProps = {
  /** Left pane — parent map (compose {@link LedgerDrillParentMap}). */
  parents: ReactNode;
  /**
   * Right pane body when a parent is selected. Domain mounts its child
   * `LedgerGridSurface` / thin adapter here.
   */
  children: ReactNode;
  /** True when a durable parent key is selected (drives empty / narrow). */
  hasSelection: boolean;
  /** Clear parent selection (narrow back control). */
  onClearSelection: () => void;
  /**
   * Persist key for the left pane width — must be unique per surface
   * (e.g. `cf.receivingDrill.splitRatio`, `cf.ordersDrill.splitRatio`).
   * Collapse preference is `${storageKey}.collapsed`.
   */
  storageKey: string;
  /** Empty right pane copy when nothing selected. */
  emptySelectionMessage?: string;
  /** Narrow back control label. */
  narrowBackLabel?: string;
  defaultLeftWidth?: number;
  minLeftWidth?: number;
  maxWidthPad?: number;
  narrowBreakpointPx?: number;
  resizeLabel?: string;
  resizeTestId?: string;
  className?: string;
  testId?: string;
};

export function LedgerDrillHost({
  parents,
  children,
  hasSelection,
  onClearSelection,
  storageKey,
  emptySelectionMessage = 'Select a parent record.',
  narrowBackLabel = '← Back',
  defaultLeftWidth = 360,
  minLeftWidth = 260,
  maxWidthPad = 320,
  narrowBreakpointPx = DEFAULT_NARROW_BREAKPOINT_PX,
  resizeLabel = 'Resize drill panes',
  resizeTestId = 'ledger-drill-split-resize',
  className,
  testId = 'ledger-drill-host',
}: LedgerDrillHostProps) {
  const [collapsed, setCollapsed] = useLocalStorage(
    `${storageKey}.collapsed`,
    false,
  );

  const { width: leftWidth, isDragging, edgeHandleProps } =
    useHorizontalEdgeResize({
      storageKey,
      defaultWidth: defaultLeftWidth,
      minWidth: minLeftWidth,
      maxWidthPad,
      edge: 'trailing',
      label: resizeLabel,
      testId: resizeTestId,
      collapseBelowPx: minLeftWidth - EDGE_RESIZE_COLLAPSE_SLACK_PX,
      onCollapseBeyondMin: () => setCollapsed(true),
    });

  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(`(max-width: ${narrowBreakpointPx}px)`);
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [narrowBreakpointPx]);

  // List-OR-detail on narrow: parents until a key is chosen, then children.
  // Operator collapse parks the parent map on wide layouts only.
  const showParents = (!narrow || !hasSelection) && !(collapsed && !narrow);
  const showChildren = !narrow || hasSelection;
  const showCollapseStrip = collapsed && !narrow;

  return (
    <LedgerDrillCollapseContext.Provider
      value={{ collapse: () => setCollapsed(true) }}
    >
      <div
        className={cn('flex h-full min-h-0 w-full min-w-0', className)}
        data-testid={testId}
        data-ledger-drill="1"
        data-collapsed={showCollapseStrip ? 'true' : 'false'}
      >
        {showCollapseStrip ? (
          <LeftDockCollapseStrip
            onExpand={() => setCollapsed(false)}
            label="Show parent map"
            testId="ledger-drill-expand"
            hostDataAttrs={{ 'data-ledger-drill-collapsed': true }}
          />
        ) : null}

        {showParents ? (
          <div
            className={cn(
              'relative flex min-h-0 flex-col overflow-visible',
              narrow ? 'min-w-0 flex-1' : 'shrink-0',
            )}
            style={narrow ? undefined : ({ width: leftWidth } as CSSProperties)}
          >
            {parents}
            {!narrow ? (
              <HorizontalEdgeResizeHandle
                edge="trailing"
                edgeHandleProps={edgeHandleProps}
                isDragging={isDragging}
                placement="inset"
                tooltipLabel="Drag to resize panes · drag past minimum to hide · double-click for default"
              />
            ) : null}
          </div>
        ) : null}

        {showChildren ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {narrow && hasSelection ? (
              <div className="flex shrink-0 items-center gap-2 border-b border-border-soft px-3 py-1.5">
                {/* ds-raw-button: drill back link in master-detail chrome, not a standard action */}
                <button
                  type="button"
                  className="ds-raw-button text-role-caption font-semibold uppercase tracking-widest text-accent"
                  onClick={onClearSelection}
                >
                  {narrowBackLabel}
                </button>
              </div>
            ) : null}
            {hasSelection ? (
              children
            ) : (
              <div
                className="flex min-h-0 flex-1 items-center justify-center border border-border-soft bg-surface-card px-6 text-center"
                data-testid={`${testId}-empty`}
              >
                <p className="text-role-caption text-text-soft">
                  {emptySelectionMessage}
                </p>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </LedgerDrillCollapseContext.Provider>
  );
}
