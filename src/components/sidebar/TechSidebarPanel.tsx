'use client';

import { useCallback, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { stripCrossSurfaceParams } from '@/lib/surface-isolation';
import { useQueryClient } from '@tanstack/react-query';
import { sidebarHeaderPillRowClass } from '@/components/layout/header-shell';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import { TestingSidebarPanel } from '@/components/sidebar/TestingSidebarPanel';
import { ShippingSidebarPanel } from '@/components/sidebar/ShippingSidebarPanel';
import { HorizontalButtonSlider } from '@/components/ui/HorizontalButtonSlider';
import { useMasterNavEnabled } from '@/components/sidebar/master-nav';
import { useActiveStaffDirectory } from './hooks';
import {
  TECH_TOP_MODE_ITEMS,
  type TechSidebarTopMode,
} from './tech-station-view-config';

interface TechSidebarPanelProps {
  techId: string;
  /** Opens the main app page list in the sidebar (Main / Stations / More) — same as the desktop sidebar chevron, not a route to `/dashboard`. */
  onBackToAppNav?: () => void;
  /** Label next to the chevron (e.g. "Testing"). */
  contextNavTitle?: string;
}

export function TechSidebarPanel({ techId, onBackToAppNav: _onBackToAppNav }: TechSidebarPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const basePath = pathname || '/test';
  const staffDirectory = useActiveStaffDirectory();
  const masterNavEnabled = useMasterNavEnabled();

  const techMember = staffDirectory.find((m) => String(m.id) === String(techId));
  const techName = techMember?.name || 'Technician';
  const viewParam = searchParams.get('view');
  const topMode: TechSidebarTopMode =
    viewParam === 'testing' || viewParam === 'testing-history' ? 'testing' : 'shipping';

  useEffect(() => {
    const v = searchParams.get('view');
    if (v !== 'manual' && v !== 'update-manuals' && v !== 'testing-history') return;
    const nextParams = new URLSearchParams(searchParams.toString());
    if (v === 'testing-history') {
      nextParams.set('view', 'testing');
    } else {
      nextParams.delete('view');
    }
    nextParams.set('staffId', techId);
    const nextSearch = nextParams.toString();
    router.replace(nextSearch ? `${basePath}?${nextSearch}` : basePath);
  }, [searchParams, router, techId, basePath]);

  const updateTopMode = (next: TechSidebarTopMode) => {
    const nextParams = stripCrossSurfaceParams(
      basePath,
      new URLSearchParams(searchParams.toString()),
    );
    nextParams.set('staffId', techId);
    if (next === 'testing') {
      nextParams.set('view', 'testing');
      nextParams.delete('ship');
      nextParams.delete('search');
      nextParams.delete('searchOpen');
    } else {
      const v = nextParams.get('view');
      if (v === 'testing' || v === 'testing-history') nextParams.delete('view');
      nextParams.delete('testTab');
    }
    const nextSearch = nextParams.toString();
    router.replace(nextSearch ? `${basePath}?${nextSearch}` : basePath);
  };

  const refreshHistory = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['tech-logs'] });
  }, [queryClient]);

  return (
    <div className={`relative flex h-full w-full flex-col overflow-hidden ${appChromeClass}`}>
      {!masterNavEnabled && (
        <div className={sidebarHeaderPillRowClass}>
          <HorizontalButtonSlider
            items={TECH_TOP_MODE_ITEMS}
            value={topMode}
            onChange={(next) => updateTopMode(next as TechSidebarTopMode)}
            variant="nav"
            dense
            className="w-full"
            aria-label="Tech sidebar mode"
          />
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {topMode === 'shipping' ? (
          <ShippingSidebarPanel
            techId={techId}
            techName={techName}
            staffId={techId}
            onComplete={refreshHistory}
          />
        ) : (
          <TestingSidebarPanel staffId={techId} />
        )}
      </div>
    </div>
  );
}
