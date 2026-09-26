'use client';

/** Sidebar for /sourcing. */

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SidebarShell } from '@/components/layout/SidebarShell';
import { sidebarHeaderPillRowClass, SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { HorizontalButtonSlider, type HorizontalSliderItem } from '@/components/ui/HorizontalButtonSlider';
import { resolveSourcingMode } from '@/components/sourcing/sourcing-shared';
import { SearchBar } from '@/components/ui/SearchBar';
// Ex-admin sourcing pickers, re-homed with their modes (admin dissolution).
import { BoseModelsSidebarPanel } from '@/components/admin/sourcing/BoseModelsSidebarPanel';
import { CompatibilitySidebarPanel } from '@/components/admin/sourcing/CompatibilitySidebarPanel';

const BY_ITEMS: HorizontalSliderItem[] = [
  { id: 'model', label: 'Model' },
  { id: 'serial', label: 'Serial' },
];
const ALERT_STATUS_ITEMS: HorizontalSliderItem[] = [
  { id: 'live', label: 'Open' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'dismissed', label: 'Dismissed' },
];
const WATCH_STATUS_ITEMS: HorizontalSliderItem[] = [
  { id: 'all', label: 'All' },
  { id: 'watching', label: 'Watching' },
  { id: 'ordered', label: 'Ordered' },
  { id: 'imported', label: 'Imported' },
];
const SUPPLIER_TYPE_ITEMS: HorizontalSliderItem[] = [
  { id: 'all', label: 'All' },
  { id: 'ebay_seller', label: 'eBay' },
  { id: 'distributor', label: 'Distributor' },
  { id: 'salvage', label: 'Salvage' },
  { id: 'oem', label: 'OEM' },
];

export function SourcingSidebarPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = resolveSourcingMode(searchParams.get('mode'));

  const setParam = useCallback(
    (mutator: (p: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutator(next);
      const qs = next.toString();
      router.replace(qs ? `/sourcing?${qs}` : '/sourcing');
    },
    [router, searchParams],
  );

  const q = searchParams.get('q') ?? '';
  const by = searchParams.get('by') === 'serial' ? 'serial' : 'model';
  const status = searchParams.get('status') ?? '';

  const onQueryChange = (v: string) =>
    setParam((p) => { if (v.trim()) p.set('q', v.trim()); else p.delete('q'); });
  const searchBar = (placeholder: string) => (
    <div key="search" className={`${SIDEBAR_GUTTER} pt-3 pb-2`}>
      <SearchBar
        size="compact"
        variant="blue"
        value={q}
        onChange={onQueryChange}
        onClear={() => setParam((p) => p.delete('q'))}
        placeholder={placeholder}
      />
    </div>
  );

  if (mode === 'scout') {
    return (
      <SidebarShell
        headerRows={[
          searchBar(by === 'serial' ? 'Scan or type a serial…' : 'Filter model number or name…'),
          <div key="by" className={sidebarHeaderPillRowClass}>
            <HorizontalButtonSlider
              items={BY_ITEMS}
              value={by}
              onChange={(next) => setParam((p) => p.set('by', next))}
              variant="nav"
              dense
              className="w-full"
              aria-label="Lookup by"
            />
          </div>,
        ]}
      >
        <p className="px-3 py-4 text-role-caption text-text-soft">
          {by === 'serial' ? 'Scan a serial to decode the model.' : 'Find a product or model to see compatible parts and stock.'}
        </p>
      </SidebarShell>
    );
  }

  if (mode === 'searches') {
    return (
      <SidebarShell>
        <p className="px-3 py-4 text-role-caption text-text-soft">
          Standing searches the scour watcher re-runs on a cadence to auto-fill the watchlist. Add one, then run, pause, or remove it.
        </p>
      </SidebarShell>
    );
  }

  if (mode === 'analytics') {
    return (
      <SidebarShell>
        <p className="px-3 py-4 text-role-caption text-text-soft">
          Acquisition spend, cost vs target, demand fill-rate, and time-to-source. Pick a range in the pane — the view is read-only.
        </p>
      </SidebarShell>
    );
  }

  if (mode === 'suppliers') {
    const type = searchParams.get('type') || 'all';
    return (
      <SidebarShell
        headerRows={[
          searchBar('Filter suppliers…'),
          <div key="type" className={sidebarHeaderPillRowClass}>
            <HorizontalButtonSlider
              items={SUPPLIER_TYPE_ITEMS}
              value={type}
              onChange={(next) => setParam((p) => { if (next === 'all') p.delete('type'); else p.set('type', next); })}
              variant="nav"
              dense
              className="w-full"
              aria-label="Supplier type"
            />
          </div>,
        ]}
      >
        <p className="px-3 py-4 text-role-caption text-text-soft">
          Sourcing suppliers ranked by spend. Pick a row in the pane to edit one, or use Add supplier.
        </p>
      </SidebarShell>
    );
  }

  // Absorbed from /admin (dissolution):
  if (mode === 'models') return <BoseModelsSidebarPanel />;
  if (mode === 'compatibility') return <CompatibilitySidebarPanel />;

  const statusItems = mode === 'queue' ? ALERT_STATUS_ITEMS : WATCH_STATUS_ITEMS;
  const sentinel = mode === 'queue' ? 'live' : 'all';
  const activeStatus = status === '' ? sentinel : status;

  return (
    <SidebarShell
      headerRows={[
        <div key="status" className={sidebarHeaderPillRowClass}>
          <HorizontalButtonSlider
            items={statusItems}
            value={activeStatus}
            onChange={(next) => setParam((p) => { if (next === sentinel) p.delete('status'); else p.set('status', next); })}
            variant="nav"
            dense
            className="w-full"
            aria-label={`${mode} status`}
          />
        </div>,
      ]}
    >
      <p className="px-3 py-4 text-role-caption text-text-soft">
        {mode === 'queue'
          ? 'Everything that needs sourcing — EOL, low/no stock, and replenish-on-sold. Resolve or dismiss with a reason.'
          : 'Saved candidates across channels. Import one into inventory to track its cost & condition.'}
      </p>
    </SidebarShell>
  );
}
