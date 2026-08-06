'use client';

/**
 * Receiving History drill — thin adapter over the WMS-wide
 * {@link LedgerDrillHost} SoT.
 *
 * Domain owns: URL (`?drillPo=`), parent-map title/meta (product + qty/order/
 * tracking), parent-map footer find (`?rh_q=` via TechRailSearchBar), and the
 * child {@link ReceivingGridView}. Layout / resize / narrow list-OR-detail live
 * in the design-system host — never re-fork them here.
 *
 * - **List** = flat leaf sheet (default / `?hlayout=list`) — no in-grid PO summary
 * - **Drill** = this adapter → {@link LedgerDrillHost} (`?hlayout=drill`);
 *   parent rollups live only on {@link LedgerDrillParentMap}
 * - **Compare** = independent multi-pane (`UnboxCompareHost`) — orthogonal
 */

import { useCallback, useMemo, type ReactNode, type RefObject } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useIsFetching } from '@tanstack/react-query';
import type { ReceivingPoGroup } from '@/components/station/receiving-lines-table-helpers';
import type { ReceivingActivityAxis } from '@/components/station/receiving-lines-table-helpers';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { GridSelectGutterChrome } from '@/components/ui/GridRowCheckbox';
import { OrderIdChip, TrackingChip, getLast8 } from '@/components/ui/CopyChip';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import { RailFilterCollapseButton } from '@/components/sidebar/tech/left-dock-toggle';
import { usePlatformMeta } from '@/hooks/useCatalog';
import {
  LedgerDrillHost,
  LedgerDrillParentMap,
  useLedgerDrillCollapse,
  type LedgerDrillParentSection,
} from '@/design-system/components/grid';
import { getReceivingPoIdentityParts } from '@/lib/receiving/po-group-title';
import {
  flattenDrillParents,
  HISTORY_DRILL_LAYOUT_PARAM,
  HISTORY_DRILL_PO_PARAM,
  parseHistoryDrillLayout,
  parseHistoryDrillPo,
  writeHistoryDrillParams,
} from '@/lib/receiving/history-drill-layout';
import {
  RECEIVING_HISTORY_URL_PARAMS,
  getReceivingHistoryPlaceholder,
  normalizeReceivingHistorySearchField,
  setReceivingHistoryUrlParams,
} from '@/lib/receiving-history-search';
import { formatDateKeyShort } from '@/utils/date';
import type { ReceivingGridColumn } from '@/lib/receiving/receiving-grid-layout';
import { displayReceivingProductTitle } from './cells/receiving-grid-row-helpers';
import { ReceivingGridView } from './ReceivingGridView';

/** Parent-map filter footer — must mount under {@link LedgerDrillHost} for collapse context. */
function ReceivingDrillParentFilter({
  value,
  onChange,
  placeholder,
  isSearching,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  isSearching: boolean;
}) {
  const drillCollapse = useLedgerDrillCollapse();
  return (
    <TechRailSearchBar
      variant="rail"
      density="row"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      isSearching={isSearching}
      trailingAction={
        drillCollapse ? (
          <RailFilterCollapseButton
            onCollapse={drillCollapse.collapse}
            label="Hide parent map"
            testId="receiving-drill-filter-collapse"
          />
        ) : null
      }
    />
  );
}

function metaSep() {
  return (
    <span className="shrink-0 text-text-faint" aria-hidden>
      ·
    </span>
  );
}

/**
 * Parent-map second row — qty (digit only) · order # · tracking.
 * Title is the product name (not platform · PO).
 */
function parentMeta(
  rows: ReceivingLineRow[],
  resolvePlatformLabel: (raw: string) => string,
): ReactNode {
  const first = rows[0];
  if (!first) return null;

  const received = rows.reduce((sum, r) => sum + (r.quantity_received || 0), 0);
  const qty = received > 0 ? received : rows.length;
  const { poValue, platformLabel } = getReceivingPoIdentityParts(
    first,
    resolvePlatformLabel,
  );
  const tracking =
    rows
      .map((r) => (r.tracking_number || '').trim())
      .find(Boolean) || '';

  const parts: ReactNode[] = [
    <span key="qty" className="shrink-0 tabular-nums">
      {qty}
    </span>,
  ];
  if (poValue) {
    parts.push(metaSep());
    parts.push(
      <OrderIdChip
        key="order"
        value={poValue}
        display={getLast8(poValue)}
        platformLabel={platformLabel || null}
        dense
      />,
    );
  }
  if (tracking) {
    parts.push(metaSep());
    parts.push(<TrackingChip key="tracking" value={tracking} dense />);
  }
  return <>{parts}</>;
}

export function ReceivingDrillHost({
  filteredGroupedRecords,
  loading,
  emptyMessage,
  isMobile,
  selectMode,
  selectedId,
  selectedIds,
  handleSelectRow,
  handleToggleRow,
  activityAxis,
  isHistory,
  selectGutterChrome,
  clickSelect = false,
  onOpenWorkspace,
  historyTriageMenu = false,
  columns,
  scrollRef,
  className,
  columnTriggerPortalTarget = null,
}: {
  filteredGroupedRecords: Record<string, ReceivingPoGroup[]>;
  loading: boolean;
  emptyMessage: string;
  isMobile: boolean;
  selectMode: boolean;
  selectedId: number | null;
  selectedIds: Set<number>;
  handleSelectRow: (row: ReceivingLineRow) => void;
  handleToggleRow?: (row: ReceivingLineRow) => void;
  activityAxis?: ReceivingActivityAxis;
  isHistory?: boolean;
  selectGutterChrome?: GridSelectGutterChrome;
  clickSelect?: boolean;
  onOpenWorkspace?: (row: ReceivingLineRow) => void;
  historyTriageMenu?: boolean;
  columns?: readonly ReceivingGridColumn[];
  scrollRef?: RefObject<HTMLDivElement | null>;
  className?: string;
  columnTriggerPortalTarget?: HTMLElement | null;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const resolvePlatformMeta = usePlatformMeta();
  const drillPo = parseHistoryDrillPo(searchParams.get(HISTORY_DRILL_PO_PARAM));

  const historyQ = searchParams.get(RECEIVING_HISTORY_URL_PARAMS.q) ?? '';
  const searchField = useMemo(
    () =>
      normalizeReceivingHistorySearchField(
        searchParams.get(RECEIVING_HISTORY_URL_PARAMS.field),
      ),
    [searchParams],
  );
  const tableFetching =
    useIsFetching({
      predicate: (u) =>
        Array.isArray(u.queryKey) && u.queryKey[0] === 'receiving-lines-table',
    }) > 0;

  const parents = useMemo(
    () => flattenDrillParents(filteredGroupedRecords),
    [filteredGroupedRecords],
  );

  const selectedEntry = useMemo(() => {
    if (!drillPo) return null;
    return parents.find((p) => p.group.key === drillPo) ?? null;
  }, [parents, drillPo]);

  const childRecords = useMemo((): Record<string, ReceivingPoGroup[]> => {
    if (!selectedEntry) return {};
    return { [selectedEntry.day]: [selectedEntry.group] };
  }, [selectedEntry]);

  const parentSections = useMemo((): LedgerDrillParentSection[] => {
    const map = new Map<string, LedgerDrillParentSection>();
    for (const { day, group } of parents) {
      const first = group.rows[0];
      if (!first) continue;
      const sectionId = day || 'unknown';
      let section = map.get(sectionId);
      if (!section) {
        section = {
          id: sectionId,
          label: day ? formatDateKeyShort(day) : 'Unknown',
          rows: [],
        };
        map.set(sectionId, section);
      }
      section.rows.push({
        key: group.key,
        title: displayReceivingProductTitle(first),
        meta: parentMeta(group.rows, (raw) => resolvePlatformMeta(raw).label),
      });
    }
    return [...map.values()];
  }, [parents, resolvePlatformMeta]);

  const setDrillPo = useCallback(
    (key: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      const layout = parseHistoryDrillLayout(
        params.get(HISTORY_DRILL_LAYOUT_PARAM),
      );
      writeHistoryDrillParams(params, layout, key);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setHistorySearch = useCallback(
    (q: string) => {
      const next = setReceivingHistoryUrlParams(searchParams, { q });
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const parentFilterFooter = (
    <ReceivingDrillParentFilter
      value={historyQ}
      onChange={setHistorySearch}
      placeholder={getReceivingHistoryPlaceholder(searchField).replace(
        /^Search/,
        'Filter',
      )}
      isSearching={tableFetching}
    />
  );

  return (
    <LedgerDrillHost
      className={className}
      storageKey="cf.receivingDrill.splitRatio"
      hasSelection={Boolean(selectedEntry)}
      onClearSelection={() => setDrillPo(null)}
      emptySelectionMessage="Select a purchase order."
      narrowBackLabel="← Orders"
      resizeLabel="Resize history drill panes"
      resizeTestId="receiving-drill-split-resize"
      testId="receiving-drill-host"
      parents={
        <LedgerDrillParentMap
          title="Purchase orders"
          sections={parentSections}
          selectedKey={drillPo}
          onSelect={(key) => setDrillPo(key)}
          loading={loading}
          emptyMessage={emptyMessage}
          footer={parentFilterFooter}
          testId="receiving-drill-parents"
        />
      }
    >
      <ReceivingGridView
        filteredGroupedRecords={childRecords}
        serverSorted
        loading={false}
        emptyMessage="No line items in this purchase order."
        isMobile={isMobile}
        selectMode={selectMode}
        selectedId={selectedId}
        selectedIds={selectedIds}
        handleSelectRow={handleSelectRow}
        handleToggleRow={handleToggleRow}
        activityAxis={activityAxis}
        isHistory={isHistory}
        selectGutterChrome={selectGutterChrome}
        clickSelect={clickSelect}
        onOpenWorkspace={onOpenWorkspace}
        historyTriageMenu={historyTriageMenu}
        columns={columns}
        scrollRef={scrollRef}
        showDayHeaders={false}
        testId="receiving-drill-children"
        columnTriggerPortalTarget={columnTriggerPortalTarget}
      />
    </LedgerDrillHost>
  );
}
