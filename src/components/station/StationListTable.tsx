'use client';

/**
 * `StationListTable` — display removed pending a rewrite (2026-08-20).
 *
 * This surface had no column model of its own: it rendered the shared Orders
 * spreadsheet, whose engine is `NonlinearTableHost` and whose family glue is
 * `useOrdersSpreadsheet` — both still mounted by To-Ship. Deleting either would
 * have deleted To-Ship, so each of its other consumers is stubbed here at the
 * PAGE level instead — never at the shared engine.
 *
 * Props accepted and ignored so every call site keeps compiling; the route, its
 * permissions and its data are untouched.
 */

import { TableRebuildPlaceholder } from '@/components/tables/TableRebuildPlaceholder';

export function StationListTable<T = unknown>(_props: Record<string, unknown>) {
  void (null as T | null);
  return <TableRebuildPlaceholder surface="Station list" />;
}
