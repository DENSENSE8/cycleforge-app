'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { NavContext } from '@/lib/nav/context/schema';
import { fetchNavContext } from '@/lib/nav/context/http-client';
import { MASTER_NAV_TOGGLE_EVENT } from '@/lib/app-events';
import { AnimatePresence, motion } from '@/design-system/motion';
import { motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-presets-hooks';
import { SidebarContent, SidebarFooter, SidebarProvider } from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft } from '@/components/Icons';
import { SidebarCollapseControl } from '@/components/layout/SidebarCollapseControl';
import { TOP_CHROME_BAND_CLASS } from '@/components/layout/header-shell';
import { SPINE_SCROLLPORT_SCROLLBAR_CLASS } from '@/components/sidebar/sidebar-spine';
import { StaffAccountFooter } from '@/components/sidebar/master-nav/StaffAccountFooter';
import { cn } from '@/utils/_cn';
import {
  navContextQueryKey,
  useCurrentNavPath,
  useNavContext,
  useNavStaffKey,
} from './useNavContext';
import { NavSectionList } from './NavSectionList';
import { NavFilters } from './NavFilters';
import { NAV_BLOCK_CLASS } from './nav-block';
import { NavRecentsList } from './NavRecentsList';
import { NavFind, NavGlobalSearch } from './NavFind';
import { NavSlotError } from './NavSlotError';

/**
 * The contextual sidebar host (stage 5) — one host for every page whose
 * `NavContext.rollout` is `contextual`. Minimal by default; detail opens on
 * click (operator 2026-09-27):
 *
 * - pinned head: collapse · global search (the ⌘K palette's face); on a page
 *   panel also `‹ <Page>` and Find (`F`, the list on screen only). Pinned so
 *   search never scrolls away or hides while a record is open;
 * - scrolling body: the views as pressable blocks, then the closed filter
 *   rows. The view's verbs live in the page header, over the list they act
 *   on (`NavPageActions`). After `‹` the body shows the lane map
 *   (`?view=top`) with this page lit. `‹` is LOCAL state and never touches
 *   the URL; any URL change (links, back/forward) rebuilds from the URL;
 * - fixed footer: the staff account bar.
 *
 * Every slot renders only when its NavContext field is present, so a page
 * needs no host code of its own.
 */
export function ContextualSidebar() {
  const path = useCurrentNavPath();
  const staffKey = useNavStaffKey();
  const queryClient = useQueryClient();
  const page = useNavContext(path);
  const [peekTop, setPeekTop] = useState(false);
  const top = useNavContext(path, { view: 'top', enabled: peekTop });
  const backRowRef = useRef<HTMLButtonElement>(null);
  const litTopRowRef = useRef<HTMLAnchorElement>(null);
  const returnFocusToBack = useRef(false);

  // The URL is the state: a navigation always lands on that page's own panel.
  useEffect(() => {
    setPeekTop(false);
  }, [path]);

  const prefetchTop = () =>
    void queryClient.prefetchQuery({
      queryKey: navContextQueryKey(staffKey, path, 'top'),
      queryFn: ({ signal }) => fetchNavContext(path, { view: 'top', signal }),
      staleTime: 30_000,
    });

  const nav = page.data;
  const showTop = peekTop || nav?.scope === 'top';
  const body: NavContext | undefined = peekTop ? top.data : nav;

  useEffect(() => {
    if (peekTop && top.data) litTopRowRef.current?.focus({ preventScroll: true });
  }, [peekTop, top.data]);
  useEffect(() => {
    if (!peekTop && returnFocusToBack.current) {
      returnFocusToBack.current = false;
      backRowRef.current?.focus({ preventScroll: true });
    }
  }, [peekTop]);

  const presence = useMotionPresence(motionPresence.sidebarScopeSwap);
  const transition = useMotionTransition(motionTransition.sidebarScopeSwap);

  return (
    <SidebarProvider className="isolate flex h-full min-h-0 flex-col font-spine" data-contextual-sidebar>
      {/* Pinned: global search, then this page's `‹` and Find. Neither scrolls
          away nor hides while a record is open. */}
      <div data-contextual-head className="flex shrink-0 flex-col gap-1 pb-1">
        <div className={cn(TOP_CHROME_BAND_CLASS, 'items-center pr-2')}>
          <SidebarCollapseControl
            navOpen
            onToggleNav={() => window.dispatchEvent(new Event(MASTER_NAV_TOGGLE_EVENT))}
          />
          <NavGlobalSearch />
        </div>
        {nav?.scope === 'section' ? (
          // Find sits ABOVE `‹` so it never moves: backing out to the page map
          // drops the back row below it, not the field the eye is on.
          <div className="flex flex-col gap-1 px-2">
            <NavFind search={nav.search} />
            {nav.back && !peekTop ? (
              <button
                ref={backRowRef}
                type="button"
                data-nav-back
                onClick={() => setPeekTop(true)}
                onPointerEnter={prefetchTop}
                onFocus={prefetchTop}
                className={cn(NAV_BLOCK_CLASS, 'h-8 text-role-body font-semibold')}
              >
                <ChevronLeft aria-hidden className="size-4 shrink-0 text-text-muted" />
                <span className="min-w-0 flex-1 truncate">{nav.back.label}</span>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <SidebarContent
        data-spine-scrollport
        className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', SPINE_SCROLLPORT_SCROLLBAR_CLASS)}
      >
        {!nav ? (
          page.isError ? (
            <NavSlotError label="Sidebar unavailable" onRetry={() => void page.refetch()} />
          ) : (
            <BodySkeleton />
          )
        ) : (
          <div className="grid [&>*]:col-start-1 [&>*]:row-start-1">
            <AnimatePresence initial={false}>
              <motion.div
                key={`${showTop ? 'top' : 'section'}:${nav.page.id}`}
                initial={presence.initial}
                animate={presence.animate}
                exit={presence.exit}
                transition={transition}
                className="flex min-w-0 flex-col pb-2"
              >
                {showTop ? (
                  <TopBody
                    nav={body}
                    loading={peekTop && !top.data}
                    failed={peekTop && top.isError}
                    onRetry={() => void top.refetch()}
                    litRowRef={litTopRowRef}
                    onReturn={
                      peekTop
                        ? () => {
                            returnFocusToBack.current = true;
                            setPeekTop(false);
                          }
                        : undefined
                    }
                  />
                ) : (
                  <SectionBody nav={nav} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </SidebarContent>

      <SidebarFooter className="shrink-0 p-0">
        <StaffAccountFooter />
      </SidebarFooter>
    </SidebarProvider>
  );
}

function BodySkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-2 px-3 py-3">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-5 w-1/2" />
      <Skeleton className="h-5 w-3/5" />
      <Skeleton className="h-5 w-2/5" />
    </div>
  );
}

function TopBody({
  nav,
  loading,
  failed,
  onRetry,
  litRowRef,
  onReturn,
}: {
  nav: NavContext | undefined;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  litRowRef: React.Ref<HTMLAnchorElement>;
  onReturn: (() => void) | undefined;
}) {
  if (failed && !nav) return <NavSlotError label="Pages unavailable" onRetry={onRetry} />;
  if (loading || !nav) return <BodySkeleton />;
  return <NavSectionList sections={nav.sections} onActiveSelect={onReturn} activeRowRef={litRowRef} />;
}

function SectionBody({ nav }: { nav: NavContext }) {
  const hasItems = nav.sections.some((section) => section.items.length > 0);
  return (
    <>
      {hasItems ? (
        <NavSectionList sections={nav.sections} pageId={nav.page.id} />
      ) : (
        <p className="px-4 py-2 text-role-caption text-text-faint">No views on this page</p>
      )}
      {nav.filters || nav.controls || nav.savedViews ? (
        <NavFilters
          key={nav.filters?.facetContext ?? nav.page.id}
          filters={nav.filters}
          controls={nav.controls}
          savedViews={nav.savedViews}
        />
      ) : null}
      {nav.recents ? <NavRecentsList endpoint={nav.recents.endpoint} surface={nav.recents.surface} /> : null}
    </>
  );
}
