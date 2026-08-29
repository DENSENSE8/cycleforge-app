'use client';

/**
 * `SheetChromeProvider` — the state the Sheets toolbar and bottom bar share.
 *
 * The toolbar sits ABOVE the grid and the status counts sit BELOW it, but both
 * describe the same sheet: zoom scales the grid the toolbar is above, the row
 * count is the count of the rows the filter button filtered, and fullscreen
 * changes the box all three live in. Threading that through the page component
 * in both directions is what produced the thirty hand-assembled workspace
 * headers this replaces, so the sheet publishes it once and the chrome reads it.
 *
 * Deliberately NOT in here: anything durable in the URL (filters, sort, the
 * active tab). Those stay URL-owned — that is the deep-link contract the
 * interaction budget depends on, and a context copy of them would be a second
 * source of truth for the same fact.
 *
 * What IS here is either ephemeral (fullscreen, the live counts a grid reports)
 * or a per-staff display preference with its own storage (zoom).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  GRID_ZOOM_DEFAULT,
  readStoredGridZoom,
  stepGridZoom,
  writeStoredGridZoom,
  type GridZoomPercent,
} from '@/design-system/components/grid/grid-zoom';

/** What the grid reports upward for the § 4.3 status counts. */
export interface SheetCounts {
  /** Rows currently rendered after filtering. */
  shown: number;
  /** Rows the surface would show with no filter — omit when unknown. */
  total?: number;
  /** Selected rows. Zero renders nothing (honest absence, never "0 selected"). */
  selected: number;
  /** How many refinements are active — lights the filter button. */
  activeFilters: number;
}

const EMPTY_COUNTS: SheetCounts = { shown: 0, selected: 0, activeFilters: 0 };

/**
 * What the grid hands the toolbar so Copy and Print can act on what is ON
 * SCREEN.
 *
 * The toolbar sits above the grid and has no access to its rows, its filter
 * result, or which columns survived the visibility resolver — and scraping the
 * DOM would copy whatever the virtualizer happens to have mounted, which on a
 * 900-row queue is about 30 rows. So the grid registers a producer and the
 * toolbar calls it.
 *
 * Deliberately a FUNCTION and not a value: it runs at click time against the
 * current render, so a stale snapshot cannot be copied.
 */
export interface SheetDataSource {
  /** Header labels, in on-screen column order. */
  columns: () => string[];
  /** Filtered rows × visible columns, as plain text. */
  rows: () => string[][];
  /** Names the print document and the export file. */
  title: string;
}

interface SheetChromeValue {
  tableId: string;
  zoom: GridZoomPercent;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  fullscreen: boolean;
  toggleFullscreen: () => void;
  counts: SheetCounts;
  /** Grids call this to publish their live counts. */
  reportCounts: (next: Partial<SheetCounts>) => void;
  dataSource: SheetDataSource | null;
  /** Grids call this to publish a Copy / Print producer. Returns an unregister. */
  registerDataSource: (source: SheetDataSource | null) => void;
  /**
   * The column the Format group acts on.
   *
   * Google Sheets formats the SELECTED CELLS, and this product's formatting is
   * per column (see `column-formats.ts`), so "which cells" reduces to "which
   * column". Rather than infer that from a cell click — which would mean
   * threading a `data-col-key` through thirteen families of hand-written cell
   * renderers, all of them domain code — the sheet carries one explicit slot.
   * The toolbar's column picker writes it, and a future grid-side click can
   * write the same slot without the toolbar changing.
   *
   * `null` means nothing is targeted, which is what disables the group rather
   * than letting a mark land on a column the operator did not choose.
   */
  activeColumnKey: string | null;
  setActiveColumnKey: (key: string | null) => void;
  /**
   * The sheet's tab strip, PUBLISHED UP from the chrome that used to draw it.
   *
   * Tabs moved to the bottom bar (operator ruling 2026-08-29), and thirty-three
   * surfaces pass them to `WorkbenchChromeHeader` as `tabs` / `activeTab` /
   * `onTabChange`. Those are structured data, not opaque nodes, so the header
   * can publish them here and the bottom bar can render them — the strip
   * relocates on every surface at once and no call site changes.
   *
   * Crucially `onTabChange` is still the surface's own callback, so every tab
   * still writes the same URL param it always did. This moves where a control is
   * drawn, never what it does — which is what keeps every deep link and every
   * existing e2e selector-by-URL working.
   */
  tabs: SheetTabStrip | null;
  publishTabs: (strip: SheetTabStrip | null) => void;
}

/** A published tab strip — the data half of what `TabSwitch` used to draw. */
export interface SheetTabStrip {
  tabs: readonly { id: string; label: string; count?: number }[];
  activeTab: string;
  onTabChange: (id: string) => void;
  /**
   * A control that ADDS to this strip (Unbox's pin-a-tab popover), rendered
   * after the last tab.
   *
   * It travels with the tabs rather than staying in the header's `leading`
   * slot, because a control whose whole job is "add one of these" beside a rail
   * that is no longer there is orphaned chrome — the operator reads it as
   * belonging to whatever it happens to sit next to.
   */
  action?: ReactNode;
}

const SheetChromeContext = createContext<SheetChromeValue | null>(null);

export function SheetChromeProvider({
  tableId,
  children,
}: {
  tableId: string;
  children: ReactNode;
}) {
  // Zoom hydrates from storage in an effect rather than a lazy initialiser:
  // `localStorage` is not available during the server render, and seeding state
  // from it directly is the classic hydration mismatch.
  const [zoom, setZoom] = useState<GridZoomPercent>(GRID_ZOOM_DEFAULT);
  const [fullscreen, setFullscreen] = useState(false);
  const [counts, setCounts] = useState<SheetCounts>(EMPTY_COUNTS);
  const [dataSource, setDataSource] = useState<SheetDataSource | null>(null);
  const [activeColumnKey, setActiveColumnKey] = useState<string | null>(null);
  const [tabs, setTabs] = useState<SheetTabStrip | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  useEffect(() => {
    setZoom(readStoredGridZoom(tableId));
  }, [tableId]);

  const commitZoom = useCallback(
    (next: GridZoomPercent) => {
      setZoom(next);
      writeStoredGridZoom(next, tableId);
    },
    [tableId],
  );

  const zoomIn = useCallback(
    () => commitZoom(stepGridZoom(zoomRef.current, 1)),
    [commitZoom],
  );
  const zoomOut = useCallback(
    () => commitZoom(stepGridZoom(zoomRef.current, -1)),
    [commitZoom],
  );
  const resetZoom = useCallback(() => commitZoom(GRID_ZOOM_DEFAULT), [commitZoom]);

  const toggleFullscreen = useCallback(() => setFullscreen((v) => !v), []);

  // Esc leaves fullscreen. This is a CSS fullscreen (the sheet fills the app
  // frame), not the Fullscreen API — an operator on a scan station must keep the
  // global header's ⌘K and the scan dock reachable, and the browser API hides
  // the whole document including those.
  //
  // **Capture phase, deliberately.** This listened on the bubble phase until
  // 2026-08-29 and Escape did nothing — `sheet-chrome-to-ship.spec.ts` caught
  // it. The app is full of Escape handlers (menus, popovers, the record cursor,
  // the rail) and one of them stops propagation before the event reaches
  // `window`. Fullscreen is the outermost box on the page, so its escape hatch
  // has to run before anything nested can swallow the key — otherwise an
  // operator is stuck in a sheet with only a toolbar button to get out.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [fullscreen]);

  const reportCounts = useCallback((next: Partial<SheetCounts>) => {
    setCounts((prev) => {
      const merged = { ...prev, ...next };
      // Bail on a no-op so a grid that re-reports identical counts on every
      // render (they all do) cannot loop the chrome.
      if (
        merged.shown === prev.shown &&
        merged.total === prev.total &&
        merged.selected === prev.selected &&
        merged.activeFilters === prev.activeFilters
      ) {
        return prev;
      }
      return merged;
    });
  }, []);

  const registerDataSource = useCallback(
    (source: SheetDataSource | null) => setDataSource(source),
    [],
  );

  const publishTabs = useCallback((strip: SheetTabStrip | null) => {
    setTabs((prev) => {
      // Bail on an equivalent strip: the publisher re-renders on every parent
      // render and would otherwise loop the chrome. Compared by VALUE — ids,
      // labels, counts and the active id — because a caller building its tab
      // array in a `useMemo` still yields a new array whenever a count moves.
      if (prev === strip) return prev;
      if (!prev || !strip) return strip;
      if (
        prev.activeTab === strip.activeTab &&
        prev.onTabChange === strip.onTabChange &&
        prev.action === strip.action &&
        prev.tabs.length === strip.tabs.length &&
        prev.tabs.every((t, i) => {
          const next = strip.tabs[i];
          return next && t.id === next.id && t.label === next.label && t.count === next.count;
        })
      ) {
        return prev;
      }
      return strip;
    });
  }, []);

  const value = useMemo<SheetChromeValue>(
    () => ({
      tableId,
      zoom,
      zoomIn,
      zoomOut,
      resetZoom,
      fullscreen,
      toggleFullscreen,
      counts,
      reportCounts,
      dataSource,
      registerDataSource,
      activeColumnKey,
      setActiveColumnKey,
      tabs,
      publishTabs,
    }),
    [
      tableId,
      zoom,
      zoomIn,
      zoomOut,
      resetZoom,
      fullscreen,
      toggleFullscreen,
      counts,
      reportCounts,
      dataSource,
      registerDataSource,
      activeColumnKey,
      tabs,
      publishTabs,
    ],
  );

  return <SheetChromeContext.Provider value={value}>{children}</SheetChromeContext.Provider>;
}

/**
 * Read the sheet chrome.
 *
 * Throws outside a provider rather than returning a no-op default: a toolbar
 * whose zoom silently does nothing is worse than a build that says the sheet was
 * mounted without its provider, and every mount site is in this repo.
 */
export function useSheetChrome(): SheetChromeValue {
  const ctx = useContext(SheetChromeContext);
  if (!ctx) {
    throw new Error('useSheetChrome must be used inside a <SheetChromeProvider>');
  }
  return ctx;
}

/** Optional read — for a control that may render outside a sheet. */
export function useSheetChromeOptional(): SheetChromeValue | null {
  return useContext(SheetChromeContext);
}

/**
 * Publish this grid's counts to the bottom bar.
 *
 * A hook rather than a prop so the reporting grid does not have to be a direct
 * child of the chrome — `NonlinearTableHost` sits several composers below it.
 */
export function useReportSheetCounts(next: Partial<SheetCounts>): void {
  const ctx = useContext(SheetChromeContext);
  const report = ctx?.reportCounts;
  const { shown, total, selected, activeFilters } = next;
  useEffect(() => {
    report?.({ shown, total, selected, activeFilters });
  }, [report, shown, total, selected, activeFilters]);
}

/**
 * Publish this grid's Copy / Print producer.
 *
 * Takes the source in a ref so a caller may pass a fresh object literal every
 * render (they all will) without re-registering on every render — the producer
 * closes over the current render's rows either way, because it is only called
 * at click time.
 */
export function useSheetDataSource(source: SheetDataSource | null): void {
  const ctx = useContext(SheetChromeContext);
  const register = ctx?.registerDataSource;
  const ref = useRef(source);
  ref.current = source;
  const title = source?.title;
  const live = source != null;
  useEffect(() => {
    if (!register) return;
    if (!live) {
      register(null);
      return;
    }
    register({
      title: title ?? 'Sheet',
      columns: () => ref.current?.columns() ?? [],
      rows: () => ref.current?.rows() ?? [],
    });
    return () => register(null);
  }, [register, live, title]);
}

/**
 * Publish this surface's tab strip to the bottom bar.
 *
 * Called by `WorkbenchChromeHeader`, which used to draw the strip itself. A
 * no-op outside a sheet, so a header mounted somewhere without a bottom bar
 * simply has no tabs rather than throwing.
 */
export function usePublishSheetTabs(strip: SheetTabStrip | null): void {
  const ctx = useContext(SheetChromeContext);
  const publish = ctx?.publishTabs;
  useEffect(() => {
    if (!publish) return;
    publish(strip);
    return () => publish(null);
  }, [publish, strip]);
}
