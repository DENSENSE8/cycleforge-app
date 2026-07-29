'use client';

/**
 * Local Pickup sidebar rail — the LCPU orders navigator (row = one pickup
 * order: PO# + customer + item count + total). Composes the generic
 * {@link SidebarRecentRailBase} rail engine (fetch · optimistic · keyboard-nav ·
 * stagger · snapshot), typed to {@link PickupOrderGroup} — NOT a hand-rolled
 * `<ul>`, and NOT the receiving-line rail (LCPU orders are a distinct entity).
 *
 * Selecting an order writes `?lcpu=<orderId>` so the right-pane
 * {@link PickupWorkspace} highlights that order's product rows (URL-as-state, the
 * Workbench contract).
 */

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ShoppingCart } from '@/components/Icons';
import { SidebarRecentRailBase } from '@/components/sidebar/rail-shell/SidebarRecentRailBase';
import { RailRowBody } from '@/components/sidebar/rail-shell/RailRowBody';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';
import { groupPickupLines, pickupMoney, type PickupLine, type PickupOrderGroup } from './pickup-lines';

// Stable module-scope callbacks — the rail shell wires these into a listener
// effect; a fresh arrow each render would tear it down + re-add every re-render.
const getGroupOrderId = (g: PickupOrderGroup) => g.orderId;
const getGroupActivityAt = (g: PickupOrderGroup) => g.pickupDate;
const getGroupStatusDot = (g: PickupOrderGroup) =>
  g.orderStatus === 'COMPLETED' ? 'bg-emerald-500' : 'bg-amber-400';
const getGroupStatusLabel = (g: PickupOrderGroup) =>
  g.orderStatus === 'COMPLETED' ? 'Done' : 'Draft';

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
      railInset="gutter"
      staggerRevealMotion="sidebar"
      eyebrowTitle="Local Pickup"
      emptyText="No local pickup orders yet."
      getId={getGroupOrderId}
      getActivityAt={getGroupActivityAt}
      onSelect={selectOrder}
      getStatusDot={getGroupStatusDot}
      getStatusDotLabel={getGroupStatusLabel}
      renderRowMain={(g) => <PickupRailRowMain group={g} />}
    />
  );
}

function PickupRailRowMain({ group }: { group: PickupOrderGroup }) {
  const title = group.poNumber;
  return (
    <RailRowBody
      vm={{
        title: (
          <span className="flex min-w-0 items-center gap-1.5">
            <ShoppingCart className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden />
            <span className="min-w-0 truncate">{title}</span>
          </span>
        ),
        titleAttr: title,
        meta: (
          <span className="flex min-w-0 items-center gap-1 font-semibold uppercase tracking-widest text-text-soft">
            <span className="truncate">{group.customer || 'Local pickup'}</span>
          </span>
        ),
        metaTrailing: (
          <HoverTooltip label={`${group.itemCount} item${group.itemCount === 1 ? '' : 's'}`} asChild focusable={false}>
            <span className="flex shrink-0 items-center gap-1.5 tabular-nums">
              <span className={cn('font-semibold text-text-default')}>{pickupMoney(String(group.totalValue))}</span>
              <span className="text-text-faint">·</span>
              <span className="text-text-faint">{group.itemCount}</span>
            </span>
          </HoverTooltip>
        ),
      }}
    />
  );
}
