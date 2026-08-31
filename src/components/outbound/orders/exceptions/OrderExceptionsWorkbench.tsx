'use client';

/**
 * **Order exceptions** — the held-order queue, on the ONE outbound grid.
 *
 * Operator brief (2026-08-31): *"Port the currently built data table onto the
 * exceptions page within shipping. On the exceptions tab, clicking a button
 * should never open another page. It should open the data table first, for
 * exact triaging of information."* Then, on the first attempt being wrong:
 * *"You must use the one data table component, the slot table, the linear
 * host."*
 *
 * ## What this is, and the fork it is NOT
 *
 * This mounts {@link useOrdersSpreadsheet} — the same feed every other outbound
 * lane mounts — over the exception rows, adapted through
 * {@link exceptionRowToQueueRow}. Same binding (`fulfillment.default`), same
 * prefs bucket (`orders`), same compound two-row materialization of the
 * effective slot layout (staff ?? org ?? product). There is no
 * `order-exceptions` sheet, no second column model and no row component of its
 * own, because there is no second table.
 *
 * The first attempt at this surface built exactly those things — a
 * `*-grid-layout` SoT, a `*GridRow` with a switch over column keys, a new
 * `entityFamily`, a new `TableId`, a new registered binding — on the reasoning
 * that `blockers[]` and `siblingUnpairedCount` have no column on `ShippedOrder`.
 * That is the wrong altitude for that fact: a column this grid does not yet
 * print is a SLOT BINDING in `@/lib/tables/field-catalog/orders.ts`, resolved
 * by the layout cascade and materialized by `materializeTracks`. Adding a field
 * there offers the column to every outbound lane; hand-rolling a grid gives the
 * operator a second table that drifts from the first. The law is pinned in
 * `src/design-system/pinned.json` so `ds_contract` says it before the next
 * agent writes a line.
 *
 * ## Without a photo
 *
 * The `thumb` track is dropped from the mounted column list. An exception is a
 * held ORDER, not a received unit — there is no image to match against a box in
 * an operator's hands, and the alternative is a 48px `Package` placeholder
 * repeated down every row, which is chrome saying "no photo" 200 times. The
 * geometry survives it: `item` is still present, so `isCompoundColumnModel` and
 * the 48px `compoundRowEstimateFor` both still resolve, and the frozen pane is
 * still a contiguous leading prefix (now `select` alone).
 *
 * ## The record is a PAGE, beside a persistent queue rail
 *
 * `?order=<id>` swaps the BODY from the table to {@link ExceptionEditor}. Not a
 * `RightRailHost` occupant (ruled out explicitly), not a modal, not an inline
 * expansion. The deep link an operator sends a colleague — "this one is wrong,
 * look" — still lands on the same record it always did.
 *
 * {@link ExceptionsRecentRail} rides the RECORD state, not the table state
 * (operator 2026-08-31: "a CTA button to access the full screen form display
 * that will then display the recent rail and the full screen form"). The table
 * is for EXACT triage — columns, sort, prefs, the facts you compare ACROSS
 * orders — and the rail is for WALKING the queue while you fix ONE. Different
 * questions, so they are not shown at once.
 *
 * That split is also what makes the small state fit. The stage caps at
 * `DESK_STAGE_MAX_PX` (1152px) and the mounted compound tracks minus `thumb`
 * come to 55rem / 880px; a 22rem rail beside them leaves 800px and the table
 * scrolls horizontally out of the box, worse with every status binding a
 * manager adds — those tracks are fixed `minmax` widths and do not shrink under
 * pressure. Table alone gets the full 1152px. (Measured with cycleforge-app-c4,
 * 2026-08-31.)
 *
 * The rail is a preset over `SidebarRecentRailBase` — the same shell as the
 * unbox and testing rails, with their row anatomy (status dot, title, quantity
 * on the meta line). Not a hand-rolled list; that fork was deleted once
 * already.
 *
 * The editor autosaves, owns its own Escape handler (→ `onExit`) and reseeds on
 * `row.id` only, so this host must not remount it on `onChanged` and must not
 * add a second Escape listener. It needs a `min-h-0` flex parent or its
 * scrollport will not scroll.
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
import { DataTable } from '@/components/tables/DataTable';
import { ExceptionsRecentRail } from './ExceptionsRecentRail';
import { Button } from '@/components/ui/button';
import { Maximize2 } from '@/components/Icons';
import { useDeskStageOptional } from '@/design-system/components/DeskStageContext';
import { triagePanelControl } from '@/design-system/tokens/triage-panel';
import { useOrdersSpreadsheet } from '@/components/dashboard/orders-queue/useOrdersSpreadsheet';
import { exceptionRowToQueueRow } from '@/lib/queries/caged-orders-queries';
import { SHIPPING_EXCEPTIONS_PATH } from '@/lib/shipping/orders-desk';
import type { OrderExceptionRow } from '@/lib/orders/order-exception-types';
import type { ShippedOrder } from '@/types/orders';
import { ExceptionEditor } from './ExceptionEditor';

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
    queryKey: ['order-exceptions', 'actionable', debounced],
    queryFn: async (): Promise<ExceptionsPayload> => {
      const params = new URLSearchParams({ scope: 'actionable' });
      if (debounced.trim()) params.set('q', debounced.trim());
      const res = await fetch(`/api/orders/exceptions?${params}`, {
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error(`Could not load exceptions (${res.status})`);
      return (await res.json()) as ExceptionsPayload;
    },
    staleTime: 0,
  });

  const exceptions = useMemo(() => query.data?.exceptions ?? [], [query.data]);
  const selected = exceptions.find((r) => r.id === selectedId) ?? null;

  // Memoized: this list is the input to the grouped row model, so an
  // unmemoized re-derive would re-identify every row on every render.
  const records = useMemo(() => exceptions.map(exceptionRowToQueueRow), [exceptions]);

  const openRecord = useCallback(
    (record: ShippedOrder) => patchParams({ order: String(record.id) }),
    [patchParams],
  );

  /**
   * Leave the record, paint the queue. The editor's ✕, its context-header ◁
   * and its Escape all land here.
   */
  const closeRecord = useCallback(() => patchParams({ order: null }), [patchParams]);

  /**
   * After a write: refetch. When the row RESOLVED it has left the actionable
   * set, and a page host has no next row to advance to — so the honest answer
   * is to hand the operator the queue back rather than pushing them at some
   * arbitrary neighbour. (Resolve-and-advance was the rail's ergonomic; a page
   * does not have it, and faking it would land them on a record they did not
   * choose.)
   */
  const handleChanged = useCallback(
    async (opts?: { resolved?: boolean }) => {
      const next = await query.refetch();
      if (!opts?.resolved) return;
      const remaining = next.data?.exceptions ?? [];
      if (remaining.some((r) => r.id === selectedId)) return; // still blocked; stay put
      closeRecord();
    },
    [query, selectedId, closeRecord],
  );

  const stage = useDeskStageOptional();

  const sheet = useOrdersSpreadsheet({
    records,
    loading: query.isLoading,
    searchValue: search,
    onOpenRecord: openRecord,
    onClearSearch: () => patchParams({ search: null }),
    emptyMessage: 'Nothing blocked — every order has what it needs to ship.',
    searchEmptyTitle: 'No held order found',
    searchResultLabel: 'held orders',
    clearSearchLabel: 'Show all held orders',
    selectionScope: EXCEPTIONS_SELECTION_SCOPE,
    ariaLabel: 'Order exceptions',
    'data-testid': 'order-exceptions-grid-body',
    // The `orders` prefs bucket on purpose: this IS the outbound sheet, so a
    // column an operator curates on To-ship is curated here too. A bucket of
    // its own would be the fork wearing a different hat.
    tableId: 'orders',
  });

  // See the docblock — an exception has no photo, so the track is not mounted.
  const columns = useMemo(
    () => sheet.columns?.filter((c) => c.key !== 'thumb'),
    [sheet.columns],
  );

  /**
   * The CTA the operator asked for: one control that takes them from the small
   * table into the full-screen FORM — fullscreen stage plus an open record, so
   * the rail and the editor arrive together.
   *
   * It opens the row they have picked, or the first in the queue when they have
   * picked none, because "open the form" with nothing selected has to mean
   * something and the top of a worklist is the only non-arbitrary answer.
   *
   * `useDeskStageOptional` is optional for a reason: this surface only gained a
   * stage when the route moved inside the `(desk)` group. Outside it the hook
   * returns null and the CTA still opens the record — it just cannot expand,
   * which is the honest degradation rather than a dead button.
   */
  const openFullScreenForm = useCallback(() => {
    const target = selectedId ?? exceptions[0]?.id ?? null;
    if (!target) return;
    if (stage && !stage.fullscreen) stage.toggleFullscreen();
    patchParams({ order: String(target) });
  }, [exceptions, patchParams, selectedId, stage]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-surface-canvas">
      {query.isError ? (
        <div
          className="border-b border-border-danger bg-surface-danger px-6 py-2 text-role-caption font-semibold text-text-danger"
          data-testid="exceptions-error"
        >
          {(query.error as Error)?.message ?? 'Could not load exceptions.'}
        </div>
      ) : null}

      {selected ? (
        // The FORM display: rail beside the record. `min-h-0` is load-bearing —
        // TriageScrollLayout's scrollport will not scroll without a
        // height-constrained flex parent.
        <div className="flex min-h-0 min-w-0 flex-1">
          <aside
            className="flex w-[22rem] shrink-0 flex-col border-r border-border-hairline bg-surface-card"
            aria-label="Exception queue"
            data-testid="exceptions-rail"
          >
            <ExceptionsRecentRail
              rows={exceptions}
              selectedId={selectedId}
              onSelect={(id) => patchParams({ order: String(id) })}
              loading={query.isLoading}
            />
          </aside>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-card">
            <ExceptionEditor
              key={selected.id}
              row={selected}
              onChanged={handleChanged}
              onExit={closeRecord}
            />
          </div>
        </div>
      ) : (
        // The TABLE display, small by default now that the route has a stage.
        <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="exceptions-queue">
          {/*
            One control, right-aligned, no band: not a title, not a count, not a
            second row of chrome saying what the table already says. The find
            row, filter, fields picker and the stage's own fullscreen toggle all
            live inside DataTable — this is the only thing that surface does not
            already offer.
          */}
          <div className="flex shrink-0 justify-end px-4 pt-3">
            <Button
              variant="outline"
              size="md"
              onClick={openFullScreenForm}
              disabled={exceptions.length === 0}
              className={triagePanelControl()}
              data-testid="exceptions-open-form"
            >
              <Maximize2 className="h-3.5 w-3.5" aria-hidden />
              Open full-screen form
            </Button>
          </div>
          <DataTable
            {...sheet}
            columns={columns}
            search={{
              value: search,
              onChange: (value) => patchParams({ search: value || null }),
              placeholder: 'Search order #, item #, SKU or title…',
            }}
          />
        </div>
      )}
    </div>
  );
}
