import { getSidebarPageNav, hasDeskPageChrome } from '@/lib/sidebar-navigation';
import {
  isKnownChildOrder,
  upsertChildOrder,
  type NavDefinition,
} from '@/lib/nav/org-nav';

export type ReorderDeskTabsError = 'UNKNOWN_PAGE' | 'NOT_TABBED' | 'UNKNOWN_IDS';

export function reorderDeskTabs(args: {
  pageId: string;
  orderedIds: readonly string[];
  current: NavDefinition | null | undefined;
}): { ok: true; definition: NavDefinition } | { ok: false; error: ReorderDeskTabsError } {
  const page = getSidebarPageNav(args.pageId);
  if (!page) return { ok: false, error: 'UNKNOWN_PAGE' };
  if (!hasDeskPageChrome(page)) return { ok: false, error: 'NOT_TABBED' };
  const known = (page.children ?? []).map((child) => child.id);
  if (!isKnownChildOrder(known, args.orderedIds)) {
    return { ok: false, error: 'UNKNOWN_IDS' };
  }
  return {
    ok: true,
    definition: upsertChildOrder(args.current, args.pageId, args.orderedIds),
  };
}
