'use client';

/**
 * Repair service — the REPAIRS HOST of the house triage face (owner
 * 2026-09-29): one {@link RepairCard} per ticket on `TriageCardList`, the
 * record on its `DeskRecordPlane` (`?openRepair=`, the Cmd-K and printed-QR
 * landing). Mounted by Receiving › Repair service (`/repair`) and Sales ›
 * Repair service (`/dashboard?mode=repairs`).
 *
 * The contextual sidebar owns the loading controls: Find (`?search=`), the
 * channel view (`?channel=`: All · Shipped in · Dropped off), Status (`?tab=`
 * — what is loaded) and Sort (`?sort=`, applied here over the loaded tickets
 * like the other card hosts). The sidebar's Stage facet
 * (`?repairStatus=`: Arriving · Still needs work · Completed · Closed) narrows
 * the loaded tickets, like Allocate's. A card shows its status as the rail
 * only: Change status lives on the open record and on the check-set's strip.
 * A channel view drops the channel from every card (the page already says it).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Copy, ListChecks, Maximize2 } from '@/components/Icons';
import { RecordActionStrip, type RecordActionVerb } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { RecordLedgerSummaryPane, type RecordLedgerSummary } from '@/design-system/components/record-ledger/RecordLedgerSummary';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { TriageCardList, type TriageFeed, type TriageSelectionPort } from '@/design-system/components/triage-card-list/TriageCardList';
import { useTriageDensity } from '@/design-system/components/triage-card-list/triage-density';
import { useTriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import { useRepairsTable } from '@/hooks/useRepairs';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import type { RowGroup } from '@/lib/group-rows';
import type { RepairTab, RSRecord } from '@/lib/neon/repair-service-queries';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { parseRepairChannel, REPAIR_ALL_CHANNELS_LABEL, REPAIR_CHANNEL_LABEL, REPAIR_CHANNEL_PARAM } from '@/lib/repair/repair-channel';
import { compareRepairs, repairCardModel, repairDayKey, type RepairCardModel } from '@/lib/repair/repair-card-model';
import { isRepairClosed } from '@/lib/repair-status';
import { DEFAULT_REPAIR_SORT, parseRepairSort, REPAIR_SORT_PARAM } from '@/lib/repair/repair-sort';
import { REPAIR_STATUS_CHIP_KEYS, repairStatusChipKey } from '@/lib/repair/repair-status-chips';
import { REPAIR_QUEUE_VIEW } from '@/lib/triage/views';
import { parseRepairTab } from '@/lib/walk-in/history-modes';
import { toast } from '@/lib/toast';
import { formatDateKeyMedium, getCurrentPSTDateKey } from '@/utils/date';
import { qk } from '@/queries/keys';
import { useRepairRecordSlot } from './record/useRepairRecordSlot';
import { RepairCard } from './cards/RepairCard';
import { RepairRow } from './cards/RepairRow';
import { RepairStatusList } from './cards/RepairStatusList';
import { useRepairStatusChange } from './useRepairStatusChange';

const VIEW = REPAIR_QUEUE_VIEW;
const ALL_BAND = 'All repairs';

const rowId = (row: RSRecord) => row.id;
const rowStatus = (row: RSRecord): readonly string[] => [repairStatusChipKey(row.status)];
const cardKey = (group: RowGroup<RSRecord>) => group.key;
// A Find that names exactly one ticket opens it: `#10089`, the carton `R-812`, or the internal `RS-4894`.
const exactFind = (query: string, model: RepairCardModel) => {
  const { ticket, carton } = model.handles;
  return query.replace(/^#/, '') === ticket?.toLowerCase() || query === `rs-${model.lead.id}` || query === carton?.toLowerCase();
};

/** Local check-set (the triage face paints it; nothing else reads it). */
function useRepairSelection(rows: readonly RSRecord[], scopeKey: string) {
  const [ids, setIds] = useState<ReadonlySet<number>>(() => new Set());
  const visibleRef = useRef<readonly number[]>([]);
  useEffect(() => setIds(new Set()), [scopeKey]);
  const port = useMemo<TriageSelectionPort<RSRecord>>(
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

interface RepairCardListProps {
  /** Status (`?tab=`) with the param unset: the station's open queue, Sales' whole book. */
  defaultTab: RepairTab;
}

export function RepairCardList({ defaultTab }: RepairCardListProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseRepairTab(searchParams.get('tab'), defaultTab);
  // No `?channel=` is the All view — every channel.
  const channel = parseRepairChannel(searchParams.get(REPAIR_CHANNEL_PARAM));
  const needsLabel = searchParams.get('needsLabel') === '1';
  const search = (searchParams.get('search') ?? '').trim();
  const sort = parseRepairSort(searchParams.get(REPAIR_SORT_PARAM)) ?? DEFAULT_REPAIR_SORT;
  // Newest / oldest band the cards into the days they were opened.
  const dated = sort === 'newest' || sort === 'oldest';

  const { data: repairs = [], isLoading, isFetching, isError, refetch } = useRepairsTable(search, tab, needsLabel, channel);
  const { getStaffName } = useStaffNameMap();
  // The warehouse day the SLA reads against (PT civil day).
  const todayKey = getCurrentPSTDateKey();
  const changeStatus = useRepairStatusChange();

  const sorted = useMemo(() => [...repairs].sort((a, b) => compareRepairs(a, b, sort)), [repairs, sort]);
  const allBands = useMemo<[string, RowGroup<RSRecord>[]][]>(() => {
    const groups = sorted.map((repair) => ({ key: `repair:${repair.id}`, rows: [repair] }));
    if (!dated) return groups.length ? [[ALL_BAND, groups]] : [];
    const byDay = new Map<string, RowGroup<RSRecord>[]>();
    for (const group of groups) {
      const day = repairDayKey(group.rows[0]!);
      const band = day ? formatDateKeyMedium(day, { weekday: 'short', withYear: true }) : 'No date';
      const held = byDay.get(band);
      if (held) held.push(group);
      else byDay.set(band, [group]);
    }
    return [...byDay.entries()];
  }, [sorted, dated]);
  const cut = useTriageCut({ statusKeys: REPAIR_STATUS_CHIP_KEYS, recordParams: VIEW.recordParams, statusParam: VIEW.chips.param });
  const bands = useMemo(() => cut.filterBands(allBands, cardKey, rowStatus), [allBands, cut]);
  const painted = useMemo(() => bands.flatMap(([, groups]) => groups.flatMap((group) => group.rows)), [bands]);

  // The open repair rides `?openRepair=` — reload, Cmd-K and a printed QR all land here.
  const openRaw = Number(searchParams.get('openRepair'));
  const openRepairId = Number.isFinite(openRaw) && openRaw > 0 ? openRaw : null;
  // A repair the current list does not carry (another tab / channel) — read through the
  // ticket's shared record query, so a write's `repairs` invalidation refreshes it too.
  const listed = openRepairId == null ? null : repairs.find((repair) => repair.id === openRepairId) ?? null;
  const unlisted = useQuery({
    queryKey: qk.repairs.workbench(openRepairId ?? 0, 'record'),
    queryFn: async ({ signal }): Promise<RSRecord | null> => {
      const res = await fetch(`/api/repair-service/${openRepairId}`, { signal });
      if (!res.ok) return null;
      const data = (await res.json()) as RSRecord;
      return data?.id ? data : null;
    },
    enabled: openRepairId != null && !isLoading && !listed,
  });
  const openRepair = listed ?? (unlisted.data?.id === openRepairId ? unlisted.data : null);
  const refreshOpen = useCallback(() => {
    void refetch();
    if (!listed) void unlisted.refetch();
  }, [refetch, listed, unlisted]);

  const setOpenRepair = useCallback(
    (id: number | null) => {
      const next = new URLSearchParams(window.location.search);
      if (id == null) next.delete('openRepair');
      else next.set('openRepair', String(id));
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );
  const open = useCallback((row: RSRecord) => setOpenRepair(row.id), [setOpenRepair]);
  const close = useCallback(() => setOpenRepair(null), [setOpenRepair]);

  usePublishRecordCursor({
    surfaceId: 'repair-queue',
    scope: 'record',
    enabled: true,
    order: bands,
    openId: openRepair?.id ?? null,
    getId: rowId,
    onOpen: open,
    onClose: close,
  });

  // Compact | Full — one line per ticket or the full card; saved per person (both repair pages share it).
  const [density, setDensity] = useTriageDensity('repair.queue');
  const family = useMemo(
    () =>
      triageFamily(VIEW, {
        rowId,
        groupKey: cardKey,
        cardModel: (group) => repairCardModel(group.rows[0]!, todayKey, { staffName: getStaffName, channelPinned: channel != null }),
        exactFind,
        renderCard: (props) => (density === 'row' ? <RepairRow {...props} /> : <RepairCard {...props} />),
      }),
    [todayKey, getStaffName, channel, density],
  );

  const selection = useRepairSelection(painted, `${search}|${searchParams.toString()}`);
  const checked = selection.selected;
  const bulkVerbs = useMemo<RecordActionVerb[]>(() => {
    const tickets = checked.map((repair) => String(repair.ticket_number || '').trim()).filter(Boolean);
    return [
      {
        id: 'open',
        label: 'Open',
        icon: <Maximize2 className="size-4" aria-hidden />,
        disabled: checked.length !== 1,
        disabledReason: 'Open one repair at a time',
        run: () => {
          if (checked[0]) open(checked[0]);
        },
      },
      {
        id: 'copy-tickets',
        label: 'Copy ticket numbers',
        icon: <Copy className="size-4" aria-hidden />,
        disabled: tickets.length === 0,
        disabledReason: 'No ticket numbers to copy',
        run: async () => {
          try {
            await navigator.clipboard.writeText(tickets.join('\n'));
            toast.success(`Copied ${tickets.length} ticket${tickets.length === 1 ? '' : 's'}`);
          } catch {
            toast.error('Failed to copy');
          }
        },
      },
      {
        id: 'status',
        label: 'Change status',
        icon: <ListChecks className="size-4" aria-hidden />,
        // Each repair goes through the one status writer (history entry, SLA start); a refused write puts its old status back.
        dialog: (done) => {
          const first = checked[0]?.status ?? '';
          return (
            <RepairStatusList
              // The list ticks the current status only when every checked repair shares it.
              current={checked.every((repair) => repair.status === first) ? first : ''}
              subject={`${checked.length} repair${checked.length === 1 ? '' : 's'}`}
              testId="repair-bulk-status-list"
              onPick={async (next) => (await Promise.all(checked.map((repair) => changeStatus(repair, next)))).every(Boolean)}
              done={done}
            />
          );
        },
      },
    ];
  }, [checked, open, changeStatus]);

  const feed: TriageFeed<RSRecord> = {
    bands,
    allBands,
    painted,
    sectioned: dated,
    loading: isLoading,
    fetching: isFetching,
    search: { value: search, pending: isFetching },
    selection: selection.port,
    open: { id: openRepair?.id ?? null, open, close },
  };

  const slot = useRepairRecordSlot(openRepair, { refresh: refreshOpen, onClose: close });
  const inProgress = repairs.filter((repair) => !isRepairClosed(repair.status)).length;
  const summary: RecordLedgerSummary = {
    title: `Repair service · ${channel ? REPAIR_CHANNEL_LABEL[channel] : REPAIR_ALL_CHANNELS_LABEL}`,
    facts: [
      { label: 'Visible repairs', value: painted.length },
      { label: 'Still open', value: inProgress },
      { label: 'Closed', value: repairs.length - inProgress },
    ],
    note: 'Open a repair to work it from its record — status, labels, paperwork and tickets are in its Actions panel. Stage and Sort live in the sidebar.',
  };
  const narrowed = Boolean(search) || needsLabel || searchParams.has('tab');

  return (
    <div data-testid="repair-queue" data-face="cards" className="flex min-h-0 min-w-0 flex-1">
      <TriageCardList
        family={family}
        feed={feed}
        cut={cut}
        densityControl={{ value: density, onChange: setDensity }}
        record={{
          title: slot?.title ?? 'Repair',
          subtitle: slot?.subtitle || undefined,
          noun: VIEW.noun.one,
          showIndex: false,
          testId: 'repair-record',
          summary: <RecordLedgerSummaryPane summary={summary} />,
          view: slot?.view ?? null,
          strip: null,
        }}
        summary={null}
        bulk={<RecordActionStrip verbs={bulkVerbs} label="Checked repair actions" testId="repair-bulk" face="header" />}
        searchEmpty={narrowed ? <p className="text-sm text-text-muted">{search ? `No repairs match "${search}"` : 'No repairs in this view.'}</p> : null}
        allClear={
          <TriageAllClear
            title={isError ? 'Could not load repairs' : channel ? `No ${REPAIR_CHANNEL_LABEL[channel].toLowerCase()} repairs` : 'No repairs'}
            detail="New repair tickets appear here as they are opened."
          />
        }
      />
    </div>
  );
}
