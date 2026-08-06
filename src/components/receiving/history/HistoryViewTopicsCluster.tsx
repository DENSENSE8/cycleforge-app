'use client';

/**
 * History inspector **View** topic cluster — sheet layout chrome that stays on
 * the right rail after query facets moved to Band 3 Refine.
 *
 * Order locked by {@link historyInspectorTopicActions} View group:
 * paint · drill · compare · zoom · columns · kpi
 *
 * Staff · week live in the Unbox History find Refine funnel (query facets).
 */

import { useSearchParams } from 'next/navigation';
import { HistoryDrillChrome } from '@/components/receiving/unbox/HistoryDrillChrome';
import { HistoryRowPaintChrome } from '@/components/receiving/unbox/HistoryRowPaintChrome';
import { UnboxCompareChrome } from '@/components/receiving/unbox/compare/UnboxCompareChrome';
import { WorkbenchKpiCollapseToggle } from '@/components/dashboard/workbench-kpi-collapse';
import { useHistoryViewChrome } from '@/components/receiving/history/history-view-chrome-context';
import {
  parseUnboxCompareLayout,
  UNBOX_COMPARE_LAYOUT_PARAM,
} from '@/lib/receiving/unbox-compare-layout';
import { cn } from '@/utils/_cn';

export function HistoryViewTopicsCluster({
  className,
  /** When true, hide paint (needs selection) — still honest for View-only. */
  hidePaint = false,
}: {
  className?: string;
  hidePaint?: boolean;
}) {
  const { setControlsEl, setZoom, kpiOpen, onToggleKpi } = useHistoryViewChrome();
  const searchParams = useSearchParams();
  const isCompare =
    parseUnboxCompareLayout(searchParams.get(UNBOX_COMPARE_LAYOUT_PARAM)) !==
    'single';
  // Drill + paint are orthogonal to TradingView compare — hide while split/quad.
  const showDrillPaint = !hidePaint && !isCompare;

  return (
    <div
      className={cn('flex shrink-0 items-center gap-1', className)}
      role="group"
      aria-label="History view topics"
      data-testid="history-triage-view-topics"
      data-history-view-topics=""
    >
      {showDrillPaint ? <HistoryRowPaintChrome /> : null}
      {showDrillPaint ? <HistoryDrillChrome /> : null}
      <UnboxCompareChrome onZoomChange={setZoom} />
      {/* ▦ column trigger portals here from ReceivingLinesTable. */}
      <div
        // Stable ref (the state setter) — an inline arrow would detach/reattach
        // every render and thrash the portal target through context.
        ref={setControlsEl}
        className="contents"
        data-history-view-controls=""
      />
      <WorkbenchKpiCollapseToggle open={kpiOpen} onToggle={onToggleKpi} />
    </div>
  );
}
