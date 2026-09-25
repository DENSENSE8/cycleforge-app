'use client';

/**
 * Inventory › **Stock** — every (location, SKU) pair holding stock,
 * warehouse-wide, as an industrial record ledger with a triage evidence column.
 *
 *   spine │ photo │ RDY · BIN <location> · ROOM ···························│ SEP 22
 *         │       │ title ··················································│ QTY [n]
 *         │       │ SKU … · (TMP → SKU exception ↗) · BIN COUNT / UNITS ····│ → Count
 *   ────────────────────────────────────────────────────────────── │ evidence
 *
 * The rows arrive from the RSC loader (`app/inventory/stock/page.tsx`), which
 * answers `?q=` in SQL and `?room=` over the matched set; this island only
 * writes the URL. `?open=` is the open pair (its record key). Live: a
 * `STOCK_DELTA_*` activity anywhere (the phone, the gun, this desk) re-reads
 * the loader, debounced so a burst costs one refresh.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { Plus } from '@/components/Icons';
import { DeskActionSlotRegistrar, DeskHeaderAction } from '@/design-system/components/DeskActionSlot';
import { SearchField } from '@/design-system/primitives';
import { RecordLedger } from '@/design-system/components/record-ledger/RecordLedger';
import {
  IndustrialRecord,
  RecordBin,
  RecordIdFact,
  RecordNext,
  RecordPhoto,
  RecordQty,
  RecordStamp,
  RecordStateCode,
  RecordTitle,
} from '@/design-system/components/record-ledger/IndustrialRecord';
import { RECORD_LOCATION_CLASS } from '@/design-system/components/record-ledger/record-ledger-geometry';
import { DESK_BAR_SEGMENT_CLASS, deskBarSegmentTone } from '@/design-system/components/DeskActionSlot';
import { RECORD_LABEL_CLASS } from '@/design-system/tokens/industrial-record';
import { lifecycleRecordState } from '@/design-system/tokens/lifecycle';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { useOptimisticUrlParam } from '@/hooks/useOptimisticUrlParam';
import { getStationChannelName, safeChannelName } from '@/lib/realtime/channels';
import { isStockDeltaActivity } from '@/lib/inventory/stock-live-refresh';
import {
  locationStockRowId,
  type LocationStockRoomFacet,
  type LocationStockStateFilter,
  type LocationStockTableRow,
} from '@/lib/inventory/location-stock-row';
import { INVENTORY_STOCK_ROUTE_PARAMS } from '@/lib/routing/query-mode-routes';
import { parseRouteParams } from '@/lib/routing/route-params';
import { cn } from '@/utils/_cn';
import { useProvisionalSku, useProvisionalSkus, useSkuExceptionsRealtime } from '@/hooks/useProvisionalSkus';
import { SkuExceptionCreateForm } from '@/components/inventory/sku-exceptions/SkuExceptionCreateForm';
import { SkuExceptionEvidence } from '@/components/inventory/sku-exceptions/SkuExceptionEvidence';
import { stockLocationFace, stockRecordCountable, stockRecordState, stockRecordTitle } from './stock-record';
import { StockEvidence } from './StockEvidence';

const STOCK_PATH = '/inventory/stock';
/** Evidence key while the shared ledger holds the new on-hold SKU form. */
const CREATE_KEY = 'new-temp-sku';

/** A burst of counts (a gun session) costs one loader re-read. */
const LIVE_REFRESH_DEBOUNCE_MS = 400;

export interface StockLedgerProps {
  /** Pairs after `?q=` and `?room=`, in walking order. */
  rows: LocationStockTableRow[];
  /** Rooms across the `?q=` matches, before the room filter. */
  rooms: LocationStockRoomFacet[];
  /** The selected rooms (`?room=`). */
  selectedRooms: string[];
  /** The operational-state funnel (`?status=`). */
  selectedStates: LocationStockStateFilter[];
  /** Pairs matching `?q=` across the whole org, before the row cap. */
  totalCount: number;
  /** The loader hit its row cap — some matches are not on screen. */
  capped: boolean;
}

export function StockLedger({ rows, rooms, selectedRooms, selectedStates, totalCount, capped }: StockLedgerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  /** One writer for the params this surface owns, in the route's declared order. */
  const replace = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = parseRouteParams(INVENTORY_STOCK_ROUTE_PARAMS, params).toString();
      startTransition(() => router.replace(qs ? `${STOCK_PATH}?${qs}` : STOCK_PATH, { scroll: false }));
    },
    [router, searchParams],
  );

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
  const provisionalList = useProvisionalSkus();
  const provisionalRecord = useProvisionalSku(openProvisionalSku);
  useSkuExceptionsRealtime();
  const [creating, setCreating] = useState(false);

  const openRow = useCallback(
    (row: LocationStockTableRow) => {
      setCreating(false);
      replace((params) => {
        params.set('open', locationStockRowId(row));
        if (row.is_provisional) params.set('sku', row.sku);
        else params.delete('sku');
      });
    },
    [replace],
  );
  const openRecordKey = useCallback(
    (key: string) => {
      const row = rows.find((item) => locationStockRowId(item) === key);
      if (row) openRow(row);
    },
    [openRow, rows],
  );
  const closeRecord = useCallback(
    () => {
      setCreating(false);
      replace((params) => {
        params.delete('open');
        params.delete('sku');
      });
    },
    [replace],
  );

  const { value: query, setValue: setQuery } = useOptimisticUrlParam<string>({
    urlValue: searchParams.get('q') ?? '',
    replace,
    write: (params, next) => {
      if (next.trim()) params.set('q', next);
      else params.delete('q');
    },
  });

  const toggleRoom = useCallback(
    (room: string | null) =>
      replace((params) => {
        if (room == null) {
          params.delete('room');
          return;
        }
        const next = selectedRooms.includes(room)
          ? selectedRooms.filter((r) => r !== room)
          : [...selectedRooms, room];
        if (next.length > 0) params.set('room', next.join(','));
        else params.delete('room');
      }),
    [replace, selectedRooms],
  );

  const toggleState = useCallback(
    (state: LocationStockStateFilter | null) =>
      replace((params) => {
        if (state == null) {
          params.delete('status');
          return;
        }
        const next = selectedStates.includes(state)
          ? selectedStates.filter((item) => item !== state)
          : [...selectedStates, state];
        if (next.length) params.set('status', next.join(','));
        else params.delete('status');
      }),
    [replace, selectedStates],
  );

  const toggleCreate = useCallback(() => {
    if (creating) {
      setCreating(false);
      return;
    }
    setCreating(true);
    replace((params) => {
      params.delete('open');
      params.delete('sku');
    });
  }, [creating, replace]);

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

  const renderRecord = useCallback(
    (row: LocationStockTableRow, open: boolean) => <StockRecord row={row} open={open} onOpen={() => openRow(row)} />,
    [openRow],
  );

  const narrowed = Boolean(query.trim()) || selectedRooms.length > 0 || selectedStates.length > 0;
  const evidenceOpenKey = creating ? CREATE_KEY : resolvedOpenKey;

  return (
    <>
      <DeskActionSlotRegistrar role="primary">{createAction}</DeskActionSlotRegistrar>
      <RecordLedger
      testId="stock-ledger"
      label="Stock by location"
      records={rows}
      recordKey={locationStockRowId}
      renderRecord={renderRecord}
      openKey={evidenceOpenKey}
      onOpenKey={openRecordKey}
      onClose={closeRecord}
      loading={pending && rows.length === 0}
      toolbar={
        <>
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search title, SKU, location, room or qty…"
            isSearching={pending}
            className="min-w-0 max-w-[28rem] flex-1 overflow-hidden rounded-none pl-2"
            tone="neutral"
            hideUnderline
            fillHost
          />
          <div
            role="group"
            aria-label="Rooms"
            className="flex min-w-0 items-stretch overflow-x-auto border-l border-mode-edge"
            data-testid="stock-rooms"
          >
            <button
              type="button"
              aria-pressed={selectedRooms.length === 0}
              onClick={() => toggleRoom(null)}
              className={cn(DESK_BAR_SEGMENT_CLASS, 'border-r border-mode-edge', deskBarSegmentTone(selectedRooms.length === 0))}
            >
              All rooms
            </button>
            {rooms.map((room) => {
              const active = selectedRooms.includes(room.id);
              return (
                <button
                  key={room.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleRoom(room.id)}
                  className={cn(DESK_BAR_SEGMENT_CLASS, 'border-r border-mode-edge', deskBarSegmentTone(active))}
                >
                  <span className="truncate">{room.label}</span>
                  <span className="tabular-nums">{room.count}</span>
                </button>
              );
            })}
          </div>
          <div
            role="group"
            aria-label="Stock state"
            className="flex min-w-0 items-stretch overflow-x-auto border-l border-mode-edge"
            data-testid="stock-states"
          >
            {([
              [null, 'All stock'],
              ['on-hold', 'On hold'],
              ['catalog', 'Catalog paired'],
            ] as const).map(([state, label]) => {
              const active = state == null ? selectedStates.length === 0 : selectedStates.includes(state);
              return (
                <button
                  key={state ?? 'all'}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleState(state)}
                  className={cn(DESK_BAR_SEGMENT_CLASS, 'border-r border-mode-edge', deskBarSegmentTone(active))}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </>
      }
      empty={
        narrowed ? (
          <>
            <b className="text-role-body font-bold text-mode-ink">No stock matches</b>
            <button
              type="button"
              onClick={() =>
                replace((params) => {
                  params.delete('q');
                  params.delete('room');
                  params.delete('status');
                })
              }
              className={cn(RECORD_LABEL_CLASS, 'underline underline-offset-2 text-mode-ink')}
            >
              Clear search and rooms
            </button>
          </>
        ) : (
          <>
            <b className="text-role-body font-bold text-mode-ink">No stock on any shelf</b>
            <span className={cn(RECORD_LABEL_CLASS, 'text-mode-muted')}>Counts land here from the floor</span>
          </>
        )
      }
      footer={
        <span className="tabular-nums" data-testid="stock-status">
          {rows.length} pair{rows.length === 1 ? '' : 's'}
          {capped ? ` · first ${rows.length} of ${totalCount} — narrow the search` : ''}
        </span>
      }
      evidenceNoun={openRecord?.is_provisional || creating ? 'SKU exception' : 'stock'}
      evidenceHead={creating ? 'New temp SKU' : undefined}
      evidence={
        creating ? (
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
        ) : openRecord?.is_provisional ? (
          <SkuExceptionEvidence
            sku={openProvisionalSku}
            item={provisionalRecord.data}
            loading={provisionalRecord.isLoading}
            error={provisionalRecord.isError ? provisionalRecord.error : null}
            mergedInto={provisionalRecord.mergedInto}
            rows={provisionalList.data ?? []}
            onExit={() => {
              closeRecord();
              router.refresh();
            }}
          />
        ) : (
          <StockEvidence
            openKey={resolvedOpenKey}
            record={openRecord}
            rows={rows}
            rooms={rooms}
            onCounted={() => router.refresh()}
          />
        )
      }
      />
    </>
  );
}

const StockRecord = memo(function StockRecord({
  row,
  open,
  onOpen,
}: {
  row: LocationStockTableRow;
  open: boolean;
  onOpen: () => void;
}) {
  const key = locationStockRowId(row);
  const state = stockRecordState(row);
  const stateFace = lifecycleRecordState(state);
  const title = stockRecordTitle(row);
  const face = stockLocationFace(row);
  const moved = row.last_moved ? new Date(row.last_moved) : null;
  const movedValid = moved && !Number.isNaN(moved.getTime()) ? moved : null;
  const countable = stockRecordCountable(row);

  return (
    <IndustrialRecord
      recordKey={key}
      state={stateFace}
      open={open}
      openLabel={`${title} at ${face ?? 'no location'}, ${row.qty} on hand`}
      onOpen={onOpen}
      photo={<RecordPhoto src={row.image_url} fallback={title} />}
      bands={[
        {
          main: (
            <>
              <RecordStateCode state={stateFace} />
              <RecordBin faces={face ? [face] : []} className={RECORD_LOCATION_CLASS} />
              <span className={cn(RECORD_LABEL_CLASS, 'truncate text-mode-muted')}>{row.room ?? 'No room'}</span>
            </>
          ),
          right: (
            <RecordStamp title={movedValid ? `Last moved ${format(movedValid, 'MMM d, yyyy · h:mm a')}` : undefined}>
              {movedValid ? format(movedValid, 'MMM d').toUpperCase() : null}
            </RecordStamp>
          ),
        },
        { main: <RecordTitle>{title}</RecordTitle>, right: <RecordQty value={row.qty} /> },
        {
          main: (
            <>
              <RecordIdFact label="SKU" value={row.sku} className="w-44 shrink-0" />
              {state === 'onHold' ? <span className={cn(RECORD_LABEL_CLASS, 'shrink-0 text-mode-warn')}>Pair · photo · count</span> : null}
              <span className={cn(RECORD_LABEL_CLASS, 'shrink-0 text-mode-muted')}>
                {row.source === 'bin' ? 'Bin count' : row.source === 'unit' ? 'Units' : 'On hold'}
              </span>
            </>
          ),
          right: <RecordNext label={countable ? 'Count' : null} />,
        },
      ]}
    />
  );
});
