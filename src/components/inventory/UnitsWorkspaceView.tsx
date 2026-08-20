'use client';

/**
 * `UnitsWorkspaceView` — display removed pending a rewrite.
 *
 * The collection grid this mounted was deleted on 2026-08-20; the route, its
 * auth gate, its permission-registry entry, its nav position and its data are
 * all untouched. Props are accepted and ignored on purpose: every call site
 * keeps compiling, so rebuilding the display is a change to THIS file rather
 * than a hunt through the callers.
 */

import { TableRebuildPlaceholder } from '@/components/tables/TableRebuildPlaceholder';

export function UnitsWorkspaceView(_props: Record<string, unknown>) {
  return <TableRebuildPlaceholder surface="Inventory units" />;
}
