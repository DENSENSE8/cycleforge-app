'use client';

/**
 * The rail body for a MULTI-row selection — occupant `detail:order-batch`.
 *
 * Cardinality decides the rail body (`selection-occupancy.ts`): one row is the
 * existing `detail:order` inspector, which `GlobalDetailStackHost` already
 * mounts and which this component deliberately does not touch; exactly two is
 * `OrderRailCompare`; three or more is this shell.
 *
 * Phase 3 took the exactly-two case away from here — comparing two orders is a
 * divergence read, and a roster that just lists them answers a different
 * question. Phase 4 gives each roster row a `[×]` so the set can be refined
 * against the rows on screen.
 * Plan: `docs/todo/order-rail-selection-plane-PLAN.md`.
 */

import { useCallback, useMemo } from 'react';
import { DetailStackRailRegistrar } from '@/components/right-rail/DetailStackRailRegistrar';
import { emitToggleAll } from '@/lib/selection/table-selection';
import {
  isRailOccupantActive,
  resolveRailOccupancy,
} from '@/lib/right-rail/selection-occupancy';
import {
  RailActionRegion,
  RailSelectionBand,
  useRailActionSnapshot,
} from './OrderRailActions';
import { OrdersViewTopicsCluster } from '@/components/outbound/orders/OrdersViewTopicsCluster';
import {
  OrdersViewChromeBridge,
  useOrdersViewChromeOptional,
} from '@/components/outbound/orders/orders-view-chrome-context';

/** The few fields the roster reads. Satisfied by both outbound row shapes. */
type RosterRow = {
  id: number | string;
  order_id?: string | null;
  item_name?: string | null;
  product_title?: string | null;
  sku?: string | null;
};

function rosterTitle(row: RosterRow): string {
  const title = String(row.item_name || row.product_title || '').trim();
  if (title) return title;
  const sku = String(row.sku || '').trim();
  if (sku) return sku;
  // Honest absence — never a blank row, never an invented "Untitled order".
  return '—';
}

export function OrderRailShell() {
  const { scope, rows } = useRailActionSnapshot();
  const viewChrome = useOrdersViewChromeOptional();
  const occupancy = useMemo(
    () => resolveRailOccupancy((rows as RosterRow[]).map((r) => Number(r.id))),
    [rows],
  );

  // D4: closing the rail CLEARS the selection. With the capsule gone this is
  // the only dismissal affordance, and a rail that merely hid itself would
  // leave rows checked with nothing on screen saying so.
  const handleClose = useCallback(() => {
    if (scope) emitToggleAll(scope, 'none');
  }, [scope]);

  // 3+ only — exactly two is `OrderRailCompare`. Gated through the resolver's
  // own helper so the two registrars can never both claim the slot.
  const active = isRailOccupantActive(occupancy, 'attention');

  return (
    <DetailStackRailRegistrar
      // Stable per MODE, never per record — the host keys AnimatePresence on
      // this id, so folding the ids into it would exit/enter the whole panel on
      // every checkbox. See selection-occupancy.ts.
      id="detail:order-batch"
      enabled={active}
      onClose={handleClose}
      modal={false}
      edgeCollapse
      collapsedStrip={false}
      ariaLabel={`${rows.length} orders selected`}
    >
      <OrdersViewChromeBridge value={viewChrome}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-card">
        <RailSelectionBand onClose={handleClose} />
        {active && viewChrome ? (
          <div
            className="flex h-9 min-w-0 items-center justify-end gap-2 border-b border-border-hairline px-2"
            role="toolbar"
            aria-label="Orders view topics"
          >
            <OrdersViewTopicsCluster />
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <ul className="divide-y divide-border-soft">
            {(rows as RosterRow[]).map((row) => (
              <li key={String(row.id)} className="flex items-center gap-2 px-4 py-1.5">
                <span className="truncate text-role-caption font-semibold text-text-default">
                  {rosterTitle(row)}
                </span>
                <span className="ml-auto shrink-0 truncate text-role-eyebrow uppercase tracking-widest text-text-soft">
                  {String(row.order_id || '').trim() || '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <RailActionRegion />
      </div>
      </OrdersViewChromeBridge>
    </DetailStackRailRegistrar>
  );
}
