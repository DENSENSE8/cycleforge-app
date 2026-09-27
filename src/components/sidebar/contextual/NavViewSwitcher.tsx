'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useQueries } from '@tanstack/react-query';
import type { NavItem, NavSection } from '@/lib/nav/context/schema';
import { fetchNavFacets, NavHttpError } from '@/lib/nav/context/http-client';
import { isNavFacetContext } from '@/lib/nav/facets/contexts';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import { navRowGlyph } from './NavSectionList';
import { NavSwitcherMenu, type NavSwitcherGroup } from './NavSwitcherMenu';

/** A view's unfiltered count revalidates at most this often. */
const VIEW_COUNT_STALE_MS = 20_000;

/**
 * Page panels whose views answer bare `1`–`9`, in painted order. Opt-in per
 * page because a record's decision bar (`EvidenceDecisionBar`) owns bare 1–4
 * on the pages that mount it; the Shipping desk binds no bare digit.
 */
const VIEW_HOTKEY_PAGES: Readonly<Record<string, true>> = { outbound: true };

/**
 * Each view's unfiltered total — `GET /api/nav/facets?context=<pageId.itemId>`
 * with only the view's own href params, never the filters applied on screen.
 * Nav items stay count-free; a view without a facet context gets no entry.
 * The key matches `NavFilters`' facets query, so the lit view's unfiltered
 * fetch is shared.
 */
function useViewCounts(pageId: string, items: readonly NavItem[]) {
  const specs = items.flatMap((item) => {
    const context = `${pageId}.${item.id}`;
    if (!isNavFacetContext(context)) return [];
    return [{ itemId: item.id, context, search: new URL(item.href, 'http://nav.local').searchParams.toString() }];
  });
  const results = useQueries({
    queries: specs.map((spec) => ({
      queryKey: ['nav-facets', spec.context, spec.search],
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchNavFacets(spec.context, spec.search, signal),
      staleTime: VIEW_COUNT_STALE_MS,
      placeholderData: keepPreviousData,
      // A view the caller cannot read (403) stays count-less; don't retry it.
      retry: (failures: number, error: Error) =>
        !(error instanceof NavHttpError && error.status < 500) && failures < 2,
    })),
  });
  const slots: Record<string, number | undefined> = {};
  specs.forEach((spec, index) => {
    slots[spec.itemId] = results[index]?.data?.total;
  });
  return slots;
}

/** Bare `1`–`9` open the panel's views in painted order (never while typing). */
function useViewHotkeys(items: readonly NavItem[], enabled: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (isEditableKeyTarget(event.target)) return;
      const item = /^[1-9]$/.test(event.key) ? items[Number(event.key) - 1] : undefined;
      if (!item) return;
      event.preventDefault();
      if (!item.active) router.push(item.href);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [items, enabled, router]);
}

/**
 * The page's VIEW (Exceptions · PO paired · Pick list · To ship · Shipped) —
 * pinned in the head under the mode switcher. A view is changed rarely, so at
 * rest it is one block naming the view you are on, with its count; hover or
 * Enter opens every view to the right of the sidebar (`NavSwitcherMenu`),
 * each led by its state glyph, then its digit key on opted-in pages, then its
 * unfiltered total. Bare `1`–`9` work whether or not the menu is open.
 * One view is no choice: nothing renders.
 */
export function NavViewSwitcher({ sections, pageId }: { sections: readonly NavSection[]; pageId: string }) {
  const painted = useMemo(() => sections.flatMap((section) => section.items), [sections]);
  const hotkeys = VIEW_HOTKEY_PAGES[pageId] === true;
  useViewHotkeys(painted, hotkeys);
  // The `?` / ⌘⇧? sheet lists this page's view keys while it is mounted.
  useEffect(() => {
    if (!hotkeys || painted.length < 2) return undefined;
    return registerShortcutOverviewGroup({
      id: 'sidebar-views',
      title: 'Views on this page',
      rows: painted.slice(0, 9).map((item, index) => ({ keys: [String(index + 1)], label: item.label })),
    });
  }, [hotkeys, painted]);
  const counts = useViewCounts(pageId, painted);
  if (painted.length < 2) return null;
  const groups: NavSwitcherGroup[] = sections
    .filter((section) => section.items.length > 0)
    .map((section) => ({
      id: section.id,
      label: section.label,
      entries: section.items.map((item) => {
        const order = painted.indexOf(item);
        const digit = hotkeys && order < 9 ? String(order + 1) : undefined;
        return {
          item,
          glyph: navRowGlyph(item, pageId),
          keys: digit ? [digit] : undefined,
          ariaKeys: digit,
          countSlot: item.id in counts,
          count: counts[item.id],
        };
      }),
    }));
  return <NavSwitcherMenu kind="view" name="View" groups={groups} currentId={painted.find((item) => item.active)?.id} />;
}
