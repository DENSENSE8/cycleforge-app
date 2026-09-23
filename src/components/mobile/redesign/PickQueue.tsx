'use client';

/**
 * Mobile picker queue — `/m/pick`.
 *
 * ## What this stopped being
 *
 * `/m/pick` used to mount {@link MobileToShipQueue} over the pending SHIPPING
 * feed (`/api/orders?excludePacked=true`). That feed is label-scoped and
 * order-grained, so the queue could not show an order before its label existed,
 * could not split a two-line order, and — decisively — could not say WHERE the
 * unit is. It was a shipping desk wearing a picker's name.
 *
 * This is the pick list proper: one row per live `order_unit_allocations`
 * record, led by the shelf. `/m/work` keeps the old feed; the two screens
 * answer different questions and must not converge again.
 *
 * ## Scope is in the URL
 *
 * Mine · All · Unpaired are page facets (`SURFACE_LAW` §5), driven through
 * `?scope=` with `router.replace` exactly like `/m/work` drives `?tab=`, so a
 * picker can hand a supervisor the URL they are looking at. The server decides
 * what each scope contains — the picker's staff id comes from the session, not
 * from the query string.
 *
 * ## The unallocated half is a LIST, not a sentence
 *
 * `/m/pick` used to read allocations only, so an order with no unit reserved
 * existed on this screen as one number inside one sentence. Measured on org 1
 * (2026-09-15): 3 allocations against 70 unallocated lines — the queue showed
 * 4% of the day's demand and called the rest a footnote. A picker could not see
 * WHICH order was short, or why, or that someone had to act.
 *
 * Operator 2026-09-15: *"it must display a picklist loading for org1 from the
 * orders."* So the shortfall is rendered as rows, each naming its blocker, and
 * the band carries the one verb that can clear any of them.
 */

import { Suspense, useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Inbox } from '@/components/Icons';
import { Button, EmptyState, Inset } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { TAP_MIN_H_CLASS, TAP_POINTER_CLASS } from '@/design-system/tokens/interaction';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { TOKENS } from '@/components/mobile/redesign/DesignSystem';
import { PickQueueRow } from '@/components/mobile/redesign/PickQueueRow';
import { usePickList, useAllocationSweep } from '@/components/mobile/redesign/usePickList';
import { PickPairToteSheet, type PairToteUnit } from '@/components/mobile/picker/PickPairToteSheet';
import { ItemCardRow } from '@/components/mobile/redesign/ItemCardRow';
import { toShipPriceText } from '@/components/mobile/redesign/to-ship-faces';
import { formatSalePrice } from '@/lib/dashboard/orders-queue-helpers';
import { useToShipOrders } from '@/components/mobile/redesign/useToShipOrders';
import {
  parsePickListScope,
  type PickListBlocker,
  type PickListCounts,
  type PickListRow,
  type PickListScope,
  type PickListShortfallRow,
} from '@/components/mobile/redesign/pick-list-payload';

/**
 * The blocker, as the one sentence a picker can act on.
 *
 * Written as an instruction, not a state name: `no_catalog_link` is the import
 * defect (`sku_catalog_id` never resolved from the channel's external item
 * number), and the person holding the phone cannot fix a catalog link at the
 * shelf — they can only stop looking for the unit.
 */
const BLOCKER_LABEL: Record<PickListBlocker, string> = {
  no_catalog_link: 'No SKU linked',
  ready_to_allocate: 'In stock — not reserved',
  no_stock: 'No stock',
};

// `orders` is dogfood-only (operator 2026-09-15): the to-ship feed on the
// pick page's own card, so any order is tappable while iterating on the card.
// It carries no count — it is not pick work, it is a test surface.
const SCOPE_TABS: ReadonlyArray<{ id: PickListScope | 'orders'; label: string; count: keyof PickListCounts | null }> = [
  { id: 'mine', label: 'Mine', count: 'mine' },
  { id: 'all', label: 'All', count: 'all' },
  { id: 'unpaired', label: 'Unpaired', count: 'unpaired' },
  { id: 'orders', label: 'Orders', count: null },
];

function ScopeTabs({
  scope,
  counts,
  onSelect,
}: {
  scope: PickListScope | 'orders';
  counts: PickListCounts;
  onSelect: (next: PickListScope | 'orders') => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Pick scope"
      data-testid="pick-queue-tablist"
      className="flex min-w-0 items-center gap-2"
    >
      {SCOPE_TABS.map((tab) => {
        const selected = tab.id === scope;
        return (
          // ds-raw-button: page-facet pill, same grammar as the /m/work strip.
          // It carries the 44px touch floor rather than that strip's py-0.5,
          // because a facet is a standalone tap target (SURFACE_LAW R2/R6).
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            data-testid={`pick-queue-tab-${tab.id}`}
            onClick={() => onSelect(tab.id)}
            className={cn(
              'ds-raw-button flex items-center gap-1.5 px-3 text-role-caption font-semibold',
              cornerClass('control'),
              TAP_MIN_H_CLASS,
              TAP_POINTER_CLASS,
              focusRing('control'),
              selected ? 'bg-text-default text-surface-card' : 'text-text-muted',
            )}
          >
            {tab.count ? (
              <span className={cn('tabular-nums', selected ? 'text-surface-card' : 'text-text-faint')}>
                {counts[tab.count]}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function PickQueueScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawScope = searchParams.get('scope');
  // `orders` is client-only dogfood — the pick API knows nothing of it.
  const scope = rawScope === 'orders' ? 'orders' : parsePickListScope(rawScope);
  const { data, isPending, isError } = usePickList(
    scope === 'orders' ? 'all' : scope,
  );
  const { rows: orderRows } = useToShipOrders({ enabled: scope === 'orders' });

  const counts = data?.counts ?? { mine: 0, all: 0, unpaired: 0, unallocated: 0 };
  const groups = useMemo(() => data?.groups ?? [], [data]);
  const rowCount = useMemo(
    () => groups.reduce((total, group) => total + group.rows.length, 0),
    [groups],
  );
  const shortfall = useMemo(() => data?.shortfall ?? [], [data]);
  // Only `ready_to_allocate` lines are ones the sweep can fill, so the CTA
  // appears exactly when pressing it would change something. A button that
  // reliably reports "0 units reserved" teaches the operator to stop pressing
  // it — which is how the real shortfall stops being read.
  const sweepable = useMemo(
    () => shortfall.filter((row) => row.blocker === 'ready_to_allocate').length,
    [shortfall],
  );
  const sweep = useAllocationSweep();

  const selectScope = useCallback(
    (next: PickListScope | 'orders') => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('scope', next);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams],
  );

  // Pair state: the order whose rows the tote sheet will assign. The unit
  // list is every allocated row of that order IN THIS LIST — an unallocated
  // line has no serial to pair, which is exactly the shortfall the banner
  // counts.
  const [pairOrder, setPairOrder] = useState<PickListRow | null>(null);
  const pairUnits = useMemo<PairToteUnit[]>(
    () =>
      pairOrder
        ? groups
            .flatMap((group) => group.rows)
            .filter((row) => row.orderId === pairOrder.orderId)
            .map((row) => ({ serialUnitId: row.serialUnitId, serialNumber: row.serialNumber }))
        : [],
    [groups, pairOrder],
  );

  // The picker session is the existing detail surface for a pick; this queue
  // adds no second one. Allocation rows carry no shipping identity, so the
  // to-ship sheet cannot read them.
  const openRow = useCallback(
    (row: PickListRow) => {
      router.push(`/m/pick/${encodeURIComponent(String(row.orderId))}`);
    },
    [router],
  );

  // Group headers only earn their line on `all`, where rows from several
  // pickers share one list. On `mine` and `unpaired` every row has the same
  // owner, so a repeated name is noise between the shelf numbers.
  const showGroupHeaders = scope === 'all';

  return (
    <div data-testid="pick-queue" className="flex h-full min-h-full flex-col bg-surface-card">
      <div className="bg-surface-card">
        <Inset space="chip">
          <ScopeTabs scope={scope} counts={counts} onSelect={selectScope} />
        </Inset>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-surface-card">
        <Inset space="chip">
          {scope === 'orders' ? (
            // Dogfood (operator 2026-09-15): the to-ship feed, on the pick
            // page, on the SAME card — any order tappable, so the card can be
            // iterated against real data. Tapping opens the pick session for
            // the order; Ship stays a to-ship-queue verb, so the CTA is off.
            orderRows.length === 0 ? (
              <p className="text-role-caption text-text-muted">No orders in the feed.</p>
            ) : (
              <ul className="flex flex-col">
                {orderRows.map((row) => (
                  <li key={row.entityId}>
                    <ItemCardRow
                      title={row.title}
                      imageUrl={row.imageUrl}
                      qty={row.quantity}
                      price={toShipPriceText(row)}
                      deadlineAt={row.deadlineAt}
                      onOpen={() =>
                        router.push(`/m/pick/${encodeURIComponent(String(row.orderId ?? row.entityId))}`)
                      }
                      ariaLabel={row.title}
                      primary={null}
                    />
                  </li>
                ))}
              </ul>
            )
          ) : isPending ? (
            <p className="text-role-caption text-text-muted">Loading…</p>
          ) : isError ? (
            <EmptyState
              tone="danger"
              title="Couldn't load the pick list"
              description="Pull back to this screen to retry."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {rowCount === 0 ? <PickQueueEmpty scope={scope} counts={counts} /> : null}
              {groups.map((group) => (
                <section key={group.staffId ?? 'unpaired'}>
                  {showGroupHeaders ? (
                    <h2
                      data-testid="pick-queue-group"
                      className="mb-1.5 px-1 text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft"
                    >
                      {group.staffId === null
                        ? 'Unpaired · anyone can claim'
                        : (group.staffName ?? `Staff ${group.staffId}`)}
                    </h2>
                  ) : null}
                  <ul className="flex flex-col">
                    {group.rows.map((row) => (
                      <li key={row.allocationId}>
                        <PickQueueRow row={row} onOpen={openRow} onPair={setPairOrder} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {shortfall.length > 0 ? (
                <ShortfallBand
                  rows={shortfall}
                  total={counts.unallocated}
                  sweepable={sweepable}
                  sweeping={sweep.isPending}
                  sweepError={sweep.error?.message ?? null}
                  onSweep={() => sweep.mutate()}
                  onOpen={(row) => router.push(`/m/orders/${encodeURIComponent(String(row.orderId))}`)}
                />
              ) : null}
            </div>
          )}
        </Inset>
      </div>

      <PickPairToteSheet
        open={pairOrder != null}
        onClose={() => setPairOrder(null)}
        orderLabel={pairOrder?.orderNumber ?? ''}
        units={pairUnits}
      />
    </div>
  );
}

/**
 * The unallocated half of the pick list.
 *
 * Reads AFTER the walkable rows on purpose: a picker with a shelf to visit must
 * not scroll past 70 things they cannot pick to reach the 3 they can.
 *
 * Rows are the SAME {@link ItemCardRow} the walkable rows and `/m/work` paint,
 * so a line does not change identity when it becomes pickable. The card's
 * `location` slot carries the blocker in warning ink — the slot already means
 * "where is this unit", and for these rows the honest answer is why there
 * isn't one. There is no per-row CTA: nothing here is pickable, and a row of
 * disabled buttons teaches the thumb to ignore the band.
 *
 * Tapping opens the ORDER record, not a picker session: a session over an order
 * with no allocation is the empty shell, which is the dead end this band
 * exists to replace.
 */
function ShortfallBand({
  rows,
  total,
  sweepable,
  sweeping,
  sweepError,
  onSweep,
  onOpen,
}: {
  rows: readonly PickListShortfallRow[];
  /** Exact count; `rows` may be truncated by the query's valve. */
  total: number;
  sweepable: number;
  sweeping: boolean;
  sweepError: string | null;
  onSweep: () => void;
  onOpen: (row: PickListShortfallRow) => void;
}) {
  return (
    <section data-testid="pick-queue-shortfall">
      <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
        {/* "Order lines", not "orders": the demand side is line-grained, so one
            marketplace order number can be several rows here. */}
        <h2 className="min-w-0 text-role-eyebrow font-semibold uppercase tracking-widest text-text-warning">
          {total} order {total === 1 ? 'line has' : 'lines have'} no unit
        </h2>
        {sweepable > 0 ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={onSweep}
            disabled={sweeping}
            data-testid="pick-queue-sweep"
          >
            {sweeping ? 'Reserving…' : `Reserve ${sweepable}`}
          </Button>
        ) : null}
      </div>
      {sweepError ? (
        <p className="mb-1.5 px-1 text-role-caption text-text-danger" role="alert">
          {sweepError}
        </p>
      ) : null}
      <ul className="flex flex-col">
        {rows.map((row) => (
          <li key={row.orderId}>
            <ItemCardRow
              title={row.productTitle ?? row.sku ?? row.orderNumber}
              imageUrl={row.imageUrl}
              location={BLOCKER_LABEL[row.blocker]}
              locationTone="text-text-warning"
              itemNumber={row.itemNumber}
              qty={row.qty}
              price={formatSalePrice(row.saleAmount, row.currency) || null}
              deadlineAt={row.deadlineAt}
              onOpen={() => onOpen(row)}
              ariaLabel={`${row.orderNumber} — ${BLOCKER_LABEL[row.blocker]}`}
              primary={null}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Two genuinely different absences, in the order a picker can act on them.
 *
 * An allocated unit sitting in another scope outranks everything: telling
 * someone the floor is empty while a claimable unit sits one tab away sends
 * them to look for the supervisor instead of at the shelf.
 *
 * There is no "waiting on stock" branch any more. The shortfall used to be a
 * headline here because it had nowhere else to live; {@link ShortfallBand}
 * renders those lines as rows below, and an EmptyState that announces a count
 * the very next element lists is the screen contradicting itself.
 */
function PickQueueEmpty({ scope, counts }: { scope: PickListScope; counts: PickListCounts }) {
  if (counts.all > 0) {
    return (
      <div data-testid="pick-queue-empty">
        <EmptyState
          icon={<Inbox className="h-6 w-6 text-text-soft" />}
          title={scope === 'mine' ? 'Nothing on your list' : 'Nothing in this view'}
          description={
            counts.unpaired > 0
              ? `${counts.unpaired} allocated ${counts.unpaired === 1 ? 'unit is' : 'units are'} unpaired — open Unpaired to claim one.`
              : 'Every allocated unit belongs to another picker. Open All to see the floor.'
          }
        />
      </div>
    );
  }
  return (
    <div data-testid="pick-queue-empty">
      <EmptyState
        icon={<Inbox className="h-6 w-6 text-text-soft" />}
        title="Nothing to pick"
        description="Every allocated unit has been picked."
      />
    </div>
  );
}

export default function RedesignedMobilePickQueue() {
  return (
    <div className={`h-full overflow-hidden ${TOKENS.colors.background}`}>
      <Suspense
        fallback={
          <Inset space="field">
            <p className="text-role-caption text-text-muted">Loading…</p>
          </Inset>
        }
      >
        <PickQueueScreen />
      </Suspense>
    </div>
  );
}
