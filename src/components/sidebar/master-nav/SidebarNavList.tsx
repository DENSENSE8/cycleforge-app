'use client';

import { useCallback, useMemo, type ReactNode } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown } from '@/components/Icons';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import {
  resolveSpineMapEntries,
  spineStructuralTopPages,
  SPINE_STATIONS_SLOT_ID,
} from '@/lib/nav/spine-slots';
import {
  DESK_SPINE_SECTIONS,
  SPINE_SECTIONS,
  isSpineDeskItem,
  spineSectionIdForPage,
  type SidebarIconComponent,
  type SidebarPageNav,
} from '@/lib/sidebar-navigation';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { spineRailLineClass } from '@/lib/nav/spine-section-accent';
import {
  SPINE_CHILD_RAIL_INSET_CLASS,
  SPINE_CHILD_RAIL_TRUNK_CLASS,
  SPINE_LABEL_CLASS,
  SPINE_ROW_ICON_CLASS,
  SPINE_SCROLLPORT_SCROLLBAR_CLASS,
  SPINE_SECTION_LABEL_STICKY_CLASS,
} from '@/components/sidebar/sidebar-spine';
import { cn } from '@/utils/_cn';
import { StaffAccountFooter } from './StaffAccountFooter';
import { useSpineSectionCollapse } from './useSpineSectionCollapse';

/**
 * MasterNav page list, painted on the shadcn `Sidebar*` primitives
 * (`@/components/ui/sidebar`) — the component tree the operator named
 * (2026-09-14): `SidebarContent → SidebarGroup → SidebarGroupLabel /
 * SidebarGroupContent → SidebarMenu → SidebarMenuItem → SidebarMenuButton`.
 *
 * A **LANE is a `SidebarGroup`.** That is the whole translation: Inbound ·
 * Outbound · Inventory · Products · Sales · Support · Operations are groups,
 * and Scan Stations is one too. Daily · Media Library stay structural top rows.
 * Hold-drag reorders group slots and loose L1 ids into `prefs.spineSlots`.
 *
 * Two laws the primitives now carry instead of this file:
 *
 * - **Row treatment.** `SidebarMenuButton` bakes in `SPINE_ACCENT.idlePage` +
 *   `SPINE_ACCENT_DATA_ACTIVE`, so "am I the current page?" is the
 *   `data-active` attribute rather than a conditional class threaded down
 *   through every helper. The old `accent` parameter is gone — one row system,
 *   one place that spells it.
 * - **Icon law** (operator: *"icon at the parent level only"*). A glyph marks a
 *   PARENT: an L0 row, or a `SidebarGroupLabel`. A row inside a group passes no
 *   icon and wears the rail HAIRLINE on its left instead
 *   (`spineRailLineClass`) — the same child mark the `/m` drawer uses.
 *
 * `data-spine-nav` / `data-spine-scrollport` are load-bearing — `SidebarNavColumn`
 * re-measures the collapsed hover-peek card through them.
 */
interface SidebarNavListProps {
  activePage: SidebarPageNav;
  activeChildId: string | null;
  otherPages: SidebarPageNav[];
  onNavigate: (pageId: string, childId?: string) => void;
  onRowHover?: (page: SidebarPageNav) => void;
  spineOrder: string[];
  onSpineOrderChange: (ids: string[]) => void;
  className?: string;
}

/** A row the operator can hold-drag to reorder (L0 slots only). */
function SortableMenuRow({
  id,
  label,
  icon: RowIcon,
  active,
  ariaLabel,
  onActivate,
  onMouseEnter,
}: {
  id: string;
  label: string;
  icon: SidebarIconComponent;
  active: boolean;
  ariaLabel: string;
  onActivate: () => void;
  onMouseEnter?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <SidebarMenuItem
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(isDragging && 'z-10 opacity-80')}
    >
      <SidebarMenuButton
        {...attributes}
        {...listeners}
        isActive={active}
        onClick={onActivate}
        onMouseEnter={onMouseEnter}
        aria-label={ariaLabel}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'touch-none',
          isDragging && 'cursor-grabbing ring-1 ring-inset ring-border-soft',
        )}
      >
        <RowIcon className={navIconStrokeClass(SPINE_ROW_ICON_CLASS)} />
        <span className={cn('min-w-0 flex-1 truncate', SPINE_LABEL_CLASS)} title={label}>
          {label}
        </span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * The group's face: a `SidebarGroupLabel` acting as the disclosure trigger, and
 * the level that WEARS THE GLYPH under the icon law.
 *
 * Split from its sortable wrapper because lanes are not draggable by their
 * label alone — staff reorder acts on the L0 slot — and `useSortable` cannot be
 * called conditionally. One face, two wrappers, rather than a second trigger
 * that drifts.
 */
function SectionTriggerFace({
  label,
  icon: SectionIcon,
  open,
  rowCount,
  ownsCurrent,
  bodyId,
  onToggle,
  dragProps,
  isDragging = false,
}: {
  label: string;
  icon: SidebarIconComponent;
  open: boolean;
  rowCount: number;
  ownsCurrent: boolean;
  bodyId: string;
  onToggle: () => void;
  dragProps?: Record<string, unknown>;
  isDragging?: boolean;
}) {
  return (
    <SidebarGroupLabel asChild>
      <button
        type="button"
        data-spine-section-trigger
        data-owns-current={ownsCurrent ? 'true' : undefined}
        aria-expanded={open}
        aria-controls={bodyId}
        {...dragProps}
        onClick={onToggle}
        className={cn(
          // No ink override: `SidebarGroupLabel` already carries the ROW's
          // `text-text-default` + `SPINE_LABEL_CLASS`, so a lane header reads
          // exactly like Daily / Media Library above it (operator 2026-09-14:
          // "all black, all consistent with the top three items"). A `hover:`
          // ink rule here would imply the idle state was quieter.
          'relative cursor-pointer touch-none',
          SPINE_SECTION_LABEL_STICKY_CLASS,
          ownsCurrent &&
            "font-semibold before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-text-default before:content-['']",
          isDragging && 'cursor-grabbing ring-1 ring-inset ring-border-soft',
        )}
      >
        <SectionIcon className={navIconStrokeClass(SPINE_ROW_ICON_CLASS)} />
        <span className={cn('min-w-0 flex-1 truncate', SPINE_LABEL_CLASS)} title={label}>
          {label}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {open ? null : (
            <span className="tabular-nums text-role-micro text-text-default">{rowCount}</span>
          )}
          <ChevronDown
            aria-hidden
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-text-default transition-transform',
              open ? 'rotate-0' : '-rotate-90',
              open &&
                'opacity-0 group-hover/section:opacity-100 group-focus-within/section:opacity-100',
            )}
          />
        </span>
      </button>
    </SidebarGroupLabel>
  );
}

function SortableSectionTrigger({
  id,
  label,
  icon,
  open,
  rowCount,
  ownsCurrent,
  bodyId,
  onToggle,
}: {
  id: string;
  label: string;
  icon: SidebarIconComponent;
  open: boolean;
  rowCount: number;
  ownsCurrent: boolean;
  bodyId: string;
  onToggle: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn('relative', isDragging && 'z-10 opacity-80')}
    >
      <SectionTriggerFace
        label={label}
        icon={icon}
        open={open}
        rowCount={rowCount}
        ownsCurrent={ownsCurrent}
        bodyId={bodyId}
        onToggle={onToggle}
        dragProps={{ ...attributes, ...listeners }}
        isDragging={isDragging}
      />
    </div>
  );
}

export function SidebarNavList({
  activePage,
  activeChildId,
  otherPages,
  onNavigate,
  onRowHover,
  spineOrder,
  onSpineOrderChange,
  className,
}: SidebarNavListProps) {
  const highlightedChildId = activeChildId ?? activePage.children?.[0]?.id ?? null;
  const topPages = spineStructuralTopPages(otherPages);
  const stationsSection = SPINE_SECTIONS.find((s) => s.id === 'floor');
  const { isSectionOpen, setSectionOpen } = useSpineSectionCollapse();

  const floorPages = useMemo(
    () => otherPages.filter((p) => spineSectionIdForPage(p) === 'floor'),
    [otherPages],
  );
  const deskPages = useMemo(
    () => otherPages.filter((p) => isSpineDeskItem(p)),
    [otherPages],
  );

  const mapEntries = useMemo(
    () => resolveSpineMapEntries(spineOrder, otherPages),
    [spineOrder, otherPages],
  );

  type SpineBlock =
    | { kind: 'stations' }
    | { kind: 'lane'; lane: (typeof DESK_SPINE_SECTIONS)[number] }
    | { kind: 'parent'; page: SidebarPageNav }
    | { kind: 'loose'; pages: SidebarPageNav[] };

  const spineBlocks = useMemo<SpineBlock[]>(() => {
    const blocks: SpineBlock[] = [];
    for (const entry of mapEntries) {
      if (entry.kind === 'stations') {
        blocks.push({ kind: 'stations' });
        continue;
      }
      if (entry.kind === 'lane') {
        const lane = DESK_SPINE_SECTIONS.find((section) => section.id === entry.id);
        if (lane) blocks.push({ kind: 'lane', lane });
        continue;
      }
      const page = entry.page;
      if ((page.children?.length ?? 0) > 0 && !page.spineFlat) {
        blocks.push({ kind: 'parent', page });
        continue;
      }
      const tail = blocks[blocks.length - 1];
      if (tail?.kind === 'loose') tail.pages.push(page);
      else blocks.push({ kind: 'loose', pages: [page] });
    }
    return blocks;
  }, [mapEntries]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = spineOrder.indexOf(String(active.id));
      const newIndex = spineOrder.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      onSpineOrderChange(arrayMove(spineOrder, oldIndex, newIndex));
    },
    [spineOrder, onSpineOrderChange],
  );

  /**
   * One destination row.
   *
   * `icon` is OMITTED for a row inside a group — the parent wears the glyph
   * (icon law) — and such a row instead gets the **rail HAIRLINE** on its left,
   * `spineRailLineClass`: one physical line, always mounted, two colour tokens
   * (`border-soft` idle → `text-default` on the row you are on).
   *
   * That line is not decoration; it is what makes an open parent's children
   * legible as its children (operator 2026-09-14: *"when a parent level design
   * sidebar is open, it should display a hairline exactly like the pasted page
   * component … a hairline on the left of all the child components"*). It is
   * the SAME element the `/m` drawer has always used, which is the point: the
   * desk had a 32px indent and the phone had a hairline, so one law was painted
   * two ways. The indent token is retired.
   *
   * Its X is not free either: the group body carries
   * {@link SPINE_CHILD_RAIL_INSET_CLASS}, which lands the rail in the PARENT
   * GLYPH's column (operator 2026-09-14: *"a hairline on the left side and
   * aligned with the icon of the parent to the left of the child and then the
   * name on the right side"*). Before that the body was `pl-2` and the rail sat
   * under the parent's left pad instead — right mark, wrong column.
   */
  const renderMenuRow = (opts: {
    key: string;
    label: string;
    icon?: SidebarIconComponent;
    active: boolean;
    ariaLabel: string;
    onClick: () => void;
    onMouseEnter?: () => void;
  }) => {
    const RowIcon = opts.icon;
    return (
      <SidebarMenuItem
        key={opts.key}
        className={RowIcon ? undefined : 'flex min-w-0 w-full items-stretch'}
      >
        {RowIcon ? null : (
          <span className={spineRailLineClass(opts.active)} aria-hidden />
        )}
        <SidebarMenuButton
          isActive={opts.active}
          onClick={opts.onClick}
          onMouseEnter={opts.onMouseEnter}
          aria-label={opts.ariaLabel}
          aria-current={opts.active ? 'page' : undefined}
          className={RowIcon ? undefined : 'min-w-0 w-auto flex-1'}
        >
          {RowIcon ? <RowIcon className={navIconStrokeClass(SPINE_ROW_ICON_CLASS)} /> : null}
          <span className={cn('min-w-0 flex-1 truncate', SPINE_LABEL_CLASS)} title={opts.label}>
            {opts.label}
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  /** A page row INSIDE a group — no glyph, indented under the group's icon. */
  const renderLeaf = (page: SidebarPageNav) =>
    renderMenuRow({
      key: page.id,
      label: page.label,
      active: page.id === activePage.id,
      ariaLabel: `Go to ${page.label}`,
      onClick: () => onNavigate(page.id),
      onMouseEnter: onRowHover ? () => onRowHover(page) : undefined,
    });

  const renderSection = (opts: {
    sectionKey: string;
    sortableId: string;
    domId: string;
    label: string;
    icon: SidebarIconComponent;
    rows: ReactNode;
    rowCount: number;
    ownsCurrent: boolean;
  }) => {
    if (opts.rowCount === 0) return null;
    const open = isSectionOpen(opts.sectionKey);
    const bodyId = `${opts.domId}-body`;
    return (
      <SidebarGroup id={opts.domId} role="group" aria-label={opts.label}>
        <SortableSectionTrigger
          id={opts.sortableId}
          label={opts.label}
          icon={opts.icon}
          open={open}
          rowCount={opts.rowCount}
          ownsCurrent={opts.ownsCurrent}
          bodyId={bodyId}
          onToggle={() => setSectionOpen(opts.sectionKey, !open)}
        />
        {open ? (
          <SidebarGroupContent
            id={bodyId}
            role="group"
            aria-label={opts.label}
            className={cn('relative', SPINE_CHILD_RAIL_INSET_CLASS)}
          >
            {/* The continuous trunk: one hairline from the parent glyph's
                bottom to the end of the child list. The per-row segments in
                `renderMenuRow` paint over it in the same column to mark the
                current row. */}
            <span className={SPINE_CHILD_RAIL_TRUNK_CLASS} aria-hidden />
            <SidebarMenu>{opts.rows}</SidebarMenu>
          </SidebarGroupContent>
        ) : null}
      </SidebarGroup>
    );
  };

  /**
   * One LANE as a top-level `SidebarGroup` (v3) — Inbound · Outbound ·
   * Inventory · Products · Sales · Support · Operations.
   *
   * There is no "Workspaces" parent any more. It named the software's idea of
   * itself, and it cost the operator a disclosure before they could read the
   * domain they came for. The lanes are the parents: a flat band of named
   * groups beside Scan Stations, each individually draggable
   * (`SPINE_LANE_SLOT_IDS` are real slots, so staff reorder acts on domains
   * rather than on one opaque block).
   *
   * **Single-page lanes EXPAND (operator ruling 2026-09-14, supersedes the
   * collapse rule).** *"Ensure all the sidebar names and icons are under one
   * parent … exactly like inbound and outbound, create different parents and
   * expand them into different childs."* A lane holding one page paints the
   * lane label plus that page's OWN children as rows — Sales → Counter · Sales
   * Board · Local Pickup · Repair Service. The children already exist
   * (`SIDEBAR_PAGE_NAV` desk chrome); before this they were reachable only as
   * in-page tabs, so the spine hid one whole altitude of the IA behind a flat
   * row. Registry invariant pinned in `sidebar-navigation.test.ts`.
   *
   * The collapse rule survives in one case only: a lone page with NO children,
   * where a `SidebarGroupLabel` really would sit over nothing. `spineFlat`
   * pages (Automations) opt out by declaration.
   *
   * That is also what puts *Outbound* on the spine without renaming the
   * Shipping desk (its header chip, ⌘K entry and recents keep "Shipping",
   * which is a station/milestone word too).
   *
   * The row (collapsed) or the label (expanded) wears the **lane's** glyph,
   * never a member page's — the icon marks the parent, so it must name the
   * parent. Child rows carry no glyph and indent into the parent's label
   * column via {@link renderMenuRow}.
   *
   * An empty lane never reaches here — `resolveSpineMapEntries` drops a lane
   * slot the role cannot paint, so no label ever sits over nothing.
   */
  const renderLane = (lane: (typeof DESK_SPINE_SECTIONS)[number]) => {
    const lanePages = deskPages.filter((page) => spineSectionIdForPage(page) === lane.id);
    if (lanePages.length === 0) return null;

    if (lanePages.length === 1) {
      const page = lanePages[0]!;
      const children = page.spineFlat ? [] : (page.children ?? []);

      // No children to expand: keep the flat one-row face wearing the lane label.
      if (children.length === 0) {
        return (
          <SidebarGroup key={lane.id}>
            <SidebarMenu>
              <SortableMenuRow
                id={lane.id}
                label={lane.label}
                icon={lane.icon}
                active={page.id === activePage.id}
                ariaLabel={`Go to ${lane.label}`}
                onActivate={() => onNavigate(page.id)}
                onMouseEnter={onRowHover ? () => onRowHover(page) : undefined}
              />
            </SidebarMenu>
          </SidebarGroup>
        );
      }

      // `onNavigate(pageId, childId)` is the same door the `kind: 'parent'`
      // block uses, so a child row lands on that desk tab.
      return (
        <div key={lane.id}>
          {renderSection({
            sectionKey: lane.id,
            sortableId: lane.id,
            domId: `spine-section-${lane.id}`,
            label: lane.label,
            icon: lane.icon,
            rows: children.map((child) =>
              renderMenuRow({
                key: `${page.id}-${child.id}`,
                label: child.label,
                active: page.id === activePage.id && highlightedChildId === child.id,
                ariaLabel: `Go to ${child.label}`,
                onClick: () => onNavigate(page.id, child.id),
                onMouseEnter: onRowHover ? () => onRowHover(page) : undefined,
              }),
            ),
            rowCount: children.length,
            ownsCurrent: page.id === activePage.id,
          })}
        </div>
      );
    }

    return (
      <div key={lane.id}>
        {renderSection({
          sectionKey: lane.id,
          sortableId: lane.id,
          domId: `spine-section-${lane.id}`,
          label: lane.label,
          icon: lane.icon,
          rows: lanePages.map((page) => renderLeaf(page)),
          rowCount: lanePages.length,
          ownsCurrent: lanePages.some((page) => page.id === activePage.id),
        })}
      </div>
    );
  };

  return (
    <Sidebar data-spine-nav aria-label="Pages" className={className}>
      <SidebarContent
        data-spine-scrollport
        className={SPINE_SCROLLPORT_SCROLLBAR_CLASS}
      >
        {topPages.length > 0 ? (
          <SidebarGroup id="spine-section-top" role="group" aria-label="Pinned">
            <SidebarMenu>
              {topPages.map((page) =>
                renderMenuRow({
                  key: page.id,
                  label: page.label,
                  icon: page.icon,
                  active: page.id === activePage.id,
                  ariaLabel: `Go to ${page.label}`,
                  onClick: () => onNavigate(page.id),
                  onMouseEnter: onRowHover ? () => onRowHover(page) : undefined,
                }),
              )}
            </SidebarMenu>
          </SidebarGroup>
        ) : null}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={spineOrder} strategy={verticalListSortingStrategy}>
            {spineBlocks.map((block) => {
              if (block.kind === 'stations') {
                if (!stationsSection) return null;
                return (
                  <div key={SPINE_STATIONS_SLOT_ID}>
                    {renderSection({
                      sectionKey: 'floor',
                      sortableId: SPINE_STATIONS_SLOT_ID,
                      domId: 'spine-section-floor',
                      label: stationsSection.label,
                      icon: stationsSection.icon,
                      rows: floorPages.map((page) => renderLeaf(page)),
                      rowCount: floorPages.length,
                      ownsCurrent: floorPages.some((page) => page.id === activePage.id),
                    })}
                  </div>
                );
              }
              if (block.kind === 'lane') {
                return renderLane(block.lane);
              }
              if (block.kind === 'parent') {
                const page = block.page;
                const children = page.children ?? [];
                return (
                  <div key={page.id}>
                    {renderSection({
                      sectionKey: page.id,
                      sortableId: page.id,
                      domId: `spine-section-${page.id}`,
                      label: page.label,
                      icon: page.icon,
                      rows: children.map((child) =>
                        renderMenuRow({
                          key: `${page.id}-${child.id}`,
                          label: child.label,
                          active: page.id === activePage.id && highlightedChildId === child.id,
                          ariaLabel: `Go to ${child.label}`,
                          onClick: () => onNavigate(page.id, child.id),
                        }),
                      ),
                      rowCount: children.length,
                      ownsCurrent: page.id === activePage.id,
                    })}
                  </div>
                );
              }
              return (
                <SidebarGroup key={`loose-${block.pages[0]!.id}`}>
                  <SidebarMenu>
                    {block.pages.map((page) => (
                      <SortableMenuRow
                        key={page.id}
                        id={page.id}
                        label={page.label}
                        icon={page.icon}
                        active={page.id === activePage.id}
                        ariaLabel={`Go to ${page.label}`}
                        onActivate={() => onNavigate(page.id)}
                        onMouseEnter={onRowHover ? () => onRowHover(page) : undefined}
                      />
                    ))}
                  </SidebarMenu>
                </SidebarGroup>
              );
            })}
          </SortableContext>
        </DndContext>
      </SidebarContent>
      <SidebarFooter>
        <StaffAccountFooter />
      </SidebarFooter>
    </Sidebar>
  );
}
