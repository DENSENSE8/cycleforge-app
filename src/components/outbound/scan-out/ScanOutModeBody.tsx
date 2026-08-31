'use client';

/**
 * Scan-out mode sidebar — filter, recent ship-out rail, and dock scan bar.
 * The center pane is idle scan-await / carton workbench (not a staged queue).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { SidebarShell } from '@/components/layout/SidebarShell';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { ScanOutStationBar } from '@/components/outbound/scan-out/ScanOutStationBar';
import { ScanOutRecentRail } from '@/components/outbound/scan-out/ScanOutRecentRail';
import { SearchBar } from '@/components/ui/SearchBar';

export function ScanOutModeBody() {
  const [filterText, setFilterText] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const commitFilter = useCallback((value: string) => setFilterText(value), []);

  const handleInputChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => commitFilter(value), 200);
    },
    [commitFilter],
  );

  return (
    <SidebarShell
      headerAbove={
        <div className={`${SIDEBAR_GUTTER} pt-3 pb-2`}>
          <SearchBar
            size="compact"
            variant="blue"
            value={searchInput}
            onChange={handleInputChange}
            onClear={() => {
              setSearchInput('');
              commitFilter('');
            }}
            onSearch={commitFilter}
            placeholder="Filter ship-outs…"
          />
        </div>
      }
      bodyClassName="flex min-h-0 flex-1 flex-col"
      footer={
        <div className="border-t border-border-hairline bg-surface-card pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <ScanOutStationBar autoFocus />
        </div>
      }
    >
      <ScanOutRecentRail filterText={filterText} />
    </SidebarShell>
  );
}
