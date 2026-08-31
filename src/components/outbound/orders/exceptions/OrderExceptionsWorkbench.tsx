'use client';

/**
 * **Order exceptions** workbench — full-bleed master/detail.
 *
 * Operator brief (2026-08-31): processing a caged order through the centered
 * intake overlay was "extremely difficult" — the overlay is a 46rem column
 * built for typing ONE new order, and it is the wrong instrument for grinding
 * through a queue of broken ones. This is the industry-standard shape for that
 * job: a queue on the left, the whole record on the right, resolve-and-advance.
 *
 * It lives OUTSIDE the `(desk)` route group on purpose. That group's
 * `DeskPageChrome` gives every desk a fixed-width stage; this surface was asked
 * for at full page width, so — like `/shipping/scan-out` — it sits beside the
 * group rather than inside it.
 *
 * The selected order is `?order=<id>` so a row is linkable: an operator can
 * send "this one is wrong" to someone else and have them land on the same
 * record.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { OrderExceptionRow, OrderExceptionScope } from '@/lib/orders/order-exception-types';
import { cn } from '@/utils/_cn';
import { ExceptionEditor } from './ExceptionEditor';
import { ExceptionQueueList } from './ExceptionQueueList';

interface ExceptionsPayload {
  ok: boolean;
  count: number;
  exceptions: OrderExceptionRow[];
}

export function OrderExceptionsWorkbench() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedParam = Number(searchParams.get('order'));
  const selectedId = Number.isFinite(selectedParam) && selectedParam > 0 ? selectedParam : null;

  const [scope, setScope] = useState<OrderExceptionScope>('actionable');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const query = useQuery({
    queryKey: ['order-exceptions', scope, debounced],
    queryFn: async (): Promise<ExceptionsPayload> => {
      const params = new URLSearchParams({ scope });
      if (debounced.trim()) params.set('q', debounced.trim());
      const res = await fetch(`/api/orders/exceptions?${params}`, {
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error(`Could not load exceptions (${res.status})`);
      return (await res.json()) as ExceptionsPayload;
    },
    staleTime: 0,
  });

  const rows = useMemo(() => query.data?.exceptions ?? [], [query.data]);

  const select = useCallback(
    (id: number | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) params.set('order', String(id));
      else params.delete('order');
      const qs = params.toString();
      router.replace(qs ? `/shipping/exceptions?${qs}` : '/shipping/exceptions');
    },
    [router, searchParams],
  );

  // Land on the first row so the surface is never an empty right pane.
  useEffect(() => {
    if (selectedId || rows.length === 0) return;
    select(rows[0]!.id);
  }, [rows, selectedId, select]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  /**
   * After a write: refetch. When the row was RESOLVED, advance to the next one
   * so the operator keeps moving — resolve-and-advance is the whole ergonomic
   * difference between a worklist and a form.
   */
  const handleChanged = useCallback(
    async (opts?: { resolved?: boolean }) => {
      const currentIndex = rows.findIndex((r) => r.id === selectedId);
      const next = await query.refetch();
      if (!opts?.resolved) return;
      const remaining = next.data?.exceptions ?? [];
      if (remaining.some((r) => r.id === selectedId)) return; // still blocked; stay put
      const following = remaining[Math.min(currentIndex, remaining.length - 1)];
      select(following ? following.id : null);
    },
    [query, rows, selectedId, select],
  );

  const blockedCount = rows.filter((r) => r.blockers.length > 0).length;

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-canvas">
      {/* Band 1 — identity + scope. */}
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border-hairline bg-surface-card px-4 py-2">
        <h1 className="text-role-body font-semibold text-text-default">Order exceptions</h1>
        <Badge variant={blockedCount > 0 ? 'warning' : 'success'}>
          {blockedCount} blocked
        </Badge>
        <div className="ml-auto flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find order #, item #, SKU, title…"
            className="h-8 w-64"
            data-testid="exceptions-search"
          />
          <Button
            variant={scope === 'actionable' ? 'active' : 'ghost'}
            size="sm"
            onClick={() => setScope('actionable')}
            data-testid="exceptions-scope-actionable"
          >
            Actionable
          </Button>
          <Button
            variant={scope === 'all' ? 'active' : 'ghost'}
            size="sm"
            onClick={() => setScope('all')}
            data-testid="exceptions-scope-all"
          >
            All
          </Button>
        </div>
      </header>

      {/* Master / detail. Full bleed — no fixed-width stage. */}
      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            'flex w-[22rem] shrink-0 flex-col border-r border-border-hairline bg-surface-card',
          )}
          aria-label="Exception queue"
          data-testid="exceptions-queue"
        >
          <ExceptionQueueList
            rows={rows}
            selectedId={selectedId}
            onSelect={select}
            loading={query.isLoading}
          />
        </aside>

        <main className="min-w-0 flex-1 bg-surface-card" data-testid="exceptions-detail">
          {query.isError ? (
            <p className="px-5 py-6 text-role-caption text-rose-700">
              {(query.error as Error)?.message ?? 'Could not load exceptions.'}
            </p>
          ) : selected ? (
            <ExceptionEditor key={selected.id} row={selected} onChanged={handleChanged} />
          ) : (
            <div className="px-5 py-10 text-center">
              <p className="text-role-body font-semibold text-text-default">
                {rows.length === 0 ? 'Nothing blocked' : 'Pick an order'}
              </p>
              <p className="pt-1 text-role-caption text-text-soft">
                {rows.length === 0
                  ? 'Every order in this scope has what it needs to ship.'
                  : 'Choose a row on the left to edit and pair it.'}
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
