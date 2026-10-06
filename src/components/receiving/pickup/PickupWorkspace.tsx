'use client';

/**
 * Local Pickup receiving history. This host intentionally wears the same
 * TriageCardList face as Incoming and FBM Allocate; the retired pickup sheet
 * is not part of this route.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Camera } from '@/components/Icons';
import { DeskActionSlotRegistrar, DeskHeaderAction } from '@/design-system/components/DeskActionSlot';
import { useRecordSlot } from '@/design-system/components/record-ledger/useRecordSlot';
import { RecordLedgerSummaryPane, type RecordLedgerSummary } from '@/design-system/components/record-ledger/RecordLedgerSummary';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import {
  TriageCardList,
  type TriageFeed,
  type TriageSelectionPort,
} from '@/design-system/components/triage-card-list/TriageCardList';
import { useTriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import { groupRowsBy, type RowGroup } from '@/lib/group-rows';
import {
  pickupLineNeedsProcess,
  pickupOrderIsDone,
} from '@/lib/local-pickup/order-status';
import {
  parsePickupStageFilters,
  pickupOrderMatchesStageFilters,
} from '@/lib/local-pickup/stage-filters';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { PICKUP_HISTORY_VIEW } from '@/lib/triage/views';
import { formatDateKeyMedium } from '@/utils/date';
import { usePickupRecord } from '@/lib/receiving/pickup/usePickupRecord';
import { PickupCard } from './cards/PickupCard';
import {
  pickupCardKey,
  pickupCardModel,
  pickupDateKey,
  pickupOrderRecords,
  type PickupCardModel,
  type PickupOrderRecord,
} from '@/lib/receiving/pickup/pickup-card-model';
import {
  parsePickupStatusTab,
  usePickupLines,
  type PickupLine,
} from '@/lib/receiving/pickup/pickup-lines';

const VIEW = PICKUP_HISTORY_VIEW;
const NO_CARD_STATUS = [] as const;
const ALL_BAND = 'All pickups';

export type PickupSort = 'actionable' | 'newest' | 'oldest' | 'order' | 'customer' | 'amount_high' | 'amount_low';

function parsePickupSort(raw: string | null): PickupSort {
  return raw === 'newest' || raw === 'oldest' || raw === 'order' || raw === 'customer' || raw === 'amount_high' || raw === 'amount_low'
    ? raw
    : 'actionable';
}

function pickupFoldKey(line: PickupLine): string {
  return `pickup:${line.order_id}`;
}

function compareGroups(a: RowGroup<PickupOrderRecord>, b: RowGroup<PickupOrderRecord>, sort: PickupSort): number {
  const left = pickupCardModel(a);
  const right = pickupCardModel(b);
  if (sort === 'actionable') {
    const rank = { 'Resolve failure': 0, Triage: 1, 'Print labels': 2, Test: 3, Retest: 4, 'Put away': 5 } as const;
    const byAction = rank[left.unitSummary.nextAction] - rank[right.unitSummary.nextAction];
    if (byAction !== 0) return byAction;
    if (left.pickupDate == null && right.pickupDate != null) return 1;
    if (left.pickupDate != null && right.pickupDate == null) return -1;
    return (left.pickupDate || '').localeCompare(right.pickupDate || '') || left.identity.localeCompare(right.identity, undefined, { numeric: true });
  }
  if (sort === 'newest' || sort === 'oldest') {
    if (left.pickupDate == null && right.pickupDate != null) return 1;
    if (left.pickupDate != null && right.pickupDate == null) return -1;
    return sort === 'oldest'
      ? (left.pickupDate || '').localeCompare(right.pickupDate || '')
      : (right.pickupDate || '').localeCompare(left.pickupDate || '');
  }
  if (sort === 'order') return left.identity.localeCompare(right.identity, undefined, { numeric: true });
  if (sort === 'customer') return (left.customer || '').localeCompare(right.customer || '');
  if (sort === 'amount_high') return right.totalValue - left.totalValue;
  if (sort === 'amount_low') return left.totalValue - right.totalValue;
  return 0;
}

export function pickupBands(rows: readonly PickupLine[], sort: PickupSort): [string, RowGroup<PickupOrderRecord>[]][] {
  const groups = pickupOrderRecords(rows)
    .map((record) => ({ key: `pickup:${record.orderId}`, rows: [record] }))
    .sort((a, b) => compareGroups(a, b, sort));
  const sectioned = sort === 'newest' || sort === 'oldest';
  if (!sectioned) return groups.length ? [[ALL_BAND, groups]] : [];
  const byDate = new Map<string, RowGroup<PickupOrderRecord>[]>();
  for (const group of groups) {
    const date = pickupDateKey(group.rows[0]!.lines[0]!);
    const band = date
      ? formatDateKeyMedium(date, { weekday: 'short', withYear: true })
      : 'No pickup date';
    const held = byDate.get(band);
    if (held) held.push(group);
    else byDate.set(band, [group]);
  }
  return [...byDate.entries()];
}

function usePickupSelection(rows: readonly PickupOrderRecord[], scopeKey: string) {
  const [ids, setIds] = useState<ReadonlySet<number>>(() => new Set());
  const visibleRef = useRef<readonly number[]>([]);
  useEffect(() => setIds(new Set()), [scopeKey]);
  const port = useMemo<TriageSelectionPort<PickupOrderRecord>>(
    () => ({
      ids,
      toggle: (row) =>
        setIds((current) => {
          const next = new Set(current);
          if (!next.delete(row.id)) next.add(row.id);
          return next;
        }),
      toggleGroup: (groupIds, on) =>
        setIds((current) => {
          const next = new Set(current);
          for (const id of groupIds) on ? next.add(id) : next.delete(id);
          return next;
        }),
      setAll: (on) => setIds(on ? new Set(visibleRef.current) : new Set()),
      publishVisible: (visible) => {
        visibleRef.current = visible;
      },
    }),
    [ids],
  );
  return { port, selected: rows.filter((row) => ids.has(row.id)) };
}

const rowId = (row: PickupOrderRecord) => row.id;
const rowStatus = (_row: PickupOrderRecord): readonly never[] => NO_CARD_STATUS;
const exactFind = (query: string, model: PickupCardModel) =>
  model.identity.toLowerCase() === query ||
  String(model.lead.orderId) === query.replace(/^#/, '') ||
  model.rows.some((row) => (row.sku || '').toLowerCase() === query);

interface PickupWorkspaceProps {
  /** Open this LCPU order from the URL / contextual recent-history rail. */
  selectedOrderId?: number | null;
}

export function PickupWorkspace({ selectedOrderId = null }: PickupWorkspaceProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const statusTab = parsePickupStatusTab(searchParams.get('status'));
  const stageFilters = useMemo(() => parsePickupStageFilters(searchParams), [searchParams]);
  const query = searchParams.get('q') ?? '';
  const sort = parsePickupSort(searchParams.get('sort'));
  const { data: lines, isLoading, isError, isFetching } = usePickupLines(query);
  const allRows = useMemo(() => lines ?? [], [lines]);
  const allOrderRecords = useMemo(() => pickupOrderRecords(allRows), [allRows]);
  const visibleOrderRecords = useMemo(
    () => allOrderRecords.filter((record) => pickupOrderMatchesStageFilters(record.lines, stageFilters)),
    [allOrderRecords, stageFilters],
  );
  const rows = useMemo(() => visibleOrderRecords.flatMap((record) => record.lines), [visibleOrderRecords]);
  const allBands = useMemo(() => pickupBands(rows, sort), [rows, sort]);
  const cut = useTriageCut({ statusKeys: NO_CARD_STATUS, recordParams: VIEW.recordParams });
  const bands = useMemo(
    () => cut.filterBands(allBands, pickupCardKey, rowStatus),
    [allBands, cut],
  );
  const painted = useMemo(
    () => bands.flatMap(([, groups]) => groups.flatMap((group) => group.rows)),
    [bands],
  );
  const openRecord = useMemo(
    () => (selectedOrderId == null ? null : allOrderRecords.find((row) => row.orderId === selectedOrderId) ?? null),
    [allOrderRecords, selectedOrderId],
  );
  const openGroup = useMemo(() => {
    if (!openRecord) return null;
    return pickupCardModel({ key: `pickup:${openRecord.orderId}`, rows: [openRecord] });
  }, [openRecord]);

  const setOrder = useCallback(
    (orderId: number | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (orderId == null) next.delete('lcpu');
      else next.set('lcpu', String(orderId));
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );
  const open = useCallback((row: PickupOrderRecord) => setOrder(row.orderId), [setOrder]);
  const pickup = usePickupRecord(openGroup);
  const slot = useRecordSlot(pickup?.model ?? null, pickup?.verbs ?? [], openGroup ? `Local pickup ${openGroup.identity} actions` : 'Pickup actions', 'pickup-record');
  const close = useCallback(() => setOrder(null), [setOrder]);
  // Pickup paperwork lands from the phone pickup door (the desk form adds POs and returns only).
  const importPaperwork = useCallback(() => router.push('/m/receiving/pickup/new?type=PICKUP'), [router]);
  const importAction = useMemo(
    () => (
      <DeskHeaderAction
        variant="primary"
        size="md"
        icon={<Camera aria-hidden />}
        onClick={importPaperwork}
        data-testid="pickup-import-paperwork"
      >
        Import paperwork
      </DeskHeaderAction>
    ),
    [importPaperwork],
  );

  usePublishRecordCursor({
    surfaceId: 'pickup-history',
    scope: 'record',
    enabled: true,
    order: bands,
    openId: openRecord?.id ?? null,
    getId: rowId,
    getGroupKey: (row) => row.orderId,
    openGroupKey: openRecord?.orderId ?? null,
    onOpen: open,
    onClose: close,
  });

  const family = useMemo(
    () => triageFamily(VIEW, {
      rowId,
      groupKey: pickupCardKey,
      cardModel: pickupCardModel,
      exactFind,
      renderCard: (props) => <PickupCard {...props} />,
    }),
    [],
  );
  const scopeKey = `${query}|${searchParams.toString()}`;
  const selection = usePickupSelection(painted, scopeKey);
  const feed: TriageFeed<PickupOrderRecord> = {
    bands,
    allBands,
    painted,
    sectioned: sort === 'newest' || sort === 'oldest',
    loading: isLoading,
    fetching: isFetching,
    search: { value: query, pending: isFetching },
    selection: selection.port,
    open: { id: openRecord?.id ?? null, open, close },
  };
  const cardCount = bands.reduce((sum, [, groups]) => sum + groups.length, 0);
  const totalItems = rows.reduce((sum, row) => sum + Math.max(0, Number(row.quantity) || 0), 0);
  const processCount = groupRowsBy(allRows.filter(pickupLineNeedsProcess), pickupFoldKey).length;
  const doneCount = groupRowsBy(allRows.filter((row) => pickupOrderIsDone(row.order_status)), pickupFoldKey).length;
  const summary: RecordLedgerSummary = {
    title: 'Local pickup history',
    facts: [
      { label: 'Visible pickups', value: cardCount },
      { label: 'Visible items', value: totalItems },
      { label: 'Need to process', value: processCount, warn: processCount > 0 },
      { label: 'Done', value: doneCount },
    ],
    note: 'Open a pickup to inspect every item and its receiving linkage. Sales keeps the separate money-facing receipt history.',
  };
  const narrowed = Boolean(query.trim()) || statusTab !== 'all' || Boolean(
    stageFilters.qc || stageFilters.triage || stageFilters.label || stageFilters.ticket
      || stageFilters.vendor || stageFilters.from || stageFilters.to,
  );
  const emptyTitle = isError
    ? 'Could not load local pickup orders'
    : statusTab === 'process'
      ? 'No local pickups need processing'
      : 'No local pickup orders yet';

  return (
    <>
      <DeskActionSlotRegistrar role="primary">{importAction}</DeskActionSlotRegistrar>
      <div data-testid="pickup-history-ledger" data-face="cards" className="flex min-h-0 min-w-0 flex-1">
        <TriageCardList
        family={family}
        feed={feed}
        cut={cut}
        record={{
          title: slot?.title ?? 'Local pickup',
          actions: slot?.actions,
          noun: VIEW.noun.one,
          testId: 'pickup-history-record',
          summary: <RecordLedgerSummaryPane summary={summary} />,
          view: slot?.view ?? null,
          strip: null,
        }}
        summary={<span className="text-xs text-text-muted">{cardCount} pickups · {totalItems} items</span>}
        bulk={<span className="text-xs font-medium text-text-muted">{selection.selected.length} pickups selected</span>}
        searchEmpty={narrowed ? <p className="text-sm text-text-muted">No local pickups match this view.</p> : null}
        allClear={<TriageAllClear title={emptyTitle} detail="Imported and kiosk pickup records will appear here." />}
        />
      </div>
    </>
  );
}
