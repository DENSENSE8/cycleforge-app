'use client';

/**
 * Inventory › **Stock** — one location-walk row per physical warehouse slot,
 * count; title; count · SKU). Room and Aisle narrow the server query from the
 * contextual sidebar; stock health is the middle status rail. The page's one
 * CTA, Add stock, opens the inline form (a new product is minted there). The
 * pair (`?open=<loc:sku:source>`) reads in the record plane.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus } from '@/components/Icons';
import { CopyChip } from '@/components/ui/CopyChip';
import { DeskActionSlotRegistrar, DeskHeaderAction } from '@/design-system/components/DeskActionSlot';
import { StatusChipRail, type StatusChip } from '@/design-system/components/QueueStatusChips';
import { RecordLedgerSummaryPane, RecordLedgerTally } from '@/design-system/components/record-ledger/RecordLedgerSummary';
import { RecordCard } from '@/design-system/components/record-card/RecordCard';
import { RecordFactPaint } from '@/design-system/components/record-card/record-fact';
import { TriageCardList, type TriageCardSlotProps, type TriageFeed } from '@/design-system/components/triage-card-list/TriageCardList';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { useLocalTriageSelection } from '@/design-system/components/triage-card-list/local-selection';
import { useTriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { triageFamily } from '@/design-system/components/triage-card-list/triage-view';
import { recordRowFace } from '@/design-system/components/triage-card-list/record-row-face';
import { useTriageDensity } from '@/design-system/components/triage-card-list/triage-density';
import { TriageRow } from '@/design-system/components/triage-card-list/TriageRow';
import { Button } from '@/design-system/primitives';
import { CARD_FACT_BOX_CLASS } from '@/design-system/tokens/desk-stage';
import { useAuth } from '@/contexts/AuthContext';
import { useAblyChannel } from '@/hooks/useAblyChannel';
import { StockRecordView } from '@/features/stock-record/StockRecordView';
import { StockRecordActions } from '@/components/inventory/stock/StockRecordActions';
import type { RowGroup } from '@/lib/group-rows';
import { isStockDeltaActivity } from '@/lib/inventory/stock-live-refresh';
import {
  locationStockRowId,
  resolveLocationStockRow,
  locationStockRackFace,
  locationStockRackGroups,
  parseLocationStockAisles,
  parseLocationStockRoomIds,
  parseLocationStockSort,
  type LocationStockRoomFacet,
  type LocationStockTableRow,
} from '@/lib/inventory/location-stock-row';
import { getStationChannelName, safeChannelName } from '@/lib/realtime/channels';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { toast } from '@/lib/toast';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';
import { INVENTORY_STOCK_ROUTE_PARAMS } from '@/lib/routing/query-mode-routes';
import { parseRouteParams } from '@/lib/routing/route-params';
import type { StockScopeCounts } from '@/lib/neon/location-stock-queries';
import { INVENTORY_STOCK_VIEW } from '@/lib/triage/views';
import { stockLocationFace, stockRecordState, stockRecordTitle } from './stock-record';
import { postStockTransfer } from '@/lib/inventory/stock-transfer-client';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { recallStockPlace, rememberStockPlace, useStockPlaceOptions } from '@/hooks/useStockPlaceOptions';
import { StockAddForm } from './StockAddForm';
import { stockSummary } from './StockEvidence';
import { StockRackPeek } from './StockRackPeek';
import { stockRackTotal, stockRecordCard, type StockRowModel } from './stock-card-model';
import { cn } from '@/utils/_cn';

const VIEW = INVENTORY_STOCK_VIEW;
const STOCK_PATH = '/inventory/stock';

/** A burst of counts (a gun session) costs one loader re-read. */
const LIVE_REFRESH_DEBOUNCE_MS = 400;

type StockHealth = 'in-stock' | 'out-of-stock' | 'on-hold';

const STOCK_HEALTH_CHIPS: readonly Omit<StatusChip<StockHealth>, 'count'>[] = [
  { id: 'in-stock', label: 'In stock', tone: 'info' },
  { id: 'out-of-stock', label: 'Out of stock', tone: 'danger' },
  { id: 'on-hold', label: 'On hold', tone: 'warning' },
];
const STOCK_HEALTH_KEYS = STOCK_HEALTH_CHIPS.map((chip) => chip.id);

export function stockHealth(row: LocationStockTableRow): readonly StockHealth[] {
  // An empty address is capacity, not an item. It stays in the location walk
  // but must not inflate or appear under an item-health chip.
  if (row.source === 'empty') return [];
  const state = stockRecordState(row);
  // On hold is an exception facet, not a third inventory quantity state.
  // A TMP row is still either physically present or out of stock, so operators
  // can reach zero-count exceptions from either relevant chip.
  if (state === 'onHold') return row.qty > 0 ? ['in-stock', 'on-hold'] : ['out-of-stock', 'on-hold'];
  return [state === 'outOfStock' ? 'out-of-stock' : 'in-stock'];
}

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

interface StockLedgerProps {
  /** Pairs loaded for the selected server-side room/aisle scope. */
  rows: LocationStockTableRow[];
  /** Rooms across those pairs, with counts. */
  rooms: LocationStockRoomFacet[];
  /** Room value used for this server payload. */
  loadedRoomFilter: string | null;
  /** Aisle value used for this server payload. */
  loadedAisleFilter: string | null;
  /** Sort value used while producing this server payload. */
  loadedSortFilter: string | null;
  /** Pairs matching `?q=` across the selected room, before the row cap. */
  totalCount: number;
  /** Health counts over the loaded scope — server truth, uncapped. */
  counts: StockScopeCounts;
  /** The loader hit its row cap — some matches are not on screen. */
  capped: boolean;
}

export function StockLedger({
  rows,
  rooms,
  loadedRoomFilter,
  loadedAisleFilter,
  loadedSortFilter,
  totalCount,
  counts,
  capped,
}: StockLedgerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const roomFilter = searchParams.get('room')?.trim() || null;
  const aisleFilter = searchParams.get('aisle')?.trim() || null;
  const sortFilter = searchParams.get('sort')?.trim() || null;
  useEffect(() => {
    // Contextual controls update the native URL first. Refresh that exact URL
    // when this payload trails it; replacing an identical URL is a Next no-op.
    if (
      roomFilter !== loadedRoomFilter ||
      aisleFilter !== loadedAisleFilter ||
      sortFilter !== loadedSortFilter
    ) {
      startTransition(() => router.refresh());
    }
  }, [
    aisleFilter,
    loadedAisleFilter,
    loadedRoomFilter,
    loadedSortFilter,
    roomFilter,
    router,
    sortFilter,
    startTransition,
  ]);

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

  // ── Location walk: sidebar room/aisle scope, then middle health status ────
  const cut = useTriageCut({ statusKeys: STOCK_HEALTH_KEYS, recordParams: VIEW.recordParams, statusParam: VIEW.chips.param });
  const { filterBands } = cut;
  const selectedRooms = useMemo(
    () => new Set(parseLocationStockRoomIds(loadedRoomFilter)),
    [loadedRoomFilter],
  );
  const selectedAisles = useMemo(
    () => new Set(parseLocationStockAisles(loadedAisleFilter)),
    [loadedAisleFilter],
  );
  const locationWalkActive = selectedRooms.size > 0 || selectedAisles.size > 0;
  const locationSort = parseLocationStockSort(searchParams.get('sort'));
  const scopedRows = useMemo(
    () => rows.filter((row) => (
      (selectedRooms.size === 0 || selectedRooms.has(row.room?.trim() || '(none)')) &&
      (selectedAisles.size === 0 || (row.aisle != null && selectedAisles.has(row.aisle)))
    )),
    [rows, selectedAisles, selectedRooms],
  );
  const locationGroups = useMemo(
    () => locationStockRackGroups(scopedRows, locationSort),
    [locationSort, scopedRows],
  );
  const walkRows = useMemo(() => locationGroups.flatMap((group) => group.rows), [locationGroups]);
  const allBands = useMemo<[string, RowGroup<LocationStockTableRow>[]][]>(
    () => (locationGroups.length ? [['stock', locationGroups]] : []),
    [locationGroups],
  );
  const bands = useMemo(
    () => filterBands(allBands, (group) => group.key, stockHealth),
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
    () => (resolvedOpenKey ? resolveLocationStockRow(rows, resolvedOpenKey) : null),
    [resolvedOpenKey, rows],
  );
  // A stale `<loc>::empty` link resolved to that location's live row: rewrite
  // the URL to the real key so the walk (J/K), prev/next and `?sku=` all agree.
  useEffect(() => {
    if (!openRecord || !resolvedOpenKey) return;
    if (locationStockRowId(openRecord) === resolvedOpenKey) return;
    writeRecord((params) => {
      params.set('open', locationStockRowId(openRecord));
      if (openRecord.is_provisional) params.set('sku', openRecord.sku);
    });
  }, [openRecord, resolvedOpenKey, writeRecord]);
  const [adding, setAdding] = useState(false);

  const openRow = useCallback(
    (row: LocationStockTableRow) => {
      setAdding(false);
      writeRecord((params) => {
        params.set('open', locationStockRowId(row));
        if (row.is_provisional) params.set('sku', row.sku);
        else params.delete('sku');
      });
    },
    [writeRecord],
  );
  const closeRecord = useCallback(() => {
    writeRecord((params) => {
      params.delete('open');
      params.delete('sku');
    });
  }, [writeRecord]);

  // Stock desk-local photo shortcut: invoke the exact visible Phone button so
  // keyboard and pointer share handshake, busy and availability behavior.
  useEffect(() => {
    if (!openRecord) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.code !== 'KeyP' ||
        event.defaultPrevented ||
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        isEditableKeyTarget(event.target) ||
        hasOpenOverlay()
      ) return;
      const phone = document.querySelector<HTMLButtonElement>('[data-testid="stock-photo-phone"]');
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!phone || phone.offsetParent == null) {
        toast.error('Create a TMP SKU first — this location has no stock record to photograph.');
        return;
      }
      if (phone.disabled) {
        toast.error(phone.title || 'Phone is busy');
        return;
      }
      phone.click();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [openRecord]);

  usePublishRecordCursor({
    surfaceId: 'stock-rows',
    scope: 'record',
    enabled: true,
    keyOrder: 'j-prev',
    order: bands,
    openId: openRecord ? stockRowId(openRecord) : null,
    getId: stockRowId,
    onOpen: openRow,
    onClose: closeRecord,
  });

  // ONE page CTA, top-right: Add stock. A product the catalog does not know is
  // minted inside that form — pairing is part of adding, not a second CTA.
  const createAction = useMemo(
    () => (
      <DeskHeaderAction
        type="button"
        variant="primary"
        size="md"
        icon={<Plus aria-hidden />}
        aria-pressed={adding}
        onClick={() => setAdding((open) => !open)}
        data-testid="stock-add-open"
      >
        Add stock
      </DeskHeaderAction>
    ),
    [adding],
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
  const localSelection = useLocalTriageSelection(stockRowId);
  // Shift-click checks the RANGE from the last plain click to this row (the
  // face's plain toggle checks one). Select-all still acts on the visible page.
  const anchorRef = useRef<number | null>(null);
  const selection = useMemo<typeof localSelection>(
    () => ({
      ...localSelection,
      toggle: (row, event) => {
        if (event?.shiftKey && anchorRef.current != null) {
          const ids = painted.map(stockRowId);
          const to = ids.indexOf(stockRowId(row));
          const from = ids.indexOf(anchorRef.current);
          if (to >= 0 && from >= 0) {
            localSelection.toggleGroup(ids.slice(Math.min(from, to), Math.max(from, to) + 1), true);
            return;
          }
        }
        anchorRef.current = stockRowId(row);
        localSelection.toggle(row, event);
      },
    }),
    [localSelection, painted],
  );
  const [density, setDensity] = useTriageDensity('inventory.stock');
  const family = useMemo(
    () =>
      triageFamily(VIEW, {
        rowId: stockRowId,
        groupKey: (group: RowGroup<LocationStockTableRow>) => group.key,
        cardModel: (group: RowGroup<LocationStockTableRow>): StockRowModel => {
          const lead = group.rows[0]!;
          return { key: group.key, ids: group.rows.map(stockRowId), lead, rows: group.rows };
        },
        // A Find naming exactly one pair's bin or SKU opens it.
        exactFind: (query: string, model: StockRowModel) => model.rows.some((row) =>
          row.sku.toLowerCase() === query ||
          stockLocationFace(row)?.toLowerCase() === query ||
          locationStockRackFace(row)?.toLowerCase() === query
        ),
        renderCard: (props: TriageCardSlotProps<LocationStockTableRow, StockRowModel>) =>
          density === 'row' ? <StockCompactRow {...props} /> : <StockRow {...props} />,
      }),
    [density],
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
      id: resolvedOpenKey ? stockPairId(resolvedOpenKey) : null,
      open: openRow,
      close: closeRecord,
    },
  };

  // ── Bulk actions: the top row's verb bar ─────────────────────────────────
  const [bulkBusy, setBulkBusy] = useState(false);
  const selectedRows = useMemo(
    () => walkRows.filter((row) => selection.ids.has(stockRowId(row))),
    [selection.ids, walkRows],
  );
  const deletable = useMemo(
    () => selectedRows.filter((row) => row.is_provisional && row.qty <= 0 && row.sku),
    [selectedRows],
  );
  // Empty bins among the selection — one verb per unique barcode (the walk can
  // list the same bin once per SKU); DELETE refuses any bin that still holds stock.
  const deletableBins = useMemo(() => {
    const seen = new Set<string>();
    const bins: { barcode: string; face: string }[] = [];
    for (const row of selectedRows) {
      if (row.source !== 'empty' || !row.location_barcode || seen.has(row.location_barcode)) continue;
      seen.add(row.location_barcode);
      bins.push({ barcode: row.location_barcode, face: stockLocationFace(row) ?? row.location_barcode });
    }
    return bins;
  }, [selectedRows]);
  const movable = useMemo(
    () => selectedRows.filter((row) => row.qty > 0 && row.location_barcode && row.sku),
    [selectedRows],
  );
  const [moveChoice, setMoveChoice] = useState<string | null>(null);
  const [moveArmed, setMoveArmed] = useState(false);
  const placePicker = useStockPlaceOptions({ enabled: selectedRows.length > 0 });
  const bulkDeleteBins = useCallback(async () => {
    if (bulkBusy || deletableBins.length === 0) return;
    const label = deletableBins.length === 1 ? deletableBins[0]!.face : `${deletableBins.length} empty bins`;
    if (!window.confirm(`Delete ${label}? They stop appearing in the walk and pickers.`)) return;
    setBulkBusy(true);
    let failed = 0;
    for (const bin of deletableBins) {
      try {
        const res = await fetch(`/api/locations/${encodeURIComponent(bin.barcode)}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (!res.ok) failed += 1;
      } catch {
        failed += 1;
      }
    }
    setBulkBusy(false);
    const done = deletableBins.length - failed;
    if (done > 0) toast.success(`Deleted ${done} empty bin${done === 1 ? '' : 's'}`);
    if (failed > 0) toast.error(`${failed} bin${failed === 1 ? '' : 's'} could not be deleted (not empty or in use).`);
    selection.setAll(false);
    router.refresh();
  }, [bulkBusy, deletableBins, router, selection]);
  const bulkMove = useCallback(async () => {
    if (bulkBusy || movable.length === 0 || !moveChoice) return;
    const face = placePicker.faceOf(moveChoice);
    if (!window.confirm(`Move ${movable.length} pair${movable.length === 1 ? '' : 's'} to ${face}?`)) return;
    setBulkBusy(true);
    let failed = 0;
    try {
      const target = await placePicker.resolve(moveChoice);
      for (const row of movable) {
        try {
          await postStockTransfer({
            fromBarcode: row.location_barcode ?? '',
            toBarcode: target,
            sku: row.sku,
            qty: row.qty,
            notes: `Bulk move to ${face}`,
          });
        } catch {
          failed += 1;
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not resolve the target place.');
      setBulkBusy(false);
      return;
    }
    setBulkBusy(false);
    const done = movable.length - failed;
    if (done > 0) toast.success(`Moved ${done} pair${done === 1 ? '' : 's'} to ${face}`);
    if (failed > 0) toast.error(`${failed} pair${failed === 1 ? '' : 's'} could not be moved — re-check their counts.`);
    setMoveChoice(null);
    if (done > 0 && moveChoice) rememberStockPlace(moveChoice);
    setMoveArmed(false);
    selection.setAll(false);
    router.refresh();
  }, [bulkBusy, movable, moveChoice, placePicker, router, selection]);

  const bulkDelete = useCallback(async () => {
    if (bulkBusy || deletable.length === 0) return;
    const label = deletable.length === 1 ? deletable[0]!.sku : `${deletable.length} placeholders`;
    if (!window.confirm(`Delete ${label}? This removes the placeholder pairings — it cannot be undone.`)) return;
    setBulkBusy(true);
    let failed = 0;
    for (const row of deletable) {
      try {
        const res = await fetch(`/api/sku-catalog/provisional/${encodeURIComponent(row.sku)}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (!res.ok) failed += 1;
      } catch {
        failed += 1;
      }
    }
    setBulkBusy(false);
    const done = deletable.length - failed;
    if (done > 0) toast.success(`Deleted ${done} placeholder${done === 1 ? '' : 's'}`);
    if (failed > 0) toast.error(`${failed} could not be deleted (they hold stock — pair those instead).`);
    selection.setAll(false);
    router.refresh();
  }, [bulkBusy, deletable, router, selection]);

  const toggleHealth = useCallback(
    (key: StockHealth) => {
      replace((params) => {
        const selected = new Set(
          (params.get(VIEW.chips.param) ?? '')
            .split(',')
            .filter((value): value is StockHealth => STOCK_HEALTH_KEYS.includes(value as StockHealth)),
        );
        if (!selected.delete(key)) selected.add(key);
        const ordered = STOCK_HEALTH_KEYS.filter((value) => selected.has(value));
        if (ordered.length) params.set(VIEW.chips.param, ordered.join(','));
        else params.delete(VIEW.chips.param);
        params.delete('page');
      });
    },
    [replace],
  );
  const resetHealth = useCallback(
    () => replace((params) => {
      params.delete(VIEW.chips.param);
      params.delete('page');
    }),
    [replace],
  );

  const chips = useMemo<StatusChip<StockHealth>[]>(
    () => [
      { ...STOCK_HEALTH_CHIPS[0]!, count: counts.inStockProducts, label: `In stock · ${counts.inStockUnits} units` },
      { ...STOCK_HEALTH_CHIPS[1]!, count: counts.outPairs },
      { ...STOCK_HEALTH_CHIPS[2]!, count: counts.onHoldPairs },
    ],
    [counts],
  );
  // The list read as a whole: server counts over the SAME matched set — the
  // numbers never move when the health filter narrows the rows on screen.
  const summary = useMemo(() => stockSummary(totalCount, counts, rooms), [counts, rooms, totalCount]);
  const narrowed = Boolean(searchParams.get('q')?.trim()) || selectedRooms.size > 0 || selectedAisles.size > 0 || cut.url.statusFilter.size > 0;

  return (
    <>
      <DeskActionSlotRegistrar role="primary">{createAction}</DeskActionSlotRegistrar>
      <TriageCardList
        family={family}
        densityControl={{ value: density, onChange: setDensity }}
        feed={feed}
        cut={cut}
        summary={
          <div className="flex min-w-0 flex-1 items-center">
            <RecordLedgerTally summary={summary} />
            <StatusChipRail
              chips={chips}
              active={cut.url.statusFilter}
              onToggle={toggleHealth}
              onReset={resetHealth}
              label="Stock health"
              testId="stock-health"
            />
          </div>
        }
        summaryInline
        bulk={
          selectedRows.length > 0 ? (
            <div className="flex min-w-0 items-center gap-2">
              {movable.length > 0 ? (
                moveArmed ? (
                  <>
                    <SearchableSelectField
                      value={moveChoice}
                      onChange={(next) => setMoveChoice(next == null ? null : String(next))}
                      options={placePicker.options}
                      loading={placePicker.loading}
                      placeholder="Move to…"
                      searchPlaceholder="Tote (H-12), bin code or room…"
                      className="w-56"
                      testId="stock-bulk-move-target"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={bulkBusy}
                      onClick={() => void bulkMove()}
                      data-testid="stock-bulk-move-confirm"
                    >
                      Move {movable.length}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => { setMoveChoice(null); setMoveArmed(false); }}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => { setMoveChoice(recallStockPlace()); setMoveArmed(true); }}
                    data-testid="stock-bulk-move"
                  >
                    Move {movable.length}
                  </Button>
                )
              ) : null}
              {deletableBins.length > 0 ? (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={bulkBusy && deletable.length === 0}
                  onClick={() => void bulkDeleteBins()}
                  data-testid="stock-bulk-delete-bins"
                >
                  Delete {deletableBins.length} {deletableBins.length === 1 ? 'bin' : 'bins'}
                </Button>
              ) : null}
              {deletable.length > 0 || selectedRows.some((row) => row.is_provisional) ? (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={bulkBusy && deletableBins.length === 0}
                  disabled={deletable.length === 0}
                  title={deletable.length === 0 ? 'Only zero-stock TMP placeholders can be deleted here — pair real stock instead.' : undefined}
                  onClick={() => void bulkDelete()}
                  data-testid="stock-bulk-delete"
                >
                  Delete {deletable.length > 0 ? `${deletable.length} TMP` : 'TMP'}
                </Button>
              ) : null}
            </div>
          ) : (
            <span className="truncate text-sm text-text-muted">Open one to count it</span>
          )
        }
        banner={
          capped && (!locationWalkActive || walkRows.length === rows.length) ? (
            <p className="truncate pb-2 pl-4 text-sm text-text-warning" data-testid="stock-capped">
              First {rows.length} of {totalCount} pairs — narrow the search
            </p>
          ) : null
        }
        leadSlot={
          adding ? (
            <StockAddForm
              key="all"
              rows={rows}
              onAdded={refreshSoon}
              onClose={() => setAdding(false)}
            />
          ) : null
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
                    params.delete('aisle');
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
          // The record reads what is here and what it is (owner 2026-09-30): the stock on the left, the product title after it.
          // Where it sits (tote · room) is the item card's location line, not the header.
          title: openRecord ? (
            <span className="flex min-w-0 items-baseline gap-3" data-testid="stock-record-title">
              <span
                className={cn('shrink-0 tabular-nums', openRecord.qty > 0 ? 'text-text-default' : 'text-text-warning')}
                data-testid="stock-record-title-qty"
              >
                {openRecord.qty}
              </span>
              <span className="min-w-0 truncate">
                {openRecord.source === 'empty' ? 'Empty location' : stockRecordTitle(openRecord)}
              </span>
            </span>
          ) : (
            'Not in this list'
          ),
          actions:
            openRecord && openRecord.source !== 'empty' ? (
              <StockRecordActions
                record={openRecord}
                onChanged={() => router.refresh()}
                onPaired={() => {
                  closeRecord();
                  router.refresh();
                }}
              />
            ) : null,
          noun: openRecord?.is_provisional ? 'SKU exception' : VIEW.noun.one,
          testId: 'stock-record',
          summary: <RecordLedgerSummaryPane summary={summary} />,
          strip: null,
          view: resolvedOpenKey ? (
            <StockRecordView
              record={openRecord}
              rows={rows}
              showActions={false}
              onChanged={() => router.refresh()}
              onOpenKey={(key, sku) =>
                replace((params) => {
                  params.set('open', key);
                  params.set('sku', sku);
                })
              }
              onClose={closeRecord}
            />
          ) : null,
        }}
      />
    </>
  );
}

/**
 * One rack-level stock card, following Allocate's card grammar: room · rack
 * once, the first positive product as the lead, and +N products unfolding the
 * remaining exact positions. No location code is repeated as a separate card.
 */
const StockRow = memo(function StockRow(props: TriageCardSlotProps<LocationStockTableRow, StockRowModel>) {
  const { model } = props;
  const row = model.lead;
  const bin = locationStockRackFace(row);
  const totalQty = stockRackTotal(model.rows);
  const record = useMemo(() => stockRecordCard(model, stockRowId), [model]);
  return (
    <RecordCard
      {...props}
      view={VIEW}
      model={record}
      factColumns={VIEW.facts}
      testIdPrefix={VIEW.testIdPrefix}
      onOpen={(event) => props.onOpen(row, event)}
      onToggleCheck={(event) => props.onToggleCheck(model, event)}
      onToggleExpand={() => props.onToggleExpand(model.key)}
      onTogglePeek={() => props.onTogglePeek(model.key)}
      onOpenLine={(lineId, event) => {
        const item = model.rows.find((candidate) => stockRowId(candidate) === lineId);
        if (item) props.onOpen(item, event);
      }}
      openLineId={props.openId}
      identity={{
        role: 'identity',
        content: (
          <span className="flex min-w-0 items-center gap-2" data-testid={`${VIEW.testIdPrefix}-location`}>
            <span className={cn('min-w-0 truncate', !row.room && 'text-text-warning')}>{row.room ?? 'No room'}</span>
            <span aria-hidden className="text-text-faint">·</span>
            {bin ? (
              <CopyChip value={bin} display={bin} tone="bin" icon={null} width="w-fit max-w-full" />
            ) : (
              <span className="shrink-0 text-text-warning">No location</span>
            )}
          </span>
        ),
      }}
      // The rack's total on hand across its positions, before the last-counted date (the status).
      trailing={{
        role: 'trailing',
        content: (
          <span
            className={cn(CARD_FACT_BOX_CLASS, 'pointer-events-auto gap-1 whitespace-nowrap text-[13px] text-text-muted')}
            title={`${totalQty} on hand across ${model.rows.length} position${model.rows.length === 1 ? '' : 's'}`}
            data-testid={`${VIEW.testIdPrefix}-total`}
          >
            <RecordFactPaint face={{ kind: 'count', value: totalQty }} />
            on hand
          </span>
        ),
      }}
      quickLook={<StockRackPeek key="peek" model={model} testIdPrefix={VIEW.testIdPrefix} />}
    />
  );
});

/**
 * One rack on ONE line — the Compact face of the stock list (Full is
 * {@link StockRow}). Built from the card's own `stockRecordCard` model, so both
 * densities paint one truth; identity is the room · rack handle the card shows.
 */
const StockCompactRow = memo(function StockCompactRow(props: TriageCardSlotProps<LocationStockTableRow, StockRowModel>) {
  const { model } = props;
  const face = useMemo(() => {
    const row = model.lead;
    const bin = locationStockRackFace(row);
    const identity = `${row.room ?? 'No room'} · ${bin ?? 'No location'}`;
    return recordRowFace(stockRecordCard(model, stockRowId), VIEW, { identity, identityWidth: 'long' });
  }, [model]);
  return (
    <TriageRow
      {...props}
      face={face}
      testIdPrefix={VIEW.testIdPrefix}
      quickLook={<StockRackPeek key="peek" model={model} testIdPrefix={VIEW.testIdPrefix} />}
    />
  );
});
