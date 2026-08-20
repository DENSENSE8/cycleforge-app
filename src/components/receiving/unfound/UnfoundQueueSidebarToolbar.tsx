'use client';

/**
 * `UnfoundQueueSidebarToolbar` — display removed pending a rewrite (2026-08-20).
 *
 * Props accepted and ignored so every call site keeps compiling; the route, its
 * permissions and its data are untouched.
 */

import { TableRebuildPlaceholder } from '@/components/tables/TableRebuildPlaceholder';

export function UnfoundQueueSidebarToolbar(_props: Record<string, unknown>) {
  return <TableRebuildPlaceholder surface="Unfound toolbar" />;
}
