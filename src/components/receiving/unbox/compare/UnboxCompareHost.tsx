'use client';

/**
 * TradingView-like Unbox compare host — single / split (1×2) / quad (2×2).
 * Each pane owns an independent {@link ReceivingPaneQuery}; column prefs + zoom
 * are shared across panes.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  defaultUnboxComparePanes,
  readUnboxCompareFromSearch,
  resolveUnboxCompareLayoutForWidth,
  unboxComparePaneCount,
  writeUnboxCompareParams,
  type UnboxCompareLayout,
  type UnboxComparePaneId,
  UNBOX_COMPARE_PANE_IDS,
} from '@/lib/receiving/unbox-compare-layout';
import {
  normalizeCartonReceivingId,
  resolveUnboxCompareCrosshair,
} from '@/lib/receiving/unbox-compare-crosshair';
import type { ReceivingPaneQuery } from '@/lib/receiving/receiving-pane-query';
import { ReceivingPaneTable } from './ReceivingPaneTable';
import { HorizontalEdgeResizeHandle } from '@/design-system/components/HorizontalEdgeResizeHandle';
import { useHorizontalEdgeResize } from '@/design-system/hooks/useHorizontalEdgeResize';
import { cn } from '@/utils/_cn';

const PANE_SCOPE = (id: string) => `receiving:compare:${id}`;

export function UnboxCompareHost({
  selectMode = false,
  className,
}: {
  selectMode?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const hostRef = useRef<HTMLDivElement>(null);

  const fromUrl = useMemo(
    () => readUnboxCompareFromSearch(searchParams),
    [searchParams],
  );

  const [layout, setLayout] = useState<UnboxCompareLayout>(fromUrl.layout);
  const [panes, setPanes] = useState<ReceivingPaneQuery[]>(() => [...fromUrl.panes]);
  const [activePane, setActivePane] = useState<UnboxComparePaneId>('a');
  /** Sticky carton from record select; hover overrides while pointer is over a row. */
  const [stickyReceivingId, setStickyReceivingId] = useState<number | null>(null);
  const [hoverReceivingId, setHoverReceivingId] = useState<number | null>(null);
  const linkedReceivingId = resolveUnboxCompareCrosshair(
    stickyReceivingId,
    hoverReceivingId,
  );

  const onCrosshairHover = useCallback((receivingId: number | null) => {
    setHoverReceivingId(normalizeCartonReceivingId(receivingId));
  }, []);

  const onCrosshairSelect = useCallback((receivingId: number | null) => {
    setStickyReceivingId(normalizeCartonReceivingId(receivingId));
  }, []);

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
        const next = resolveUnboxCompareLayoutForWidth(prev, w);
        if (next === prev) return prev;
        setPanes((p) => {
          const defaults = defaultUnboxComparePanes(next);
          const count = unboxComparePaneCount(next);
          return Array.from({ length: count }, (_, i) => p[i] ?? defaults[i]!);
        });
        return next;
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const persist = useCallback(
    (nextLayout: UnboxCompareLayout, nextPanes: ReceivingPaneQuery[]) => {
      const params = new URLSearchParams(searchParams.toString());
      writeUnboxCompareParams(params, nextLayout, nextPanes);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const updatePane = (index: number, next: ReceivingPaneQuery) => {
    setPanes((prev) => {
      const copy = [...prev];
      copy[index] = next;
      persist(layout, copy);
      return copy;
    });
  };

  const count = unboxComparePaneCount(layout);
  const visiblePanes = useMemo(() => {
    const defaults = defaultUnboxComparePanes(layout);
    return Array.from(
      { length: count },
      (_, i) => panes[i] ?? defaults[i]!,
    );
  }, [count, layout, panes]);

  const { width: leftWidth, isDragging, edgeHandleProps } =
    useHorizontalEdgeResize({
      storageKey: 'cf.unboxCompare.splitRatio',
      defaultWidth: 480,
      minWidth: 280,
      maxWidthPad: 280,
      edge: 'trailing',
      label: 'Resize compare panes',
      testId: 'unbox-compare-split-resize',
    });

  const paneNodes = visiblePanes.map((query, i) => {
    const id = UNBOX_COMPARE_PANE_IDS[i]!;
    return (
      <ReceivingPaneTable
        key={id}
        paneId={id}
        query={query}
        onQueryChange={(q) => updatePane(i, q)}
        active={activePane === id}
        onActivate={() => setActivePane(id)}
        selectMode={selectMode}
        selectionScope={PANE_SCOPE(id)}
        linkedReceivingId={linkedReceivingId}
        stickyReceivingId={stickyReceivingId}
        onCrosshairHover={onCrosshairHover}
        onCrosshairSelect={onCrosshairSelect}
        className={layout === 'quad' ? 'min-h-[12rem]' : undefined}
      />
    );
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const n = Number(e.key);
      if (n >= 1 && n <= count) {
        e.preventDefault();
        setActivePane(UNBOX_COMPARE_PANE_IDS[n - 1]!);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count]);

  return (
    <div
      ref={hostRef}
      className={cn('flex h-full min-h-0 w-full min-w-0 flex-col', className)}
      data-unbox-compare-layout={layout}
      data-testid="unbox-compare-host"
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
