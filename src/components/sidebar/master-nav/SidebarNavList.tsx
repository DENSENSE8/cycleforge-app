'use client';

import { Fragment, Suspense, useMemo, type ReactNode } from 'react';
import { ChevronDown, Plus } from '@/components/Icons';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import {
  resolveSpineMapEntries,
  spineStructuralBottomPages,
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
import { LANE_DOORS } from '@/lib/nav/lanes';
import {
  Sidebar,
  SidebarContent,
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
  SPINE_PARENT_ICON_MOTION_CLASS,
  SPINE_PARENT_MARKER_CLASS,
  SPINE_PARENT_ROW_MOTION_CLASS,
  SPINE_ROW_ICON_CLASS,
  SPINE_SCROLLPORT_SCROLLBAR_CLASS,
  SPINE_NAV_GROUP_TITLE_CLASS,
  SPINE_SECTION_LABEL_STICKY_CLASS,
  spineNavigationBand,
  spineNavigationBandTitle,
} from '@/components/sidebar/sidebar-spine';
import { IconButton } from '@/design-system/primitives/IconButton';
import { Collapse } from '@/design-system/components/Collapse';
import { AI_CHAT_NEW_EVENT } from '@/lib/app-events';
import { cn } from '@/utils/_cn';
import { ChatSessionsNav } from './ChatSessionsNav';
import { useSpineSectionCollapse } from './useSpineSectionCollapse';
import { useLaneDoorHref } from '@/components/sidebar/contextual/useLaneDoorHref';
import { spineParentTone } from './spine-parent-tone';
import { handleSidebarNavigationKeyDown } from '@/components/sidebar/sidebar-keyboard-navigation';
import { LIST_KEY_OWNER_ATTR } from '@/lib/keyboard/list-key-scope';

/** MasterNav page list, painted on the shadcn `Sidebar*` primitives (`@/components/ui/sidebar`) — the component tree the operator named… */
interface SidebarNavListProps {
  activePage: SidebarPageNav;
  activeChildId: string | null;
  otherPages: SidebarPageNav[];
  onNavigate: (pageId: string, childId?: string) => void;
  /** Push an in-app href (a chat thread, `?new=1`) and close the mobile sheet. */
  onOpenHref: (href: string) => void;
  onRowHover?: (page: SidebarPageNav) => void;
  className?: string;
}

/** A parent destination row in the product-defined navigation order. */
function ParentMenuRow({
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
  const tone = spineParentTone(id);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        data-sidebar-nav-item
        isActive={active}
        onClick={onActivate}
        onMouseEnter={onMouseEnter}
        aria-label={ariaLabel}
        aria-current={active ? 'page' : undefined}
        className={cn(
          SPINE_PARENT_ROW_MOTION_CLASS,
          tone.row,
        )}
      >
        <span
          aria-hidden
          className={cn(
            SPINE_PARENT_MARKER_CLASS,
            tone.marker,
            active && 'scale-y-100 opacity-100',
          )}
        />
        <RowIcon
          className={navIconStrokeClass(cn(SPINE_ROW_ICON_CLASS, SPINE_PARENT_ICON_MOTION_CLASS, tone.icon))}
        />
        <span className={cn('min-w-0 flex-1 truncate', SPINE_LABEL_CLASS)} title={label}>
          {label}
        </span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** The group's face: */
function SectionTriggerFace({
  toneKey,
  label,
  icon: SectionIcon,
  open,
  ownsCurrent,
  bodyId,
  onToggle,
}: {
  toneKey: string;
  label: string;
  icon: SidebarIconComponent;
  open: boolean;
  ownsCurrent: boolean;
  bodyId: string;
  onToggle: () => void;
}) {
  const tone = spineParentTone(toneKey);
  return (
    <SidebarGroupLabel asChild>
      <button
        type="button"
        data-spine-section-trigger
        data-sidebar-nav-item
        data-owns-current={ownsCurrent ? 'true' : undefined}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
        className={cn(
          'relative cursor-pointer',
          SPINE_SECTION_LABEL_STICKY_CLASS,
          SPINE_PARENT_ROW_MOTION_CLASS,
          tone.section,
          ownsCurrent && 'font-semibold',
        )}
      >
        <span
          aria-hidden
          className={cn(
            SPINE_PARENT_MARKER_CLASS,
            tone.marker,
            ownsCurrent && 'scale-y-100 opacity-100',
          )}
        />
        <SectionIcon
          className={navIconStrokeClass(cn(SPINE_ROW_ICON_CLASS, SPINE_PARENT_ICON_MOTION_CLASS, tone.icon))}
        />
        <span className={cn('min-w-0 flex-1 truncate', SPINE_LABEL_CLASS)} title={label}>
          {label}
        </span>
        {/* No count on a lane (operator 2026-09-26, Vercel sidebar law): the
            nav names places; numbers live in the page. */}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
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

export function SidebarNavList({
  activePage,
  activeChildId,
  otherPages,
  onNavigate,
  onOpenHref,
  onRowHover,
  className,
}: SidebarNavListProps) {
  const highlightedChildId = activeChildId ?? activePage.children?.[0]?.id ?? null;
  const topPages = spineStructuralTopPages(otherPages);
  const bottomPages = spineStructuralBottomPages(otherPages);
  const stationsSection = SPINE_SECTIONS.find((s) => s.id === 'floor');
  const { isSectionOpen, setSectionOpen } = useSpineSectionCollapse();
  const doorHref = useLaneDoorHref();

  const floorPages = useMemo(
    () => otherPages.filter((p) => spineSectionIdForPage(p) === 'floor'),
    [otherPages],
  );
  const deskPages = useMemo(
    () => otherPages.filter((p) => isSpineDeskItem(p)),
    [otherPages],
  );

  const mapEntries = useMemo(() => resolveSpineMapEntries(otherPages), [otherPages]);

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

  /**
   * One destination row.
   * legible as its children (operator 2026-09-14: *"when a parent level design
   * Parent destinations wear a glyph; child destinations align to the rail.
   */
  const renderMenuRow = (opts: {
    key: string;
    label: string;
    icon?: SidebarIconComponent;
    active: boolean;
    ariaLabel: string;
    onClick: () => void;
    onMouseEnter?: () => void;
    /** Parent rows alone carry color and animated depth. */
    toneKey?: string;
    /** Hover-revealed action at the row's end (always shown on the active row). */
    trailing?: ReactNode;
  }) => {
    const RowIcon = opts.icon;
    const tone = opts.toneKey ? spineParentTone(opts.toneKey) : null;
    return (
      <SidebarMenuItem
        key={opts.key}
        className={cn(RowIcon ? undefined : 'flex min-w-0 w-full items-stretch', opts.trailing && 'group/row')}
      >
        {RowIcon ? null : (
          <span className={spineRailLineClass(opts.active)} aria-hidden />
        )}
        <SidebarMenuButton
          data-sidebar-nav-item
          isActive={opts.active}
          onClick={opts.onClick}
          onMouseEnter={opts.onMouseEnter}
          aria-label={opts.ariaLabel}
          aria-current={opts.active ? 'page' : undefined}
          className={cn(
            RowIcon ? [SPINE_PARENT_ROW_MOTION_CLASS, tone?.row] : 'min-w-0 w-auto flex-1',
            opts.trailing && 'pr-9',
          )}
        >
          {RowIcon && tone ? (
            <span
              aria-hidden
              className={cn(
                SPINE_PARENT_MARKER_CLASS,
                tone.marker,
                opts.active && 'scale-y-100 opacity-100',
              )}
            />
          ) : null}
          {RowIcon ? (
            <RowIcon
              className={navIconStrokeClass(
                cn(SPINE_ROW_ICON_CLASS, SPINE_PARENT_ICON_MOTION_CLASS, tone?.icon),
              )}
            />
          ) : null}
          <span className={cn('min-w-0 flex-1 truncate', SPINE_LABEL_CLASS)} title={opts.label}>
            {opts.label}
          </span>
        </SidebarMenuButton>
        {opts.trailing ? (
          <div
            className={cn(
              'absolute right-1 top-1/2 -translate-y-1/2 transition-opacity',
              opts.active
                ? 'opacity-100'
                : 'opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100',
            )}
          >
            {opts.trailing}
          </div>
        ) : null}
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
        <SectionTriggerFace
          toneKey={opts.sectionKey}
          label={opts.label}
          icon={opts.icon}
          open={open}
          ownsCurrent={opts.ownsCurrent}
          bodyId={bodyId}
          onToggle={() => setSectionOpen(opts.sectionKey, !open)}
        />
        <Collapse open={open}>
          <SidebarGroupContent
            id={bodyId}
            role="group"
            aria-label={opts.label}
            className={cn('relative', SPINE_CHILD_RAIL_INSET_CLASS)}
          >
            {/* The continuous trunk: */}
            <span className={SPINE_CHILD_RAIL_TRUNK_CLASS} aria-hidden />
            <SidebarMenu>{opts.rows}</SidebarMenu>
          </SidebarGroupContent>
        </Collapse>
      </SidebarGroup>
    );
  };

  /**
   * One LANE as a top-level `SidebarGroup` (v3) — Inbound · Outbound · Inventory · Products · Sales · Support · Operations.
   * **Single-page lanes EXPAND (operator ruling 2026-09-14, supersedes the
   */
  const renderLane = (lane: (typeof DESK_SPINE_SECTIONS)[number]) => {
    const lanePages = deskPages.filter((page) => spineSectionIdForPage(page) === lane.id);
    if (lanePages.length === 0) return null;

    // A lane DOOR is one row that opens its landing page — no dropdown of the
    // lane's pages; the landing page's contextual sidebar holds them.
    const door = lanePages.find((page) => page.id === LANE_DOORS[lane.id]);
    if (door) {
      return (
        <SidebarGroup key={lane.id}>
          <SidebarMenu>
            <ParentMenuRow
              id={lane.id}
              label={lane.label}
              icon={lane.icon}
              active={lanePages.some((page) => page.id === activePage.id)}
              ariaLabel={`Go to ${lane.label}`}
              onActivate={() => {
                const href = doorHref(door.id);
                if (href) onOpenHref(href);
                else onNavigate(door.id);
              }}
              onMouseEnter={onRowHover ? () => onRowHover(door) : undefined}
            />
          </SidebarMenu>
        </SidebarGroup>
      );
    }

    if (lanePages.length === 1) {
      const page = lanePages[0]!;
      const children = page.spineFlat ? [] : (page.children ?? []);

      // No children to expand: keep the flat one-row face wearing the lane label.
      if (children.length === 0) {
        return (
          <SidebarGroup key={lane.id}>
            <SidebarMenu>
              <ParentMenuRow
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
    <Sidebar
      data-spine-nav
      role="navigation"
      aria-label="Pages"
      className={className}
      onKeyDown={handleSidebarNavigationKeyDown}
      {...{ [LIST_KEY_OWNER_ATTR]: '' }}
    >
      <SidebarContent
        data-spine-scrollport
        className={SPINE_SCROLLPORT_SCROLLBAR_CLASS}
      >
        {topPages.length > 0 ? (
          <SidebarGroup id="spine-section-top" role="group" aria-label="Pinned">
            <div data-sidebar-group-title className={SPINE_NAV_GROUP_TITLE_CLASS}>
              Workspace
            </div>
            <SidebarMenu>
              {topPages.map((page) => {
                const row = renderMenuRow({
                  key: page.id,
                  label: page.label,
                  icon: page.icon,
                  toneKey: page.id,
                  active: page.id === activePage.id,
                  ariaLabel: `Go to ${page.label}`,
                  onClick: () => onNavigate(page.id),
                  onMouseEnter: onRowHover ? () => onRowHover(page) : undefined,
                  trailing:
                    page.id === 'ai-chat' ? (
                      <IconButton
                        size="xs"
                        ariaLabel="New chat"
                        title="New chat"
                        icon={<Plus className="h-4 w-4" />}
                        className="text-text-faint hover:bg-surface-sunken hover:text-text-default"
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent(AI_CHAT_NEW_EVENT));
                          onOpenHref('/ai-chat?new=1');
                        }}
                      />
                    ) : undefined,
                });
                // The Chat row's threads, only while on /ai-chat: the WMS spine stays calm elsewhere.
                if (page.id !== 'ai-chat' || activePage.id !== 'ai-chat') return row;
                return [
                  row,
                  <SidebarMenuItem key="ai-chat-sessions">
                    <Suspense fallback={null}>
                      <ChatSessionsNav onOpenHref={onOpenHref} />
                    </Suspense>
                  </SidebarMenuItem>,
                ];
              })}
            </SidebarMenu>
          </SidebarGroup>
        ) : null}

        {spineBlocks.map((block, index) => {
              const blockId =
                block.kind === 'stations'
                  ? SPINE_STATIONS_SLOT_ID
                  : block.kind === 'lane'
                    ? block.lane.id
                    : block.kind === 'parent'
                      ? block.page.id
                      : block.pages[0]!.id;
              const previousBlock = spineBlocks[index - 1];
              const previousId = previousBlock
                ? previousBlock.kind === 'stations'
                  ? SPINE_STATIONS_SLOT_ID
                  : previousBlock.kind === 'lane'
                    ? previousBlock.lane.id
                    : previousBlock.kind === 'parent'
                      ? previousBlock.page.id
                      : previousBlock.pages[0]!.id
                : null;
              const band = spineNavigationBand(blockId);
              const startsBand = previousId === null || spineNavigationBand(previousId) !== band;
              const wrapBlock = (node: ReactNode) => (
                <Fragment key={blockId}>
                  {startsBand ? (
                    <div data-sidebar-group-title className={SPINE_NAV_GROUP_TITLE_CLASS}>
                      {spineNavigationBandTitle(band)}
                    </div>
                  ) : null}
                  {node}
                </Fragment>
              );
              if (block.kind === 'stations') {
                if (!stationsSection) return null;
                const activeStation = floorPages.find((page) => page.id === activePage.id);
                const stationDoor = activeStation ?? floorPages[0];
                if (!stationDoor) return null;
                return wrapBlock(
                  <SidebarGroup>
                    <SidebarMenu>
                      <ParentMenuRow
                        id={SPINE_STATIONS_SLOT_ID}
                        label={stationsSection.label}
                        icon={stationsSection.icon}
                        active={Boolean(activeStation)}
                        ariaLabel={`Go to ${stationsSection.label}`}
                        onActivate={() => onNavigate(stationDoor.id)}
                        onMouseEnter={
                          onRowHover ? () => onRowHover(stationDoor) : undefined
                        }
                      />
                    </SidebarMenu>
                  </SidebarGroup>,
                );
              }
              if (block.kind === 'lane') {
                return wrapBlock(renderLane(block.lane));
              }
              if (block.kind === 'parent') {
                const page = block.page;
                const children = page.children ?? [];
                return wrapBlock(
                  <div>
                    {renderSection({
                      sectionKey: page.id,
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
                  </div>,
                );
              }
              return wrapBlock(
                <SidebarGroup>
                  <SidebarMenu>
                    {block.pages.map((page) => (
                      <ParentMenuRow
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
                </SidebarGroup>,
              );
        })}
        {bottomPages.length > 0 ? (
          <SidebarGroup id="spine-section-bottom" role="group" aria-label="Utilities">
            <div data-sidebar-group-title className={SPINE_NAV_GROUP_TITLE_CLASS}>
              Utilities
            </div>
            <SidebarMenu>
              {bottomPages.map((page) =>
                renderMenuRow({
                  key: page.id,
                  label: page.label,
                  icon: page.icon,
                  toneKey: page.id,
                  active: page.id === activePage.id,
                  ariaLabel: `Go to ${page.label}`,
                  onClick: () => onNavigate(page.id),
                  onMouseEnter: onRowHover ? () => onRowHover(page) : undefined,
                }),
              )}
            </SidebarMenu>
          </SidebarGroup>
        ) : null}
      </SidebarContent>
    </Sidebar>
  );
}
