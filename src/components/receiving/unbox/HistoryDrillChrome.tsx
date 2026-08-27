'use client';

/**
 * History Drill | List chrome — icon menu over the WMS-wide drill SoT.
 * Orthogonal to TradingView compare (`clayout`). Only meaningful on History.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronsRight, List } from '@/components/Icons';
import { ToolbarIconMenu } from '@/components/ui/ToolbarIconMenu';
import {
  HISTORY_DRILL_LAYOUT_PARAM,
  HISTORY_DRILL_PO_PARAM,
  parseHistoryDrillLayout,
  type HistoryDrillLayout,
  writeHistoryDrillParams,
} from '@/lib/receiving/history-drill-layout';

const LAYOUT_OPTS = [
  { id: 'drill' as const, label: 'Drill', icon: ChevronsRight },
  { id: 'list' as const, label: 'List', icon: List },
];

export function HistoryDrillChrome({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const layout = parseHistoryDrillLayout(
    searchParams.get(HISTORY_DRILL_LAYOUT_PARAM),
  );

  const setLayout = (next: HistoryDrillLayout) => {
    const params = new URLSearchParams(searchParams.toString());
    const drillPo =
      next === 'drill' ? params.get(HISTORY_DRILL_PO_PARAM) : null;
    writeHistoryDrillParams(params, next, drillPo);
    if (next === 'list') params.delete(HISTORY_DRILL_PO_PARAM);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <ToolbarIconMenu
      className={className}
      value={layout}
      onChange={setLayout}
      options={LAYOUT_OPTS}
      ariaLabel="History table layout"
      tooltipLabel={layout === 'drill' ? 'Drill' : 'List'}
      testId="history-drill-chrome"
    />
  );
}
