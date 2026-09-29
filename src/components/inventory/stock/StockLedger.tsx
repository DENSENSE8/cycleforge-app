'use client';

/**
 * Inventory › **Stock** — every (location, SKU) pair holding stock,
 * warehouse-wide, as the shared three-row triage card. State · bin identity ·
 * title · SKU · room · qty → Count / Pair. Room chips narrow the loaded pairs
 * (`?room=`); Find and the State funnel are the sidebar's (server). The open
 * pair (`?open=<loc:sku:source>`) reads in the record plane.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus } from '@/components/Icons';
import { BinChip } from '@/components/ui/CopyChip';
import { DeskActionSlotRegistrar, DeskHeaderAction } from '@/design-system/components/DeskActionSlot';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { StatusChipRail, type StatusChip } from '@/design-system/components/QueueStatusChips';
import { RecordLedgerSummaryPane, RecordLedgerTally } from '@/design-system/components/record-ledger/RecordLedgerSummary';
import { RecordCard } from '@/design-system/components/record-card/RecordCard';
import type { RecordCardModel } from '@/design-system/components/record-card/record-card-types';
import { LIFECYCLE_GLYPH } from '@/design-system/components/record-ledger/LifecycleCode';
import { TriageCardList, type TriageCardSlotProps, type TriageFeed } from '@/design-system/components/triage-card-list/TriageCardList';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { useLocalTriageSelection } from '@/design-system/components/triage-card-list/local-selection';
import { useTriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import { Button } from '@/design-system/primitives';
import { STOCK_LIFECYCLE } from '@/design-system/tokens/stock-lifecycle';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { useProvisionalSku, useSkuExceptionsRealtime } from '@/hooks/useProvisionalSkus';
import { SkuExceptionCreateForm } from '@/components/inventory/sku-exceptions/SkuExceptionCreateForm';
import { SkuExceptionEvidence } from '@/components/inventory/sku-exceptions/SkuExceptionEvidence';
import type { RowGroup } from '@/lib/group-rows';
import { isStockDeltaActivity } from '@/lib/inventory/stock-live-refresh';
import {
  locationStockRoomId,
  locationStockRowId,
  type LocationStockRoomFacet,
  type LocationStockStateFilter,
  type LocationStockTableRow,
} from '@/lib/inventory/location-stock-row';
import { getStationChannelName, safeChannelName } from '@/lib/realtime/channels';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';
import { INVENTORY_STOCK_ROUTE_PARAMS } from '@/lib/routing/query-mode-routes';
import { parseRouteParams } from '@/lib/routing/route-params';
import { INVENTORY_STOCK_VIEW } from '@/lib/triage/views';
import { stockLocationFace, stockRecordNext, stockRecordState, stockRecordTitle } from './stock-record';
import { StockEvidence, StockRecordStatus, stockSummary } from './StockEvidence';

const VIEW = INVENTORY_STOCK_VIEW;
const STOCK_PATH = '/inventory/stock';

/** The plane's record id while it holds the New temp SKU form (no row carries it). */
const CREATE_ID = -1;

/** A burst of counts (a gun session) costs one loader re-read. */
const LIVE_REFRESH_DEBOUNCE_MS = 400;

/**
 * The triage face speaks numeric record ids (selection, the record cursor,
 * `data-desk-record-key`); a pair's key is `<location>:<sku>:<source>`. The id
 * is a 53-bit hash of the key (cyrb53), NOT a first-seen counter: the rows
 * render on the server too, and a counter there (one per process) and in the
 * browser (one per tab) would hand the same row two ids and break hydration.
 */
function stockPairId(key: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < key.length; i++) {
    const ch = key.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  // Positive: the face drops ids ≤ 0 from the visible set.
  return 4294967296 * (2097151 & h2) + (h1 >>> 0) || 1;
}
const stockRowId = (row: LocationStockTableRow): number => stockPairId(locationStockRowId(row));

type StockRowModel = { key: string; ids: readonly number[]; lead: LocationStockTableRow };

interface StockLedgerProps {
  /** Pairs after `?q=` and `?status=`, in walking order — every room (the chips narrow). */
  rows: LocationStockTableRow[];
  /** Rooms across those pairs, with counts. */
  rooms: LocationStockRoomFacet[];
  /** The operational-state funnel (`?status=`). */
  selectedStates: LocationStockStateFilter[];
  /** Pairs matching `?q=` across the whole org, before the row cap. */
  totalCount: number;
  /** The loader hit its row cap — some matches are not on screen. */
  capped: boolean;
}

export function StockLedger({ rows, rooms, selectedStates, totalCount, capped }: StockLedgerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  /** A server-read change (Find, State, a new temp SKU): the loader re-reads, params in the route's declared order. */
  const replace = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = readLiveSearchParams(searchParams.toString());
      mutate(params);
      const qs = parseRouteParams(INVENTORY_STOCK_ROUTE_PARAMS, params).toString();
      startTransition(() => router.replace(qs ? `${STOCK_PATH}?${qs}` : STOCK_PATH, { scroll: false }));
    },
    [router, searchParams],
  );
  /** The open record moves within the loaded list: History API, no server round-trip (J / K stay instant). */
  const writeRecord = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = readLiveSearchParams(searchParams.toString());
      mutate(params);
      const qs = parseRouteParams(INVENTORY_STOCK_ROUTE_PARAMS, params).toString();
      window.history.replaceState(null, '', qs ? `${STOCK_PATH}?${qs}` : STOCK_PATH);
    },
    [searchParams],
  );

  // ── Rooms: the list's own chips (`?room=`) ────────────────────────────────
  const roomIds = useMemo(() => rooms.map((room) => room.id), [rooms]);
  const cut = useTriageCut({ statusKeys: roomIds, recordParams: VIEW.recordParams, statusParam: VIEW.chips.param });
  const { filterBands } = cut;
  const allBands = useMemo<[string, RowGroup<LocationStockTableRow>[]][]>(
    () => (rows.length ? [['stock', rows.map((row) => ({ key: locationStockRowId(row), rows: [row] }))]] : []),
    [rows],
  );
  const bands = useMemo(
    () => filterBands(allBands, (group) => group.key, (row) => [locationStockRoomId(row)]),
    [filterBands, allBands],
  );
  const painted = useMemo(() => bands.flatMap(([, groups]) => groups.flatMap((group) => group.rows)), [bands]);

  // ── The open record ───────────────────────────────────────────────────────
  const requestedSku = searchParams.get('sku')?.trim() || null;
  const openKey = searchParams.get('open')?.trim() || null;
  // Legacy/share links name an exception by SKU, while stock rows are keyed by
  // (location, SKU, source). Focus its first row without needing a second URL.
  const requestedSkuRow = useMemo(
    () => (requestedSku ? (rows.find((row) => row.is_provisional && row.sku === requestedSku) ?? null) : null),
    [requestedSku, rows],
  );
  const resolvedOpenKey = openKey ?? (requestedSkuRow ? locationStockRowId(requestedSkuRow) : null);
  const openRecord = useMemo(
    () => (resolvedOpenKey ? (rows.find((row) => locationStockRowId(row) === resolvedOpenKey) ?? null) : null),
    [resolvedOpenKey, rows],
  );
  const openProvisionalSku = openRecord?.is_provisional ? openRecord.sku : requestedSku;
  const provisionalRecord = useProvisionalSku(openProvisionalSku);
  useSkuExceptionsRealtime();
  const [creating, setCreating] = useState(false);

  const openRow = useCallback(
    (row: LocationStockTableRow) => {
      setCreating(false);
      writeRecord((params) => {
        params.set('open', locationStockRowId(row));
        if (row.is_provisional) params.set('sku', row.sku);
        else params.delete('sku');
      });
    },
    [writeRecord],
  );
  const closeRecord = useCallback(() => {
    setCreating(false);
    writeRecord((params) => {
      params.delete('open');
      params.delete('sku');
    });
  }, [writeRecord]);

  usePublishRecordCursor({
    surfaceId: 'stock-rows',
    scope: 'record',
    enabled: true,
    order: bands,
    openId: openRecord && !creating ? stockRowId(openRecord) : null,
    getId: stockRowId,
    onOpen: openRow,
    onClose: closeRecord,
  });

  const toggleCreate = useCallback(() => {
    if (creating) {
      setCreating(false);
      return;
    }
    setCreating(true);
    writeRecord((params) => {
      params.delete('open');
      params.delete('sku');
    });
  }, [creating, writeRecord]);

  const createAction = useMemo(
    () => (
      <DeskHeaderAction
        type="button"
        variant="primary"
        size="md"
        icon={<Plus aria-hidden />}
        aria-pressed={creating}
        onClick={toggleCreate}
        data-testid="stock-new-temp-sku"
      >
        New temp SKU
      </DeskHeaderAction>
    ),
    [creating, toggleCreate],
  );

  // Live: any STOCK_DELTA_* re-reads the loader (debounced).
  const { user } = useAuth();
  const channel = safeChannelName(() => getStationChannelName(user?.organizationId!));
  const refreshTimer = useRef<number | null>(null);
  const refreshSoon = useCallback(() => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null;
      router.refresh();
    }, LIVE_REFRESH_DEBOUNCE_MS);
  }, [router]);
  useEffect(
    () => () => {
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    },
    [],
  );
  const onActivity = useCallback(
    (message: { data?: { activityType?: string } }) => {
      if (isStockDeltaActivity(message?.data?.activityType)) refreshSoon();
    },
    [refreshSoon],
  );
  useAblyChannel(channel, 'activity.logged', onActivity, !!channel, { coalesce: 'frame' });

  // ── The face ──────────────────────────────────────────────────────────────
  const selection = useLocalTriageSelection(stockRowId);
  const family = useMemo(
    () =>
      triageFamily(VIEW, {
        rowId: stockRowId,
        groupKey: (group: RowGroup<LocationStockTableRow>) => group.key,
        cardModel: (group: RowGroup<LocationStockTableRow>): StockRowModel => {
          const lead = group.rows[0]!;
          return { key: group.key, ids: [stockRowId(lead)], lead };
        },
        // A Find naming exactly one pair's bin or SKU opens it.
        exactFind: (query: string, model: StockRowModel) =>
          model.lead.sku.toLowerCase() === query || stockLocationFace(model.lead)?.toLowerCase() === query,
        renderCard: (props: TriageCardSlotProps<LocationStockTableRow, StockRowModel>) => <StockRow {...props} />,
      }),
    [],
  );

  const feed: TriageFeed<LocationStockTableRow> = {
    bands,
    allBands,
    painted,
    sectioned: false,
    loading: pending && rows.length === 0,
    fetching: pending,
    search: { value: searchParams.get('q') ?? '', pending: false },
    selection,
    open: {
      id: creating ? CREATE_ID : resolvedOpenKey ? stockPairId(resolvedOpenKey) : null,
      open: openRow,
      close: closeRecord,
    },
  };

  const chips = useMemo<StatusChip<string>[]>(
    () => rooms.map((room) => ({ id: room.id, label: room.label, tone: 'neutral', count: room.count })),
    [rooms],
  );
  // The list read as a whole: the rows on screen (after the room chips).
  const summary = useMemo(() => stockSummary(painted, rooms), [painted, rooms]);
  const narrowed = Boolean(searchParams.get('q')?.trim()) || selectedStates.length > 0;

  return (
    <>
      <DeskActionSlotRegistrar role="primary">{createAction}</DeskActionSlotRegistrar>
      <TriageCardList
        family={family}
        feed={feed}
        cut={cut}
        summary={
          chips.length > 1 ? (
            <StatusChipRail
              chips={chips}
              active={cut.url.statusFilter}
              onToggle={cut.url.toggleStatus}
              onReset={cut.url.resetStatus}
              label="Rooms"
              testId="stock-rooms"
            />
          ) : null
        }
        bulk={<span className="truncate text-sm text-text-muted">Open one to count it</span>}
        // The list's tally rides one line under the bar, so the room chips keep the bar.
        banner={
          <div className="flex min-w-0 items-center gap-3 pb-2 pl-4" data-testid="stock-tally">
            {capped ? (
              <p className="truncate text-sm text-text-warning" data-testid="stock-capped">
                First {rows.length} of {totalCount} pairs — narrow the search
              </p>
            ) : null}
            <span className="ml-auto flex">
              <RecordLedgerTally summary={summary} />
            </span>
          </div>
        }
        searchEmpty={
          narrowed ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-sm text-text-muted">No stock matches</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  replace((params) => {
                    params.delete('q');
                    params.delete('room');
                    params.delete('status');
                  })
                }
              >
                Clear search and filters
              </Button>
            </div>
          ) : null
        }
        allClear={<TriageAllClear title="No stock on any shelf" detail="Counts land here from the floor." />}
        record={{
          title: creating ? 'New temp SKU' : openRecord ? stockRecordTitle(openRecord) : 'Not in this list',
          subtitle: !creating && openRecord ? [openRecord.sku, stockLocationFace(openRecord)].filter(Boolean).join(' · ') : undefined,
          actions: !creating && openRecord && !openRecord.is_provisional ? <StockRecordStatus record={openRecord} /> : undefined,
          noun: openRecord?.is_provisional || creating ? 'SKU exception' : VIEW.noun.one,
          testId: 'stock-record',
          summary: <RecordLedgerSummaryPane summary={summary} />,
          strip: null,
          view: creating ? (
            <DeskRecordLayout
              main={
                <SkuExceptionCreateForm
                  onCreated={(sku) => {
                    setCreating(false);
                    replace((params) => {
                      params.set('status', 'on-hold');
                      params.set('sku', sku);
                      params.delete('open');
                    });
                    router.refresh();
                  }}
                  onCancel={closeRecord}
                />
              }
            />
          ) : openRecord?.is_provisional ? (
            <DeskRecordLayout
              main={
                <SkuExceptionEvidence
                  sku={openRecord.sku}
                  item={provisionalRecord.data}
                  loading={provisionalRecord.isLoading}
                  error={provisionalRecord.isError ? provisionalRecord.error : null}
                  mergedInto={provisionalRecord.mergedInto}
                  onExit={() => {
                    closeRecord();
                    router.refresh();
                  }}
                />
              }
            />
          ) : resolvedOpenKey ? (
            // The stock pair lays out its own main / aside (order-record shape).
            <StockEvidence record={openRecord} onCounted={() => router.refresh()} />
          ) : null,
        }}
      />
    </>
  );
}

/** One stock pair as a three-row triage card. */
const StockRow = memo(function StockRow(props: TriageCardSlotProps<LocationStockTableRow, StockRowModel>) {
  const { model } = props;
  const row = model.lead;
  const title = stockRecordTitle(row);
  const bin = stockLocationFace(row);
  const next = stockRecordNext(row);
  const state = STOCK_LIFECYCLE[stockRecordState(row)];
  const record = useMemo<RecordCardModel>(
    () => ({
      key: model.key,
      leadId: stockRowId(row),
      state,
      stateIcon: LIFECYCLE_GLYPH[state.icon as keyof typeof LIFECYCLE_GLYPH],
      stateMeaning: state.label,
      alert: null,
      aria: {
        card: `${title} at ${bin ?? 'no location'}, ${row.qty} on hand`,
        open: `Open ${title} at ${bin ?? 'no location'}`,
        check: `Select ${title} at ${bin ?? 'no location'}`,
      },
      channel: null,
      person: null,
      chips: [],
      notes: { fixed: null, own: null },
      status: { kind: 'none' },
      next: next ? { label: next, tone: state.tone, tip: next, blocked: false } : null,
      lines: [
        {
          id: stockRowId(row),
          title,
          photoUrl: row.image_url,
          facts: {
            sku: { kind: 'code', text: row.sku, title: `SKU ${row.sku}` },
            room: row.room ? { kind: 'text', text: row.room } : { kind: 'missing', text: 'No room' },
            qty: { kind: 'qty', value: row.qty },
          },
          alert: false,
          alertNote: null,
        },
      ],
      hiddenAlertLabel: () => '',
    }),
    [bin, model.key, next, row, state, title],
  );
  return (
    <RecordCard
      {...props}
      model={record}
      factColumns={VIEW.facts}
      testIdPrefix={VIEW.testIdPrefix}
      onOpen={(event) => props.onOpen(row, event)}
      onToggleCheck={(event) => props.onToggleCheck(model, event)}
      onToggleExpand={() => props.onToggleExpand(model.key)}
      onTogglePeek={() => props.onTogglePeek(model.key)}
      identity={{
        role: 'identity',
        content: bin ? <BinChip value={bin} display={bin} /> : <span className="text-text-warning">No location</span>,
      }}
      trailing={null}
      quickLook={null}
    />
  );
});
