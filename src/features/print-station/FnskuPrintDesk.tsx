'use client';

/**
 * Print station › **FNSKU labels** (owner 2026-09-29). The manager's path when a
 * packer's FBA unit label is damaged and they cannot reprint it themselves:
 *
 *   sidebar Find (`?q=`, FNSKU / ASIN / SKU / title — an exact FNSKU opens it)
 *   → the FNSKU (`?fnsku=`) → the station at the packer's table → how many
 *   → Print: the label prints THERE, silently (the `fnsku` station job).
 *
 * One row per catalog FNSKU; the most recently reprinted lead with no Find.
 */

import { memo, useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, Plus } from '@/components/Icons';
import { FnskuChip } from '@/components/ui/CopyChip';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { DeskActionSlotRegistrar, DeskHeaderAction } from '@/design-system/components/DeskActionSlot';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordCard } from '@/design-system/components/record-card/RecordCard';
import { TriageCardList, type TriageCardSlotProps, type TriageFeed } from '@/design-system/components/triage-card-list/TriageCardList';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { useLocalTriageSelection } from '@/design-system/components/triage-card-list/local-selection';
import { useTriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { triageFamily, type ViewCardModel } from '@/design-system/components/triage-card-list/triage-view';
import type { RecordStateFace } from '@/design-system/tokens/record';
import type { RowGroup } from '@/lib/group-rows';
import { useOptimisticMutation } from '@/lib/optimistic/useOptimisticMutation';
import {
  fetchPrintStationFnskus,
  PRINT_STATION_FNSKUS_KEY,
  printStationFnskusKey,
  savePrintStationFnsku,
  type PrintStationFnskuList,
  type PrintStationFnskuPatch,
} from '@/lib/print-station/fnsku-client';
import { PRINT_STATION_FNSKU_PARAM, PRINT_STATION_FNSKU_ROW_CAP, PRINT_STATION_PATH, type PrintStationFnskuRow, type PrintStationFnskuView } from '@/lib/print-station/fnsku';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';
import { PRINT_STATION_FNSKU_VIEW } from '@/lib/triage/views';
import { fbaCondition } from '@/lib/fba/fba-conditions';
import { formatDateTimePST } from '@/utils/date';
import { FnskuCreateForm, type CreatedFnsku } from './FnskuCreateForm';
import { FNSKU_RECORD_ROOT_CLASS, FnskuPrintRecord } from './FnskuPrintRecord';

const VIEW = PRINT_STATION_FNSKU_VIEW;
/** No chips: Find is the sidebar's, narrowed on the server. */
const NO_CHIPS: readonly never[] = [];

/**
 * Every card here is an FBA FNSKU, so its state is constant: the rail and the
 * at-rest glyph stay neutral ink — the FNSKU chip already wears the FBA colour.
 */
const FBA_STATE: RecordStateFace = {
  id: 'fba',
  code: 'FBA',
  label: 'Fulfilled by Amazon',
  tone: 'neutral',
  icon: 'package',
};

/**
 * A loaded row. The list family keys records by number and the FBA catalog has
 * none (its key is the FNSKU), so each row carries its 1-based place in this
 * load; the URL keeps the real key (`?fnsku=`).
 */
type FnskuListItem = PrintStationFnskuRow & { ordinal: number };
type FnskuRowModel = { key: string; ids: readonly number[]; lead: FnskuListItem };

const fnskuRowId = (row: FnskuListItem): number => row.ordinal;
/** The open FNSKU is not in this load (a stale link or a narrower Find): the plane shows why. */
const NOT_LOADED_ID = -1;

export function FnskuPrintDesk({
  rows: initialRows,
  total: initialTotal,
  capped,
  view,
}: {
  rows: PrintStationFnskuRow[];
  total: number;
  capped: boolean;
  view: PrintStationFnskuView;
}) {
  const searchParams = useSearchParams();
  const [creating, setCreating] = useState(false);
  const queryClient = useQueryClient();
  const query = searchParams.get('q')?.trim() ?? '';
  const list = useQuery({
    queryKey: printStationFnskusKey(query, view),
    queryFn: ({ signal }) => fetchPrintStationFnskus(query, view, signal),
    initialData: { rows: initialRows, total: initialTotal },
    staleTime: 15_000,
  });
  const rows = list.data.rows;
  const total = list.data.total;
  const labelMutation = useOptimisticMutation<void, { fnsku: string; patch: PrintStationFnskuPatch }>({
    mutationFn: ({ fnsku, patch }) => savePrintStationFnsku(fnsku, patch),
    caches: [
      {
        queryKey: PRINT_STATION_FNSKUS_KEY,
        match: 'prefix',
        update: (current: unknown, vars) => {
          const cached = current as PrintStationFnskuList | undefined;
          return cached
            ? {
                ...cached,
                rows: cached.rows.map((row) =>
                  row.fnsku === vars.fnsku
                    ? {
                        ...row,
                        ...('title' in vars.patch ? { title: vars.patch.title?.trim() || null } : {}),
                        ...('condition' in vars.patch ? { condition: vars.patch.condition?.trim() || null } : {}),
                      }
                    : row,
                ),
              }
            : undefined;
        },
      },
    ],
  });
  const saveLabel = useCallback(
    (fnsku: string, patch: PrintStationFnskuPatch) => labelMutation.mutateAsync({ fnsku, patch }),
    [labelMutation],
  );
  /** The open FNSKU moves within the loaded list: History API, no server round-trip (J / K stay instant). */
  const writeOpen = useCallback(
    (fnsku: string | null) => {
      const params = readLiveSearchParams(searchParams.toString());
      if (fnsku) params.set(PRINT_STATION_FNSKU_PARAM, fnsku);
      else params.delete(PRINT_STATION_FNSKU_PARAM);
      const qs = params.toString();
      window.history.replaceState(null, '', qs ? `${PRINT_STATION_PATH}?${qs}` : PRINT_STATION_PATH);
    },
    [searchParams],
  );

  const cut = useTriageCut({ statusKeys: NO_CHIPS, recordParams: VIEW.recordParams, statusParam: VIEW.chips.param });
  const { filterBands } = cut;
  const items = useMemo<FnskuListItem[]>(() => rows.map((row, index) => ({ ...row, ordinal: index + 1 })), [rows]);
  const allBands = useMemo<[string, RowGroup<FnskuListItem>[]][]>(
    () => (items.length ? [['fnskus', items.map((row) => ({ key: row.fnsku, rows: [row] }))]] : []),
    [items],
  );
  const bands = useMemo(() => filterBands(allBands, (group) => group.key, () => NO_CHIPS), [filterBands, allBands]);
  const painted = useMemo(() => bands.flatMap(([, groups]) => groups.flatMap((group) => group.rows)), [bands]);

  const openKey = searchParams.get(PRINT_STATION_FNSKU_PARAM)?.trim().toUpperCase() || null;
  const openRecord = useMemo(() => (openKey ? (items.find((row) => row.fnsku === openKey) ?? null) : null), [openKey, items]);
  const openId = openRecord ? openRecord.ordinal : openKey ? NOT_LOADED_ID : null;
  const openRow = useCallback(
    (row: FnskuListItem) => {
      setCreating(false);
      writeOpen(row.fnsku);
    },
    [writeOpen],
  );
  const closeRecord = useCallback(() => writeOpen(null), [writeOpen]);

  usePublishRecordCursor({
    surfaceId: 'fnsku-print-rows',
    scope: 'record',
    enabled: true,
    order: bands,
    openId,
    getId: fnskuRowId,
    onOpen: openRow,
    onClose: closeRecord,
  });

  const selection = useLocalTriageSelection(fnskuRowId);
  const family = useMemo(
    () =>
      triageFamily(VIEW, {
        rowId: fnskuRowId,
        groupKey: (group: RowGroup<FnskuListItem>) => group.key,
        cardModel: (group: RowGroup<FnskuListItem>): FnskuRowModel => {
          const lead = group.rows[0]!;
          return { key: group.key, ids: [lead.ordinal], lead };
        },
        // A Find naming exactly one FNSKU (or its catalog aliases) opens it.
        exactFind: (text: string, model: FnskuRowModel) =>
          [model.lead.fnsku, model.lead.asin, model.lead.sku].some((key) => key?.toLowerCase() === text),
        renderCard: (props: TriageCardSlotProps<FnskuListItem, FnskuRowModel>) => <FnskuCard {...props} />,
      }),
    [],
  );

  const feed: TriageFeed<FnskuListItem> = {
    bands,
    allBands,
    painted,
    sectioned: false,
    loading: list.isPending,
    fetching: list.isFetching,
    search: { value: query, pending: false },
    selection,
    open: { id: openId, open: openRow, close: closeRecord },
  };

  const toggleCreate = useCallback(() => {
    if (!creating) writeOpen(null);
    setCreating((open) => !open);
  }, [creating, writeOpen]);
  const createAction = useMemo(
    () => (
      <DeskHeaderAction
        type="button"
        variant="primary"
        size="md"
        icon={<Plus aria-hidden />}
        aria-pressed={creating}
        onClick={toggleCreate}
        data-testid="fnsku-add"
      >
        Add FNSKU
      </DeskHeaderAction>
    ),
    [creating, toggleCreate],
  );
  const created = useCallback(
    (row: CreatedFnsku) => {
      queryClient.setQueryData<PrintStationFnskuList>(printStationFnskusKey(query, view), (current) => {
        if (!current) return current;
        const added: PrintStationFnskuRow = {
          fnsku: row.fnsku,
          title: row.product_title,
          asin: row.asin,
          sku: row.sku,
          condition: row.condition,
          printJobs: 0,
          copiesPrinted: 0,
          lastPrintedAt: null,
          lastCopies: null,
          lastPrintedBy: null,
        };
        const exists = current.rows.some((item) => item.fnsku === row.fnsku);
        return {
          total: current.total + (exists ? 0 : 1),
          rows: exists
            ? current.rows.map((item) => (item.fnsku === row.fnsku ? { ...item, ...added } : item))
            : [added, ...current.rows].slice(0, PRINT_STATION_FNSKU_ROW_CAP),
        };
      });
      setCreating(false);
      writeOpen(row.fnsku);
      void queryClient.invalidateQueries({ queryKey: PRINT_STATION_FNSKUS_KEY });
    },
    [query, queryClient, view, writeOpen],
  );

  return (
    <>
      <DeskActionSlotRegistrar role="primary">{createAction}</DeskActionSlotRegistrar>
      <TriageCardList
        family={family}
        feed={feed}
        cut={cut}
        summary={null}
        bulk={<span className="truncate text-sm text-text-muted">Open one to print its label at any station</span>}
        banner={
          <div className="flex min-w-0 items-center gap-3 pb-2 pl-4" data-testid="fnsku-print-tally">
            <p className="truncate text-sm text-text-muted">
              {capped || total > PRINT_STATION_FNSKU_ROW_CAP
                ? `First ${rows.length} of ${total} FNSKUs — narrow the search`
                : query
                  ? `${total} ${total === 1 ? 'FNSKU' : 'FNSKUs'} match`
                  : `${total} ${total === 1 ? 'FNSKU' : 'FNSKUs'} ready to print`}
            </p>
          </div>
        }
        leadSlot={creating ? <FnskuCreateForm onCancel={() => setCreating(false)} onCreated={created} /> : null}
        searchEmpty={query ? <p className="text-sm text-text-muted">No FNSKU matches “{query}” — try the FNSKU or part of the title.</p> : null}
        allClear={<TriageAllClear title="No FNSKUs in the FBA catalog yet" detail="Add the first FNSKU from the page action." />}
        record={{
          title: openRecord ? openRecord.fnsku : 'Not in this list',
          subtitle: openRecord?.title ?? undefined,
          noun: 'FNSKU',
          testId: 'fnsku-print-record',
          summary: null,
          strip: null,
          view: openRecord ? (
            <FnskuPrintRecord
              key={openRecord.fnsku}
              row={openRecord}
              onSaveLabel={(patch) => saveLabel(openRecord.fnsku, patch)}
              labelSaving={labelMutation.isPending && labelMutation.variables?.fnsku === openRecord.fnsku}
              onPrinted={() => void queryClient.invalidateQueries({ queryKey: PRINT_STATION_FNSKUS_KEY })}
            />
          ) : openKey ? (
            <div className={FNSKU_RECORD_ROOT_CLASS}>
              <DeskRecordLayout main={<EvidenceNotice>{openKey} is not in this list — search for it in Find.</EvidenceNotice>} />
            </div>
          ) : null,
        }}
      />
    </>
  );
}

/** Its print state here: printed (the last job on hover) or not yet. */
function fnskuPrintStatus(row: PrintStationFnskuRow): ViewCardModel<typeof VIEW>['status'] {
  if (row.printJobs === 0) return { kind: 'state', face: 'Not printed', tone: 'neutral', tip: 'No print of this FNSKU is logged at the print station' };
  const last = row.lastPrintedAt ? `Last printed ${formatDateTimePST(row.lastPrintedAt)} PT` : 'Printed';
  const copies = row.lastCopies != null ? ` · ${row.lastCopies} sticker${row.lastCopies === 1 ? '' : 's'}` : '';
  const by = row.lastPrintedBy ? ` by ${row.lastPrintedBy}` : '';
  const total = `${row.printJobs} job${row.printJobs === 1 ? '' : 's'}, ${row.copiesPrinted} sticker${row.copiesPrinted === 1 ? '' : 's'} in all`;
  return { kind: 'state', face: 'Printed', tone: 'success', tip: `${last}${copies}${by} · ${total}` };
}

/** One FNSKU as the shared card reads it (`print-station.fnsku`). */
export function fnskuRecordCard(model: FnskuRowModel): ViewCardModel<typeof VIEW> {
  const row = model.lead;
  const condition = fbaCondition(row.condition);
  return {
    key: model.key,
    leadId: row.ordinal,
    state: FBA_STATE,
    stateIcon: Package,
    stateMeaning: FBA_STATE.label,
    alert: null,
    aria: {
      card: `FNSKU ${row.fnsku}, ${row.title ?? 'no title'}`,
      open: `Open FNSKU ${row.fnsku}`,
      check: `Select FNSKU ${row.fnsku}`,
    },
    channel: null,
    person: null,
    chips: [],
    notes: { fixed: null, own: null },
    status: fnskuPrintStatus(row),
    next: null,
    lines: [
      {
        id: row.ordinal,
        title: row.title ?? 'No title in the catalog',
        photoUrl: null,
        // Only what this record has: an unset condition or a missing ASIN paints nothing.
        facts: {
          asin: row.asin ? { kind: 'code', text: row.asin, title: `ASIN ${row.asin}` } : null,
          condition: row.condition ? { kind: 'grade', label: condition?.label ?? row.condition, code: condition?.grade ?? null } : null,
        },
        alert: false,
        alertNote: null,
      },
    ],
    hiddenAlertLabel: () => '',
  };
}

/** One FNSKU as a triage card: the FNSKU · title, ASIN and condition (when set); its print state top-right. */
const FnskuCard = memo(function FnskuCard(props: TriageCardSlotProps<FnskuListItem, FnskuRowModel>) {
  const { model } = props;
  const row = model.lead;
  const record = useMemo(() => fnskuRecordCard(model), [model]);
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
      identity={{ role: 'identity', content: <FnskuChip value={row.fnsku} width="w-fit max-w-full" /> }}
      trailing={null}
    />
  );
});
