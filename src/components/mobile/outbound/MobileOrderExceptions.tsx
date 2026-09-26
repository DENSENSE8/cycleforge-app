'use client';

/**
 * Mobile projection of the canonical order-exceptions queue.
 * desktop DataTable. Only presentation differs: BRIEF §4 triage rows
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw } from '@/components/Icons';
import { LifecycleStateCode } from '@/components/mobile/triage/StateCode';
import { TriageRow } from '@/components/mobile/triage/TriageRow';
import { useTriageSelection } from '@/components/mobile/triage/useTriageSelection';
import { Button, Inset, SearchField } from '@/design-system/primitives';
import { withJobReturn } from '@/lib/mobile/nav-trail';
import {
  ORDER_EXCEPTION_BLOCKER_LABEL,
  sortExceptionQueueRows,
  type OrderExceptionRow,
} from '@/lib/orders/order-exception-types';

interface ExceptionsPayload {
  ok: boolean;
  count: number;
  exceptions: OrderExceptionRow[];
}

async function fetchExceptions(search: string): Promise<ExceptionsPayload> {
  const params = new URLSearchParams({ scope: 'actionable' });
  if (search) params.set('q', search);
  const response = await fetch(`/api/orders/exceptions?${params}`, {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Could not load exceptions (${response.status})`);
  return response.json();
}

function blockerSummary(row: OrderExceptionRow): string {
  return row.blockers.map((blocker) => ORDER_EXCEPTION_BLOCKER_LABEL[blocker]).join(' · ');
}

export function MobileOrderExceptions() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const exceptions = useQuery({
    queryKey: ['order-exceptions', 'mobile', debounced],
    queryFn: () => fetchExceptions(debounced),
    staleTime: 0,
  });
  const rows = useMemo(
    () => sortExceptionQueueRows(exceptions.data?.exceptions ?? []),
    [exceptions.data],
  );

  const [selected, select] = useTriageSelection('exceptions');
  const label = (row: OrderExceptionRow) => row.orderNumber || `#${row.id}`;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-card" data-testid="mobile-order-exceptions">
      <div className="border-b border-border-hairline bg-surface-card">
        <Inset space="chip">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search order, item, SKU or title…"
            tone="neutral"
            hideUnderline
            isSearching={exceptions.isFetching && Boolean(debounced)}
          />
        </Inset>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-border-hairline px-3 py-2 text-role-caption text-text-muted">
          {exceptions.isPending
            ? 'Loading held orders…'
            : `${rows.length} order${rows.length === 1 ? '' : 's'} need catalog pairing`}
        </div>

        {exceptions.isError ? (
          <div className="flex flex-col items-start gap-3 border-b border-border-hairline px-3 py-5">
            <p className="flex items-center gap-2 text-role-caption font-semibold text-text-danger">
              <AlertTriangle className="h-4 w-4" /> Couldn&apos;t load exceptions.
            </p>
            <Button
              variant="secondary"
              radius="flush"
              size="sm"
              icon={<RefreshCw />}
              onClick={() => void exceptions.refetch()}
            >
              Retry
            </Button>
          </div>
        ) : !exceptions.isPending && rows.length === 0 ? (
          <div className="border-b border-border-hairline px-3 py-8 text-center">
            <p className="text-role-data font-semibold text-text-default">
              {debounced ? 'No held order matches this search.' : 'No outbound exceptions.'}
            </p>
            <p className="mt-1 text-role-caption text-text-muted">
              {debounced ? 'Clear the search to see the full queue.' : 'Every caged order is paired.'}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border-hairline border-b border-border-hairline">
            {rows.map((row) => {
              const title = row.productTitle || row.catalogTitle || label(row);
              const verb = row.blockers.includes('no_item_number') ? 'Add item #' : 'Pair';
              return (
                <TriageRow
                  key={row.id}
                  code={<LifecycleStateCode state="onHold" />}
                  title={title}
                  meta={
                    <span className="min-w-0 truncate text-role-caption text-text-soft">
                      <span className="font-mono">{label(row)}</span>
                      {` · ${blockerSummary(row)}`}
                    </span>
                  }
                  selected={selected === String(row.id)}
                  actionLabel={verb}
                  actionName={`${verb} for ${label(row)}: ${blockerSummary(row)}`}
                  inspectName={`Open order ${label(row)}`}
                  onInspect={() => {
                    select(String(row.id));
                    router.push(withJobReturn(`/m/orders/${row.id}?by=id`, '/m/exceptions'));
                  }}
                  onAction={() => {
                    select(String(row.id));
                    router.push(`/m/exceptions/${row.id}`);
                  }}
                />
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
