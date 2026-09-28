'use client';

/** useOrgNavItems — the sidebar nav list with the per-org override applied (operator-surfaces refactor Phase 4). */

import { useQuery } from '@tanstack/react-query';
import {
  getSidebarNavItems,
  type GetSidebarNavItemsOpts,
  type SidebarNavItem,
} from '@/lib/sidebar-navigation';
import { mergeOrgNav, parseNavDefinition, type NavDefinition } from '@/lib/nav/org-nav';
import { withCapabilityGate } from '@/lib/capabilities/nav-gate';

async function fetchOrgNav(): Promise<NavDefinition | null> {
  try {
    const res = await fetch('/api/nav', { cache: 'no-store' });
    if (!res.ok) return null;
    const json = (await res.json()) as { definition?: unknown; capabilityHidden?: string[] };
    const stored = json?.definition ? parseNavDefinition(json.definition) : null;
    // SIMPLE-FIRST: rows of capabilities the org has not unlocked ride as hidden entries.
    return withCapabilityGate(stored, json?.capabilityHidden);
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
