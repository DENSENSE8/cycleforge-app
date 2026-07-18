'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SidebarShell } from '@/components/layout/SidebarShell';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { ScanOutStationBar } from '@/components/outbound/scan-out/ScanOutStationBar';
import { OutboundDockStatusLegend } from '@/components/outbound/scan-out/OutboundDockStatusLegend';
import { stagedOrdersQuery } from '@/lib/queries/outbound-queries';
import { useOutboundUrlState } from '@/hooks/useOutboundUrlState';
import { SearchBar } from '@/components/ui/SearchBar';

/** Scan-out mode sidebar — filter, staging count, and dock scan bar (list lives in the right pane). */
export function ScanOutModeBody() {
  const { q, setQ } = useOutboundUrlState();
  const [searchInput, setSearchInput] = useState(q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stagedQuery = useQuery(stagedOrdersQuery({ searchQuery: q }));

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  const commitSearch = useCallback(
    (value: string) => setQ(value),
    [setQ],
  );

  const handleInputChange = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => commitSearch(value), 300);
    },
    [commitSearch],
  );

  return (
    <SidebarShell
      headerAbove={
        // In-context list filter — local base SearchBar over the staged queue.
        // The dock ScanOutStationBar in the footer is a scan-first input, untouched.
        // Global header pill stays global.
        <div className={`${SIDEBAR_GUTTER} pt-3 pb-2`}>
          <SearchBar
            size="compact"
            variant="blue"
            value={searchInput}
            onChange={handleInputChange}
            onClear={() => {
              setSearchInput('');
              commitSearch('');
            }}
            onSearch={commitSearch}
            placeholder="Filter staged packages…"
            isSearching={stagedQuery.isFetching}
          />
        </div>
      }
      headerBelow={
        <div className={`${SIDEBAR_GUTTER} pb-1`}>
          {/* Count lives on the “At dock” chip — no second ready-to-scan headline. */}
          <OutboundDockStatusLegend />
        </div>
      }
      bodyClassName="flex min-h-0 flex-1 flex-col"
      footer={
        <div className="border-t border-border-hairline bg-surface-card pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <ScanOutStationBar autoFocus />
        </div>
      }
    >
      {/* Empty scroll body — shell flex-1 keeps the dock bar pinned to the bottom. */}
      <div aria-hidden className="min-h-0 flex-1" />
    </SidebarShell>
  );
}
