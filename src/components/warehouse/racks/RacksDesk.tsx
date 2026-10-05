'use client';

/**
 * Inventory › Locations › **Racks** (`?tab=movable`) — the desk face of the
 * phone's `/m/racks`. Movable racks as shared `RecordCard`s (`Rack 12 · RK12`
 * → where it stands now · shelves; last moved top-right);
 * the room is a filter, never a step. `?code=RK12` opens the rack record in
 * the desk record plane; `?new=1` opens the four-step New rack in the same
 * plane. Every read and write goes through `racks-client` (`/api/racks/**`).
 */

import { memo, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from '@/components/Icons';
import { RecordCard } from '@/design-system/components/record-card/RecordCard';
import { TriageCardList, type TriageCardSlotProps, type TriageFeed } from '@/design-system/components/triage-card-list/TriageCardList';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { useLocalTriageSelection } from '@/design-system/components/triage-card-list/local-selection';
import { useTriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import { Button } from '@/design-system/primitives';
import type { RowGroup } from '@/lib/group-rows';
import { inventoryLocationsHref } from '@/lib/inventory/locations-path';
import { canonicalRackCode } from '@/lib/locations/rack-code';
import type { RackSummary } from '@/lib/locations/rack-types';
import { listRacks, racksQueryKey } from '@/lib/locations/racks-client';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';
import { LOCATIONS_RACKS_VIEW } from '@/lib/triage/views/locations-racks';
import { RackCreateFlow } from './RackCreateFlow';
import { useRackRecordSlot } from './RackRecord';
import { rackRecordCard, type RackCardModel } from './rack-card-model';

const VIEW = LOCATIONS_RACKS_VIEW;
/** No status chips: the room filter is the sidebar's Room facet (`NAV_FACET_GROUPS['inventory.racks']`). */
const NO_CHIPS: readonly never[] = [];
/** The plane's record id while it holds New rack, or a rack outside the loaded list. */
const CREATE_ID = -1;
const NOT_LOADED_ID = -2;

const rackRowId = (rack: RackSummary): number => rack.id;

export function RacksDesk() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const roomParam = searchParams.get('room');
  const room = roomParam && /^\d+$/.test(roomParam) ? Number(roomParam) : null;
  const all = useQuery({ queryKey: racksQueryKey(), queryFn: () => listRacks(), staleTime: 15_000 });
  const racks = useMemo(
    () => (all.data?.racks ?? []).filter((r) => room == null || r.room?.id === room),
    [all.data, room],
  );

  /** The open rack / New rack move within the page: History API, no server round-trip (J / K stay instant). */
  const writeParams = useCallback(
    (patch: Record<string, string | null>) => {
      const params = readLiveSearchParams(searchParams.toString());
      params.delete('tab');
      for (const [k, v] of Object.entries(patch)) {
        if (v == null) params.delete(k);
        else params.set(k, v);
      }
      window.history.replaceState(null, '', inventoryLocationsHref({ tab: 'movable', extra: Object.fromEntries(params) }));
    },
    [searchParams],
  );

  const cut = useTriageCut({ statusKeys: NO_CHIPS, recordParams: VIEW.recordParams, statusParam: VIEW.chips.param });
  const { filterBands } = cut;
  const allBands = useMemo<[string, RowGroup<RackSummary>[]][]>(
    () => (racks.length ? [['racks', racks.map((rack) => ({ key: rack.code, rows: [rack] }))]] : []),
    [racks],
  );
  const bands = useMemo(() => filterBands(allBands, (group) => group.key, () => NO_CHIPS), [filterBands, allBands]);
  const painted = useMemo(() => bands.flatMap(([, groups]) => groups.flatMap((group) => group.rows)), [bands]);

  const creating = searchParams.get('new') === 'true';
  const openCode = searchParams.get('code')?.trim() || null;
  const openCanonical = openCode ? (canonicalRackCode(openCode) ?? openCode) : null;
  const openRack = useMemo(
    () => (openCanonical ? (racks.find((r) => r.code === openCanonical) ?? null) : null),
    [openCanonical, racks],
  );
  const openId = creating ? CREATE_ID : openRack ? openRack.id : openCode ? NOT_LOADED_ID : null;

  const openRow = useCallback((rack: RackSummary) => writeParams({ code: rack.code, new: null }), [writeParams]);
  const closeRecord = useCallback(() => writeParams({ code: null, new: null }), [writeParams]);
  const refreshList = useCallback(() => void queryClient.invalidateQueries({ queryKey: ['racks'] }), [queryClient]);

  usePublishRecordCursor({
    surfaceId: 'rack-cards',
    scope: 'record',
    enabled: true,
    order: bands,
    openId: creating ? null : openId,
    getId: rackRowId,
    onOpen: openRow,
    onClose: closeRecord,
  });

  const selection = useLocalTriageSelection(rackRowId);
  const family = useMemo(
    () =>
      triageFamily(VIEW, {
        rowId: rackRowId,
        groupKey: (group: RowGroup<RackSummary>) => group.key,
        cardModel: (group: RowGroup<RackSummary>): RackCardModel => {
          const lead = group.rows[0]!;
          return { key: group.key, ids: [lead.id], lead };
        },
        // A Find naming exactly one rack (any spelling of its code) opens it.
        exactFind: (query: string, model: RackCardModel) => canonicalRackCode(query) === model.lead.code,
        renderCard: (props: TriageCardSlotProps<RackSummary, RackCardModel>) => <RackCard {...props} />,
      }),
    [],
  );

  const feed: TriageFeed<RackSummary> = {
    bands,
    allBands,
    painted,
    sectioned: false,
    loading: all.isPending,
    fetching: all.isFetching,
    search: { value: searchParams.get('q') ?? '', pending: false },
    selection,
    open: { id: openId, open: openRow, close: closeRecord },
  };

  const slot = useRackRecordSlot(creating ? null : openCode, refreshList, closeRecord);
  const total = racks.length;

  return (
    <TriageCardList
      family={family}
      feed={feed}
      cut={cut}
      summary={null}
      bulk={<span className="truncate text-sm text-text-muted">Open one to print, move or add a shelf</span>}
      banner={
        <div className="flex min-w-0 flex-wrap items-center gap-3 pb-2 pl-4" data-testid="rack-cards-tally">
          <p className="truncate text-sm text-text-muted">
            {all.isPending ? 'Reading racks…' : `${total} ${total === 1 ? 'rack' : 'racks'}`}
          </p>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus aria-hidden />}
            aria-pressed={creating}
            onClick={() => writeParams({ new: creating ? null : 'true', code: null })}
            className="ml-auto mr-4"
            data-testid="rack-new"
          >
            New rack
          </Button>
        </div>
      }
      searchEmpty={room != null ? <p className="text-sm text-text-muted">No rack stands in this room — clear Room in the sidebar.</p> : null}
      allClear={<TriageAllClear title="No movable racks yet" detail="Create the first one with New rack." />}
      record={{
        title: creating ? 'New rack' : (slot?.title ?? openCode ?? ''),
        subtitle: creating ? undefined : (slot?.subtitle ?? undefined),
        actions: creating ? undefined : slot?.actions,
        noun: 'rack',
        testId: 'rack-record-plane',
        summary: null,
        strip: null,
        view: creating ? (
          <RackCreateFlow onCreated={refreshList} onOpenRack={(code) => writeParams({ code, new: null })} />
        ) : (
          (slot?.view ?? null)
        ),
      }}
    />
  );
}

/** One rack as a two-row record card: `Rack 12 · RK12` → where it stands · shelves · arrival; last moved top-right. */
const RackCard = memo(function RackCard(props: TriageCardSlotProps<RackSummary, RackCardModel>) {
  const { model } = props;
  const rack = model.lead;
  const record = useMemo(() => rackRecordCard(model), [model]);
  return (
    <RecordCard
      {...props}
      view={VIEW}
      model={record}
      factColumns={VIEW.facts}
      testIdPrefix={VIEW.testIdPrefix}
      onOpen={(event) => props.onOpen(rack, event)}
      onToggleCheck={(event) => props.onToggleCheck(model, event)}
      onToggleExpand={() => props.onToggleExpand(model.key)}
      onTogglePeek={() => props.onTogglePeek(model.key)}
      identity={{
        role: 'identity',
        content: (
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="font-semibold text-text-default">{rack.name}</span>
            <span className="font-mono text-text-muted">{rack.code}</span>
          </span>
        ),
      }}
      trailing={null}
    />
  );
});
