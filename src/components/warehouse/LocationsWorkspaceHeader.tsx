'use client';

/**
 * Inventory › Locations — Band 1 tabs (Bin Tags · Racks · Rooms · Bins · Map).
 * Composes `WorkbenchChromeHeader density="band"` like Unbox / FBA.
 *
 * House Band-1 law (Unbox golden · To-ship desk exemplar): fixed process tabs
 * for every staffer — never Chrome-style unpin of a system stage · Pin-list cube
 * omitted (honest absence — no closed foreign-collection catalog) · no page Views
 * (honest absence; if added they mount on Band 3, never Band-1 leading) · page-pin
 * in GlobalHeader. Three pin scopes never share a trigger/store. SoT:
 * source-of-truth.md → Workbench Band-1 strip · Left-edge → SCOPE decides its home.
 */

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { WorkbenchChromeHeader } from '@/components/dashboard/workbench-shell';
import {
  parseLocationsTab,
  type LocationsTab,
} from '@/lib/inventory/locations-path';
import { cn } from '@/utils/_cn';

const TABS: {
  id: LocationsTab;
  label: string;
  color: 'blue' | 'orange' | 'purple' | 'emerald' | 'gray';
}[] = [
  { id: 'labels', label: 'Bin Tags', color: 'blue' },
  { id: 'racks', label: 'Racks', color: 'orange' },
  { id: 'rooms', label: 'Rooms', color: 'purple' },
  { id: 'bins', label: 'Bins', color: 'emerald' },
  { id: 'map', label: 'Map', color: 'gray' },
];

export function LocationsWorkspaceHeader({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseLocationsTab(searchParams.get('tab'));

  const tabs = useMemo(
    () =>
      TABS.map((t) => ({
        id: t.id,
        label: t.label,
        color: t.color,
        dividerBefore: t.id === 'map',
      })),
    [],
  );

  const onSelectTab = useCallback(
    (next: LocationsTab) => {
      // Construct — drop sibling facet state (room/code/status/…) on tab change.
      const params = new URLSearchParams();
      if (next !== 'labels') params.set('tab', next);
      const staff = searchParams.get('staff') ?? searchParams.get('staffId');
      if (staff) params.set('staff', staff);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    <WorkbenchChromeHeader
      density="band"
      tabs={tabs}
      activeTab={tab}
      onTabChange={(id) => onSelectTab(id as LocationsTab)}
      solidTone="accent"
      className={cn('rounded-none border-l-0 border-t-0 shadow-sm', className)}
    />
  );
}
