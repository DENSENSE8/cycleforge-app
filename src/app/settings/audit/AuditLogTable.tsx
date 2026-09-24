'use client';

/**
 * Settings › Audit — the CLIENT ISLAND for `/settings/audit`.
 *
 * The page is an RSC: it guards on `admin.view_logs`, runs the tenant-scoped
 * `audit_logs` query and walks its keyset pages. None of that moves. This file
 * is the boundary the slot engine needs (hooks, layout cascade, header sort),
 * and it takes its rows as props — the SQL stays on the server.
 *
 * ## The find box is the page's `?q=`, not a pass over fifty rows
 *
 * Same shape as `@/components/inventory/StockByLocationView`, the in-repo
 * precedent for an RSC page whose search is server-answered: the box writes
 * `?q=` through {@link useOptimisticUrlParam} — so the field paints on the
 * keystroke and the table is NOT remounted mid-word — the page reads that
 * param into its SQL, and the feed handed back here IS the answer. Declaring
 * `answeredBy: 'server'` is what stops the engine running its own substring
 * pass over the fifty rows in hand: that pass could only ever narrow the
 * server's answer, and the server is matching 25k rows this page never holds.
 *
 * ## Why the write deletes `?cursor=`
 *
 * The page is keyset-paged: `?cursor=` means "ids below this one". It is an
 * address inside ONE ordered list, and changing the query text produces a
 * different list. Carrying the old cursor across would start the search in the
 * middle of a result set the operator has never seen the top of — matches
 * above the cursor would be silently unreachable. Every query write therefore
 * drops the cursor and the search starts at the newest match.
 *
 * No record plane — the binding says why (`AUDITLOG_TABLE_BINDING.recordPlane`).
 */

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DataTable, type DataTableSearch } from '@/components/tables/DataTable';
import { useOptimisticUrlParam } from '@/hooks/useOptimisticUrlParam';
import { useAuditLogSpreadsheet } from '@/components/settings/audit-log/useAuditLogSpreadsheet';
import type { AuditLogRow } from '@/lib/audit/audit-log-row';

const AUDIT_ROUTE = '/settings/audit';
const QUERY_PARAM = 'q';
const CURSOR_PARAM = 'cursor';

export function AuditLogTable({
  rows,
  emptyMessage,
}: {
  rows: AuditLogRow[];
  /** The page owns the filtered-vs-empty wording; it knows the search params. */
  emptyMessage: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  /** The COMMITTED query — what the rows in hand are the answer for. */
  const urlQuery = searchParams.get(QUERY_PARAM) ?? '';

  /**
   * Within-route param mutation: clone the current query string, rewrite this
   * one key, replace. `/settings/audit` has no route-param spec and mounts no
   * `SurfaceParamHygiene`, so there is no canonical key order to emit in and
   * nothing strips `?source=` / `?action=` on the way through — cloning is what
   * keeps them.
   */
  const replace = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.replace(qs ? `${AUDIT_ROUTE}?${qs}` : AUDIT_ROUTE, { scroll: false });
    },
    [router, searchParams],
  );

  const write = useCallback((params: URLSearchParams, next: string) => {
    if (next.trim()) params.set(QUERY_PARAM, next);
    else params.delete(QUERY_PARAM);
    // See the module docblock: a cursor is an address inside one ordered list.
    params.delete(CURSOR_PARAM);
  }, []);

  const { value: query, setValue: setQuery } = useOptimisticUrlParam<string>({
    urlValue: urlQuery,
    replace,
    write,
  });

  /**
   * Is the server still answering the text in the box?
   *
   * `query` is the OPTIMISTIC value (painted the instant the operator types);
   * `urlQuery` only catches up when the soft-replace lands, which on this
   * dynamic page means the new rows have arrived. The gap between them is the
   * one honest "a request for this value is in flight" the RSC path offers —
   * there is no client fetch to ask. Compared TRIMMED because {@link write}
   * drops a whitespace-only query rather than writing it; comparing raw, a box
   * holding a single space would hang the body in its loading face forever.
   */
  const searchPending = query.trim() !== urlQuery.trim();

  const search = useMemo<DataTableSearch>(
    () => ({
      value: query,
      onChange: setQuery,
      // Names the facts an operator reaches for by hand; the SQL matches those
      // plus the entity type and the actor's role, so this is the invitation,
      // not the limit.
      placeholder: 'Search action, source, entity, actor, IP…',
      answeredBy: 'server',
      pending: searchPending,
    }),
    [query, setQuery, searchPending],
  );

  const sheet = useAuditLogSpreadsheet({ rows, emptyMessage, search });

  return (
    <div className="flex h-[60vh] min-h-0 min-w-0 flex-col">
      <DataTable {...sheet} totalCount={rows.length} />
    </div>
  );
}
