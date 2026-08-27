'use client';

/**
 * Unbox inspector **View** topic cluster — the sheet layout chrome that stays
 * on the right rail after query facets moved to Band 3 Refine.
 *
 * Order locked by {@link historyInspectorTopicActions} View group:
 * paint · drill · compare · zoom · columns
 *
 * Staff · week live in the Unbox find Refine funnel (query facets), and **KPI
 * collapse lives on Band 3** — one door, and the door that is still on screen
 * when this rail is parked.
 *
 * Reachable from **every** Unbox tab since 2026-08-08, not just History. Paint
 * and Drill still need a selected carton, so on the other tabs (always
 * `viewOnly`) this renders compare · zoom · ▦ only.
 */

import { useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { HistoryDrillChrome } from '@/components/receiving/unbox/HistoryDrillChrome';
import { HistoryRowPaintChrome } from '@/components/receiving/unbox/HistoryRowPaintChrome';
import { UnboxCompareChrome } from '@/components/receiving/unbox/compare/UnboxCompareChrome';
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
  /**
   * The cluster is visibly interactive — the View strip is showing AND the rail
   * is not parked.
   *
   * **This gates the ▦ portal target, and that is load-bearing.** Since Band 3
   * stopped hosting the column trigger, this cluster is its only portal host;
   * publishing a non-null element while the rail is hidden or parked would
   * portal ▦ into an inert, invisible node *and* suppress
   * `GridColumnDetailsTrigger`'s card-corner fallback — leaving column display
   * unreachable with no missing control to notice. Publishing `null` hands the
   * trigger back to that fallback, which is the documented behaviour.
   */
  active = true,
}: {
  className?: string;
  hidePaint?: boolean;
  active?: boolean;
}) {
  const { setControlsEl, setZoom } = useHistoryViewChrome();
  const searchParams = useSearchParams();
  const isCompare =
    parseUnboxCompareLayout(searchParams.get(UNBOX_COMPARE_LAYOUT_PARAM)) !==
    'single';
  // Drill + paint are orthogonal to TradingView compare — hide while split/quad.
  const showDrillPaint = !hidePaint && !isCompare;

  // Stable callback — an inline arrow would detach/reattach the portal target
  // every render and thrash it through context.
  const publishControlsEl = useCallback(
    (el: HTMLDivElement | null) => {
      setControlsEl(active ? el : null);
    },
    [active, setControlsEl],
  );

  return (
    <div
      className={cn('flex shrink-0 items-center gap-1', className)}
      role="group"
      aria-label="View topics"
      data-testid="history-triage-view-topics"
      data-history-view-topics=""
    >
      {showDrillPaint ? <HistoryRowPaintChrome /> : null}
      {showDrillPaint ? <HistoryDrillChrome /> : null}
      <UnboxCompareChrome onZoomChange={setZoom} />
      {/* ▦ column trigger portals here from ReceivingLinesTable. */}
      <div
        ref={publishControlsEl}
        className="contents"
        data-history-view-controls=""
      />
    </div>
  );
}
