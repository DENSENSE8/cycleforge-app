'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { NavAction, NavContext } from '@/lib/nav/context/schema';
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
import { NavPanelActions } from './NavPanelActions';
import { NavFind } from './NavFind';
import { NavSlotError } from './NavSlotError';
import { NavModeSwitcher, isNavModeSection } from './NavModeSwitcher';
import { NavViewSwitcher } from './NavViewSwitcher';
import { NavGoKeys } from './NavGoKeys';
import { useRememberLaneView } from './useLaneDoorHref';

/**
 * THE desktop sidebar — one host for every page. A page whose
 * `NavContext.rollout` is `contextual` gets its own panel; every other page
 * gets the page map (the resolver's lane map, `?view=top`) with that page
 * lit, so the parent sidebar is the same face everywhere. Minimal by
 * default; detail opens on click (operator 2026-09-27):
 *
 * - pinned head: collapse · THE search field (`NavFind`) — on a page panel
 *   it narrows the list on screen (`F`), grows right over the header while
 *   focused, and says where the text lives in the section (locate pills);
 *   "Search everywhere" hands the text to the ⌘K palette; the palette's face
 *   everywhere else — then `‹ <Lane>` — carrying a view-less page's verbs at
 *   its right end (Chat's `+`) — then, on a lane door's landing page, the
 *   MODE switcher (Shipping · FBA · Label intake), then the VIEW switcher
 *   (Exceptions · PO paired · …). Modes and views are changed rarely, so
 *   each is one block that opens to the right of the sidebar on hover
 *   (`NavSwitcherMenu`). Pinned so search never scrolls away or hides while
 *   a record is open;
 * - scrolling body: what you change often, as buttons — the saved views,
 *   then the closed filter rows. The view's verbs live in the page header,
 *   over the list they act on (`NavPageActions`). After `‹` the body shows
 *   the lane map
 *   (`?view=top`) with this page lit. `‹` is LOCAL state and never touches
 *   the URL; any URL change (links, back/forward) rebuilds from the URL;
 * - fixed footer, PARENT level only (the page map, and a panel's `‹` peek):
 *   the staff account bar. A page's own panel does not repeat it.
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
  const nav = page.data;
  // A page without its own contextual panel shows the page map, never a panel.
  const panel = nav?.rollout === 'contextual' && nav.scope === 'section';
  const mapOnly = nav !== undefined && nav.scope === 'section' && !panel;
  const backVerbs = panel ? viewlessPanelVerbs(nav) : [];
  const top = useNavContext(path, { view: 'top', enabled: peekTop || mapOnly });
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

  const modeSection = panel ? nav.sections.find(isNavModeSection) : undefined;
  const viewSections = useMemo(
    () => (panel ? nav.sections.filter((section) => !isNavModeSection(section)) : []),
    [panel, nav?.sections],
  );
  const showTop = peekTop || !panel;
  const body: NavContext | undefined = peekTop || mapOnly ? top.data : nav;
  useRememberLaneView(nav);

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
      {/* Pinned: the one search field, then this page's `‹` and switchers.
          None scrolls away or hides while a record is open. */}
      <div data-contextual-head className="flex shrink-0 flex-col gap-1 pb-1">
        <div className={cn(TOP_CHROME_BAND_CLASS, 'items-center pl-1 pr-2')}>
          <SidebarCollapseControl
            navOpen
            onToggleNav={() => window.dispatchEvent(new Event(MASTER_NAV_TOGGLE_EVENT))}
          />
          {/* The field never moves: backing out to the page map drops the
              back row below it, not the field the eye is on. */}
          <NavFind search={panel ? nav.search : undefined} />
        </div>
        {panel ? (
          <div className="flex flex-col gap-1 px-2">
            {nav.back && !peekTop ? (
              <div className="relative flex min-w-0">
                <button
                  ref={backRowRef}
                  type="button"
                  data-nav-back
                  onClick={() => setPeekTop(true)}
                  onPointerEnter={prefetchTop}
                  onFocus={prefetchTop}
                  className={cn(NAV_BLOCK_CLASS, 'h-8 text-role-body font-semibold', backVerbs.length > 0 && 'pr-10')}
                >
                  <ChevronLeft aria-hidden className="size-4 shrink-0 text-text-muted" />
                  <span className="min-w-0 flex-1 truncate">{nav.back.label}</span>
                </button>
                {backVerbs.length > 0 ? (
                  // A sibling of `‹`, never inside it: a verb must not also go back.
                  <span className="absolute inset-y-0 right-1 flex items-center">
                    <NavPanelActions actions={backVerbs} />
                  </span>
                ) : null}
              </div>
            ) : null}
            {modeSection && !peekTop ? <NavModeSwitcher section={modeSection} currentPageId={nav.page.id} /> : null}
            {!peekTop ? <NavViewSwitcher sections={viewSections} pageId={nav.page.id} /> : null}
          </div>
        ) : null}
      </div>
      <NavGoKeys currentPageId={nav?.page.id} />

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
                    loading={(peekTop || mapOnly) && !top.data}
                    failed={(peekTop || mapOnly) && top.isError}
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

      {/* The account bar belongs to the PARENT level (the page map), not to
          every page's panel: a panel reaches it through `‹`. */}
      {showTop ? (
        <SidebarFooter className="shrink-0 p-0" data-sidebar-account>
          <StaffAccountFooter />
        </SidebarFooter>
      ) : null}
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

/**
 * A VIEW-LESS panel (Chat) is its recents list; with no desk header over that
 * list, the page's verbs ride the `‹` back row (`NavPanelActions`).
 */
function viewlessPanelVerbs(nav: NavContext): readonly NavAction[] {
  const hasViews = nav.sections.some((section) => !isNavModeSection(section) && section.items.length > 0);
  return !hasViews && nav.recents ? (nav.actions ?? []) : [];
}

function SectionBody({ nav }: { nav: NavContext }) {
  // Modes and views paint as the pinned switchers in the head, not as rows here.
  const hasViews = nav.sections.some((section) => !isNavModeSection(section) && section.items.length > 0);
  const hasFilters = Boolean(nav.filters || nav.controls || nav.savedViews);
  return (
    <>
      {!hasViews && !hasFilters && !nav.recents ? (
        <p className="px-4 py-2 text-role-caption text-text-faint">No views on this page</p>
      ) : null}
      {hasFilters ? (
        <NavFilters
          key={nav.filters?.facetContext ?? nav.page.id}
          filters={nav.filters}
          controls={nav.controls}
          savedViews={nav.savedViews}
        />
      ) : null}
      {nav.recents ? (
        <NavRecentsList
          key={nav.recents.surface}
          recents={nav.recents}
          search={nav.search}
          leadingHairline={hasFilters}
        />
      ) : null}
    </>
  );
}
