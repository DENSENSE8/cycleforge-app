'use client';

/**
 * Records (`/records`, owner 2026-10-06, docs/refactors/records) — every LINE
 * of an inbound or outbound order as ONE sheet: THE house sheet
 * (`PastedListSheet`) over `GET /api/nav/records` (`useRecordsList`) with
 * `RECORDS_COLUMNS` — Select · Order # · Tracking frozen left, Internal |
 * External pinned right on every row. The sidebar holds Sort, grain, the date
 * axis + window, who did what when and the counted facets
 * (`NAV_PAGE_DECLS.records`); the body paints records only. The grain folds
 * lines under a head (count, opened in place) and sets what a check covers;
 * the check-set's verbs are the floating dock (`RecordsSelectionDock`).
 * Paste mode: `?refs=` — the search bar's held list, or ⌘V on the sheet
 * (nothing editable focused; `parseRefList`, the paste's own cap). Order # and
 * Tracking edit in place at the grain shown.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PastedListSheet } from '@/components/search/pasted-list/PastedListSheet';
import { PastedListBack, usePastedListBack } from '@/components/search/pasted-list/PastedListBack';
import { RECORDS_COLUMN_SET, type PastedListColumnKey, type PastedListRow } from '@/components/search/pasted-list/pasted-list-table';
import { useReplaceSearchParams } from '@/components/sidebar/contextual/useReplaceSearchParams';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import type { BulkEntry } from '@/lib/nav/locate/use-bulk-list';
import {
  RECORDS_DEFAULT_GRAIN,
  RECORDS_DIR_PARAM,
  RECORDS_GRAINS,
  RECORDS_GRAIN_PARAM,
  RECORDS_SORT_DIR,
  RECORDS_SORT_PARAM,
  readRecordsQuery,
  type RecordsGrain,
  type RecordsSort,
} from '@/lib/nav/records/params';
import { parseRefList } from '@/lib/receiving/reconcile';
import { toast } from '@/lib/toast';
import { postRecordWrite, type RecordWrite } from './records-actions-client';
import { RECORDS_GROUP_KEY, orderNumberTargets, recordsEntryKey, recordTargets, selectedRecordLines, summarizeRecordResults } from './records-grain';
import { RecordsSelectionDock } from './RecordsSelectionDock';
import { useRecordsList } from './useRecordsList';

const NOUN = { one: 'line', many: 'lines' } as const;
const KEYS_GROUP = { id: 'records', title: 'Records' } as const;
const LAYOUT_KEY = 'cf:sheet-columns:records';
const SELECTION_SCOPE = 'records-sheet';
const IDENTIFIERS: readonly PastedListColumnKey[] = ['order', 'tracking'];
const NO_EDIT: readonly PastedListColumnKey[] = [];

/** Header → the sidebar's Sort (`RECORDS_SORTS`), first press in that sort's own direction. */
const SORT_BY: Readonly<Partial<Record<PastedListColumnKey, RecordsSort>>> = {
  internal: 'internal',
  external: 'external',
  channel: 'platform',
  party: 'party',
  lineTotal: 'price',
};
const SORTABLE = Object.fromEntries(Object.entries(SORT_BY).map(([key, sort]) => [key, RECORDS_SORT_DIR[sort]])) as Readonly<
  Partial<Record<PastedListColumnKey, 'asc' | 'desc'>>
>;

export function RecordsSheet() {
  const list = useRecordsList();
  const searchParams = useSearchParams();
  const replace = useReplaceSearchParams();
  const goBack = usePastedListBack();
  const search = searchParams?.toString() ?? '';
  const query = useMemo(() => readRecordsQuery(new URLSearchParams(search), list.refs.refs), [search, list.refs.refs]);
  const rawGrain = searchParams?.get(RECORDS_GRAIN_PARAM) ?? '';
  const grain: RecordsGrain = (RECORDS_GRAINS as readonly string[]).includes(rawGrain) ? (rawGrain as RecordsGrain) : RECORDS_DEFAULT_GRAIN;
  const groupKey = RECORDS_GROUP_KEY[grain];
  const groupBy = useMemo(() => (groupKey ? (row: PastedListRow) => groupKey(row.view.entry) : undefined), [groupKey]);
  const hasBack = Boolean(searchParams?.get('back'));

  // ── Sort: a header press writes the sidebar's Sort. ──
  const activeKey = (Object.entries(SORT_BY).find(([, sort]) => sort === query.sort)?.[0] ?? null) as PastedListColumnKey | null;
  const onSort = useCallback(
    (key: PastedListColumnKey, dir: 'asc' | 'desc') => {
      const sort = SORT_BY[key];
      if (!sort) return;
      replace((params) => {
        params.set(RECORDS_SORT_PARAM, sort);
        params.set(RECORDS_DIR_PARAM, dir);
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

  // ── In-place edit: one row's Order # or Tracking, at the grain shown (a head = every line it holds). ──
  const edit = useMemo(
    () => ({
      keysFor: (row: PastedListRow) => {
        if (row.member || !row.view.entry.facts?.direction) return NO_EDIT;
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
            ? () => void postRecordWrite({ path: '/api/records/tracking', body: { targets, tracking: previous, mode: 'set' } }).then(refetch, (error: unknown) =>
                toast.error(error instanceof Error ? error.message : 'Could not restore the tracking'),
              )
            : undefined;
        void postRecordWrite(write).then(
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
    [grain, refetch],
  );

  // ── Paste mode: ⌘V on the sheet (nothing editable focused) holds a new list. ──
  const writeRefs = list.writeRefs;
  useEffect(() => {
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

  const pasteMode = list.refs.refs.length > 0;
  const find = query.find;
  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col">
      <PastedListSheet
        list={list}
        // Find is the query's (server-side), so the sheet narrows nothing more.
        query=""
        columnSort={{ sortable: SORTABLE, key: activeKey, dir: query.dir, onSort }}
        noun={NOUN}
        layoutKey={LAYOUT_KEY}
        exportName="records"
        ariaLabel="Records"
        empty={{
          none: pasteMode
            ? 'None of the pasted numbers is a record here.'
            : find
              ? `No line in this window matches “${find}”.`
              : 'No line in this window. Widen the dates in the sidebar, or paste numbers (⌘V).',
        }}
        keysGroup={KEYS_GROUP}
        onEscape={hasBack ? goBack : undefined}
        columns={RECORDS_COLUMN_SET}
        lead={hasBack ? <PastedListBack /> : null}
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
        pasted={list.refs}
        writeRefs={writeRefs}
        latest={latest}
        onClear={clear}
        onDone={refetch}
      />
    </div>
  );
}
