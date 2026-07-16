'use client';

/**
 * Categorized Walk-In history — recently completed front-desk work.
 * Category via `?category=repairs|sales|pickups` (default repairs).
 */

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { HorizontalButtonSlider } from '@/components/ui/HorizontalButtonSlider';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { WorkbenchTablePane } from '@/components/dashboard/workbench-shell';
import { RepairTable } from '@/components/repair';
import { Button } from '@/design-system/primitives';
import { ExternalLink } from '@/components/Icons';
import {
  DEFAULT_WALK_IN_HISTORY_CATEGORY,
  WALK_IN_HISTORY_ITEMS,
  parseWalkInHistoryCategory,
  type WalkInHistoryCategory,
} from '@/lib/walk-in/history-categories';
import { walkInStationHref } from '@/lib/walk-in/jobs';
import { formatMoney } from '@/components/work-orders/localPickupStore';
import { formatCentsToDollars } from '@/lib/square/client';
import { toPSTDateKey, formatDateKeyMedium } from '@/utils/date';

type SaleRow = {
  id: string;
  customer_name: string | null;
  total: number | null;
  status: string;
  order_source: string;
  created_at: string;
  line_items: Array<{ name: string; quantity: string }>;
};

type PickupOrderRow = {
  id: number;
  pickup_date: string;
  customer_name: string | null;
  status: string;
  item_count: number;
  total_value: string;
  completed_at: string | null;
  created_at: string;
};

function categoryFromParams(searchParams: URLSearchParams): WalkInHistoryCategory {
  const category = searchParams.get('category');
  if (category) return parseWalkInHistoryCategory(category);
  // Legacy tab/mode without category → repairs history (or sales tab label).
  if (searchParams.get('mode') === 'sales') return 'sales';
  return parseWalkInHistoryCategory(searchParams.get('tab'));
}

export function WalkInHistoryHub() {
  const router = useRouter();
  const pathname = usePathname() ?? '/walk-in';
  const searchParams = useSearchParams();
  const category = categoryFromParams(searchParams);

  const setCategory = useCallback(
    (next: WalkInHistoryCategory) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('mode');
      params.delete('tab');
      params.delete('new');
      params.delete('openRepair');
      if (next === DEFAULT_WALK_IN_HISTORY_CATEGORY) {
        params.delete('category');
      } else {
        params.set('category', next);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-surface-card">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border-hairline px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
            Walk-In
          </p>
          <h2 className="text-role-caption font-black uppercase tracking-tight text-text-default">
            Recent activity
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1.5"
            onClick={() => router.push(walkInStationHref('pickup'))}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open station
          </Button>
          <div className="w-[min(100%,22rem)]">
            <HorizontalButtonSlider
              items={WALK_IN_HISTORY_ITEMS}
              value={category}
              onChange={(id) => setCategory(id as WalkInHistoryCategory)}
              variant="segmented"
              className="w-full"
              aria-label="Walk-In history category"
            />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {category === 'repairs' ? (
          <RepairTable filter="done" />
        ) : category === 'sales' ? (
          <SalesHistoryTable />
        ) : (
          <PickupsHistoryTable />
        )}
      </div>
    </div>
  );
}

function SalesHistoryTable() {
  const { data: rows = [], isLoading } = useQuery<SaleRow[]>({
    queryKey: ['walk-in-history-sales'],
    queryFn: async () => {
      const res = await fetch('/api/walk-in/sales?orderSource=walk_in_sale&limit=100', {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Failed to load sales');
      const data = (await res.json()) as { rows?: SaleRow[] };
      return data.rows ?? [];
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="lg" className="text-emerald-600" />
      </div>
    );
  }

  return (
    <WorkbenchTablePane>
      <div className="overflow-auto">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-border-hairline bg-surface-card text-role-micro uppercase tracking-wider text-text-soft">
            <tr>
              <th className="px-4 py-2.5 font-bold">When</th>
              <th className="px-4 py-2.5 font-bold">Customer</th>
              <th className="px-4 py-2.5 font-bold">Items</th>
              <th className="px-4 py-2.5 font-bold text-right">Total</th>
              <th className="px-4 py-2.5 font-bold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-faint">
                  No recent walk-in sales
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const day = toPSTDateKey(row.created_at);
                const itemSummary = row.line_items
                  ?.slice(0, 2)
                  .map((li) => `${li.quantity}× ${li.name}`)
                  .join(', ');
                const more =
                  (row.line_items?.length ?? 0) > 2
                    ? ` +${row.line_items.length - 2}`
                    : '';
                return (
                  <tr
                    key={row.id}
                    className="border-b border-border-hairline/80 hover:bg-surface-canvas/50"
                  >
                    <td className="px-4 py-2.5 tabular-nums text-text-soft">
                      {day ? formatDateKeyMedium(day, { weekday: 'none' }) : '—'}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-text-default">
                      {row.customer_name?.trim() || 'Walk-in'}
                    </td>
                    <td className="max-w-[18rem] truncate px-4 py-2.5 text-text-soft">
                      {itemSummary || '—'}
                      {more}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-text-default">
                      {row.total != null ? formatCentsToDollars(row.total) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-text-soft">{row.status}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </WorkbenchTablePane>
  );
}

function PickupsHistoryTable() {
  const { data: rows = [], isLoading } = useQuery<PickupOrderRow[]>({
    queryKey: ['walk-in-history-pickups'],
    queryFn: async () => {
      const res = await fetch('/api/local-pickup-orders?status=COMPLETED&limit=100', {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Failed to load pickups');
      const data = (await res.json()) as { orders?: PickupOrderRow[] };
      return data.orders ?? [];
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner size="lg" className="text-emerald-600" />
      </div>
    );
  }

  return (
    <WorkbenchTablePane>
      <div className="overflow-auto">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-border-hairline bg-surface-card text-role-micro uppercase tracking-wider text-text-soft">
            <tr>
              <th className="px-4 py-2.5 font-bold">Pickup date</th>
              <th className="px-4 py-2.5 font-bold">Customer</th>
              <th className="px-4 py-2.5 font-bold text-right">Items</th>
              <th className="px-4 py-2.5 font-bold text-right">Total</th>
              <th className="px-4 py-2.5 font-bold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-faint">
                  No completed local pickups
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border-hairline/80 hover:bg-surface-canvas/50"
                >
                  <td className="px-4 py-2.5 tabular-nums text-text-soft">
                    {row.pickup_date
                      ? formatDateKeyMedium(row.pickup_date, { weekday: 'none' })
                      : '—'}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-text-default">
                    {row.customer_name?.trim() || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-text-soft">
                    {row.item_count}
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-text-default">
                    {formatMoney(Number(row.total_value) || 0)}
                  </td>
                  <td className="px-4 py-2.5 text-text-soft">{row.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </WorkbenchTablePane>
  );
}
