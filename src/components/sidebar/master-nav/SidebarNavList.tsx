'use client';

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { Pin } from '@/components/Icons';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import {
  resolveSpineMapEntries,
  SPINE_DESKS_SLOT_ID,
  SPINE_STATIONS_SLOT_ID,
} from '@/lib/nav/spine-slots';
import {
  DESK_GROUPS,
  SPINE_SECTIONS,
  applyChildTarget,
  isSpineDeskItem,
  spineSectionIdForPage,
  type SidebarIconComponent,
  type SidebarPageNav,
} from '@/lib/sidebar-navigation';
import {
  MASTER_NAV_PIN_DROP_ID,
  MASTER_NAV_PIN_EDGE_BOTTOM,
  MASTER_NAV_PIN_RETURN_ID,
  isPinDropOverId,
  isPinEdgeOverId,
  isStructuralSpinePinHref,
  navPinDragId,
  pinIndexFromOverId,
  type NavPinDragData,
} from '@/lib/quick-access/nav-pin';
import {
  displayQuickAccessLabel,
  masterNavFaceForPinHref,
  pagesNotPinned,
  pinsCoverPageId,
} from '@/lib/quick-access/page-label';
import { useQuickAccess } from '@/lib/quick-access/use-quick-access';
import {
  SPINE_ROW_DENSITY,
  SPINE_ROW_ICON_CLASS,
  SPINE_ROW_SHELL_CLASS,
  SPINE_SCROLLPORT_SCROLLBAR_CLASS,
  SPINE_SECTION_LABEL_STICKY_CLASS,
} from '@/components/sidebar/sidebar-spine';
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { AnimatePresence, motion } from '@/design-system/motion';
import { useSpineSectionCollapse } from './useSpineSectionCollapse';
import { framerTransition } from '@/design-system/foundations/motion-framer';
import { useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { StaffAccountFooter } from './StaffAccountFooter';
import { MasterNavPinnedCluster } from './MasterNavPinnedCluster';
import { usePinUndo } from './use-pin-undo';
import { SpineSessionHead } from './SpineSessionHead';
import { SpineSessionsList } from './SpineSessionsList';
import { useChatSessions } from '@/lib/assistant/use-chat-sessions';
import { displaySessionTitle } from '@/lib/ai/session-title-text';
import { AI_CHAT_NEW_EVENT } from '@/lib/app-events';
import { sessionPinHref } from '@/lib/assistant/use-session-actions';
import { usePathname, useSearchParams } from 'next/navigation';
import { useSessionTitle } from '@/components/session/session-title-store';

/**
 * MasterNav page list on the shadcn Sidebar. Catalog is not sortable.
 * Hold-drag a leaf onto Pinned. Stations and Workspaces are collapsible
 * sections (see `renderSection`); Automations leads the map as a flat
 * `spineFlat` row — never list-replace drills.
 */
const pinCollisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  const pinHits = pointerHits.filter((hit) => isPinDropOverId(String(hit.id)));
  if (pinHits.length > 0) {
    // Most specific target wins. The cluster CONTAINS its rows and its end
    // strips, so a pointer over the first row hits the container too — and the
    // container's only answer is "append". Ranking it last is what makes the
    // top of the shelf reachable at all.
    const rank = (id: string) =>
      isPinEdgeOverId(id) ? 0 : id.startsWith('pin:') ? 1 : 2;
    return [...pinHits].sort(
      (a, b) => rank(String(a.id)) - rank(String(b.id)),
    );
  }
  if (pointerHits.length > 0) return pointerHits;
  return closestCenter(args);
};

interface SidebarNavListProps {
  activePage: SidebarPageNav;
  activeChildId: string | null;
  otherPages: SidebarPageNav[];
  onNavigate: (pageId: string, childId?: string) => void;
  /** Land on an exact href (a session thread) — one push, drawer closed. */
  onOpenHref: (href: string) => void;
  onRowHover?: (page: SidebarPageNav) => void;
  spineOrder: string[];
  className?: string;
}

function DraggableTitleRow({
  id,
  href,
  label,
  icon: RowIcon,
  active,
  ariaLabel,
  onActivate,
  onMouseEnter,
  draggable,
}: {
  id: string;
  href: string;
  label: string;
  icon: SidebarIconComponent;
  active: boolean;
  ariaLabel: string;
  onActivate: () => void;
  onMouseEnter?: () => void;
  draggable: boolean;
}) {
  const { listeners, setNodeRef, isDragging } = useDraggable({
    id: navPinDragId(id),
    data: { type: 'nav', href, label, iconKey: id } satisfies NavPinDragData,
    disabled: !draggable,
  });

  return (
    <SidebarMenuItem
      ref={setNodeRef}
      // No in-flow transform: the scrollport is a real `overflow-y-auto` box,
      // and a transformed child of one is CLIPPED at its edge — a row dragged
      // up toward Pinned would disappear on the way. The gesture is carried by
      // the portalled <DragOverlay> below; this row just dims in place.
      className={cn('relative', isDragging && 'opacity-40')}
    >
      <SidebarMenuButton
        // `listeners` only — NOT dnd-kit's `attributes`. Those carry
        // aria-roledescription="draggable" plus a describedby pointing at
        // "to pick up a draggable item, press the space bar", and with the
        // KeyboardSensor removed that instruction is false on every row. A
        // screen reader announcing a gesture that does nothing is worse than
        // announcing no gesture at all; the row is a link and says so.
        {...(draggable ? listeners : {})}
        isActive={active}
        onClick={onActivate}
        onMouseEnter={onMouseEnter}
        aria-label={ariaLabel}
        aria-current={active ? 'page' : undefined}
        className={cn(draggable && 'touch-none', isDragging && 'cursor-grabbing')}
      >
        <RowIcon className={navIconStrokeClass(SPINE_ROW_ICON_CLASS)} />
        {/* Title on the label, where truncation happens — the icon rail that
            made this an sr-only span is gone (2026-09-05). */}
        <span title={label}>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function SidebarNavList({
  activePage,
  activeChildId,
  otherPages,
  onNavigate,
  onOpenHref,
  onRowHover,
  spineOrder,
  className,
}: SidebarNavListProps) {
  // The map as an explicit drop surface. It no longer DECIDES the unpin —
  // anything that is not a pin target does that now — but registering it keeps
  // dnd-kit reporting a real `over` while the pointer is on the map, so the
  // drop reads as a landing rather than a release into nothing.
  const { setNodeRef: setPinReturnRef } = useDroppable({ id: MASTER_NAV_PIN_RETURN_ID });
  const { settings, pinAt, reorder } = useQuickAccess();
  /**
   * Unpin lives here because the drop is resolved here — the shelf's own
   * component only paints the vacated slot. See {@link usePinUndo}.
   */
  const { undo, unpinWithUndo } = usePinUndo();
  // Section disclosures — per-device, persisted, closed set only.
  const { closedSections, setSectionOpen } = useSpineSectionCollapse();
  // The chevron is the ONE thing this file animates on a section header; the
  // body's height belongs to the CSS var (see `renderSection`).
  const chevronTransition = useMotionTransition(framerTransition.upNextChevron);
  const pinIds = useMemo(() => settings.pinned.map((p) => p.id), [settings.pinned]);
  const currentPinned = pinsCoverPageId(activePage.id, settings.pinned);
  const highlightedChildId = activeChildId ?? activePage.children?.[0]?.id ?? null;
  /**
   * The session you are in, resolved for the head's current-session row.
   *
   * `?session=<id>` means a replayed thread (its title comes from the fetched
   * list — now an AI summary); a bare `/` means the live one, whose name the
   * panel publishes into `session-title-store` (the header switcher reads the
   * same store, so the two faces can never disagree). Recent threads are NOT a
   * spine section any more — the header switcher (with its own search box) and
   * ⌘K hold them.
   */
  const { sessions } = useChatSessions();
  const pathname = usePathname();
  const currentSessionId = useSearchParams().get('session');
  const liveSessionTitle = useSessionTitle();
  const onSessionSurface = pathname === '/';
  const currentSessionTitle = currentSessionId
    ? displaySessionTitle(
        (sessions ?? []).find((s) => s.id === currentSessionId)?.title,
        'Session',
      )
    : liveSessionTitle;

  const startNewSession = useCallback(() => {
    // The panel is the only thing that knows how to start a session; this is
    // the same event the header switcher and ⌘N fire. `onNavigate('home')`
    // then does the routing AND closes the mobile drawer.
    window.dispatchEvent(new CustomEvent(AI_CHAT_NEW_EVENT));
    onNavigate('home');
  }, [onNavigate]);
  /**
   * Open a specific past thread — ONE navigation. `sessionPinHref` is the same
   * URL shape a session PIN stores, so the thread has exactly one address.
   */
  const openSession = useCallback(
    (id: string) => onOpenHref(sessionPinHref(id)),
    [onOpenHref],
  );
  const stationsSection = SPINE_SECTIONS.find((s) => s.id === 'floor');
  const desksGroup = DESK_GROUPS[0];
  const floorPages = useMemo(
    () =>
      pagesNotPinned(
        otherPages.filter((p) => spineSectionIdForPage(p) === 'floor'),
        settings.pinned,
      ),
    [otherPages, settings.pinned],
  );
  const deskPages = useMemo(
    () => pagesNotPinned(otherPages.filter((p) => isSpineDeskItem(p)), settings.pinned),
    [otherPages, settings.pinned],
  );
  // R9: the section's FULL home roster, pinned rows included. `floorPages` /
  // `deskPages` above are the navigable set (pinned rows moved to the shelf);
  // these keep every destination in its arranged slot so the render can paint
  // a vacated marker exactly where the pinned row used to sit — spatial memory
  // survives the move.
  const floorPagesAll = useMemo(
    () => otherPages.filter((p) => spineSectionIdForPage(p) === 'floor'),
    [otherPages],
  );
  const deskPagesAll = useMemo(
    () => otherPages.filter((p) => isSpineDeskItem(p)),
    [otherPages],
  );

  const mapEntries = useMemo(
    () => resolveSpineMapEntries(spineOrder, otherPages),
    [spineOrder, otherPages],
  );

  /**
   * The map, as render blocks in the staff's arranged order.
   *
   * Consecutive unlabeled destinations merge into ONE group. Each
   * `SidebarGroup` carries its own padding, so a group per row surrounded every
   * lone 28px row with chrome and made a flat list read as a stack of one-row
   * sections. A run never crosses a labelled section, so merging cannot reorder
   * anything the operator arranged.
   */
  type SpineBlock =
    | { kind: 'stations' }
    | { kind: 'desks' }
    // Any map row that DECLARES children is a parent section — Operations
    // Studio and, since 2026-09-05, Admin. It used to be `kind: 'studio'`
    // matched on the literal id, which meant the second page to grow children
    // silently rendered as a labelless loose row instead.
    | { kind: 'parent'; page: SidebarPageNav }
    | { kind: 'loose'; pages: SidebarPageNav[] };

  const spineBlocks = useMemo<SpineBlock[]>(() => {
    const blocks: SpineBlock[] = [];
    for (const entry of mapEntries) {
      if (entry.kind === 'stations' || entry.kind === 'desks') {
        blocks.push({ kind: entry.kind });
        continue;
      }
      const page = entry.page;
      if (pinsCoverPageId(page.id, settings.pinned)) continue;
      // `spineFlat` L1s (Automations) declare children for ⌘K / the mode
      // switcher but paint as ONE loose map row, not a disclosure.
      if ((page.children?.length ?? 0) > 0 && !page.spineFlat) {
        blocks.push({ kind: 'parent', page });
        continue;
      }
      const tail = blocks[blocks.length - 1];
      if (tail?.kind === 'loose') tail.pages.push(page);
      else blocks.push({ kind: 'loose', pages: [page] });
    }
    return blocks;
  }, [mapEntries, settings.pinned]);

  /**
   * Pointer only, deliberately.
   *
   * dnd-kit's `KeyboardSensor` registers an activator that `preventDefault()`s
   * Space and Enter on every node these `listeners` are spread onto — which is
   * every destination row. With it mounted, a keyboard operator could not
   * activate a single row in the navigator: the key started a drag instead of
   * following the link, and the suppressed default meant no click ever fired.
   *
   * Navigating is what this list is FOR; arranging it is the accessory. So the
   * keyboard keeps the primary verb, and rearranging pins by keyboard goes
   * through ⌘1–9 and the row's own controls rather than a drag it hijacks.
   */
  const sensors = useSensors(
    useSensor(PointerSensor, {
      // DISTANCE, not delay. A `delay` constraint arms a drag on any press held
      // past the threshold even with the pointer stationary — and dnd-kit then
      // suppresses the click — so a deliberate, slightly slow click on a row
      // (a gloved hand, a floor monitor) silently did nothing at all, on this
      // column's most repeated action. Requiring 6px of travel means a press
      // that never moves is always a navigation, and a drag is always intended.
      activationConstraint: { distance: 6 },
    }),
  );

  /**
   * What the pointer carries while dragging. Resolved once on drag start so the
   * overlay never re-reads a list that is reordering underneath it.
   *
   * `kind` is what the map reads to paint its "Let go to unpin" hint: only a
   * PIN can leave the shelf, so a map row being dragged toward Pinned must not
   * put an unpin promise under the pointer.
   */
  const [dragFace, setDragFace] = useState<{
    kind: 'nav' | 'pin';
    label: string;
    icon: SidebarIconComponent;
  } | null>(null);
  // The shelf's rect (measured at drag start) and its element — the unpin
  // decision is geometry against these, not collision detection.
  const shelfRectRef = useRef<DOMRect | null>(null);
  const shelfElRef = useRef<HTMLElement | null>(null);
  const unpinDragActive = dragFace?.kind === 'pin';
  // Reduced motion collapses this to an instant cut; the hint still appears —
  // it is information, not decoration.
  const unpinHintTransition = useMotionTransition(framerTransition.overlayScrim);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const data = event.active.data.current as
        | NavPinDragData
        | { type: 'pin'; id: string }
        | undefined;
      // Measure the shelf NOW — the unpin decision is geometry against this
      // rect, taken at drag end. Measuring at start is what makes it stable
      // while lists reorder underneath the pointer.
      shelfRectRef.current = shelfElRef.current?.getBoundingClientRect() ?? null;
      if (data?.type === 'nav') {
        setDragFace({
          kind: 'nav',
          label: data.label,
          icon: masterNavFaceForPinHref(data.href)?.icon ?? Pin,
        });
        return;
      }
      if (data?.type === 'pin') {
        const pin = settings.pinned.find((p) => p.id === data.id);
        if (!pin) return;
        setDragFace({
          kind: 'pin',
          label: displayQuickAccessLabel(pin.href, pin.label),
          icon: masterNavFaceForPinHref(pin.href)?.icon ?? Pin,
        });
      }
    },
    [settings.pinned],
  );

  /**
   * THE UNPIN RULE IS GEOMETRY (operator 2026-09-06 — "it will not unpin
   * correctly"): while a pin is in flight, the pointer's position against the
   * shelf's rect decides everything. OUTSIDE the shelf — below it over the
   * map, or past either edge — is an unpin. INSIDE the shelf reorders at the
   * slot dnd-kit reports. The old chain (biased collision detection → over id
   * → "is this a pin target?") had a fallback that could report a pin ROW for
   * a release over open map, silently turning an unpin into a reorder; the
   * rect cannot lie. Nav drags mirror it: pinning requires the pointer INSIDE
   * the shelf.
   */
  const pointerOutsideShelf = (event: DragEndEvent, rect: DOMRect | null): boolean => {
    if (!rect) return true;
    const activator = event.activatorEvent as PointerEvent | null;
    if (!activator || typeof activator.clientX !== 'number') return true;
    const x = activator.clientX + event.delta.x;
    const y = activator.clientY + event.delta.y;
    const MARGIN = 8;
    const SIDE_MARGIN = 48;
    return (
      y < rect.top - MARGIN ||
      y > rect.bottom + MARGIN ||
      x > rect.right + SIDE_MARGIN
    );
  };

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDragFace(null);
      // Measure FIRST, clear LAST — the resolution below reads this rect.
      const shelfRect = shelfRectRef.current;
      shelfRectRef.current = null;
      const { active, over } = event;
      const overId = over ? String(over.id) : null;
      const activeId = String(active.id);
      const data = active.data.current as NavPinDragData | { type: 'pin'; id: string } | undefined;

      if (data?.type === 'pin' || activeId.startsWith('pin:')) {
        const fromId = data?.type === 'pin' ? data.id : activeId.slice('pin:'.length);
        const oldIndex = pinIds.indexOf(fromId);
        if (oldIndex < 0) return;
        const pin = settings.pinned[oldIndex];
        if (!pin) return;
        // OUT OF THE SHELF IS OFF THE SHELF — by GEOMETRY, not by collision
        // diplomacy. A release below the shelf, over the map, over the
        // workspace, or anywhere the pointer has left the rect unpins. The
        // overlay ("Release to unpin") promised it for the whole gesture.
        // Undo holds the vacated slot 12s, so a near-miss is a nuisance, not
        // a rebuild. The row reappears in its registry home — nothing about
        // that home is stored on the pin.
        if (pointerOutsideShelf(event, shelfRect)) {
          unpinWithUndo(pin, oldIndex);
          return;
        }
        const newIndex = overId ? pinIndexFromOverId(overId, pinIds) : null;
        if (newIndex == null) return;
        const target =
          overId === MASTER_NAV_PIN_DROP_ID || overId === MASTER_NAV_PIN_EDGE_BOTTOM
            ? pinIds.length - 1
            : newIndex;
        if (oldIndex === target) return;
        reorder(arrayMove([...pinIds], oldIndex, Math.min(target, pinIds.length - 1)));
        return;
      }

      if (data?.type !== 'nav') return;
      // Pinning a map row requires the pointer INSIDE the shelf — the mirror
      // of the unpin rule. No collision fallback can pin from the workspace.
      if (pointerOutsideShelf(event, shelfRect)) return;
      if (!overId || !isPinDropOverId(overId)) return;
      if (isStructuralSpinePinHref(data.href)) return;
      const at = pinIndexFromOverId(overId, pinIds);
      pinAt(
        { kind: 'page', href: data.href, label: data.label, iconKey: data.iconKey },
        at ?? pinIds.length,
      );
    },
    [pinAt, pinIds, reorder, settings.pinned, unpinWithUndo],
  );

  const renderDraggablePage = (page: SidebarPageNav) => (
    <DraggableTitleRow
      key={page.id}
      id={page.id}
      href={page.href}
      label={page.label}
      icon={page.icon}
      active={page.id === activePage.id && !currentPinned}
      ariaLabel={`Go to ${page.label}`}
      draggable
      onActivate={() => onNavigate(page.id)}
      onMouseEnter={onRowHover ? () => onRowHover(page) : undefined}
    />
  );

  /**
   * R9 — the vacated slot a pinned row leaves behind.
   *
   * A pinned destination is MOVED to the shelf, not copied. Dropping its home
   * row silently reflowed the section, so an operator who reaches by position
   * ("Receiving is the third Station") landed on the wrong one. This paints a
   * quiet WHISPER in the same slot — the label at faint ink with a trailing pin
   * glyph saying WHERE it went — so the arrangement is recognisable at a
   * glance.
   *
   * Deliberately NOT a second destination: the shelf pin is the one place this
   * page is reached from ("moved, not copied" — see `pagesNotPinned`), so the
   * marker is inert — no button, no `Go to` name, `aria-hidden` so assistive
   * tech hears the page once (from the pin). Held to `h-4` at `text-role-micro`
   * rather than the row's `h-7`: a slot cue costs a sliver of the column, never
   * a full repeated row, which is also what keeps the at-rest map inside its
   * fold budget when several pins vacate one section.
   */
  const renderVacatedRow = (page: SidebarPageNav) => (
    <li
      key={`vacated-${page.id}`}
      data-spine-vacated
      aria-hidden
      title={`${page.label} — pinned above`}
      className={cn(SPINE_ROW_SHELL_CLASS, 'h-4 text-text-faint')}
    >
      <page.icon className="h-3 w-3 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-role-micro">{page.label}</span>
      <Pin className="h-2.5 w-2.5 shrink-0" />
    </li>
  );

  // Paint a home section in its arranged order, swapping any pinned-away row
  // for its vacated marker (R9) so positions never shift under a pin.
  const renderSectionRows = (pages: SidebarPageNav[]) =>
    pages.map((page) =>
      pinsCoverPageId(page.id, settings.pinned)
        ? renderVacatedRow(page)
        : renderDraggablePage(page),
    );

  const renderChild = (
    page: SidebarPageNav,
    child: NonNullable<SidebarPageNav['children']>[number],
  ) => {
    const { pathname, search } = applyChildTarget(
      { pathname: page.href, params: new URLSearchParams() },
      child.to(),
    );
    const href = search ? `${pathname}?${search}` : pathname;
    return (
      <DraggableTitleRow
        key={`${page.id}-${child.id}`}
        id={`${page.id}:${child.id}`}
        href={href}
        label={child.label}
        icon={child.icon}
        active={page.id === activePage.id && highlightedChildId === child.id}
        ariaLabel={`Go to ${child.label}`}
        draggable
        onActivate={() => onNavigate(page.id, child.id)}
      />
    );
  };

  /**
   * A labelled section, as a DISCLOSURE (2026-09-05, operator ruling: "the
   * sidebar should be like a collapsible display… nav should be a parent").
   *
   * shadcn's own collapsible-sidebar grammar, unmodified: `Collapsible` wraps
   * the `SidebarGroup`, the `SidebarGroupLabel` becomes the trigger via
   * `asChild` so the whole label row is the hit target, and
   * `CollapsibleContent` owns the rows. Radix supplies `aria-expanded`,
   * `aria-controls` and — the part that matters most here — it UNMOUNTS a
   * closed section, so a folded section's destinations leave the tab order
   * instead of becoming invisible keyboard stops.
   *
   * The height tween is CSS on Radix's own measured var
   * (`.spine-collapsible-content`, `globals.css`); the chevron is the only
   * motion this file drives. See that rule for the M1 geometry argument.
   *
   * The count is not decoration: a folded section has to say what it is
   * holding, and it is the one number a nav row may carry — monochrome,
   * tabular, no hue (`spine-section-accent.ts` forbids numbers-as-colour, not
   * numbers).
   */
  const renderSection = (
    sectionKey: string,
    domId: string,
    label: string,
    rows: ReactNode,
    // `null` = not counted yet (the first paint, before the fetch lands). A
    // real `0` means "nothing to show" and the section is dropped.
    rowCount: number | null,
    /**
     * This section CONTAINS the page you are on.
     *
     * Without it a folded section was a dead end for "where am I": the row
     * carrying `aria-current` is unmounted while its section is shut, so on a
     * route inside a folded section the whole navigator showed no location at
     * all — measured on `/reports` (inside Admin, folded by default), zero
     * marks anywhere in the column.
     *
     * The mark is INK plus the same 2px bar the current row uses, never a
     * wash: the fill ladder is about 1.01:1 wash-to-wash on this white
     * ground, so a third wash would say nothing. `aria-current` stays off the
     * trigger — the trigger is a disclosure, not a destination — and
     * `data-owns-current` is what a test reads.
     */
    ownsCurrent = false,
  ) => {
    if (rowCount === 0) return null;
    const open = !closedSections.has(sectionKey);
    return (
      <Collapsible
        key={sectionKey}
        open={open}
        onOpenChange={(next) => setSectionOpen(sectionKey, next)}
      >
        <SidebarGroup id={domId} role="group" aria-label={label} className="group/section">
          <SidebarGroupLabel asChild className={SPINE_SECTION_LABEL_STICKY_CLASS}>
            <CollapsibleTrigger
              data-spine-section-trigger
              data-owns-current={ownsCurrent ? 'true' : undefined}
              className={cn(
                'relative w-full cursor-pointer gap-1.5 hover:text-text-default',
                // shadcn's `SidebarGroupLabel` ships `outline-hidden`, so a
                // trigger composed from it had NO visible focus state — the
                // keyboard operator could not see which section they were on
                // (WCAG 2.4.7, measured: outline-style none, box-shadow none).
                focusRing('control', 'accent'),
                ownsCurrent &&
                  "font-semibold text-text-default before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-text-default before:content-['']",
              )}
            >
              <span className="min-w-0 truncate">{label}</span>
              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                {/* R3: the count is what a FOLDED section says it holds; while
                    open the rows themselves say it, so the badge is redundant. */}
                {rowCount == null || open ? null : (
                  <span className="tabular-nums text-role-micro text-text-soft">
                    {rowCount}
                  </span>
                )}
                <motion.span
                  aria-hidden
                  className={cn(
                    'flex shrink-0 text-text-faint transition-opacity',
                    // R7: on an OPEN section the chevron is a quiet affordance —
                    // the disclosure state is already legible from the rows, so
                    // the glyph rests at zero opacity and reveals only on
                    // hover/focus of the section (pointer intent, or a keyboard
                    // operator landing anywhere inside it). A FOLDED section
                    // keeps it lit: there the chevron is the ONLY sign the row
                    // opens, and it sits beside the count the fold shows.
                    open &&
                      'opacity-0 group-hover/section:opacity-100 group-focus-within/section:opacity-100',
                  )}
                  initial={false}
                  animate={{ rotate: open ? 0 : -90 }}
                  transition={chevronTransition}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </motion.span>
              </span>
            </CollapsibleTrigger>
          </SidebarGroupLabel>
          <CollapsibleContent className="spine-collapsible-content">
            <SidebarGroupContent>
              <SidebarMenu>{rows}</SidebarMenu>
            </SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
      </Collapsible>
    );
  };

  return (
    // No `role="menu"`: a menu must contain `menuitem`s, and this contains
    // groups, lists and links. The navigation landmark already lives on the
    // hosting <aside>; `data-spine-nav` is the styling hook the peek shell uses.
    <div data-spine-nav className={cn('flex h-full min-h-0 flex-col', className)}>
      <DndContext
        sensors={sensors}
        collisionDetection={pinCollisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDragFace(null)}
      >
        <SidebarContent
          ref={setPinReturnRef}
          data-spine-scrollport
          className={cn(
            'min-h-0 flex-1 gap-0 overflow-y-auto overscroll-contain p-0',
            SPINE_SCROLLPORT_SCROLLBAR_CLASS,
          )}
        >
          {/* New chat · the session you are in. Home is parked in the registry
              (`spineBand: false`) — `/` is the session surface, so the
              current-session row IS the Home row now. Search + Recent moved to
              the header + ⌘K. */}
          <SpineSessionHead
            onNewSession={startNewSession}
            currentTitle={currentSessionTitle}
            currentActive={onSessionSurface}
            onOpenCurrent={() => onNavigate('home')}
          />
          <MasterNavPinnedCluster
            pinIds={pinIds}
            undo={undo}
            onKeyboardUnpin={unpinWithUndo}
            shelfRef={(el) => {
              shelfElRef.current = el;
            }}
          />
          {/* Recent sessions — always-visible under Pinned (Feature 2). The
              current thread is excluded (the head already names it). */}
          <SpineSessionsList onOpenSession={openSession} />
          {/* The map is the unpin surface. While a PIN is in flight the WHOLE
              area below the shelf wears the release face — one overlay, one
              sentence, no dip into collision diplomacy to know what a release
              means. `pointer-events-none` keeps this pane out of dnd-kit's
              hit testing; geometry resolves the drop. */}
          <div className={cn('relative', unpinDragActive && 'min-h-48')}>
            {spineBlocks.map((block) => {
              if (block.kind === 'stations') {
                if (!stationsSection) return null;
                return (
                  <div key={SPINE_STATIONS_SLOT_ID}>
                    {renderSection(
                      'floor',
                      'spine-section-floor',
                      stationsSection.label,
                      renderSectionRows(floorPagesAll),
                      floorPagesAll.length,
                      floorPages.some((page) => page.id === activePage.id),
                    )}
                  </div>
                );
              }
              if (block.kind === 'desks') {
                return (
                  <div key={SPINE_DESKS_SLOT_ID}>
                    {renderSection(
                      'desks',
                      'spine-section-desks',
                      desksGroup.label,
                      renderSectionRows(deskPagesAll),
                      deskPagesAll.length,
                      deskPages.some((page) => page.id === activePage.id),
                    )}
                  </div>
                );
              }
              if (block.kind === 'parent') {
                const page = block.page;
                const children = page.children ?? [];
                return (
                  <div key={page.id}>
                    {renderSection(
                      page.id,
                      `spine-section-${page.id}`,
                      page.label,
                      children.map((child) => renderChild(page, child)),
                      children.length,
                      page.id === activePage.id,
                    )}
                  </div>
                );
              }
              return (
                // One group per RUN of unlabeled destinations, not one per
                // destination: `SidebarGroup` carries `px-2 py-1`, so a group per
                // row put 8px of chrome around every single 28px row and made a
                // flat list read as N one-row sections. Runs keep the staff's
                // arranged order — they never hop a labelled section.
                <SidebarGroup key={`loose-${block.pages[0]!.id}`}>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {block.pages.map((page) => renderDraggablePage(page))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              );
            })}
            <AnimatePresence>
              {unpinDragActive ? (
                <motion.div
                  data-spine-unpin-hint
                  data-unpin-overlay
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={unpinHintTransition}
                  className={cn(
                    'pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-1',
                    'border border-dashed border-accent-border bg-surface-sunken/90',
                    cornerClass('surface'),
                  )}
                >
                  <span className="text-role-body font-semibold text-text-default">
                    Release to unpin
                  </span>
                  <span className="text-role-micro text-text-faint">
                    The pin returns to its home section
                  </span>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </SidebarContent>
        <DragOverlay dropAnimation={null}>
          {dragFace ? (
            // <DragOverlay> renders `position: fixed`, which escapes the
            // scrollport's clip — that, not a portal, is what keeps the gesture
            // visible. Flush ops chrome: a lifted copy of the row, not a new
            // card — same shell, same density, same glyph.
            <div
              className={cn(
                SPINE_ROW_SHELL_CLASS,
                SPINE_ROW_DENSITY.pointer.face,
                SPINE_ROW_DENSITY.pointer.label,
                'w-(--sidebar-width) cursor-grabbing border border-border-soft bg-surface-card text-text-default',
              )}
            >
              <dragFace.icon className={navIconStrokeClass(SPINE_ROW_ICON_CLASS)} />
              <span className="min-w-0 flex-1 truncate">{dragFace.label}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <SidebarFooter data-spine-account-footer className="shrink-0 p-0">
        <StaffAccountFooter />
      </SidebarFooter>
    </div>
  );
}
