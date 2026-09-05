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
import type {
  TableImportDescriptor,
  TableImportOrigin,
  TableImportRowDecision,
} from '@/lib/tables/import/types';

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
  /**
   * Where these records came from. A `file` draft is a parse the operator is
   * about to accept wholesale; a `google_sheets` draft is a human sheet whose
   * every row is an approve / reject decision.
   */
  origin: TableImportOrigin;
  /** Index into `rows` — null when no rail focus. */
  focusRowIndex: number | null;
  selectedIndexes: ReadonlySet<number>;
  /**
   * Per-row operator decisions, keyed by index into `rows`. Absent = undecided,
   * which is what makes unapprove distinct from reject. Empty on a `file`
   * draft: there is nothing to decide about a row the operator just chose.
   *
   * Index-keyed like `selectedIndexes`, so every mutator that ADDS or REMOVES
   * rows must remap it — see {@link insertTableImportRows} and
   * {@link discardTableImportSelected}.
   */
  decisions: ReadonlyMap<number, TableImportRowDecision>;
  /**
   * A stable identity per row, parallel to `rows` and the same length.
   *
   * The row's INDEX cannot be its identity once rows can be spliced in: a
   * batch landing in the middle renumbers everything below it, so an
   * index-derived React key remounts rows that never changed — which throws
   * away both their DOM state and any layout animation that was supposed to
   * show them making room. These ids survive the splice; the indexes do not.
   */
  rowIds: readonly string[];
  filter: TableImportFilter;
  /** Band-3 find — narrows rows across every projected field. */
  query: string;
}

const drafts = new Map<string, TableImportDraft>();
const listeners = new Map<string, Set<() => void>>();

/**
 * Monotonic per process. Ids only need to be unique within a draft, but a
 * global counter also makes them unique ACROSS drafts, so a stale key can
 * never collide with a fresh row after a reload of the same surface.
 */
let rowIdCounter = 0;

function mintRowIds(count: number): string[] {
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    rowIdCounter += 1;
    ids.push(`tir-${rowIdCounter}`);
  }
  return ids;
}

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

/** Load a parsed draft (tests, the file path below, and the sheet-sync lane). */
export function loadTableImportDraft<TField extends string, TRowView>(
  descriptor: TableImportDescriptor<TField, TRowView>,
  input: {
    fileName: string;
    headers: string[];
    rows: Record<string, string>[];
    mapping?: Record<string, string>;
    /** Defaults to `file` — the only origin that existed before sheet sync. */
    origin?: TableImportOrigin;
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
    origin: input.origin ?? 'file',
    focusRowIndex: null,
    selectedIndexes: new Set(),
    decisions: new Map(),
    rowIds: mintRowIds(input.rows.length),
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
  // OLD mapping would confirm a set the operator never actually saw. Decisions
  // go with it for the same reason: an approval is of the row AS READ, and a
  // remap can change which order number the operator was approving.
  mutate(surfaceId, (d) => ({
    ...d,
    mapping,
    selectedIndexes: new Set(),
    decisions: new Map(),
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

/**
 * Record (or clear) one row's operator decision.
 *
 * `null` clears it back to UNDECIDED — that is the unapprove path, and it is
 * why the decision map is sparse rather than a per-row enum with a default.
 */
export function setTableImportRowDecision(
  surfaceId: string,
  index: number,
  decision: TableImportRowDecision | null,
): void {
  mutate(surfaceId, (d) => {
    if (index < 0 || index >= d.rows.length) return d;
    const next = new Map(d.decisions);
    if (decision === null) next.delete(index);
    else next.set(index, decision);
    return { ...d, decisions: next };
  });
}

/**
 * Splice rows INTO an open draft at `at`, shifting the index-keyed state past
 * the seam.
 *
 * This is the sheet-sync landing path: a second sync must not append below the
 * fold or replace what the operator is already triaging, so rows arrive at a
 * caller-chosen position (the middle of the body) and everything below them
 * moves down — selection and decisions included. Skipping that remap is how a
 * board silently re-attributes an approval to the row that took its index.
 */
export function insertTableImportRows(
  surfaceId: string,
  rows: readonly Record<string, string>[],
  at: number,
): void {
  if (rows.length === 0) return;
  mutate(surfaceId, (d) => {
    const seam = Math.max(0, Math.min(at, d.rows.length));
    const shift = rows.length;
    const shiftIndex = (i: number) => (i >= seam ? i + shift : i);
    const decisions = new Map<number, TableImportRowDecision>();
    for (const [i, decision] of d.decisions) decisions.set(shiftIndex(i), decision);
    return {
      ...d,
      rows: [...d.rows.slice(0, seam), ...rows, ...d.rows.slice(seam)],
      selectedIndexes: new Set(Array.from(d.selectedIndexes, shiftIndex)),
      decisions,
      rowIds: [
        ...d.rowIds.slice(0, seam),
        ...mintRowIds(shift),
        ...d.rowIds.slice(seam),
      ],
      focusRowIndex: d.focusRowIndex === null ? null : shiftIndex(d.focusRowIndex),
    };
  });
}

export function discardTableImportSelected(surfaceId: string): void {
  mutate(surfaceId, (d) => {
    if (d.selectedIndexes.size === 0) return d;
    const drop = d.selectedIndexes;
    // Rows collapse, so every surviving row's index moves. Decisions are keyed
    // by that index — carry them across the compaction or the board hands an
    // operator's approval to whichever row inherited the slot.
    const decisions = new Map<number, TableImportRowDecision>();
    let kept = 0;
    d.rows.forEach((_row, i) => {
      if (drop.has(i)) return;
      const decision = d.decisions.get(i);
      if (decision) decisions.set(kept, decision);
      kept += 1;
    });
    return {
      ...d,
      rows: d.rows.filter((_, i) => !drop.has(i)),
      selectedIndexes: new Set(),
      decisions,
      rowIds: d.rowIds.filter((_, i) => !drop.has(i)),
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

/**
 * What a DECISION board acts on — the approved ∩ Ready set, plus the tally the
 * CTA and the rail print.
 *
 * The peer of {@link tableImportConfirmTargets}, for an origin where the
 * operator's verdict is the scope instead of the selection. Approval does not
 * override readiness: an approved row that still misses its order number is
 * counted as `blocked`, never silently written, because the whole reason this
 * board exists is that a human sheet is not trusted the way an API feed is.
 */
export function tableImportDecisionTargets<TField extends string, TRowView>(
  descriptor: TableImportDescriptor<TField, TRowView>,
  d: TableImportDraft,
): {
  indexes: number[];
  approved: number;
  rejected: number;
  undecided: number;
  /** Approved rows Confirm cannot write yet — a fact is still missing. */
  blocked: number;
} {
  const indexes: number[] = [];
  let approved = 0;
  let rejected = 0;
  let blocked = 0;
  d.rows.forEach((row, index) => {
    const decision = d.decisions.get(index);
    if (decision === 'rejected') {
      rejected += 1;
      return;
    }
    if (decision !== 'approved') return;
    approved += 1;
    if (descriptor.classify(row, d.mapping).status === 'ready') indexes.push(index);
    else blocked += 1;
  });
  return {
    indexes,
    approved,
    rejected,
    undecided: d.rows.length - approved - rejected,
    blocked,
  };
}
