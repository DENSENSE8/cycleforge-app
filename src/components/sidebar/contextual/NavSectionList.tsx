'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useQueries } from '@tanstack/react-query';
import type { NavItem, NavSection } from '@/lib/nav/context/schema';
import { fetchNavFacets, NavHttpError } from '@/lib/nav/context/http-client';
import { isNavFacetContext } from '@/lib/nav/facets/contexts';
import { LayoutGroup, motion } from '@/design-system/motion';
import { motionTransition } from '@/design-system/foundations/motion-presets';
import { useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { AnimatedStat } from '@/design-system/components/AnimatedStat';
import { KeyboardKey } from '@/design-system/primitives';
import { SIDEBAR_CHIP_CORNER } from '@/design-system/tokens/radius';
import { SidebarGroup, SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar';
import { ChevronRight } from '@/components/Icons';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { APP_SIDEBAR_NAV, getSidebarPageNav } from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';
import { NAV_BLOCK_CLASS, NAV_BLOCK_PLATE_CLASS } from './nav-block';
import { NAV_VIEW_ICONS } from './nav-view-icons';
import { useLaneDoorHref } from './useLaneDoorHref';

type Glyph = { icon: React.ComponentType<{ className?: string }>; tone: string; alertCount?: true };

/** A view's unfiltered count revalidates at most this often. */
const VIEW_COUNT_STALE_MS = 20_000;

/**
 * Page panels whose views answer bare `1`–`9`, in painted order. Opt-in per
 * page because a record's decision bar (`EvidenceDecisionBar`) owns bare 1–4
 * on the pages that mount it; the Shipping desk binds no bare digit.
 */
const VIEW_HOTKEY_PAGES: Readonly<Record<string, true>> = { outbound: true };

/**
 * A row's glyph. Page panel: the view's state glyph (`NAV_VIEW_ICONS`). Page
 * map: the page's own nav icon — for a lane door that is the lane's parent
 * icon, the same one the landing page registers.
 */
function glyphFor(item: NavItem, pageId: string | undefined): Glyph | null {
  if (pageId !== undefined) return NAV_VIEW_ICONS[`${pageId}.${item.id}`] ?? null;
  const icon = APP_SIDEBAR_NAV.find((row) => row.id === item.id)?.icon ?? getSidebarPageNav(item.id)?.icon;
  return icon ? { icon, tone: 'text-text-muted' } : null;
}

/**
 * Each view's unfiltered total — `GET /api/nav/facets?context=<pageId.itemId>`
 * with only the view's own href params, never the filters applied on screen.
 * Nav items stay count-free; a view without a facet context gets no entry.
 * The key matches `NavFilters`' facets query, so the lit view's unfiltered
 * fetch is shared.
 */
function useViewCounts(pageId: string | undefined, items: readonly NavItem[]) {
  const specs =
    pageId === undefined
      ? []
      : items.flatMap((item) => {
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
 * `NavContext.sections` as pressable blocks — ONE renderer for both levels,
 * so backing out with `‹` keeps the same face:
 * - page panel (`pageId` set): the page's views, each led by its state glyph,
 *   then its digit keycap (bare `1`–`9`, HOTKEY FIRST) on opted-in pages, and
 *   its unfiltered total right-aligned (facets `total`, see `useViewCounts`);
 * - page map (`pageId` unset): the lanes and pages, each led by its nav icon;
 *   a `drill` row carries a chevron; a remembering lane door opens the
 *   staffer's last view there (`useLaneDoorHref`).
 *
 * Every row is `NAV_BLOCK_CLASS` (flat, lifts on hover, sinks on press).
 * Categories are separated by a HAIRLINE, never a text heading (operator
 * 2026-09-27): a line falls before and after each multi-row category, so
 * runs of single-row lanes read as one list. The category name stays as the
 * group's accessible name. ONE lit plate per level (`layoutId`) slides to
 * the row you pick. `NavItem` itself never carries a count.
 *
 * `onActiveSelect` lets the `‹` peek treat a click on the lit row as "go back
 * down" without a navigation (the URL already is that page).
 */
export function NavSectionList({
  sections,
  onActiveSelect,
  activeRowRef,
  pageId,
}: {
  sections: readonly NavSection[];
  onActiveSelect?: () => void;
  activeRowRef?: React.Ref<HTMLAnchorElement>;
  /** Set on a page's own panel; unset renders the page map. */
  pageId?: string;
}) {
  const visible = sections.filter((section) => section.items.length > 0);
  const painted = useMemo(
    () => sections.flatMap((section) => section.items),
    [sections],
  );
  const hotkeys = pageId !== undefined && VIEW_HOTKEY_PAGES[pageId] === true;
  useViewHotkeys(painted, hotkeys);
  const counts = useViewCounts(pageId, painted);
  const doorHref = useLaneDoorHref();
  return (
    <LayoutGroup id={pageId ? `nav-views:${pageId}` : 'nav-map'}>
      {visible.map((section, index) => {
        const previous = visible[index - 1];
        const hairline = previous !== undefined && (Boolean(section.label) || Boolean(previous.label));
        return (
          <SidebarGroup key={section.id} aria-label={section.label} className="gap-px px-2 py-0.5">
            {hairline ? <div role="separator" className="mx-2 mb-1.5 mt-1 h-px bg-border-hairline" /> : null}
            <SidebarMenu>
              {section.items.map((item) => {
                const order = painted.indexOf(item);
                return (
                  <NavItemRow
                    key={item.id}
                    item={item}
                    href={pageId === undefined ? (doorHref(item.id) ?? item.href) : item.href}
                    glyph={glyphFor(item, pageId)}
                    hotkey={hotkeys && order < 9 ? String(order + 1) : undefined}
                    countSlot={item.id in counts}
                    count={counts[item.id]}
                    onActiveSelect={onActiveSelect}
                    activeRowRef={item.active ? activeRowRef : undefined}
                  />
                );
              })}
            </SidebarMenu>
          </SidebarGroup>
        );
      })}
    </LayoutGroup>
  );
}

function NavItemRow({
  item,
  href,
  glyph,
  hotkey,
  countSlot,
  count,
  onActiveSelect,
  activeRowRef,
}: {
  item: NavItem;
  href: string;
  glyph: Glyph | null;
  hotkey: string | undefined;
  /** The view has a count; its width is held while it loads. */
  countSlot: boolean;
  count: number | undefined;
  onActiveSelect?: () => void;
  activeRowRef?: React.Ref<HTMLAnchorElement>;
}) {
  const plateTransition = useMotionTransition(motionTransition.sliderIndicator);
  const interceptActive = item.active && onActiveSelect;
  return (
    <SidebarMenuItem>
      <Link
        ref={activeRowRef}
        href={href}
        prefetch={false}
        aria-current={item.active ? 'page' : undefined}
        aria-keyshortcuts={hotkey}
        className={cn(NAV_BLOCK_CLASS, 'h-8 text-role-body', item.active && 'font-medium')}
        onClick={
          interceptActive
            ? (event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                event.preventDefault();
                onActiveSelect();
              }
            : undefined
        }
      >
        {item.active ? (
          <motion.span aria-hidden layoutId="nav-row-plate" transition={plateTransition} className={NAV_BLOCK_PLATE_CLASS} />
        ) : null}
        {glyph ? (
          <span aria-hidden className="flex shrink-0">
            <glyph.icon className={navIconStrokeClass(cn('size-4', glyph.tone))} />
          </span>
        ) : null}
        {hotkey ? (
          <KeyboardKey aria-hidden size="xs">
            {hotkey}
          </KeyboardKey>
        ) : null}
        <span className="min-w-0 flex-1 truncate" title={item.label}>
          {item.label}
        </span>
        {item.badge === 'beta' ? (
          <span className="shrink-0 text-role-micro font-semibold uppercase tracking-wider text-text-faint">Beta</span>
        ) : null}
        {countSlot ? (
          <span className="flex min-w-7 shrink-0 justify-end">
            {count !== undefined ? (
              <span
                data-nav-view-count={item.id}
                className={cn(
                  'px-1.5 py-0.5 text-role-micro font-medium tabular-nums',
                  SIDEBAR_CHIP_CORNER,
                  glyph?.alertCount && count > 0
                    ? 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200'
                    : 'bg-surface-sunken text-text-muted',
                )}
              >
                <AnimatedStat value={count} speed="fast" />
              </span>
            ) : null}
          </span>
        ) : null}
        {item.kind === 'drill' ? <ChevronRight aria-hidden className="size-3.5 shrink-0 text-text-faint" /> : null}
      </Link>
    </SidebarMenuItem>
  );
}
