'use client';

/** Settings › Audit — the CLIENT ISLAND for `/settings/audit`. */

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

  /** Within-route param mutation: */
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

  /** Is the server still answering the text in the box? */
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
