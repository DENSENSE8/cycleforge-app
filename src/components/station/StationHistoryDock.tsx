'use client';

/**
 * `StationHistoryDock` — what this station just did, as the leftmost column of
 * every scan station.
 *
 * ```text
 * ┌───────────────┬──────────────────────────────────────────────┐
 * │ HISTORY    12 │  SheetToolbar                                │
 * ├───────────────┼──────────────────────────────────────────────┤
 * │ 14:32 76755…  │  the sheet                                   │
 * │ 14:29 78217…  │                                              │
 * │ 14:27 96954…  │                                              │
 * └───────────────┴──────────────────────────────────────────────┘
 * ```
 *
 * ## Why it is a dock and not a rail
 *
 * Station history used to live in the resident sidebar rail
 * (`ShippingStaffScanHistoryRail`, `PackRecentPacksRail`, `LabelsRecentRail`,
 * `SidebarRecentRailBase`) — collapsible, sometimes behind a mode switch, and
 * on some stations reachable only after the operator had already navigated away
 * from what they were scanning.
 *
 * The thing an operator asks a scan station most often is **"did that scan
 * land?"**, and the answer has to be on screen the moment it does. The
 * interaction budget makes that explicit: a status overview costs **≤ 1**
 * interaction, and opening the page is the one. A rail you have to expand is
 * already over budget, and a rail that remembers being collapsed is over budget
 * for every operator who inherited a collapsed bench.
 *
 * So: always mounted, always visible, and leftmost — the scan-in edge of the
 * station, where the eye is already going for the scan bar.
 *
 * ## Why it is not `position: absolute` over the sheet
 *
 * It is a real flex column. Overlaying it would put the newest rows on top of
 * the grid's frozen identity pane, which is the one part of the sheet that must
 * never be covered — an operator matching a scan against the list needs both at
 * once, which is the whole reason the dock exists.
 *
 * ## What it does NOT do
 *
 * No animation on append. A new row appears; nothing slides. A row that springs
 * into place delays the paint that tells a scanning operator the scan landed,
 * which is precisely the fact this dock exists to deliver (`AGENTS.md` — no
 * layout animations).
 */

import type { ReactNode } from 'react';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import { cn } from '@/utils/_cn';

/**
 * Dock width.
 *
 * Wide enough for a timestamp plus a truncated identifier — the two facts a
 * "did it land?" glance needs — and no wider: every pixel here is one the
 * sheet's frozen identity pane does not get, and the sheet is what the operator
 * is working IN.
 */
const DOCK_WIDTH = 'w-[13.5rem]';

export interface StationHistoryDockProps {
  /** Station name for the accessible label ("Unbox history"). */
  station: string;
  /** Rows, newest first. Already trimmed by the caller's feed. */
  children: ReactNode;
  /** Count beside the title. Omit when the feed cannot say (honest absence). */
  count?: number;
  /** Rendered when the feed is settled and empty. */
  emptyMessage?: string;
  /** True while the first load is in flight — suppresses the empty message. */
  loading?: boolean;
  className?: string;
}

export function StationHistoryDock({
  station,
  children,
  count,
  emptyMessage = 'Nothing scanned yet on this bench.',
  loading = false,
  className,
}: StationHistoryDockProps) {
  const isEmpty = !loading && !children;
  return (
    <aside
      aria-label={`${station} history`}
      data-station-history-dock=""
      className={cn(
        'flex min-h-0 shrink-0 flex-col border-r border-border-soft bg-surface-card',
        DOCK_WIDTH,
        className,
      )}
    >
      <header
        className={cn(
          'flex shrink-0 items-center justify-between gap-2 border-b border-border-soft px-3',
          PRIMARY_CHROME_ROW_FACE,
        )}
      >
        <span className="truncate text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
          History
        </span>
        {typeof count === 'number' && count > 0 ? (
          <span
            className="tabular-nums text-role-micro text-text-faint"
            data-testid="station-history-dock-count"
          >
            {count > 999 ? '999+' : count}
          </span>
        ) : null}
      </header>
      {/*
        Its OWN scroll port. The sheet beside it scrolls independently — an
        operator scrolling back through the morning's scans must not move the
        row they are about to act on.
      */}
      <div
        data-testid="station-history-dock-scroll"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        {isEmpty ? (
          <p className="px-3 py-4 text-role-micro text-text-soft">{emptyMessage}</p>
        ) : (
          children
        )}
      </div>
    </aside>
  );
}

/**
 * The row face — one shape for every station's dock.
 *
 * A station's history rows differ in what they NAME (a carton, an order, a
 * unit) and in nothing else: each is a time, an identifier, and optionally who
 * did it. Sharing the face is what stops six benches from teaching six slightly
 * different reading orders for the same glance.
 */
export function StationHistoryDockRow({
  time,
  identifier,
  meta,
  onOpen,
  active = false,
}: {
  /** Short local time — "14:32". */
  time: string;
  /** The thing scanned. Truncates; the title attribute carries it in full. */
  identifier: string;
  /** One quiet line under the identifier (staff, status, quantity). */
  meta?: string;
  onOpen?: () => void;
  /** This row is the record currently open in the sheet. */
  active?: boolean;
}) {
  const body = (
    <>
      <span className="shrink-0 tabular-nums text-role-micro text-text-faint">{time}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-role-caption text-text-default" title={identifier}>
          {identifier}
        </span>
        {meta ? (
          <span className="block truncate text-role-micro text-text-soft">{meta}</span>
        ) : null}
      </span>
    </>
  );

  const shell = cn(
    'flex w-full items-start gap-2 border-b border-border-hairline px-3 py-1.5 text-left',
    // Colour only — a hover that moved a row would shift the list an operator is
    // reading against a scanner.
    'transition-colors duration-100 ease-out',
    active ? 'bg-surface-accent' : 'hover:bg-surface-hover',
  );

  // A dock with no open gesture is a READOUT, and a readout must not look
  // clickable — an operator who taps a dead row learns to stop trusting the
  // dock's affordances.
  if (!onOpen) {
    return <div className={shell}>{body}</div>;
  }
  return (
    <button type="button" onClick={onOpen} className={cn('ds-raw-button', shell)}>
      {body}
    </button>
  );
}
