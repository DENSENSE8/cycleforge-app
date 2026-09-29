/**
 * The hub's one list arithmetic — pure. Every source hands over its full
 * membership; this narrows by `q`, orders newest `raisedAt` first (unknown
 * last, then key for a stable page boundary) and cuts one page. The route and
 * the tests call the same function.
 */

import type { ExceptionListParams, ExceptionRow } from './types';

export const EXCEPTION_PAGE_DEFAULT = 100;
export const EXCEPTION_PAGE_MAX = 5000;

export function clampExceptionLimit(raw: number | undefined): number {
  const limit = Math.floor(Number(raw));
  if (!Number.isFinite(limit) || limit < 1) return EXCEPTION_PAGE_DEFAULT;
  return Math.min(limit, EXCEPTION_PAGE_MAX);
}

/** Opaque cursor = the next page's offset. Junk reads as the first page. */
export function parseExceptionCursor(raw: string | null | undefined): number {
  return raw && /^[0-9]+$/.test(raw) ? Number(raw) : 0;
}

export function exceptionRowMatches(row: ExceptionRow, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [row.entity.id, row.entity.label, row.title, row.tag.label, row.detail]
    .some((value) => (value ?? '').toLowerCase().includes(needle));
}

export function compareExceptionRows(a: ExceptionRow, b: ExceptionRow): number {
  if (a.raisedAt !== b.raisedAt) {
    if (a.raisedAt == null) return 1;
    if (b.raisedAt == null) return -1;
    return a.raisedAt < b.raisedAt ? 1 : -1;
  }
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

export function pageExceptionRows(
  rows: readonly ExceptionRow[],
  params: Pick<ExceptionListParams, 'q' | 'limit' | 'cursor'>,
): { rows: ExceptionRow[]; nextCursor: string | null } {
  const matched = params.q ? rows.filter((row) => exceptionRowMatches(row, params.q ?? '')) : [...rows];
  matched.sort(compareExceptionRows);
  const offset = parseExceptionCursor(params.cursor);
  const limit = clampExceptionLimit(params.limit);
  const page = matched.slice(offset, offset + limit);
  return { rows: page, nextCursor: offset + limit < matched.length ? String(offset + limit) : null };
}
