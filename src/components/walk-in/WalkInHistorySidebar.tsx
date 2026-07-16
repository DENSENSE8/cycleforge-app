'use client';

/**
 * Walk-In history sidebar — category jump + station deep-links.
 * Replaces the former repairs/sales task sidebar on `/walk-in`.
 */

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DollarSign, Package, ShoppingCart, Wrench } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import {
  DEFAULT_WALK_IN_HISTORY_CATEGORY,
  parseWalkInHistoryCategory,
  type WalkInHistoryCategory,
} from '@/lib/walk-in/history-categories';
import { walkInStationHref } from '@/lib/walk-in/jobs';
import { sectionLabel, cardTitle } from '@/design-system/tokens/typography/presets';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';

const STATION_LINKS: Array<{
  job: 'sales' | 'pickup' | 'repair';
  label: string;
  hint: string;
  icon: (props: { className?: string }) => JSX.Element;
}> = [
  {
    job: 'sales',
    label: 'New sale',
    hint: 'Square terminal charge',
    icon: DollarSign,
  },
  {
    job: 'pickup',
    label: 'Local pickup',
    hint: 'Seller drop-off intake',
    icon: Package,
  },
  {
    job: 'repair',
    label: 'Repair intake',
    hint: 'Identify or new ticket',
    icon: Wrench,
  },
];

export function WalkInHistorySidebar() {
  const router = useRouter();
  const pathname = usePathname() ?? '/walk-in';
  const searchParams = useSearchParams();
  const category = parseWalkInHistoryCategory(
    searchParams.get('category') ?? searchParams.get('tab'),
  );

  const setCategory = useCallback(
    (next: WalkInHistoryCategory) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('mode');
      params.delete('tab');
      if (next === DEFAULT_WALK_IN_HISTORY_CATEGORY) params.delete('category');
      else params.set('category', next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-card">
      <div className={`border-b border-border-hairline ${SIDEBAR_GUTTER} pt-4 pb-3`}>
        <p className={`${sectionLabel} text-emerald-600`}>Walk-In</p>
        <h2 className={`mt-1 ${cardTitle}`}>History</h2>
        <p className="mt-1 text-role-micro text-text-soft">
          Recently completed front-desk work. Start a new job on the station.
        </p>
      </div>

      <div className={`space-y-1 border-b border-border-hairline ${SIDEBAR_GUTTER} py-3`}>
        {(
          [
            ['repairs', 'Repairs picked up'],
            ['sales', 'Sales'],
            ['pickups', 'Local pickups'],
          ] as const
        ).map(([id, label]) => {
          const active = category === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setCategory(id)}
              className={`flex w-full items-center rounded-lg px-2.5 py-2 text-left text-sm font-semibold transition-colors ${
                active
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'text-text-soft hover:bg-surface-canvas hover:text-text-default'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className={`min-h-0 flex-1 space-y-2 overflow-y-auto ${SIDEBAR_GUTTER} py-3`}>
        <p className="text-role-eyebrow uppercase tracking-widest text-text-faint">
          Station
        </p>
        {STATION_LINKS.map(({ job, label, hint, icon: Icon }) => (
          <button
            key={job}
            type="button"
            onClick={() =>
              router.push(
                job === 'repair'
                  ? walkInStationHref('repair', { new: 'true' })
                  : walkInStationHref(job),
              )
            }
            className="flex w-full items-start gap-2.5 rounded-xl border border-border-soft bg-surface-canvas/40 px-3 py-2.5 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50/40"
          >
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700">
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-text-default">{label}</span>
              <span className="block text-role-micro text-text-soft">{hint}</span>
            </span>
          </button>
        ))}
      </div>

      <div className={`border-t border-border-hairline ${SIDEBAR_GUTTER} py-3`}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="w-full gap-1.5"
          onClick={() => router.push(walkInStationHref('pickup'))}
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          Open Walk-In station
        </Button>
      </div>
    </div>
  );
}
