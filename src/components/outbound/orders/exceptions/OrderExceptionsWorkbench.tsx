'use client';

/**
 * **Order exceptions** — the held-order queue, on the ONE outbound grid.
 *
 * The Exceptions surface is the same full-width industrial ledger as To ship
 * and Pending. It does not mount the slot `DataTable`: `OutboundOrdersLedger`
 * owns the toolbar, row chrome, grouping, paging, fullscreen affordance, and
 * the order record. Exception rows are adapted into the shared `ShippedOrder`
 * shape, so the design-system table has one implementation and one visual law.
 *
 * Category controls are a narrow banner passed into that ledger. They filter
 * the server-backed exception feed; they do not introduce a second table,
 * column model, or row renderer.
 *
 * ## Image gutter
 *
 * Tabs fork row data only — never the thumb track. An exception row may have
 * no photo; the shared Image chrome still mounts. Dropping `thumb` here was the
 * skeleton-cut fork the header-sort law forbids.
 *
 * ## The record is the order record, placed by the desk
 *
 * A row (or `?order=<id>`, or the header's Resolve) opens the held order's
 * record — the same `OrderRecordView` every outbound desk opens, in its
 * `exceptions` sections — through `DeskRecordPlane` (owner 2026-09-25): in
 * place of the ledger by default, list-left / record-right when the staffer
 * turns fullscreen on. Not a `RightRailHost` occupant, not a modal, not a body
 * swap with a second queue rail: in the split view the ledger IS the queue you
 * walk (J / K) while you fix one. The deep link an operator sends a colleague
 * — "this one is wrong, look" — still lands on the same record.
 *
 * ## What the record is for (R-FLOW-7)
 *
 * Pairing the item number to the Zoho inventory SKU
 * ({@link ExceptionResolveSection}, the record's `resolve` section). That write
 * un-cages the order and it leaves this queue, which closes the record and
 * hands the operator the queue back.
 *
 * ## Scope is fixed to `actionable`
 *
 * There is no Actionable | All control. `all` does not narrow this queue, it
 * REDEFINES it — from "what is blocked right now" to a several-thousand-row
 * backlog sweep — so it is a mode, not a filter chip, and the operator ruled
 * the control off the surface.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  DeskActionSlotRegistrar,
  DeskHeaderAction,
} from '@/design-system/components/DeskActionSlot';
import { OutboundOrdersLedger } from '@/components/outbound/orders/OutboundOrdersLedger';
import { useToShipChrome } from '@/components/unshipped/useToShipChrome';
import { exceptionRowToQueueRow } from '@/lib/queries/caged-orders-queries';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { SHIPPING_EXCEPTIONS_PATH } from '@/lib/shipping/orders-desk';
import {
  ORDER_EXCEPTION_CATEGORIES,
  sortExceptionQueueRows,
  type OrderExceptionCategory,
  type OrderExceptionRow,
} from '@/lib/orders/order-exception-types';
import { ExceptionResolveSection } from './ExceptionResolveSection';

interface ExceptionsPayload {
  ok: boolean;
  count: number;
  exceptions: OrderExceptionRow[];
}

/**
 * Its OWN selection scope, never the dashboard's. A tick here must not appear
 * in the To-ship rail's selection — same rows, different question.
 */
const EXCEPTIONS_SELECTION_SCOPE = 'order-exceptions';

export function OrderExceptionsWorkbench() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedParam = Number(searchParams.get('order'));
  const selectedId = Number.isFinite(selectedParam) && selectedParam > 0 ? selectedParam : null;
  const search = searchParams.get('search') ?? '';
  const rawCategory = searchParams.get('category');
  const category: OrderExceptionCategory | null = ORDER_EXCEPTION_CATEGORIES.includes(
    rawCategory as OrderExceptionCategory,
  )
    ? (rawCategory as OrderExceptionCategory)
    : null;

  const [debounced, setDebounced] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  /** One writer for the two URL bits this surface owns; sort has its own hook. */
  const patchParams = useCallback(
    (delta: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(delta)) {
        if (value === null || value === '') params.delete(key);
        else params.set(key, value);
      }
      const qs = params.toString();
      router.replace(qs ? `${SHIPPING_EXCEPTIONS_PATH}?${qs}` : SHIPPING_EXCEPTIONS_PATH, {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  const query = useQuery({
    queryKey: ['order-exceptions', 'actionable', category, debounced],
    queryFn: async (): Promise<ExceptionsPayload> => {
      const params = new URLSearchParams({ scope: 'actionable' });
      if (category) params.set('category', category);
      if (debounced.trim()) params.set('q', debounced.trim());
      const res = await fetch(`/api/orders/exceptions?${params}`, {
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error(`Could not load exceptions (${res.status})`);
      return (await res.json()) as ExceptionsPayload;
    },
    staleTime: 0,
  });

  const exceptions = useMemo(
    () => sortExceptionQueueRows(query.data?.exceptions ?? []),
    [query.data],
  );

  // Memoized: this list is the input to the grouped row model, so an
  // unmemoized re-derive would re-identify every row on every render.
  const records = useMemo(() => exceptions.map(exceptionRowToQueueRow), [exceptions]);
  const categoryCounts = useMemo(() => {
    const counts = Object.fromEntries(ORDER_EXCEPTION_CATEGORIES.map((key) => [key, 0])) as Record<
      OrderExceptionCategory,
      number
    >;
    for (const row of exceptions) counts[row.routing.category] += 1;
    return counts;
  }, [exceptions]);

  const openRecord = useCallback(
    (record: ShippedOrder) => patchParams({ order: String(record.id) }),
    [patchParams],
  );

  /** Leave the record, paint the queue: the plane's ✕ and Esc land here. */
  const closeRecord = useCallback(() => patchParams({ order: null }), [patchParams]);

  /**
   * After a write: refetch. A RESOLVED row leaves the actionable set, and the
   * ledger's selection closes a record whose row left the queue — the operator
   * gets the queue back rather than being pushed at an arbitrary neighbour.
   */
  const { refetch } = query;
  const handleChanged = useCallback(() => {
    void refetch();
  }, [refetch]);
  const resolveRecord = useCallback(
    (record: ShippedOrder) => {
      const row = exceptions.find((r) => r.id === Number(record.id));
      return row ? <ExceptionResolveSection key={row.id} row={row} onChanged={handleChanged} /> : null;
    },
    [exceptions, handleChanged],
  );
  const toShipChrome = useToShipChrome();
  const chrome = useMemo(
    () => ({
      ...toShipChrome,
      search: {
        value: search,
        onChange: (value: string) => patchParams({ search: value || null }),
        placeholder: 'Filter orders…',
      },
    }),
    [patchParams, search, toShipChrome],
  );

  /**
   * Header verb: open the SKU-pairing record (the open one, else the first).
   * Fullscreen stays on the table toolbar ({@link DataTableFullscreenToggle}) —
   * a second expand control above the grid is the duplicate the operator refused.
   */
  const openResolveForm = useCallback(() => {
    const target = selectedId ?? exceptions[0]?.id ?? null;
    if (!target) return;
    patchParams({ order: String(target) });
  }, [exceptions, patchParams, selectedId]);

  const resolveControl = useMemo(
    () => (
      <DeskHeaderAction
        type="button"
        variant="primary"
        size="sm"
        disabled={exceptions.length === 0}
        onClick={openResolveForm}
        data-testid="exceptions-open-form"
      >
        Resolve
      </DeskHeaderAction>
    ),
    [exceptions.length, openResolveForm],
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-canvas">
      <DeskActionSlotRegistrar role="primary">{resolveControl}</DeskActionSlotRegistrar>
      {query.isError ? (
        <div
          className="border-b border-border-danger bg-surface-danger px-6 py-2 text-role-caption font-semibold text-text-danger"
          data-testid="exceptions-error"
        >
          {(query.error as Error)?.message ?? 'Could not load exceptions.'}
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="exceptions-queue">
        <OutboundOrdersLedger
          mode="exceptions"
          chrome={chrome}
          searchPending={query.isFetching || search.trim() !== debounced.trim()}
          records={records}
          loading={query.isLoading}
          onOpenRecord={openRecord}
          onCloseRecord={closeRecord}
          openRecordId={selectedId}
          resolveRecord={resolveRecord}
          railSelection={false}
          selectionScope={EXCEPTIONS_SELECTION_SCOPE}
          searchEmptyTitle="No held order found"
          searchResultLabel="held orders"
          clearSearchLabel="Show all held orders"
          banner={
            <nav
              aria-label="Exception category"
              className="flex shrink-0 items-stretch overflow-x-auto border-b border-mode-ink bg-mode-bar"
              data-testid="exception-category-tabs"
            >
              <button
                type="button"
                aria-pressed={category == null}
                onClick={() => patchParams({ category: null })}
                className="min-h-mode-hit border-r border-mode-edge px-3 text-role-eyebrow font-bold uppercase tracking-widest text-mode-ink aria-pressed:bg-mode-ink aria-pressed:text-mode-bar"
              >
                All <span className="ml-1 font-mono">{exceptions.length}</span>
              </button>
              {ORDER_EXCEPTION_CATEGORIES.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={category === item}
                  onClick={() => patchParams({ category: item })}
                  className="min-h-mode-hit border-r border-mode-edge px-3 text-role-eyebrow font-bold uppercase tracking-widest text-mode-muted hover:bg-mode-hover aria-pressed:bg-mode-ink aria-pressed:text-mode-bar"
                >
                  {item} <span className="ml-1 font-mono">{categoryCounts[item]}</span>
                </button>
              ))}
            </nav>
          }
        />
      </div>
    </div>
  );
}
