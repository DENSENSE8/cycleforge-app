'use client';

import { useCallback, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import { TestingSidebarPanel } from '@/components/sidebar/TestingSidebarPanel';
import { ShippingSidebarPanel } from '@/components/sidebar/ShippingSidebarPanel';
import { useActiveStaffDirectory } from './hooks';
import { type TechSidebarTopMode } from './tech-station-view-config';

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

  const refreshHistory = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['tech-logs'] });
  }, [queryClient]);

  return (
    <div className={`relative flex h-full w-full flex-col overflow-hidden ${appChromeClass}`}>
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
