'use client';

/**
 * To-ship Orders compare host — single / split (1×2) / quad (2×2).
 * Each pane owns an independent lifecycle view; page-level rail selection stays
 * on the single-pane list (panes use isolated scopes).
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useSearchParams } from 'next/navigation';
import {
  defaultOrdersComparePanes,
  ordersComparePaneCount,
  readOrdersCompareFromSearch,
  resolveOrdersCompareLayoutForWidth,
  type OrdersCompareLayout,
  type OrdersComparePaneId,
  type OrdersPaneQuery,
  ORDERS_COMPARE_PANE_IDS,
} from '@/lib/shipping/orders-compare-layout';
import { OrdersPaneTable } from './OrdersPaneTable';
import { HorizontalEdgeResizeHandle } from '@/design-system/components/HorizontalEdgeResizeHandle';
import { useHorizontalEdgeResize } from '@/design-system/hooks/useHorizontalEdgeResize';
import { cn } from '@/utils/_cn';

export function OrdersCompareHost({
  selectMode = false,
  className,
  columnTriggerPortalTarget = null,
}: {
  selectMode?: boolean;
  className?: string;
  /**
   * Band-3 controls slot — only the active pane portals ▦ here so multiple
   * compare grids do not fight over one host.
   */
  columnTriggerPortalTarget?: HTMLElement | null;
}) {
  const searchParams = useSearchParams();
  const hostRef = useRef<HTMLDivElement>(null);

  const fromUrl = useMemo(
    () => readOrdersCompareFromSearch(searchParams),
    [searchParams],
  );

  const [layout, setLayout] = useState<OrdersCompareLayout>(fromUrl.layout);
  const [panes, setPanes] = useState<OrdersPaneQuery[]>(() => [...fromUrl.panes]);
  const [activePane, setActivePane] = useState<OrdersComparePaneId>('a');

  useEffect(() => {
    setLayout(fromUrl.layout);
    setPanes([...fromUrl.panes]);
  }, [fromUrl]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setLayout((prev) => {
        const next = resolveOrdersCompareLayoutForWidth(prev, w);
        if (next === prev) return prev;
        setPanes((p) => {
          const defaults = defaultOrdersComparePanes(next);
          const count = ordersComparePaneCount(next);
          return Array.from({ length: count }, (_, i) => p[i] ?? defaults[i]!);
        });
        return next;
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const count = ordersComparePaneCount(layout);
  const visiblePanes = useMemo(() => {
    const defaults = defaultOrdersComparePanes(layout);
    return Array.from(
      { length: count },
      (_, i) => panes[i] ?? defaults[i]!,
    );
  }, [count, layout, panes]);

  const { width: leftWidth, isDragging, edgeHandleProps } =
    useHorizontalEdgeResize({
      storageKey: 'cf.ordersCompare.splitRatio',
      defaultWidth: 480,
      minWidth: 280,
      maxWidthPad: 280,
      edge: 'trailing',
      label: 'Resize compare panes',
      testId: 'orders-compare-split-resize',
    });

  const paneNodes = visiblePanes.map((query, i) => {
    const id = ORDERS_COMPARE_PANE_IDS[i]!;
    return (
      <OrdersPaneTable
        key={id}
        paneId={id}
        view={query.view}
        active={activePane === id}
        onActivate={() => setActivePane(id)}
        selectMode={selectMode}
        className={layout === 'quad' ? 'min-h-[12rem]' : undefined}
        columnTriggerPortalTarget={
          activePane === id ? columnTriggerPortalTarget : null
        }
      />
    );
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const n = Number(e.key);
      if (n >= 1 && n <= count) {
        e.preventDefault();
        setActivePane(ORDERS_COMPARE_PANE_IDS[n - 1]!);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count]);

  return (
    <div
      ref={hostRef}
      className={cn('flex h-full min-h-0 w-full min-w-0 flex-col', className)}
      data-orders-compare-layout={layout}
      data-testid="orders-compare-host"
    >
      {layout === 'split' ? (
        <div className="flex min-h-0 flex-1">
          <div
            className="relative flex min-h-0 shrink-0 flex-col overflow-visible"
            style={{ width: leftWidth } as CSSProperties}
          >
            {paneNodes[0]}
            <HorizontalEdgeResizeHandle
              edge="trailing"
              edgeHandleProps={edgeHandleProps}
              isDragging={isDragging}
              placement="inset"
              tooltipLabel="Resize"
            />
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {paneNodes[1]}
          </div>
        </div>
      ) : layout === 'quad' ? (
        <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-px bg-border-soft">
          {paneNodes}
        </div>
      ) : (
        paneNodes[0]
      )}
    </div>
  );
}
