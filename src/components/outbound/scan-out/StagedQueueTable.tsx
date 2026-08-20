'use client';

/**
 * `StagedQueueTable` — display removed pending a rewrite (2026-08-20).
 *
 * This surface had no column model of its own: it rendered the shared Orders
 * grid engine (`OrdersGridHost`), which survives ONLY because To-Ship is built
 * on it. Deleting the engine would have deleted To-Ship, so each of its other
 * consumers is stubbed here at the PAGE level instead — never at the shared
 * table, which To-Ship still mounts.
 *
 * Props accepted and ignored so every call site keeps compiling; the route, its
 * permissions and its data are untouched.
 */

import { TableRebuildPlaceholder } from '@/components/tables/TableRebuildPlaceholder';

export function StagedQueueTable(_props: Record<string, unknown>) {
  return <TableRebuildPlaceholder surface="Staged orders" />;
}
