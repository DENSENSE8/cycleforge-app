/**
 * Table import staging drafts — ONE store, keyed by table surface.
 *
 * Session-only, not a durable `pending_imports` quarantine. A draft is cleared
 * on confirm / discard / cancel; `?import=csv` is the paint flag and this store
 * holds the rows.
 *
 * **Keyed by `descriptor.surfaceId`**, not a module singleton: two families may
 * legitimately hold a draft at once (an operator staging cartons on History and
 * orders on To-Ship), and a singleton would let one file silently replace the
 * other's work.
 *
 * The store keeps RAW records and derives every view through the descriptor on
 * read. That is what makes an in-cell edit re-classify the row in place — there
 * is no second, stale copy of the triage state to keep in sync.
 */

import { useSyncExternalStore } from 'react';
import { parseCsv } from '@/lib/tables/import/parse-csv';
import type { TableImportDescriptor } from '@/lib/tables/import/types';

/** URL flag. The ROUTE says which desk; the store key says which family. */
export const TABLE_IMPORT_URL_PARAM = 'import';
export const TABLE_IMPORT_URL_VALUE = 'csv';

export type TableImportFilter = 'all' | 'ready' | 'action_required';

export interface TableImportDraft {
  surfaceId: string;
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
  mapping: Record<string, string>;
  /** Index into `rows` — null when no rail focus. */
  focusRowIndex: number | null;
  selectedIndexes: ReadonlySet<number>;
  filter: TableImportFilter;
  /** Band-3 find — narrows rows across every projected field. */
  query: string;
}

const drafts = new Map<string, TableImportDraft>();
const listeners = new Map<string, Set<() => void>>();

function emit(surfaceId: string): void {
  listeners.get(surfaceId)?.forEach((l) => l());
}

function subscribeTo(surfaceId: string, listener: () => void): () => void {
  let set = listeners.get(surfaceId);
  if (!set) {
    set = new Set();
    listeners.set(surfaceId, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
  };
}

export function getTableImportDraft(surfaceId: string): TableImportDraft | null {
  return drafts.get(surfaceId) ?? null;
}

export function useTableImportDraft(surfaceId: string): TableImportDraft | null {
  return useSyncExternalStore(
    (listener) => subscribeTo(surfaceId, listener),
    () => drafts.get(surfaceId) ?? null,
    () => null,
  );
}

export function clearTableImportDraft(surfaceId: string): void {
  if (!drafts.has(surfaceId)) return;
  drafts.delete(surfaceId);
  emit(surfaceId);
}

function mutate(
  surfaceId: string,
  fn: (current: TableImportDraft) => TableImportDraft,
): void {
  const current = drafts.get(surfaceId);
  if (!current) return;
  drafts.set(surfaceId, fn(current));
  emit(surfaceId);
}

/** Load a parsed draft (tests + the file path below). */
export function loadTableImportDraft<TField extends string, TRowView>(
  descriptor: TableImportDescriptor<TField, TRowView>,
  input: {
    fileName: string;
    headers: string[];
    rows: Record<string, string>[];
    mapping?: Record<string, string>;
  },
): { ok: true } | { ok: false; error: string } {
  if (input.headers.length === 0 || input.rows.length === 0) {
    return { ok: false, error: 'No data rows found in this file.' };
  }
  drafts.set(descriptor.surfaceId, {
    surfaceId: descriptor.surfaceId,
    fileName: input.fileName,
    headers: input.headers,
    rows: input.rows,
    mapping: input.mapping ?? descriptor.autoMap(input.headers),
    focusRowIndex: null,
    selectedIndexes: new Set(),
    filter: 'all',
    query: '',
  });
  emit(descriptor.surfaceId);
  return { ok: true };
}

export async function loadTableImportDraftFromFile<TField extends string, TRowView>(
  descriptor: TableImportDescriptor<TField, TRowView>,
  file: File,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const text = await file.text();
    const { headers, rows } = parseCsv(text);
    return loadTableImportDraft(descriptor, { fileName: file.name, headers, rows });
  } catch {
    return { ok: false, error: 'Could not read this file.' };
  }
}

/* -------------------------------------------------------------------------- */
/* Mutators                                                                   */
/* -------------------------------------------------------------------------- */

export function setTableImportMapping(
  surfaceId: string,
  mapping: Record<string, string>,
): void {
  // Remapping re-derives every row's readiness, so a selection made against the
  // OLD mapping would confirm a set the operator never actually saw.
  mutate(surfaceId, (d) => ({
    ...d,
    mapping,
    selectedIndexes: new Set(),
    focusRowIndex: null,
  }));
}

export function setTableImportFilter(surfaceId: string, filter: TableImportFilter): void {
  mutate(surfaceId, (d) => ({ ...d, filter }));
}

export function setTableImportQuery(surfaceId: string, query: string): void {
  mutate(surfaceId, (d) => ({ ...d, query }));
}

export function setTableImportFocusRow(surfaceId: string, index: number | null): void {
  mutate(surfaceId, (d) => ({ ...d, focusRowIndex: index }));
}

export function toggleTableImportSelected(surfaceId: string, index: number): void {
  mutate(surfaceId, (d) => {
    const next = new Set(d.selectedIndexes);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    return { ...d, selectedIndexes: next };
  });
}

export function setTableImportSelected(
  surfaceId: string,
  indexes: Iterable<number>,
): void {
  mutate(surfaceId, (d) => ({ ...d, selectedIndexes: new Set(indexes) }));
}

export function clearTableImportSelection(surfaceId: string): void {
  mutate(surfaceId, (d) => ({ ...d, selectedIndexes: new Set() }));
}

export function updateTableImportRow<TField extends string, TRowView>(
  descriptor: TableImportDescriptor<TField, TRowView>,
  index: number,
  edits: Partial<Record<TField, string>>,
): void {
  mutate(descriptor.surfaceId, (d) => {
    if (index < 0 || index >= d.rows.length) return d;
    const rows = d.rows.slice();
    rows[index] = descriptor.applyEdits(rows[index], d.mapping, edits);
    return { ...d, rows };
  });
}

export function discardTableImportSelected(surfaceId: string): void {
  mutate(surfaceId, (d) => {
    if (d.selectedIndexes.size === 0) return d;
    const drop = d.selectedIndexes;
    return {
      ...d,
      rows: d.rows.filter((_, i) => !drop.has(i)),
      selectedIndexes: new Set(),
      focusRowIndex: null,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Derived reads                                                              */
/* -------------------------------------------------------------------------- */

/** Rows for the grid — projected, then narrowed by status filter AND find. */
export function listTableImportRows<TField extends string, TRowView>(
  descriptor: TableImportDescriptor<TField, TRowView>,
  d: TableImportDraft,
): TRowView[] {
  const views = d.rows.map((row, index) =>
    descriptor.toRowView(row, d.mapping, index),
  );
  const byStatus =
    d.filter === 'all'
      ? views
      : views.filter(
          (_view, i) => descriptor.classify(d.rows[i], d.mapping).status === d.filter,
        );
  const needle = d.query.trim().toLowerCase();
  if (!needle) return byStatus;
  return byStatus.filter((view) =>
    descriptor.searchValues(view).some((v) => v.toLowerCase().includes(needle)),
  );
}

/** Batch facts — counts over the WHOLE draft, never the filtered view. */
export function summarizeTableImportDraft<TField extends string, TRowView>(
  descriptor: TableImportDescriptor<TField, TRowView>,
  d: TableImportDraft,
): { total: number; ready: number; actionRequired: number } {
  let ready = 0;
  for (const row of d.rows) {
    if (descriptor.classify(row, d.mapping).status === 'ready') ready += 1;
  }
  return { total: d.rows.length, ready, actionRequired: d.rows.length - ready };
}

/**
 * What Confirm acts on right now.
 *
 * Selection NARROWS; it is not a precondition. A clean file should import
 * without an operator select-all first, and the CTA must name the set it will
 * actually write so the label can never disagree with the action.
 */
export function tableImportConfirmTargets<TField extends string, TRowView>(
  descriptor: TableImportDescriptor<TField, TRowView>,
  d: TableImportDraft,
): { indexes: number[]; scoped: boolean; skipped: number } {
  const isReady = (index: number): boolean => {
    const row = d.rows[index];
    return Boolean(row) && descriptor.classify(row, d.mapping).status === 'ready';
  };

  if (d.selectedIndexes.size === 0) {
    const indexes: number[] = [];
    d.rows.forEach((_row, index) => {
      if (isReady(index)) indexes.push(index);
    });
    return { indexes, scoped: false, skipped: 0 };
  }

  const indexes = Array.from(d.selectedIndexes)
    .filter(isReady)
    .sort((a, b) => a - b);
  return {
    indexes,
    scoped: true,
    skipped: d.selectedIndexes.size - indexes.length,
  };
}
