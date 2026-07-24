'use client';

/**
 * Sales sidebar — the desk mode rail + Walk-In station deep-links.
 *
 * The **mode rail** (`WalkInModeSlider` → `?mode=`) is the surface's primary
 * navigation: Local Pickup · Sales. The per-mode **table tabs** live in
 * the page chrome (`WalkInDeskHeader` → `WorkbenchChromeHeader`) — modes ≠ tabs.
 *
 * Below the rail sits the one thing a history Monitor can't do — start work.
 * Sales is observe-only; every action here hands off to the station (Repair
 * intake → Receiving `/repair`).
 */

import { useRouter } from 'next/navigation';
import { DollarSign, Package, ShoppingCart, Wrench } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { WalkInModeSlider } from '@/components/walk-in/WalkInModeSlider';
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

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface-card">
      <div className={`border-b border-border-hairline ${SIDEBAR_GUTTER} pt-4 pb-3`}>
        <p className={`${sectionLabel} text-emerald-600`}>Sales</p>
        <h2 className={`mt-1 ${cardTitle}`}>Transaction history</h2>
        <p className="mt-1 text-role-micro text-text-soft">
          Every completed front-desk transaction. Start a new job on the station.
        </p>
        <div className="mt-3">
          <WalkInModeSlider />
        </div>
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
