'use client';

/**
 * Local Pickup sidebar rail — the LCPU orders navigator (row = one pickup
 * order). Composes the generic {@link SidebarRecentRailBase} rail engine
 * (fetch · optimistic · keyboard-nav · stagger · snapshot), typed to
 * {@link PickupOrderGroup}. Row content comes from {@link pickupOrderToRailVM}
 * (Unbox/Pack rail anatomy — plain title + meta, no cart icon / price trail).
 *
 * Selecting an order writes `?lcpu=<orderId>` so the right-pane
 * {@link PickupWorkspace} highlights that order's product rows (URL-as-state).
 */

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { SidebarRecentRailBase } from '@/components/sidebar/rail-shell/SidebarRecentRailBase';
import { RailRowBody } from '@/components/sidebar/rail-shell/RailRowBody';
import { groupPickupLines, type PickupLine, type PickupOrderGroup } from './pickup-lines';
import {
  getPickupOrderStatusDot,
  getPickupOrderStatusDotLabel,
  pickupOrderToRailVM,
} from './pickup-order-rail-vm';

// Stable module-scope callbacks — the rail shell wires these into a listener
// effect; a fresh arrow each render would tear it down + re-add every re-render.
const getGroupOrderId = (g: PickupOrderGroup) => g.orderId;
const getGroupActivityAt = (g: PickupOrderGroup) => g.pickupDate;

async function fetchPickupOrderGroups(): Promise<PickupOrderGroup[]> {
  const res = await fetch('/api/local-pickup-orders/lines?limit=500', { cache: 'no-store' });
  if (!res.ok) throw new Error(`Pickup lines failed (HTTP ${res.status})`);
  const data = (await res.json()) as { lines?: PickupLine[] };
  return groupPickupLines(Array.isArray(data.lines) ? data.lines : []);
}

export function PickupSidebarRail() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = Number(searchParams.get('lcpu')) || null;

  const selectOrder = useCallback(
    (g: PickupOrderGroup) => {
      const next = new URLSearchParams(searchParams.toString());
      if (selected === g.orderId) next.delete('lcpu');
      else next.set('lcpu', String(g.orderId));
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams, selected],
  );

  return (
    <SidebarRecentRailBase<PickupOrderGroup>
      queryKey={['local-pickup-orders-rail']}
      fetchFn={fetchPickupOrderGroups}
      selectedId={selected}
      limit={200}
      preserveServerOrder
      staggerRevealMotion="sidebar"
      eyebrowTitle="Local Pickup"
      emptyText="No local pickup orders yet."
      getId={getGroupOrderId}
      getActivityAt={getGroupActivityAt}
      onSelect={selectOrder}
      getStatusDot={getPickupOrderStatusDot}
      getStatusDotLabel={getPickupOrderStatusDotLabel}
      renderRowMain={(g) => <RailRowBody vm={pickupOrderToRailVM(g)} />}
    />
  );
}
