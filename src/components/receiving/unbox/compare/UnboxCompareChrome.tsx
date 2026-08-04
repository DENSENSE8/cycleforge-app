'use client';

/**
 * Unbox compare layout + spreadsheet zoom — icon menus in the triage band.
 */

import { useCallback, useEffect, useState } from 'react';
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
  GRID_ZOOM_DEFAULT,
  GRID_ZOOM_LEVELS,
  readStoredGridZoom,
  stepGridZoom,
  writeStoredGridZoom,
  type GridZoomPercent,
} from '@/design-system/components/grid/grid-zoom';
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
  onZoomChange?: (percent: GridZoomPercent) => void;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const layout = parseUnboxCompareLayout(
    searchParams.get(UNBOX_COMPARE_LAYOUT_PARAM),
  );

  const [zoom, setZoom] = useState<GridZoomPercent>(GRID_ZOOM_DEFAULT);

  useEffect(() => {
    const z = readStoredGridZoom();
    setZoom(z);
    onZoomChange?.(z);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once
  }, []);

  const setLayout = (next: UnboxCompareLayout) => {
    const params = new URLSearchParams(searchParams.toString());
    writeUnboxCompareParams(params, next, defaultUnboxComparePanes(next));
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const applyZoom = useCallback(
    (next: GridZoomPercent) => {
      setZoom(next);
      writeStoredGridZoom(next);
      onZoomChange?.(next);
    },
    [onZoomChange],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        applyZoom(stepGridZoom(zoom, 1));
      } else if (e.key === '-') {
        e.preventDefault();
        applyZoom(stepGridZoom(zoom, -1));
      } else if (e.key === '0') {
        e.preventDefault();
        applyZoom(GRID_ZOOM_DEFAULT);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [applyZoom, zoom]);

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
