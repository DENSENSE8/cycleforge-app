'use client';

/**
 * Print station › **FNSKU labels** (owner 2026-09-29; reshaped 2026-10-04).
 * The station's whole job is find a label, then print it:
 *
 *   sidebar Find (`?q=`, FNSKU / ASIN / SKU / title — an exact FNSKU opens it)
 *   → the FNSKU (`?fnsku=`) → the station at the packer's table → how many
 *   → Print: the label prints THERE, silently (the `fnsku` station job).
 *
 * One record per catalog FNSKU, read in the station's order: the FNSKU (last
 * 8), title, condition, then ASIN · SKU at the right. Compact (the default) is
 * one line; Full puts the FNSKU top-left with ASIN · SKU at that row's right
 * and the title · condition under it. Hovering a row reveals **Print** at its
 * right edge: the print popover for that FNSKU, no record open needed. No
 * print history, no count banner (the select bar already says how many and
 * `100 / page`).
 */

import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Package, Plus, Printer } from '@/components/Icons';
import { CopyChip, FnskuChip, SkuScanRefChip } from '@/components/ui/CopyChip';
import { DeskRecordLayout } from '@/design-system/components/DeskRecordPlane';
import { RecordActionStrip, type RecordActionVerb } from '@/design-system/components/record-action-strip/RecordActionStrip';
import { DeskActionSlotRegistrar, DeskHeaderAction } from '@/design-system/components/DeskActionSlot';
import { EvidenceNotice } from '@/design-system/components/record-ledger/RecordEvidence';
import { RecordCard } from '@/design-system/components/record-card/RecordCard';
import { TriageCardList, type TriageCardSlotProps, type TriageFeed } from '@/design-system/components/triage-card-list/TriageCardList';
import { TriageAllClear } from '@/design-system/components/triage-card-list/TriageListBody';
import { TriageRow, type TriageRowFace } from '@/design-system/components/triage-card-list/TriageRow';
import { useLocalTriageSelection } from '@/design-system/components/triage-card-list/local-selection';
import { useTriageDensity } from '@/design-system/components/triage-card-list/triage-density';
import { useTriageCut } from '@/design-system/components/triage-card-list/triage-list-state';
import { triageFamily, type ViewCardModel } from '@/design-system/components/triage-card-list/triage-view';
import type { RecordFactFace } from '@/design-system/components/record-card/record-fact';
import type { RecordStateFace } from '@/design-system/tokens/record';
import { getLast8 } from '@/lib/copy-chip-format';
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
import {
  PRINT_STATION_CONDITION_PARAM,
  printStationConditionWords,
  PRINT_STATION_FNSKU_PARAM,
  PRINT_STATION_FNSKU_ROW_CAP,
  PRINT_STATION_PATH,
  type PrintStationFnskuRow,
  type PrintStationFnskuView,
} from '@/lib/print-station/fnsku';
import { usePublishRecordCursor } from '@/lib/record-cursor/useRecordCursor';
import { readLiveSearchParams } from '@/lib/routing/optimistic-url-param';
import { PRINT_STATION_FNSKU_VIEW } from '@/lib/triage/views';
import { fbaCondition, fbaConditionLabel } from '@/lib/fba/fba-conditions';
import { toast } from '@/lib/toast';
import { FnskuBulkPrint, FnskuRowPrint } from './FnskuBulkPrint';
import { FnskuCreatePopover, type CreatedFnsku } from './FnskuCreateForm';
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
/** A face's slot props plus the list re-read after a row's Print sends labels. */
type FnskuFaceProps = TriageCardSlotProps<FnskuListItem, FnskuRowModel> & { onPrinted: () => void };

const fnskuRowId = (row: FnskuListItem): number => row.ordinal;
/** The open FNSKU is not in this load (a stale link or a narrower Find): the plane shows why. */
const NOT_LOADED_ID = -1;

export function FnskuPrintDesk({
  rows: initialRows,
  view,
  query: serverQuery,
  condition: serverCondition,
}: {
  rows: PrintStationFnskuRow[];
  view: PrintStationFnskuView;
  /** The Find and condition the server already loaded — only that pair may seed the cache. */
  query: string;
  condition: string;
}) {
  const searchParams = useSearchParams();
  const [creating, setCreating] = useState(false);
  const queryClient = useQueryClient();
  const query = searchParams.get('q')?.trim() ?? '';
  const condition = searchParams.get(PRINT_STATION_CONDITION_PARAM)?.trim().toLowerCase() ?? '';
  const seeded = query === serverQuery.trim() && condition === serverCondition.trim().toLowerCase();
  const list = useQuery({
    queryKey: printStationFnskusKey(query, view, condition),
    queryFn: ({ signal }) => fetchPrintStationFnskus(query, view, condition, signal),
    ...(seeded ? { initialData: { rows: initialRows } } : {}),
    staleTime: 15_000,
  });
  const rows = list.data?.rows ?? [];
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
                        ...('mark' in vars.patch ? { mark: vars.patch.mark?.trim().slice(0, 40) || null } : {}),
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
  const checked = useMemo(() => items.filter((row) => selection.ids.has(row.ordinal)), [items, selection.ids]);
  // A print re-reads the list (Reprinted view / recency order).
  const refreshList = useCallback(() => void queryClient.invalidateQueries({ queryKey: PRINT_STATION_FNSKUS_KEY }), [queryClient]);
  // The check-set's verbs (owner 2026-10-04): the station's job is find, then print — so Print the checked labels, or copy their FNSKUs.
  const bulkVerbs = useMemo<RecordActionVerb[]>(
    () => [
      {
        id: 'print',
        label: 'Print labels',
        icon: <Printer className="size-4" aria-hidden />,
        dialog: (done) => <FnskuBulkPrint rows={checked} done={done} onPrinted={refreshList} />,
      },
      {
        id: 'copy',
        label: 'Copy FNSKUs',
        icon: <Copy className="size-4" aria-hidden />,
        run: async () => {
          try {
            await navigator.clipboard.writeText(checked.map((row) => row.fnsku).join('\n'));
            toast.success(`Copied ${checked.length} ${checked.length === 1 ? 'FNSKU' : 'FNSKUs'}`);
          } catch {
            toast.error('Failed to copy');
          }
        },
      },
    ],
    [checked, refreshList],
  );
  // Compact (one line per FNSKU) unless the operator picks Full — the station reads identifiers, not cards.
  const [density, setDensity] = useTriageDensity('print-station.fnsku', 'row');
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
        renderCard: (props: TriageCardSlotProps<FnskuListItem, FnskuRowModel>) =>
          density === 'row' ? <FnskuRow {...props} onPrinted={refreshList} /> : <FnskuCard {...props} onPrinted={refreshList} />,
      }),
    [density, refreshList],
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

  const addRef = useRef<HTMLButtonElement>(null);
  const toggleCreate = useCallback(() => setCreating((open) => !open), []);
  const createAction = useMemo(
    () => (
      <DeskHeaderAction
        ref={addRef}
        type="button"
        variant="primary"
        size="md"
        icon={<Plus aria-hidden />}
        aria-haspopup="dialog"
        aria-expanded={creating}
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
      queryClient.setQueryData<PrintStationFnskuList>(printStationFnskusKey(query, view, condition), (current) => {
        if (!current) return current;
        const wanted = printStationConditionWords(condition);
        if (condition === 'none' && String(row.condition ?? '').trim()) return current;
        if (wanted && fbaConditionLabel(row.condition).trim().toLowerCase() !== wanted) return current;
        const added: PrintStationFnskuRow = {
          fnsku: row.fnsku,
          title: row.product_title,
          asin: row.asin,
          sku: row.sku,
          condition: row.condition,
          mark: null,
        };
        const exists = current.rows.some((item) => item.fnsku === row.fnsku);
        return {
          rows: exists
            ? current.rows.map((item) => (item.fnsku === row.fnsku ? { ...item, ...added } : item))
            : [added, ...current.rows].slice(0, PRINT_STATION_FNSKU_ROW_CAP),
        };
      });
      setCreating(false);
      writeOpen(row.fnsku);
      void queryClient.invalidateQueries({ queryKey: PRINT_STATION_FNSKUS_KEY });
    },
    [condition, query, queryClient, view, writeOpen],
  );

  return (
    <>
      <DeskActionSlotRegistrar role="primary">{createAction}</DeskActionSlotRegistrar>
      {creating ? <FnskuCreatePopover anchorRef={addRef} onClose={() => setCreating(false)} onCreated={created} /> : null}
      <TriageCardList
        family={family}
        feed={feed}
        cut={cut}
        // Compact FNSKU rows are a real catalog table: title, condition, ASIN and SKU
        // keep their fixed columns on one shared scroll plane instead of squeezing a
        // different subset into every available width.
        rowScroll
        densityControl={{ value: density, onChange: setDensity }}
        summary={null}
        bulk={<RecordActionStrip verbs={bulkVerbs} label="Checked FNSKU actions" testId="fnsku-bulk" face="header" />}
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
              onPrinted={refreshList}
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

/** The condition as the label prints it, painted the same on both faces; unset = nothing. */
function fnskuConditionFace(row: PrintStationFnskuRow): RecordFactFace | null {
  if (!row.condition) return null;
  const condition = fbaCondition(row.condition);
  return { kind: 'grade', label: condition?.label ?? row.condition, code: condition?.grade ?? null };
}

/** One FNSKU as the shared card reads it (`print-station.fnsku`): identification above, the label's text below. */
export function fnskuRecordCard(model: FnskuRowModel): ViewCardModel<typeof VIEW> {
  const row = model.lead;
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
    status: { kind: 'none' },
    next: null,
    lines: [
      {
        id: row.ordinal,
        title: row.title ?? 'No title in the catalog',
        photoUrl: null,
        facts: { condition: fnskuConditionFace(row) },
        alert: false,
        alertNote: null,
      },
    ],
    hiddenAlertLabel: () => '',
  };
}

/** Full: the FNSKU top-left, ASIN · SKU to the far right of that row; the title · condition under it. */
const FnskuCard = memo(function FnskuCard({ onPrinted, ...props }: FnskuFaceProps) {
  const { model } = props;
  const row = model.lead;
  const record = useMemo(() => fnskuRecordCard(model), [model]);
  const aliases =
    row.asin || row.sku ? (
      <span className="flex min-w-0 flex-wrap items-center gap-1.5" data-testid={`${VIEW.testIdPrefix}-aliases`}>
        {row.asin ? <CopyChip value={row.asin} display={row.asin} ariaLabel={`ASIN ${row.asin}`} tone="id" /> : null}
        {row.sku ? <SkuScanRefChip value={row.sku} display={row.sku} /> : null}
      </span>
    ) : null;
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
      trailing={aliases ? { role: 'trailing', content: aliases } : null}
      action={
        // The card's Print, revealed like the row's (hover / focus / touch, or while its popover is open).
        <span className="pointer-events-auto flex shrink-0 opacity-0 transition-opacity duration-150 group-hover/card:opacity-100 group-focus-within/card:opacity-100 has-[[aria-expanded=true]]:opacity-100 [@media(hover:none)]:opacity-100">
          <FnskuRowPrint row={row} onPrinted={onPrinted} />
        </span>
      }
    />
  );
});

/**
 * Compact: one line in the order the station reads it — the FNSKU (last 8: the
 * `X00` lead is the same on almost every label) · title · condition, then the
 * ASIN and SKU at the right. Every identifier is a CopyChip (click copies,
 * hover shows the whole value). No lead words: a SKU has dashes, an ASIN does
 * not. No state badge: every row is the same FBA label.
 */
const FnskuRow = memo(function FnskuRow({ onPrinted, ...props }: FnskuFaceProps) {
  const row = props.model.lead;
  const face = useMemo<TriageRowFace>(
    () => ({
      state: null,
      identity: row.fnsku,
      identityDisplay: getLast8(row.fnsku),
      identityCopy: { value: row.fnsku, tone: 'fnsku' },
      title: row.title ?? 'No title in the catalog',
      // This is a catalog row rather than a responsive summary. Its fixed title
      // and identifier columns are shared by every FNSKU, with one scroll plane
      // supplied by the host above.
      wide: true,
      facts: [
        { id: 'condition', value: fnskuConditionFace(row), width: 'long' },
        { id: 'asin', value: row.asin, width: 'code', copy: row.asin ? { value: row.asin, tone: 'id' } : undefined },
        { id: 'sku', value: row.sku, width: 'code', copy: row.sku ? { value: row.sku, tone: 'sku' } : undefined },
      ],
      next: null,
      aria: { row: `FNSKU ${row.fnsku}, ${row.title ?? 'no title'}`, open: `Open FNSKU ${row.fnsku}`, check: `Select FNSKU ${row.fnsku}` },
    }),
    [row],
  );
  return <TriageRow {...props} face={face} testIdPrefix={VIEW.testIdPrefix} trailingAction={<FnskuRowPrint row={row} onPrinted={onPrinted} />} />;
});
