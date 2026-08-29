'use client';

/**
 * `SheetView` — the Sheets workbench shell, as ONE component.
 *
 * ```text
 * ┌ SheetToolbar (pinned, outside the scroll port) ────────────┐
 * │ find · filter │ copy i/e print │ zoom │ B I S │ colour align│
 * ├ body (WORKBENCH_SHEET_HOST, zoom host) ────────────────────┤
 * │ the grid                                                   │
 * ├ SheetBottomBar (sticky bottom) ────────────────────────────┤
 * │ tabs                                     counts            │
 * └────────────────────────────────────────────────────────────┘
 * ```
 *
 * It replaces `WorkbenchSheetView`'s three-band stack (tabs · KPI · triage).
 * KPI is gone from table workbenches entirely (operator ruling 2026-08-29); the
 * tabs moved to the bottom bar; find and every Sheets verb share one row.
 *
 * ## What it owns, and what it deliberately does not
 *
 * Owns: the chrome rows, the zoom host, the fullscreen box, and the counts
 * plumbing (via {@link SheetChromeProvider}).
 *
 * Does not own: the grid, the data, the URL. A page still mounts its own
 * `NonlinearTableHost` as `children` and still owns its filters and sort in the
 * URL. That boundary is the same one `WorkbenchSheetView` drew and it was right
 * — a shell that fetched would be the mega-component the table plan bans.
 *
 * ## Fullscreen is CSS, not the Fullscreen API
 *
 * `element.requestFullscreen()` hides the whole document — including the global
 * header's ⌘K and, on a scan station, the scan dock. An operator who maximised a
 * sheet to read it has not asked to be cut off from the scanner. So fullscreen
 * here means "this sheet fills the app frame": `fixed inset-0` above the app
 * chrome's z-layer, Esc to leave, everything the operator needs still mounted.
 */

import { Suspense, type ReactNode } from 'react';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import { WORKBENCH_SHEET_CHROME, WORKBENCH_SHEET_HOST } from '@/components/dashboard/workbench-shell';
import { gridZoomStyle } from '@/design-system/components/grid/grid-zoom';
import {
  SheetChromeProvider,
  useSheetChrome,
} from '@/components/sheet/sheet-chrome-context';
import { useSheetDataActions } from '@/components/sheet/useSheetDataActions';
import { useSheetFormat, type SheetFormatColumn } from '@/components/sheet/useSheetFormat';
import { SheetFormatProvider } from '@/components/sheet/sheet-format-context';
import { SheetBottomBar, type SheetBottomBarProps } from '@/components/sheet/SheetBottomBar';
import { SheetToolbar, type SheetToolbarProps } from '@/components/sheet/SheetToolbar';
import { WorkbenchViewsMenu } from '@/components/saved-views/WorkbenchViewsMenu';
import { cn } from '@/utils/_cn';

/** Neutral stand-in at the grid's geometry — never a spinner over a table. */
export function SheetFallback() {
  return <div className="min-h-[240px] flex-1 bg-surface-canvas" aria-hidden />;
}

export interface SheetViewProps {
  /** Prefs + zoom identity. One sheet = one `tableId`. */
  tableId: string;
  toolbar: SheetToolbarProps;
  bottomBar?: SheetBottomBarProps;
  children: ReactNode;
  /** In-flow siblings inside the scroll shell (rails, overlays, bulk bars). */
  overlays?: ReactNode;
  /** Class for the scroll PORT. No default — see `WorkbenchSheetView`'s note. */
  className?: string;
  /** Escape for a body that is not the standard flush sheet host. */
  sheetHostClassName?: string;
  /**
   * Columns an operator may format on this sheet.
   *
   * Omit for a sheet that must not carry formatting at all — the group is then
   * honestly absent rather than a picker over an empty list. Pass only columns
   * whose cells actually render text: a checkbox gutter or a photo track has
   * nothing for bold to act on.
   */
  formatColumns?: readonly SheetFormatColumn[];
  /**
   * Org-scoped saved views for this sheet.
   *
   * `storageKey` resolves to the `saved_views` discriminator through
   * `surfaceFromStorageKey`; `paramKeys` are the URL params a view captures.
   * Supplying it here rather than hand-mounting a menu per surface is what
   * makes "every sheet has views" true by construction — the twelve surfaces
   * rebuilt in Phase 4 would otherwise each have needed someone to remember.
   *
   * Omit for a sheet with no refinements worth naming.
   */
  savedViews?: { storageKey: string; paramKeys: readonly string[]; emptyHint?: string };
}

/**
 * Inner half — everything that needs {@link useSheetChrome}, which cannot be
 * read in the same component that mounts its provider.
 */
function SheetViewBody({
  tableId,
  toolbar,
  bottomBar,
  children,
  overlays,
  className,
  sheetHostClassName,
  formatColumns,
  savedViews,
}: SheetViewProps) {
  const { zoom, fullscreen } = useSheetChrome();
  /*
    Copy · Export · Print are resolved HERE, from whatever the grid registered
    as its data source — not passed down by the page.

    Every page wiring its own three handlers is precisely how they drift: one
    surface's Copy takes the filtered rows while its Export takes the fetched
    page. The grid is the only thing that knows what is on screen, so it
    publishes once (`useSheetDataSource`) and the shell derives all three. A
    surface that registers nothing gets no group, which is the honest absence
    the toolbar's docblock asks for.

    An explicit handler on `toolbar` still wins — the CSV staging host wants its
    own Import, and the shell should not out-argue a caller that has one.
  */
  const dataActions = useSheetDataActions();
  // Format is resolved in the shell for the same reason: a page passes the
  // columns it will let an operator paint, and nothing else.
  const format = useSheetFormat(tableId, formatColumns);
  const resolvedToolbar = {
    ...dataActions,
    ...toolbar,
    onCopyAll: toolbar.onCopyAll ?? dataActions.onCopyAll,
    onExport: toolbar.onExport ?? dataActions.onExport,
    onPrint: toolbar.onPrint ?? dataActions.onPrint,
    format: toolbar.format ?? format.handlers,
    // Views leads the right cluster, before fullscreen and the inspector — a
    // caller's own `viewActions` still render after it, so a surface with a
    // bespoke control does not lose it.
    viewActions: savedViews ? (
      <>
        <WorkbenchViewsMenu
          storageKey={savedViews.storageKey}
          paramKeys={savedViews.paramKeys}
          emptyHint={savedViews.emptyHint}
        />
        {toolbar.viewActions}
      </>
    ) : (
      toolbar.viewActions
    ),
    formatColumns: formatColumns
      ? {
          columns: format.columns,
          activeColumnKey: format.activeColumnKey,
          onSelect: format.setActiveColumnKey,
        }
      : undefined,
    capabilities: {
      ...toolbar.capabilities,
      // No formattable columns ⇒ no Format group at all.
      format: (toolbar.capabilities?.format ?? true) && Boolean(formatColumns?.length),
    },
  };

  const shell = (
    <DashboardScrollShell
      className={className}
      chrome={
        <div className={cn(WORKBENCH_SHEET_CHROME, 'flex flex-col gap-0')}>
          <SheetToolbar {...resolvedToolbar} />
        </div>
      }
    >
      {/*
        The zoom host. `--cf-density` multiplies through the grid's rem track
        floors and frozen offsets (`grid-column-geometry`), so 80% shrinks the
        columns WITH their type — never `transform: scale()`, which blurs text
        and moves the resize hit targets away from the grips.
      */}
      <div
        className={cn(WORKBENCH_SHEET_HOST, sheetHostClassName)}
        style={gridZoomStyle(zoom)}
        data-grid-zoom={zoom}
      >
        {/* The grid reads the resolved formats to paint its cells. */}
        <SheetFormatProvider formats={format.formats}>
          <Suspense fallback={<SheetFallback />}>{children}</Suspense>
        </SheetFormatProvider>
        {bottomBar ? <SheetBottomBar {...bottomBar} /> : null}
      </div>
      {overlays}
    </DashboardScrollShell>
  );

  if (!fullscreen) return shell;

  return (
    <div
      data-sheet-fullscreen=""
      // `z-panel` — above the app chrome, below a real modal, so a dialog opened
      // from a fullscreen sheet still wins. No transition: the sheet is either
      // filling the frame or it is not (AGENTS.md — no layout animation).
      className="fixed inset-0 z-panel flex flex-col bg-surface-canvas"
    >
      {shell}
    </div>
  );
}

export function SheetView(props: SheetViewProps) {
  return (
    <SheetChromeProvider tableId={props.tableId}>
      <SheetViewBody {...props} />
    </SheetChromeProvider>
  );
}
