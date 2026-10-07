'use client';

/**
 * Records (`/records`, owner 2026-10-06, docs/refactors/records) — every LINE
 * of an inbound or outbound order as ONE sheet: THE house sheet
 * (`PastedListSheet`) with `RECORDS_COLUMNS` — Select · Order # · Tracking
 * frozen left, Internal | External pinned right on every row. The sidebar
 * holds Sort, grain, the date axis + window, who did what when and the
 * counted facets (`NAV_PAGE_DECLS.records`); the body paints records only.
 * The grain folds lines under a head (count, opened in place) and sets what a
 * check covers; the check-set's verbs are the floating dock
 * (`RecordsSelectionDock`). Order # and Tracking edit in place at the grain
 * shown.
 *
 * {@link RecordsSheetBody} is that sheet for any source of Records lines:
 * `/records` hands it `GET /api/nav/records` (`useRecordsList`) with paste
 * mode (`?refs=` — the search bar's held list, or ⌘V on the sheet; nothing
 * editable focused; `parseRefList`, the paste's own cap); Fulfilled hands it
 * its shipped orders' lines (operator 2026-10-07: Fulfilled renders exactly
 * as a pasted list does — same columns, cells, statuses, dock and keys).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { PastedListSheet } from '@/components/search/pasted-list/PastedListSheet';
import { PastedListBack, usePastedListBack } from '@/components/search/pasted-list/PastedListBack';
import { RECORDS_COLUMN_SET, type PastedListColumnKey, type PastedListRow } from '@/components/search/pasted-list/pasted-list-table';
import { useReplaceSearchParams } from '@/components/sidebar/contextual/useReplaceSearchParams';
import { useStepUp } from '@/components/providers/StepUpProvider';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import type { BulkEntry, LocatedRecords } from '@/lib/nav/locate/use-bulk-list';
import {
  RECORDS_DEFAULT_GRAIN,
  RECORDS_DIR_PARAM,
  RECORDS_FIND_PARAM,
  RECORDS_GRAINS,
  RECORDS_GRAIN_PARAM,
  RECORDS_SORTS,
  RECORDS_SORT_DIR,
  RECORDS_SORT_PARAM,
  type RecordsGrain,
  type RecordsSort,
} from '@/lib/nav/records/params';
import { parseRefInParam, parseRefList, type RefSelection } from '@/lib/receiving/reconcile';
import { toast } from '@/lib/toast';
import { postRecordWrite, type RecordWrite } from './records-actions-client';
import { RECORDS_GROUP_KEY, orderNumberTargets, recordsEntryKey, recordTargets, selectedRecordLines, summarizeRecordResults } from './records-grain';
import { RecordsSelectionDock } from './RecordsSelectionDock';
import { useRecordsList } from './useRecordsList';

const NOUN = { one: 'line', many: 'lines' } as const;
const SELECTION_SCOPE = 'records-sheet';
const IDENTIFIERS: readonly PastedListColumnKey[] = ['order', 'tracking'];
const NO_EDIT: readonly PastedListColumnKey[] = [];
const NO_REFS: RefSelection = parseRefInParam(null);

/** Header → the sidebar's Sort (`RECORDS_SORTS`), first press in that sort's own direction. Every column but the check sorts. */
const SORT_BY: Readonly<Partial<Record<PastedListColumnKey, RecordsSort>>> = {
  order: 'order',
  tracking: 'tracking',
  type: 'type',
  journey: 'journey',
  clock: 'overdue',
  item: 'item',
  sku: 'sku',
  qty: 'qty',
  unitPrice: 'unit',
  lineTotal: 'price',
  orderTotal: 'order_total',
  channel: 'platform',
  party: 'party',
  placed: 'placed',
  imported: 'imported',
  shipBy: 'ship_by',
  pickedBy: 'picked_by',
  packer: 'packed_by',
  scannedOutBy: 'scanned_out_by',
  scanSource: 'scan_source',
  unboxedBy: 'unboxed_by',
  receivedBy: 'received_by',
  carrier: 'carrier',
  service: 'service',
  labelCreated: 'label_created',
  labelCost: 'label_cost',
  firstScan: 'first_scan',
  transitDays: 'transit',
  eta: 'eta',
  delivered: 'delivered',
  attempts: 'attempts',
  exceptionCode: 'exception_code',
  claimBy: 'claim_by',
  lastPoll: 'last_poll',
  shipstationStatus: 'shipstation_status',
  returnRef: 'return',
  owner: 'owner',
  note: 'note',
  lastEvent: 'last_event',
  internal: 'internal',
  external: 'external',
};
const SORTABLE = Object.fromEntries(Object.entries(SORT_BY).map(([key, sort]) => [key, RECORDS_SORT_DIR[sort]])) as Readonly<
  Partial<Record<PastedListColumnKey, 'asc' | 'desc'>>
>;

/** A source of Records lines the sheet paints. */
export interface RecordsSheetSource extends LocatedRecords {
  /** Lines every filter keeps, before the source's row cap (the footer's "shown of total"); absent = all are loaded. */
  total?: number;
  truncated?: boolean;
  /** Paste mode — the held list and how to replace it (⌘V on the sheet). Absent = the source takes no paste. */
  paste?: { refs: RefSelection; write: (refs: readonly string[]) => void };
}

export interface RecordsSheetBodyProps {
  list: RecordsSheetSource;
  /** The grain when the URL names none (`?grain=`). */
  defaultGrain: RecordsGrain;
  /** The sort the source answers in when the URL names none (`?colsort=`). */
  defaultSort: RecordsSort;
  /** Where the staffer's column layout + zoom persist. */
  layoutKey: string;
  exportName: string;
  ariaLabel: string;
  keysGroup: { id: string; title: string };
  /** The empty sheet's words. */
  empty: string;
  /** First on the tool row (a breadcrumb, a Back). */
  lead?: ReactNode;
  /** The host's layout toggles, after Recheck all. */
  tools?: ReactNode;
  /** Esc leaves the sheet (a Back, out of a zoom); absent = Esc is not the sheet's. */
  onEscape?: () => void;
}

/** The Records sheet over one source: header sorts, grain folding, the check-set and its dock, in-place identifier edits, paste. */
export function RecordsSheetBody({ list, defaultGrain, defaultSort, layoutKey, exportName, ariaLabel, keysGroup, empty, lead, tools, onEscape }: RecordsSheetBodyProps) {
  const searchParams = useSearchParams();
  const replace = useReplaceSearchParams();
  const rawGrain = searchParams?.get(RECORDS_GRAIN_PARAM) ?? '';
  const grain: RecordsGrain = (RECORDS_GRAINS as readonly string[]).includes(rawGrain) ? (rawGrain as RecordsGrain) : defaultGrain;
  const groupKey = RECORDS_GROUP_KEY[grain];
  const groupBy = useMemo(() => (groupKey ? (row: PastedListRow) => groupKey(row.view.entry) : undefined), [groupKey]);

  // ── Sort: a header press writes the sidebar's Sort; the source answers in it. ──
  const rawSort = searchParams?.get(RECORDS_SORT_PARAM)?.trim() ?? '';
  const sort: RecordsSort = (RECORDS_SORTS as readonly string[]).includes(rawSort) ? (rawSort as RecordsSort) : defaultSort;
  const rawDir = searchParams?.get(RECORDS_DIR_PARAM)?.trim();
  const dir = rawDir === 'asc' || rawDir === 'desc' ? rawDir : RECORDS_SORT_DIR[sort];
  const activeKey = (Object.entries(SORT_BY).find(([, by]) => by === sort)?.[0] ?? null) as PastedListColumnKey | null;
  const onSort = useCallback(
    (key: PastedListColumnKey, next: 'asc' | 'desc') => {
      const by = SORT_BY[key];
      if (!by) return;
      replace((params) => {
        params.set(RECORDS_SORT_PARAM, by);
        params.set(RECORDS_DIR_PARAM, next);
      });
    },
    [replace],
  );

  // ── The check-set: units at the grain shown; a new grain starts empty. ──
  const [selection, setSelection] = useState<{ grain: RecordsGrain; keys: ReadonlySet<string> }>({ grain, keys: new Set() });
  const keys = selection.grain === grain ? selection.keys : new Set<string>();
  const onSelection = useCallback((next: ReadonlySet<string>) => setSelection({ grain, keys: next }), [grain]);
  const clear = useCallback(() => setSelection({ grain, keys: new Set() }), [grain]);
  const lines = useMemo(() => selectedRecordLines(list.entries, keys, grain), [list.entries, keys, grain]);
  const entriesRef = useRef(list.entries);
  entriesRef.current = list.entries;
  const latest = useCallback(() => new Map(entriesRef.current.map((entry) => [recordsEntryKey(entry), entry] as const)), []);
  const refetch = list.refetch;
  const requestStepUp = useStepUp();

  // ── In-place edit: one row's Order # or Tracking, at the grain shown (a head = every line it holds). ──
  const edit = useMemo(
    () => ({
      keysFor: (row: PastedListRow) => {
        // A line with no write target (a miss, a scan-out no order owns) edits nothing.
        if (row.member || !row.view.entry.facts?.direction || !row.view.entry.facts.recordId) return NO_EDIT;
        // An aggregate (item number, product) is not one order: its identifiers do not edit as one.
        return row.group && grain !== 'order' ? NO_EDIT : IDENTIFIERS;
      },
      commit: (row: PastedListRow, key: PastedListColumnKey, value: string) => {
        const rowLines: BulkEntry[] = row.group ? row.group.lines.map((line) => line.view.entry) : [row.view.entry];
        const targets = recordTargets(rowLines);
        const facts = row.view.entry.facts;
        let write: RecordWrite | null = null;
        let did = '';
        if (key === 'order') {
          if (!value || value === (facts?.orderNumber ?? row.view.entry.ref)) return;
          write = { path: '/api/records/order-number', body: { targets: orderNumberTargets(rowLines, entriesRef.current), orderNumber: value } };
          did = `Order number changed to ${value}`;
        } else if (key === 'tracking') {
          if (value === (facts?.tracking ?? '')) return;
          if (value) {
            write = { path: '/api/records/tracking', body: { targets, tracking: value, mode: 'set' } };
            did = `Tracking set to ${value}`;
          } else if (facts?.shipmentId) {
            write = { path: '/api/records/tracking/unlink', body: { targets, shipmentId: facts.shipmentId } };
            did = 'Tracking removed';
          }
        }
        if (!write) return;
        const previous = facts?.tracking ?? null;
        const undoTracking =
          key === 'tracking' && previous
            ? () =>
                void postRecordWrite({ path: '/api/records/tracking', body: { targets, tracking: previous, mode: 'set' } }, requestStepUp).then(refetch, (error: unknown) =>
                toast.error(error instanceof Error ? error.message : 'Could not restore the tracking'),
              )
            : undefined;
        void postRecordWrite(write, requestStepUp).then(
          (response) => {
            const summary = summarizeRecordResults(response);
            for (const refusal of summary.refused) toast.error(`Refused: ${refusal.reason}`);
            if (summary.done > 0) {
              if (undoTracking) toast.undo(did, { onUndo: undoTracking });
              else toast.success(did);
            }
            refetch();
          },
          // The order-number collision (409) and any refusal of the whole request: its own words.
          (error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not save'),
        );
      },
    }),
    [grain, refetch, requestStepUp],
  );

  // ── Paste mode: ⌘V on the sheet (nothing editable focused) holds a new list. ──
  const writeRefs = list.paste?.write;
  useEffect(() => {
    if (!writeRefs) return;
    const onPaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented || hasOpenOverlay() || isEditableKeyTarget(event.target)) return;
      const text = event.clipboardData?.getData('text/plain') ?? '';
      const pasted = parseRefList(text);
      if (pasted.refs.length === 0) return;
      event.preventDefault();
      writeRefs(pasted.refs);
      toast.success(`Showing ${pasted.refs.length} pasted ${pasted.refs.length === 1 ? 'number' : 'numbers'}${pasted.truncated ? ` (${pasted.truncated} over the cap left out)` : ''}`);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [writeRefs]);

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col">
      <PastedListSheet
        list={list}
        // Find is the source's (server-side), so the sheet narrows nothing more.
        query=""
        columnSort={{ sortable: SORTABLE, key: activeKey, dir, onSort }}
        noun={NOUN}
        layoutKey={layoutKey}
        exportName={exportName}
        ariaLabel={ariaLabel}
        empty={{ none: empty }}
        keysGroup={keysGroup}
        onEscape={onEscape}
        columns={RECORDS_COLUMN_SET}
        lead={lead}
        tools={tools}
        statusRow={false}
        total={list.truncated ? list.total : undefined}
        selection={{ scope: SELECTION_SCOPE, keys, onChange: onSelection }}
        groupBy={groupBy}
        edit={edit}
      />
      <RecordsSelectionDock
        lines={lines}
        loaded={list.entries}
        count={keys.size}
        grain={grain}
        pasted={list.paste?.refs ?? NO_REFS}
        writeRefs={writeRefs ?? NO_WRITE}
        latest={latest}
        onClear={clear}
        onDone={refetch}
      />
    </div>
  );
}

/** A source that takes no paste never rewrites a held list (the dock offers Remove from list only in paste mode). */
const NO_WRITE = (): void => undefined;

/** `/records` — the Records read, with paste mode. */
export function RecordsSheet() {
  const list = useRecordsList();
  const searchParams = useSearchParams();
  const goBack = usePastedListBack();
  const hasBack = Boolean(searchParams?.get('back'));
  const pasteMode = list.refs.refs.length > 0;
  const find = searchParams?.get(RECORDS_FIND_PARAM)?.trim() ?? '';
  const source = useMemo<RecordsSheetSource>(() => ({ ...list, paste: { refs: list.refs, write: list.writeRefs } }), [list]);
  return (
    <RecordsSheetBody
      list={source}
      defaultGrain={RECORDS_DEFAULT_GRAIN}
      defaultSort={pasteMode ? 'pasted' : 'date'}
      layoutKey="cf:sheet-columns:records"
      exportName="records"
      ariaLabel="Records"
      keysGroup={{ id: 'records', title: 'Records' }}
      empty={
        pasteMode
          ? 'None of the pasted numbers is a record here.'
          : find
            ? `No line in this window matches “${find}”.`
            : 'No line in this window. Widen the dates in the sidebar, or paste numbers (⌘V).'
      }
      lead={hasBack ? <PastedListBack /> : null}
      onEscape={hasBack ? goBack : undefined}
    />
  );
}
