'use client';

/**
 * Support · Tickets sidebar map — recently selected dock only.
 *
 * Full queue + status tabs live in the right-pane workbench (`SupportTicketsBoard`).
 * Mirrors Unbox's short Unboxed recent dock / Dashboard Search recents.
 * Footer: TechRailSearchBar + status/priority facets (recent-rail filter SoT).
 */

import { useMemo, useState } from 'react';
import { History, TicketHelp } from '@/components/Icons';
import { Button, EmptyState } from '@/design-system/primitives';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { SidebarRailScrollport } from '@/components/sidebar/rail-shell/SidebarRailScrollport';
import { SearchField } from '@/design-system/primitives/SearchField';
import {
  EMPTY_SUPPORT_RECENT_RAIL_FACETS,
  matchesSupportRecentRailFacets,
  SupportRecentRailFilters,
  type SupportRecentRailFacets,
} from '@/components/sidebar/rail-shell/SupportRecentRailFilters';
import { useRecentTickets } from '@/hooks/useRecentTickets';
import { useSupportTicketParam } from '@/hooks/useSupportTicketParam';
import { cn } from '@/utils/_cn';
import { SupportTicketRow } from './SupportTicketRow';

export function SupportTicketsRecentRail() {
  const { ticketId: selectedId, setTicket } = useSupportTicketParam();
  const { recents, clear } = useRecentTickets();
  const [filterText, setFilterText] = useState('');
  const [facets, setFacets] = useState<SupportRecentRailFacets>(
    EMPTY_SUPPORT_RECENT_RAIL_FACETS,
  );

  const filtered = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    return recents.filter((r) => {
      if (!matchesSupportRecentRailFacets(r, facets)) return false;
      if (!q) return true;
      const hay = [r.subject, r.status, r.priority, String(r.id)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [recents, filterText, facets]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-card">
      <div className={cn(SIDEBAR_GUTTER, 'flex shrink-0 items-center justify-between gap-2 py-2')}>
        <p className="flex items-center gap-1 text-role-micro uppercase tracking-widest text-text-faint">
          <History className="h-3 w-3" />
          Recent · {filtered.length}
        </p>
        {recents.length > 0 ? (
          <Button variant="ghost" size="sm" onClick={clear} className="h-6 px-1.5 text-role-micro">
            Clear
          </Button>
        ) : null}
      </div>

      <SidebarRailScrollport>
        {filtered.length === 0 ? (
          <div className="px-3 py-6">
            <EmptyState
              icon={<TicketHelp className="h-5 w-5 text-text-faint" />}
              title={recents.length === 0 ? 'No recent tickets' : 'No matching tickets'}
              description={
                recents.length === 0
                  ? 'Open a ticket from the queue — it will show up here.'
                  : 'Clear the filter or try a different status / priority.'
              }
            />
          </div>
        ) : (
          <div className="divide-y divide-border-hairline">
            {filtered.map((r) => (
              <SupportTicketRow
                key={r.id}
                id={r.id}
                subject={r.subject}
                status={r.status}
                priority={r.priority}
                // The dock's axis is when THIS operator opened the ticket, not when the
                // ticket last changed — `RecentTicket.at` is a ms epoch stamped at open.
                at={new Date(r.at).toISOString()}
                selected={r.id === selectedId}
                onSelect={() => setTicket(r.id)}
              />
            ))}
          </div>
        )}
      </SidebarRailScrollport>

      <SearchField
        value={filterText}
        onChange={setFilterText}
        placeholder="Filter recent…"
        rightElement={
          <SupportRecentRailFilters facets={facets} onChange={setFacets} />
        }
        />
    </div>
  );
}
