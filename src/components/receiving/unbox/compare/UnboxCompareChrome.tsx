'use client';

/**
 * Unbox compare layout + spreadsheet zoom — icon menus on the inspector **View**
 * topic cluster (they left Band 3 on 2026-08-08; the row is find + KPI +
 * inspector only).
 *
 * **Zoom state and the ⌘+ / ⌘- / ⌘0 chords live in `HistoryViewChromeProvider`,
 * not here.** This component now mounts only inside the rail, so a listener
 * bound here would die whenever the inspector is closed — and a local
 * `useState` seeded from `readStoredGridZoom()` would re-hydrate and clobber
 * the provider's value on every rail open.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ColumnsOne,
  ColumnsTwo,
  LayoutDashboard,
  ZoomIn,
} from '@/components/Icons';
import { ToolbarIconMenu } from '@/components/ui/ToolbarIconMenu';
import {
  parseUnboxCompareLayout,
  writeUnboxCompareParams,
  defaultUnboxComparePanes,
  type UnboxCompareLayout,
  UNBOX_COMPARE_LAYOUT_PARAM,
} from '@/lib/receiving/unbox-compare-layout';
import {
  GRID_ZOOM_LEVELS,
  type GridZoomPercent,
} from '@/design-system/components/grid/grid-zoom';
import { useHistoryViewChrome } from '@/components/receiving/history/history-view-chrome-context';
import { cn } from '@/utils/_cn';

const LAYOUT_OPTS = [
  { id: 'single' as const, label: '1 pane', icon: ColumnsOne },
  { id: 'split' as const, label: '2 panes', icon: ColumnsTwo },
  { id: 'quad' as const, label: '4 panes', icon: LayoutDashboard },
];

const ZOOM_OPTS = GRID_ZOOM_LEVELS.map((level) => ({
  id: String(level) as `${GridZoomPercent}`,
  label: `${level}%`,
  icon: ZoomIn,
}));

export function UnboxCompareChrome({
  onZoomChange,
  className,
}: {
  /** Kept for call-site symmetry; the provider is the zoom SoT. */
  onZoomChange?: (percent: GridZoomPercent) => void;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const layout = parseUnboxCompareLayout(
    searchParams.get(UNBOX_COMPARE_LAYOUT_PARAM),
  );

  const { zoom, setZoom } = useHistoryViewChrome();

  const setLayout = (next: UnboxCompareLayout) => {
    const params = new URLSearchParams(searchParams.toString());
    writeUnboxCompareParams(params, next, defaultUnboxComparePanes(next));
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const applyZoom = (next: GridZoomPercent) => {
    setZoom(next);
    onZoomChange?.(next);
  };

  return (
    <div
      className={cn('flex items-center gap-1', className)}
      data-testid="unbox-compare-chrome"
    >
      <ToolbarIconMenu
        value={layout}
        onChange={setLayout}
        options={LAYOUT_OPTS}
        ariaLabel="Compare layout"
        tooltipLabel={
          layout === 'single'
            ? '1 pane'
            : layout === 'split'
              ? '2 panes'
              : '4 panes'
        }
        testId="unbox-compare-layout-menu"
      />
      <ToolbarIconMenu
        value={String(zoom) as `${GridZoomPercent}`}
        onChange={(next) => applyZoom(Number(next) as GridZoomPercent)}
        options={ZOOM_OPTS}
        ariaLabel="Spreadsheet zoom"
        tooltipLabel={`Zoom ${zoom}%`}
        testId="unbox-compare-zoom-menu"
      />
    </div>
  );
}
