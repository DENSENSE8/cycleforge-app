'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NavRecentRow } from '@/lib/nav/context/schema';
import { fetchNavRecents, postNavRecent } from '@/lib/nav/context/http-client';
import { getNavRecentSurface } from '@/lib/nav/recents/surfaces';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { SPINE_LABEL_CLASS } from '@/components/sidebar/sidebar-spine';
import { cn } from '@/utils/_cn';
import { NavSlotError } from './NavSlotError';

const RECENTS_STALE_MS = 30_000;

/**
 * `NavContext.recents` — `GET recents.endpoint` rows. Opening a row on a
 * `nav_recents`-backed surface records the open (`POST /api/nav/recents`);
 * adapter surfaces are read-only feeds.
 */
export function NavRecentsList({ endpoint, surface }: { endpoint: string; surface: string }) {
  const queryClient = useQueryClient();
  const queryKey = ['nav-recents', endpoint] as const;
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchNavRecents(endpoint, signal),
    staleTime: RECENTS_STALE_MS,
  });
  const writable = getNavRecentSurface(surface)?.source === 'nav_recents';

  const recordOpen = (row: NavRecentRow) => {
    if (!writable) return;
    void postNavRecent({
      surface,
      entityType: row.entityType,
      entityId: row.entityId,
      label: row.title,
    })
      .then(() => queryClient.invalidateQueries({ queryKey }))
      .catch(() => undefined);
  };

  return (
    <SidebarGroup className="py-1">
      <SidebarGroupLabel>Recent</SidebarGroupLabel>
      <SidebarGroupContent>
        {query.isError && !query.data ? (
          <NavSlotError label="Recents unavailable" onRetry={() => void query.refetch()} />
        ) : !query.data ? (
          <div className="flex flex-col gap-1.5 px-2.5 py-1">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : query.data.length === 0 ? (
          <p className="px-2.5 py-1 text-role-caption text-text-faint">Nothing opened yet</p>
        ) : (
          <SidebarMenu>
            {query.data.map((row) => (
              <SidebarMenuItem key={row.id}>
                <SidebarMenuButton asChild>
                  <Link href={row.href} prefetch={false} onClick={() => recordOpen(row)}>
                    <span className={cn('min-w-0 flex-1 truncate', SPINE_LABEL_CLASS)} title={row.title}>
                      {row.title}
                    </span>
                    {row.subtitle ? (
                      <span className="shrink-0 truncate text-role-micro text-text-faint">{row.subtitle}</span>
                    ) : null}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        )}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
