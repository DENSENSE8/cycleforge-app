'use client';

/**
 * Sales — the overall front-desk transaction history.
 *
 * Archetype: **Monitor** (contextual-display.md) — observe-only, org-scoped, no
 * durable selection; the category is an ephemeral URL filter
 * (`?category=all|sales|pickups|repairs`, default `all`). Active intake lives on
 * the Walk-In station (`/pickup?job=`), so nothing here edits.
 *
 * Composition is the golden workbench recipe (`DashboardScrollShell` +
 * `WORKBENCH_CHROME_COLUMN` + `WORKBENCH_BODY_COLUMN`), identical to
 * `DashboardOrdersView`: pinned tab chrome OUTSIDE the scroll port, then a body
 * of KPI strip (scrolls away) → full-bleed day-banded feed. The day bands are
 * therefore the only sticky layer inside the port — no offset math.
 *
 * All four tabs render ONE feed filtered by kind; there is no per-category table.
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DashboardScrollShell } from '@/components/dashboard/DashboardScrollShell';
import {
  WORKBENCH_BODY_COLUMN,
  WORKBENCH_CHROME_COLUMN,
} from '@/components/dashboard/workbench-shell';
import { SalesWorkspaceHeader } from '@/components/walk-in/SalesWorkspaceHeader';
import { SalesKpiStrip } from '@/components/walk-in/SalesKpiStrip';
import { SalesTransactionsFeed } from '@/components/walk-in/SalesTransactionsFeed';
import { useWalkInTransactions } from '@/hooks/useWalkInTransactions';
import {
  DEFAULT_WALK_IN_HISTORY_CATEGORY,
  WALK_IN_HISTORY_ITEMS,
  parseWalkInHistoryCategory,
  type WalkInHistoryCategory,
} from '@/lib/walk-in/history-categories';
import {
  countTransactions,
  filterTransactions,
  summarizeTransactions,
} from '@/lib/walk-in/transactions';
import { walkInStationHref } from '@/lib/walk-in/jobs';

const EMPTY_MESSAGE: Record<WalkInHistoryCategory, string> = {
  all: 'No front-desk transactions yet.',
  sales: 'No walk-in sales yet.',
  pickups: 'No completed local pickups yet.',
  repairs: 'No repairs picked up yet.',
};

function categoryFromParams(searchParams: URLSearchParams): WalkInHistoryCategory {
  const category = searchParams.get('category');
  if (category) return parseWalkInHistoryCategory(category);
  // Legacy tab/mode without category stays category-scoped; anything else → all.
  if (searchParams.get('mode') === 'sales') return 'sales';
  return parseWalkInHistoryCategory(searchParams.get('tab'));
}

export function WalkInHistoryHub() {
  const router = useRouter();
  const pathname = usePathname() ?? '/walk-in';
  const searchParams = useSearchParams();
  const category = categoryFromParams(searchParams);
  const { rows, isLoading, isError, refetch } = useWalkInTransactions();

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

  const counts = useMemo(() => countTransactions(rows), [rows]);
  const visible = useMemo(() => filterTransactions(rows, category), [rows, category]);
  const rollup = useMemo(() => summarizeTransactions(visible), [visible]);

  const openStation = useCallback(
    () => router.push(walkInStationHref('pickup')),
    [router],
  );

  const categoryLabel =
    WALK_IN_HISTORY_ITEMS.find((item) => item.id === category)?.label ?? 'All';

  return (
    <DashboardScrollShell
      chrome={
        <div className={WORKBENCH_CHROME_COLUMN}>
          <SalesWorkspaceHeader
            category={category}
            onSelectCategory={setCategory}
            counts={counts}
            onOpenStation={openStation}
          />
        </div>
      }
    >
      <div className={WORKBENCH_BODY_COLUMN}>
        <div className="mb-4">
          <SalesKpiStrip
            rollup={rollup}
            isLoading={isLoading}
            label={category === 'all' ? 'Transactions' : categoryLabel}
          />
        </div>

        <SalesTransactionsFeed
          rows={visible}
          isLoading={isLoading}
          isError={isError}
          refetch={refetch}
          emptyMessage={EMPTY_MESSAGE[category]}
        />
      </div>
    </DashboardScrollShell>
  );
}
