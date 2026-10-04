'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useQueries } from '@tanstack/react-query';
import type { NavItem, NavSection } from '@/lib/nav/context/schema';
import { fetchNavFacets, NavHttpError } from '@/lib/nav/context/http-client';
import { isNavFacetContext } from '@/lib/nav/facets/contexts';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { registerShortcutOverviewGroup } from '@/lib/keyboard/shortcut-overview';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { AnimatedStat } from '@/design-system/components/AnimatedStat';
import { SIDEBAR_CHIP_CORNER } from '@/design-system/tokens/radius';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import { cn } from '@/utils/_cn';
import { navRowGlyph, type Glyph } from './NavSectionList';
import { NavSwitcherMenu } from './NavSwitcherMenu';
import { publishKeyPressed } from './go-keys-store';
import { useNavStaffKey } from '@/lib/nav/context/use-nav-staff-key';

/** A view's unfiltered count revalidates at most this often. */
const VIEW_COUNT_STALE_MS = 20_000;

/**
 * Each view's unfiltered total — `GET /api/nav/facets?context=<pageId.itemId>`
 * with only the view's own href params, never the filters applied on screen.
 * Nav items stay count-free; a view without a facet context gets no entry.
 * The key matches `NavFilters`' facets query, so the lit view's unfiltered
 * fetch is shared.
 */
export function useViewCounts(pageId: string, items: readonly NavItem[]) {
  const staffKey = useNavStaffKey();
  const specs = items.flatMap((item) => {
    const context = `${pageId}.${item.id}`;
    if (!isNavFacetContext(context)) return [];
    return [{ itemId: item.id, context, search: new URL(item.href, 'http://nav.local').searchParams.toString() }];
  });
  const results = useQueries({
    queries: specs.map((spec) => ({
      queryKey: ['nav-facets', staffKey, spec.context, spec.search],
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
export function useViewHotkeys(items: readonly NavItem[], enabled: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled || items.length < 2) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      // An open overlay (a record, a popover) owns the keyboard.
      if (isEditableKeyTarget(event.target) || hasOpenOverlay()) return;
      const item = /^[1-9]$/.test(event.key) ? items[Number(event.key) - 1] : undefined;
      if (!item) return;
      event.preventDefault();
      publishKeyPressed(`view:${item.id}`);
      if (!item.active) router.push(item.href);
    };
    window.addEventListener('keydown', onKeyDown);
    // The `?` / ⌘⇧? sheet lists this page's view keys while they are bound.
    const unregister = registerShortcutOverviewGroup({
      id: 'sidebar-views',
      title: 'Views on this page',
      rows: items.slice(0, 9).map((item, index) => ({ keys: [String(index + 1)], label: item.label })),
    });
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      unregister();
    };
  }, [items, enabled, router]);
}

/**
 * The page's VIEW (Allocate · Exceptions · Shipped on
 * FBM; any page's views elsewhere) — the CHILD tier, pinned in the
 * sidebar head under the mode. At rest one block naming the view you are on
 * and its count (an alerting view beacons on it). Hover shows every view's
 * digit beside the sidebar when the page binds them (`viewKeys`, from its
 * `NAV_PAGE_DECLS` entry — a digit is painted only where bound); click hangs
 * the OTHER views in an overlay (`NavSwitcherMenu`). One view is no choice:
 * nothing renders.
 */
export function NavViewSwitcher({
  sections,
  pageId,
  viewKeys,
}: {
  sections: readonly NavSection[];
  pageId: string;
  /** `NavContext.viewKeys` — bind and paint bare `1`–`9`. */
  viewKeys: boolean;
}) {
  const painted = useMemo(() => sections.flatMap((section) => section.items), [sections]);
  useViewHotkeys(painted, viewKeys);
  const counts = useViewCounts(pageId, painted);
  if (painted.length < 2) return null;
  const current = painted.find((item) => item.active);
  const currentGlyph = current ? navRowGlyph(current, pageId) : null;
  const alerts = painted.filter((item) => {
    const count = counts[item.id];
    return item !== current && navRowGlyph(item, pageId)?.alertCount && count !== undefined && count > 0;
  });
  return (
    <NavSwitcherMenu
      current={{
        label: current?.label ?? 'View',
        icon: currentGlyph?.icon,
        iconTone: currentGlyph?.tone,
        trailing: (
          <>
            {alerts.map((item) => (
              <AlertBeacon key={item.id} id={item.id} glyph={navRowGlyph(item, pageId)} count={counts[item.id] ?? 0} />
            ))}
            {current && current.id in counts ? <CountChip id={current.id} count={counts[current.id]} alert={currentGlyph?.alertCount} /> : null}
          </>
        ),
      }}
      // The view you are on is the block itself — never listed twice (the
      // parent card follows the same rule).
      rows={painted
        .filter((item) => item !== current)
        .map((item) => {
          const glyph = navRowGlyph(item, pageId);
          return {
            id: item.id,
            href: item.href,
            label: item.label,
            icon: glyph?.icon,
            iconTone: glyph?.tone,
            trailing: item.id in counts ? <CountChip id={item.id} count={counts[item.id]} alert={glyph?.alertCount} /> : null,
            selected: false,
          };
        })}
      hint={
        viewKeys
          ? painted.slice(0, 9).map((item, index) => {
              const glyph = navRowGlyph(item, pageId);
              return {
                id: item.id,
                keys: [String(index + 1)],
                pressedId: `view:${item.id}`,
                label: item.label,
                icon: glyph?.icon,
                iconTone: glyph?.tone,
                current: item === current,
              };
            })
          : []
      }
    />
  );
}

/**
 * A view's unfiltered total, right-aligned; amber only for a view flagged
 * `alertCount` (Exceptions) while > 0. The slot's width is held while loading.
 */
export function CountChip({ id, count, alert }: { id: string; count: number | undefined; alert?: boolean }) {
  return (
    <span className="flex min-w-7 shrink-0 justify-end">
      {count !== undefined ? (
        <span
          data-nav-view-count={id}
          className={cn(
            'px-1.5 py-0.5 text-role-micro font-medium tabular-nums',
            SIDEBAR_CHIP_CORNER,
            alert && count > 0
              ? 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200'
              : 'bg-surface-sunken text-text-muted',
          )}
        >
          <AnimatedStat value={count} profile="scanQuantity" />
        </span>
      ) : null}
    </span>
  );
}

/**
 * Another view's alert, on the closed block: its glyph and count in amber,
 * so "Exceptions: 12" is seen without opening anything.
 */
function AlertBeacon({ id, glyph, count }: { id: string; glyph: Glyph | null; count: number }) {
  const Icon = glyph?.icon;
  return (
    <span
      aria-hidden
      data-nav-view-alert={id}
      className={cn(
        'flex shrink-0 items-center gap-0.5 bg-amber-50 px-1 py-0.5 text-role-micro font-medium tabular-nums text-amber-700 ring-1 ring-inset ring-amber-200',
        SIDEBAR_CHIP_CORNER,
      )}
    >
      {Icon ? <Icon className={navIconStrokeClass('size-3')} /> : null}
      <AnimatedStat value={count} profile="scanQuantity" />
    </span>
  );
}
