/** Shared DataTable paging. */
import {
  flattenRenderOrder,
  type GroupedRenderOrder,
  type RowGroup,
} from '@/lib/group-rows';

export const DATA_TABLE_PAGE_SIZES = [20, 50, 100, 200] as const;
export type DataTablePageSize = (typeof DATA_TABLE_PAGE_SIZES)[number];
export const DATA_TABLE_PAGE_SIZE: DataTablePageSize = 100;

const PAGE_SIZE_STORAGE_KEY = 'cf:data-table-page-size';

export function isDataTablePageSize(value: number): value is DataTablePageSize {
  return (DATA_TABLE_PAGE_SIZES as readonly number[]).includes(value);
}

export function readDataTablePageSize(): DataTablePageSize {
  if (typeof window === 'undefined') return DATA_TABLE_PAGE_SIZE;
  const raw = Number(window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
  return isDataTablePageSize(raw) ? raw : DATA_TABLE_PAGE_SIZE;
}

export function writeDataTablePageSize(size: DataTablePageSize): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(size));
}

/** What a table's rows are called in its footer — "row" / "rows" unless the list names its records. */
export interface DataTableRowNoun {
  one: string;
  many: string;
}

const ROW_NOUN: DataTableRowNoun = { one: 'row', many: 'rows' };

/** Footer copy: one page prints "N rows" (or the list's own noun: "N purchases"); a slice prints "shown of total". */
export function formatDataTableCount(shown: number, total?: number, noun: DataTableRowNoun = ROW_NOUN): string {
  if (total == null || shown === total) {
    return `${shown.toLocaleString()} ${shown === 1 ? noun.one : noun.many}`;
  }
  return `${shown.toLocaleString()} of ${total.toLocaleString()}`;
}


type DataTablePage<T> = {
  order: [string, RowGroup<T>[]][];
  pageIndex: number;
  pageCount: number;
  shown: number;
  total: number;
};

type Fold<T> = { bandKey: string; group: RowGroup<T> };

function foldsOf<T>(order: GroupedRenderOrder<T>): Fold<T>[] {
  const out: Fold<T>[] = [];
  for (const [bandKey, groups] of order) {
    for (const group of groups) out.push({ bandKey, group });
  }
  return out;
}

/** Fill each page to `pageSize` leaves, splitting a fold when it overflows. */
function packPages<T>(folds: Fold<T>[], pageSize: number): Fold<T>[][] {
  if (folds.length === 0) return [[]];
  const pages: Fold<T>[][] = [];
  let current: Fold<T>[] = [];
  let leaves = 0;

  const flush = () => {
    if (current.length === 0) return;
    pages.push(current);
    current = [];
    leaves = 0;
  };

  for (const fold of folds) {
    let offset = 0;
    const rows = fold.group.rows;
    while (offset < rows.length) {
      if (leaves >= pageSize) flush();
      const take = Math.min(pageSize - leaves, rows.length - offset);
      current.push({
        bandKey: fold.bandKey,
        group: { key: fold.group.key, rows: rows.slice(offset, offset + take) },
      });
      leaves += take;
      offset += take;
    }
  }
  flush();
  return pages.length > 0 ? pages : [[]];
}

function rebuildOrder<T>(folds: Fold<T>[]): [string, RowGroup<T>[]][] {
  const bands: { key: string; groups: RowGroup<T>[] }[] = [];
  for (const fold of folds) {
    const last = bands[bands.length - 1];
    if (last && last.key === fold.bandKey) last.groups.push(fold.group);
    else bands.push({ key: fold.bandKey, groups: [fold.group] });
  }
  return bands.map((band) => [band.key, band.groups]);
}

export function pageGroupedRenderOrder<T>(
  order: GroupedRenderOrder<T>,
  pageIndex: number,
  pageSize: number = DATA_TABLE_PAGE_SIZE,
): DataTablePage<T> {
  const total = flattenRenderOrder(order).length;
  const pages = packPages(foldsOf(order), pageSize);
  const pageCount = Math.max(1, pages.length);
  const clamped = Math.min(Math.max(0, pageIndex), pageCount - 1);
  const pageFolds = pages[clamped] ?? [];
  const paged = rebuildOrder(pageFolds);
  return {
    order: paged,
    pageIndex: clamped,
    pageCount,
    shown: flattenRenderOrder(paged).length,
    total,
  };
}

/** Header select-all / clear acts on the VISIBLE page, never off-screen rows. */
export function selectAllVisibleIds(
  mode: 'all' | 'none',
  visibleIds: readonly number[],
): Set<number> {
  return mode === 'all' ? new Set(visibleIds) : new Set();
}

/** Which page holds `rowId`, or null when the row is not in this order. */
export function pageIndexForRowId<T>(
  order: GroupedRenderOrder<T>,
  pageSize: number,
  rowId: string,
  getRowId: (row: T) => string,
): number | null {
  const leaves = flattenRenderOrder(order);
  const idx = leaves.findIndex((row) => getRowId(row) === rowId);
  if (idx < 0) return null;
  return Math.floor(idx / pageSize);
}
