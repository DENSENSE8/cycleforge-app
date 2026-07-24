'use client';

/**
 * Local Pickup sidebar rail — the LCPU orders navigator, mirroring the Unbox
 * recent rail (row = one pickup order: PO# + customer + item count + status).
 * Selecting an order writes `?lcpu=<orderId>` so the right-pane
 * {@link PickupWorkspace} highlights that order's product rows (URL-as-state,
 * the Workbench contract). Sourced from the same `usePickupLines` feed.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Loader2, ShoppingCart } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { usePickupLines, groupPickupLines, pickupMoney } from './pickup-lines';

export function PickupSidebarRail() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = Number(searchParams.get('lcpu')) || null;

  const { data: lines, isLoading, isError } = usePickupLines();
  const groups = groupPickupLines(lines ?? []);

  const selectOrder = (orderId: number) => {
    const next = new URLSearchParams(searchParams.toString());
    if (selected === orderId) next.delete('lcpu');
    else next.set('lcpu', String(orderId));
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border-hairline px-3 py-2">
        <span className="text-role-eyebrow font-black uppercase tracking-widest text-text-muted">
          Local Pickup
        </span>
        {groups.length > 0 ? (
          <span className="text-role-eyebrow font-black uppercase tracking-widest text-text-faint">
            {groups.length}
          </span>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {isError ? (
          <div className="m-3 rounded-xl border border-dashed border-rose-200 bg-rose-50 px-3 py-4 text-center text-role-caption font-bold text-rose-700">
            Couldn't load pickups.
          </div>
        ) : isLoading ? (
          <div className="flex items-center gap-2 justify-center py-8 text-role-caption font-bold text-text-soft">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : groups.length === 0 ? (
          <div className="m-3 rounded-xl border border-dashed border-border-soft bg-surface-sunken px-3 py-6 text-center text-role-caption font-semibold text-text-soft">
            No local pickup orders yet.
          </div>
        ) : (
          <ul className="divide-y divide-border-hairline">
            {groups.map((g) => {
              const isSel = g.orderId === selected;
              return (
                <li key={g.orderId}>
                  {/* ds-raw-button: full-row rail select — not a Button shape */}
                  <button
                    type="button"
                    onClick={() => selectOrder(g.orderId)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors',
                      isSel
                        ? 'bg-blue-50 ring-1 ring-inset ring-blue-400'
                        : 'hover:bg-surface-hover',
                    )}
                  >
                    <ShoppingCart className="h-3.5 w-3.5 shrink-0 text-text-faint" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-role-caption font-bold text-text-default">
                        {g.poNumber}
                      </div>
                      <div className="truncate text-role-eyebrow font-semibold uppercase tracking-widest text-text-muted">
                        {g.customer || 'Local pickup'}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-role-caption font-black tabular-nums text-text-default">
                        {pickupMoney(String(g.totalValue))}
                      </div>
                      <div className="text-role-eyebrow font-black uppercase tracking-widest text-text-faint">
                        {g.itemCount} item{g.itemCount === 1 ? '' : 's'}
                      </div>
                    </div>
                    <span
                      className={cn(
                        'ml-1 inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-role-micro font-black uppercase tracking-widest ring-1 ring-inset',
                        g.orderStatus === 'COMPLETED'
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                          : 'bg-amber-50 text-amber-700 ring-amber-200',
                      )}
                    >
                      {g.orderStatus === 'COMPLETED' ? 'Done' : 'Draft'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
