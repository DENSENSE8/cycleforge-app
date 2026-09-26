'use client';

/** useOrgNavItems — the sidebar nav list with the per-org override applied (operator-surfaces refactor Phase 4). */

import { useQuery } from '@tanstack/react-query';
import {
  getSidebarNavItems,
  type GetSidebarNavItemsOpts,
  type SidebarNavItem,
} from '@/lib/sidebar-navigation';
import { mergeOrgNav, parseNavDefinition, type NavDefinition } from '@/lib/nav/org-nav';

async function fetchOrgNav(): Promise<NavDefinition | null> {
  try {
    const res = await fetch('/api/nav', { cache: 'no-store' });
    if (!res.ok) return null;
    const json = (await res.json()) as { definition?: unknown };
    return json?.definition ? parseNavDefinition(json.definition) : null;
  } catch {
    return null;
  }
}

export function orgNavQuery() {
  return {
    queryKey: ['org-nav'] as const,
    queryFn: fetchOrgNav,
    // Nav changes on publish; long staleTime, no refetch loop.
    staleTime: 5 * 60_000,
  };
}

export function useOrgNavDefinition(): NavDefinition | null {
  const { data } = useQuery(orgNavQuery());
  return data ?? null;
}

export function useOrgNavItems(opts: GetSidebarNavItemsOpts = {}): SidebarNavItem[] {
  const definition = useOrgNavDefinition();
  return mergeOrgNav(getSidebarNavItems(opts), definition);
}
