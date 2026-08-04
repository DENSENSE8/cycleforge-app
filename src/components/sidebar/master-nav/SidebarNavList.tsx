'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
import {
  framerPresence,
  framerTransition,
  framerVariants,
} from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { ChevronDown, ChevronLeft, ChevronsRight } from '@/components/Icons';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import { buildNavDestinations, type NavDestination } from '@/lib/nav/nav-destinations';
import { searchNav, splitNavHighlight, type NavMatch } from '@/lib/nav/nav-search';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import {
  spineAccentFor,
  type SpineAccentClasses,
} from '@/lib/nav/spine-section-accent';
import {
  SPINE_SECTIONS,
  STATION_SUBGROUPS,
  spineSectionIdForPage,
  type SidebarPageNav,
  type SpineSectionId,
  type StationSubgroupId,
} from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';
import { StaffAccountFooter } from './StaffAccountFooter';

/**
 * The page list inside the sidebar spine — **ONE flat scrolling map**.
 *
 * The body is every reachable destination in {@link SPINE_SECTIONS} order —
 * **Scan Stations first (2026-08-03)**, because the benches are what this
 * product is for — grouped by a `border-t`; a footer-pinned {@link TechRailSearchBar} (`density="row"`,
 * the shared ~33px band used by station recent rails too) sits above the
 * footer band — Workflow Studio · Admin · Settings — then
 * {@link StaffAccountFooter}.
 *
 * ## The drill is gone (2026-08-02)
 *
 * Six of the eight sections held exactly one page, so drilling charged a click
 * to reveal a row carrying the section's own name — `Catalog › Catalog`. That
 * duplicate was the visible symptom of hierarchy with no content.
 *
 * **Scan Stations enters via a list-replace drill (2026-08-03), not an eyebrow.**
 * Other sections render pages directly — no clickable header ROW and never a
 * chevron: a header would re-create `Catalog › Catalog` everywhere a section
 * shares a name with a page beneath it, which is most of them.
 *
 * The divider is **load-bearing**: the root axis is deliberately mixed (Scan
 * Stations is an INPUT MODEL among business DOMAINS) and the rule between the
 * blocks is the only thing left saying so.
 *
 * ## Multi-child L1 discloses in place
 *
 * Click expands / collapses — it does not navigate. Destination is a child
 * row (or a leaf L1). Every nest opens through {@link renderStaggeredNest}
 * (15ms cascade). Expanding every nest at once was measured at **64 rows /
 * ~1790px against a ~600px scrollport** — accordion keeps the map usable.
 *
 * ## Chrome
 *
 * **No badges of any kind (2026-08-03).** The trailing child-count pill is gone.
 * It meant structural cardinality — a number that never changes — in the shape
 * the whole industry uses for unread work, so it read as a notification and won
 * an attention contest it had no business entering. The count survives in each
 * row's accessible name. The vacated slot stays EMPTY: see `renderPageHeader`.
 *
 * **Nesting is a rail, not just an indent.** Child rows draw a left hairline
 * (`renderChildLikeRow`) that costs no vertical space — the one thing this
 * column cannot spend, since the map already measures 732px against a 685px
 * port on the widest page.
 *
 * **Neutral and STILL.** Accents resolve to one grey ladder via
 * {@link spineAccentFor} — the eight section hues are gone. Nothing on a row
 * travels on hover: the glyph's 2px CSS lift was deleted with the hues, because
 * a structural anchor in a 20-row column should not move under the pointer, and
 * the neutral wash answers hover on its own. The older bans stand and are about
 * cost, not taste — a framer `whileHover` here would re-render React on every
 * mousemove across the list, a row-level `scale` breaks the baseline every dense
 * surface beside it aligns to, and a hover weight shift reflows text mid-pointer.
 *
 * **Every row carries its glyph, at the same light page stroke.** A child
 * / station-subgroup) row is the switch between one page's siblings, which is
 * the job the GlobalHeader page switcher draws with the same icon set — two doors
 * onto one destination must not disagree about whether it has a face. What child
 * rows do NOT get is the heavier L2 weight: at 2.25 a child glyph out-draws its
 * own parent at 1.5. Subordination is the indent, the caption/medium type, and
 * the muted ink.
 *
 * **The map mounts instantly.** It is painted on every cold load, so a cascade
 * there is time-to-interactive spent on rows whose position the operator already
 * knows. The one surviving cascade ({@link framerVariants.spineRowStaggerContainer})
 * belongs to multi-child L1 nests, which mount on expand (15ms × index).
 * Body swap (map ⇄ ranked results) is opacity-only
 * {@link framerPresence.spineBodySwap}.
 */
interface SidebarNavListProps {
  activePage: SidebarPageNav;
  activeChildId: string | null;
  otherPages: SidebarPageNav[];
  onNavigate: (pageId: string, childId?: string) => void;
  /** Hover hook per page row — warms the destination's data (nav-data-prefetch). */
  onRowHover?: (page: SidebarPageNav) => void;
  /** Scan Stations Vercel drill — list-replace for the floor section only. */
  stationsDrillOpen: boolean;
  onStationsDrillChange: (open: boolean) => void;
  className?: string;
}

function pagesForSection(pages: SidebarPageNav[], sectionId: SpineSectionId): SidebarPageNav[] {
  return pages.filter((p) => spineSectionIdForPage(p) === sectionId);
}

function subgroupDef(id: StationSubgroupId | undefined) {
  if (!id) return null;
  return STATION_SUBGROUPS.find((g) => g.id === id) ?? null;
}

// There is deliberately NO local matcher here. A query switches the body to the
// flat destination list, which ranks through `searchNav` — the one nav matcher.
// Two unranked `includes()` helpers used to live at this spot: one narrowed the
// root's section BUTTONS, the other the drill's pages. That split is what made
// typing a page's exact name return a category.

export function SidebarNavList({
  activePage,
  activeChildId,
  otherPages,
  onNavigate,
  onRowHover,
  stationsDrillOpen,
  onStationsDrillChange,
  className,
}: SidebarNavListProps) {
  const highlightedChildId = activeChildId ?? activePage.children?.[0]?.id ?? null;
  const bodySwapPresence = useMotionPresence(framerPresence.spineBodySwap);
  const bodySwapTransition = useMotionTransition(framerTransition.spineBodySwap);
  const activeWashPresence = useMotionPresence(framerPresence.spineActiveWash);
  const activeWashTransition = useMotionTransition(framerTransition.spineActiveWash);
  const [navFilter, setNavFilter] = useState('');

  /**
   * A non-empty query switches the body from HIERARCHY to a flat ranked list.
   *
   * Categories answer "what exists" (recognition); search answers "take me to
   * the thing I named" (recall). Filtering the *category* buttons served
   * neither: typing a page's exact name returned a section that did not contain
   * the word, and the operator still had to drill and re-scan. Tree at rest,
   * flat while searching — the same switch VS Code / Linear / Notion make.
   */
  const searching = navFilter.trim().length > 0;

  const destinations = useMemo(
    // `otherPages` is misnamed upstream — MasterNav passes the FULL page list,
    // active page included. Merging by id rather than spreading keeps this
    // correct under either contract; spreading duplicated every destination of
    // the active page under an identical key, so the keyboard cursor lit two
    // rows at once and React saw duplicate children.
    () => {
      const seen = new Set(otherPages.map((p) => p.id));
      const pages = seen.has(activePage.id) ? otherPages : [activePage, ...otherPages];
      return buildNavDestinations(pages);
    },
    [activePage, otherPages],
  );
  const results = useMemo(
    () => (searching ? searchNav(destinations, navFilter) : []),
    [searching, destinations, navFilter],
  );

  /** Keyboard cursor into `results`. Reset whenever the result set changes. */
  const [cursor, setCursor] = useState(0);
  useEffect(() => {
    setCursor(0);
  }, [navFilter]);
  const activeResultKey = results[cursor]?.item.key ?? null;

  const goToDestination = (destination: NavDestination) => {
    onNavigate(destination.pageId, destination.childId);
  };

  /**
   * ↓/↑/Enter from the filter box. A filter with results and no keyboard makes
   * the operator type, lift, and aim — which is the whole cost the box was
   * meant to remove. Escape clears (and only then blurs), so one key gets back
   * to the map.
   */
  const handleFilterKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!searching || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const picked = results[cursor]?.item;
      if (picked) {
        goToDestination(picked);
        setNavFilter('');
      }
    }
  };

  const bottomPages = otherPages.filter((p) => (p.kind ?? 'bottom') === 'bottom');
  const neutralAccent = spineAccentFor(null);

  /**
   * Station subgroups the operator has expanded (Receiving today). Default is
   * **collapsed** — opening one nest closes the others (accordion). Owning the
   * active page still forces open so you cannot hide the bench you are on.
   * Cleared on every in-app page jump so a manual expand cannot stack beside
   * another page's children (Receiving open + Testing open).
   */
  const [expandedSubgroups, setExpandedSubgroups] = useState<ReadonlySet<StationSubgroupId>>(
    () => new Set(),
  );
  /**
   * Multi-child L1 pages the operator has expanded (Shipping · Locations · …).
   * Same accordion + clear-on-jump contract as subgroups. Owning the active
   * page still forces open. Click discloses only — never navigates.
   */
  const [expandedPages, setExpandedPages] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    setExpandedSubgroups(new Set());
    setExpandedPages(new Set());
  }, [activePage.id]);

  const openSubgroup = (id: StationSubgroupId) => {
    // Accordion: one subgroup at a time.
    setExpandedSubgroups(new Set([id]));
  };
  const closeSubgroup = (id: StationSubgroupId) => {
    setExpandedSubgroups((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const openPage = (id: string) => {
    setExpandedPages(new Set([id]));
  };
  const closePage = (id: string) => {
    setExpandedPages((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  /**
   * A child row — a page's child page, or a station inside a subgroup.
   *
   * **It keeps its glyph**, at the SAME light page stroke as its parent. These
   * rows are the switch between siblings of one page (Reference ⇄ Manuals ⇄
   * Labels), and that is the same job — and the same icon set — the GlobalHeader
   * page switcher draws with glyphs. Dropping them here would leave the app's two
   * doors onto one destination disagreeing about whether it has a face.
   *
   * Hierarchy is carried by the **nesting rail** plus the indent, the
   * caption/medium type against the parent's body/semibold, and the muted ink —
   * never by a heavier stroke. A child glyph at the L2 weight (2.25) would
   * out-draw its own parent at 1.5, which inverts the ladder it was supposed to
   * express.
   *
   * ## The rail (2026-08-03; centered 2026-08-03)
   *
   * A left hairline spanning the nested block, in place of relying on indent
   * alone. Two properties earned it a place in a phase whose measurement ruled
   * *against* the richer pattern it came from:
   *
   * 1. **It costs no vertical space.** It is a hairline in a gutter, so the
   *    map's height is unchanged — which is the only currency the spine is
   *    short of (measured: 732px of map against a 685px port on the widest page).
   * 2. **It survives greyscale.** Same reason the section hues were deleted: the
   *    channels this column may spend are shape and grouping, not colour.
   *
   * **Centered under the parent glyph** via a token-only gutter: `ml-2` matches
   * the parent's `px-2`, `w-3.5` matches the glyph — the `w-px` sits on the
   * icon's centre (15px) without an arbitrary `ml-[15px]`.
   *
   * It is drawn **per row, not per group**, and that is deliberate rather than
   * lazy. Child pages arrive inside a `<ul>`, but station-subgroup members
   * arrive as flat siblings of every other page in the section — there is no
   * element wrapping just them to hang a group rail on. Adjacent rows carry no
   * vertical margin, so per-row segments abut into one continuous line in both
   * shapes, and the active row's own segment darkens to mark where you are.
   *
   * The fill therefore starts INSIDE the rail rather than under it: a hover wash
   * that swallowed the line would erase the one cue this adds.
   */
  const renderChildLikeRow = (
    opts: {
      id: string;
      label: string;
      icon: SidebarPageNav['icon'];
      active: boolean;
      onClick: () => void;
      onMouseEnter?: () => void;
    },
    accent: SpineAccentClasses,
  ) => {
    const RowIcon = opts.icon;
    return (
      <div className="flex">
        <div className="ml-2 flex w-3.5 shrink-0 justify-center" aria-hidden>
          <div
            className={cn(
              'w-px self-stretch transition-colors duration-150',
              opts.active ? 'bg-border-default' : 'bg-border-soft',
            )}
          />
        </div>
        <button
          type="button"
          onClick={opts.onClick}
          onMouseEnter={opts.onMouseEnter}
          className={cn(
            'ds-raw-button group flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 pl-1 pr-2 text-left transition-colors duration-150',
            opts.active ? accent.childActive : accent.childIdle,
          )}
        >
          {RowIcon ? (
            <RowIcon
              className={navIconStrokeClass(
                'page',
                cn(
                  'h-3.5 w-3.5 shrink-0',
                  opts.active ? accent.childActiveIcon : accent.childIdleIcon,
                ),
              )}
            />
          ) : null}
          <span className="min-w-0 flex-1 truncate text-role-caption font-medium">{opts.label}</span>
        </button>
      </div>
    );
  };

  /**
   * An L1 destination row.
   *
   * **No trailing count (2026-08-03).** A right-aligned pill of digits is the
   * universal notification affordance — it promises unread work — and what this
   * one meant was *structural cardinality*: how many child pages exist. That is
   * a fact that never changes and that an operator learns once, so it was
   * spending the most attention-grabbing slot in the column on the least urgent
   * thing on the row. The operator's read ("it seems like a notification
   * display — it's distracting") was the correct one.
   *
   * The cardinality is **not lost** — it stays in `ariaLabel` ("Catalog — 7
   * pages"), which is where a screen reader needs it and where nothing competes
   * for attention. Callers already pass that string themselves, which is why
   * this signature no longer takes a `count` at all.
   *
   * **Do not fill the vacated slot with a live queue depth.** That is a separate
   * ruling with a real cost — per-render I/O in a registry that is currently
   * safe on every keystroke precisely because it does none — and it must not
   * ride in on a presentation change. Queue depths live in `InboxQueueLinks`;
   * see `source-of-truth.md` → *Per-staff queue depths*.
   */
  const renderPageHeader = (opts: {
    label: string;
    icon: SidebarPageNav['icon'];
    active: boolean;
    ariaLabel: string;
    onClick: () => void;
    onMouseEnter?: () => void;
    /**
     * Trailing affordance — mutually exclusive:
     * - `disclosure` — rotated `ChevronDown` for in-place nests (Receiving,
     *   Locations). Collapsed it looks like ›; that is intentional for expand.
     * - `drill` — `ChevronsRight` (») for list-replace enter (Scan Stations).
     *   A single › would collide with disclosure; the double mark says "go in".
     */
    disclosure?: { expanded: boolean };
    drill?: boolean;
  }, accent: SpineAccentClasses) => {
    const PageIcon = opts.icon;
    const header = (
      <button
        type="button"
        onClick={opts.onClick}
        onMouseEnter={opts.onMouseEnter}
        aria-label={opts.ariaLabel}
        aria-expanded={opts.disclosure ? opts.disclosure.expanded : undefined}
        className={cn(
          'ds-raw-button group flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left transition-colors duration-150',
          opts.active ? accent.activePage : accent.idlePage,
        )}
      >
        <PageIcon
          className={navIconStrokeClass(
            'page',
            cn(
              'h-3.5 w-3.5 shrink-0',
              opts.active ? accent.activePageIcon : accent.idlePageIcon,
            ),
          )}
        />
        <span className="min-w-0 flex-1 truncate text-role-body font-semibold leading-tight">{opts.label}</span>
        {opts.drill ? (
          <ChevronsRight className="h-3.5 w-3.5 shrink-0 text-text-faint" aria-hidden />
        ) : opts.disclosure ? (
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-text-faint motion-safe:transition-transform motion-safe:duration-150',
              !opts.disclosure.expanded && '-rotate-90',
            )}
          />
        ) : null}
      </button>
    );

    if (!opts.active) return header;

    return (
      <motion.div
        initial={activeWashPresence.initial}
        animate={activeWashPresence.animate}
        transition={activeWashTransition}
      >
        {header}
      </motion.div>
    );
  };

  /**
   * Staggered nest body — every in-place dropdown (L1 children · Receiving
   * benches) opens through this so expand always cascades. The list mounts
   * only while expanded; `initial="hidden"` is unconditional.
   */
  const renderStaggeredNest = (
    nestKey: string,
    ariaLabel: string,
    rows: Array<{
      id: string;
      label: string;
      icon: SidebarPageNav['icon'];
      active: boolean;
      onClick: () => void;
      onMouseEnter?: () => void;
    }>,
    accent: SpineAccentClasses,
  ) => (
    <motion.ul
      key={nestKey}
      role="group"
      aria-label={ariaLabel}
      className="list-none p-0"
      initial="hidden"
      animate="visible"
      variants={framerVariants.spineRowStaggerContainer}
    >
      {rows.map((row) => (
        <motion.li key={row.id} variants={framerVariants.spineRowStaggerItem}>
          {renderChildLikeRow(row, accent)}
        </motion.li>
      ))}
    </motion.ul>
  );

  const renderRow = (
    page: SidebarPageNav,
    keyPrefix: string,
    accent: SpineAccentClasses,
    opts?: { pinned?: boolean },
  ) => {
    const rowKey = `${keyPrefix}-${page.id}`;
    // Membership + highlight come from the page id alone. There used to be a
    // second, page-id-keyed "print alias" predicate here so a Print Stations row
    // could light up while the operator was on someone else's URL; the domain
    // split deleted those rows, and with them the only reason the spine ever
    // had to know a specific page's name.
    const isPageActive = page.id === activePage.id;
    const childCount = page.children?.length ?? 0;
    /**
     * Multi-child L1 discloses in place (2026-08-03). Click expands / collapses
     * the nest — it does **not** navigate. Destination is a child row (or a
     * leaf L1 with no children). Owning the active page still forces open so
     * you cannot hide the children of the page you are on.
     *
     * Accordion: only one manual nest at a time (`expandedPages`), same as
     * Receiving subgroups. Expanding every multi-child page at once was measured
     * at **64 rows (~1790px)** against a ~600px scrollport — not a map.
     */
    const hasChildren = !opts?.pinned && childCount > 1;
    const showChildren =
      hasChildren && (isPageActive || expandedPages.has(page.id));
    return (
      <div key={rowKey}>
        {renderPageHeader(
          {
            label: page.label,
            icon: page.icon,
            active: isPageActive || showChildren,
            // Cardinality survives HERE and only here, for the same reason the
            // badge was deleted: a screen reader benefits from "7 pages", and an
            // accessible name competes with nothing for the operator's eye. It
            // stays decoupled from expansion — the page has N children whether
            // or not they happen to be drawn.
            ariaLabel: hasChildren ? `${page.label} — ${childCount} pages` : `Go to ${page.label}`,
            onClick: () => {
              if (!hasChildren) {
                onNavigate(page.id);
                return;
              }
              if (showChildren && !isPageActive) {
                closePage(page.id);
                return;
              }
              if (!showChildren) {
                openPage(page.id);
              }
              // Expanded + owns active — stay open; never navigate from the parent.
            },
            onMouseEnter: onRowHover ? () => onRowHover(page) : undefined,
            // Disclosure chevron for in-place nests. Click toggles; it does not
            // navigate. (Scan Stations uses `drill: true` / ChevronsRight.)
            disclosure: hasChildren ? { expanded: showChildren } : undefined,
          },
          accent,
        )}

        {showChildren && page.children
          ? renderStaggeredNest(
              `nest-${page.id}`,
              `${page.label} pages`,
              page.children.map((child) => ({
                id: child.id,
                label: child.label,
                icon: child.icon,
                active: isPageActive && highlightedChildId === child.id,
                onClick: () => onNavigate(page.id, child.id),
              })),
              accent,
            )
          : null}
      </div>
    );
  };

  /**
   * Scan Stations root row — Vercel list-replace enter.
   *
   * Domains stay on the flat map. Scan Stations alone drills because it holds
   * multiple categories (Receiving · Testing · Packing · Scan out). Click
   * replaces the map with {@link renderStationsDrill}; it does not navigate.
   */
  const renderStationsEnterRow = (accent: SpineAccentClasses) => {
    const section = SPINE_SECTIONS.find((s) => s.id === 'floor');
    if (!section) return null;
    const floorActive = spineSectionIdForPage(activePage) === 'floor';
    // Same L1 chrome as every page row (`h-9` + renderPageHeader) so Scan
    // Stations matches Shipping / Locations height; `drill` paints » not ›.
    return renderPageHeader(
      {
        label: section.label,
        icon: section.icon,
        active: floorActive,
        ariaLabel: `Open ${section.label}`,
        onClick: () => onStationsDrillChange(true),
        drill: true,
      },
      accent,
    );
  };

  /** Floor benches inside the Scan Stations drill (Receiving nest + peers). */
  const renderFloorPages = (pages: SidebarPageNav[], accent: SpineAccentClasses) => {
    const nodes: ReactNode[] = [];
    let lastSubgroup: StationSubgroupId | undefined;

    for (const page of pages) {
      const subgroup = page.kind === 'station' ? page.stationSubgroup : undefined;

      if (subgroup) {
        // Emit the whole subgroup once, on its first member — members share one
        // staggered nest so Receiving expand cascades like Shipping.
        if (subgroup === lastSubgroup) continue;
        lastSubgroup = subgroup;

        const def = subgroupDef(subgroup);
        const members = pages.filter(
          (p) => p.kind === 'station' && p.stationSubgroup === subgroup,
        );
        const subgroupActive = members.some((m) => m.id === activePage.id);
        const firstMember = members[0];
        const subgroupExpanded = subgroupActive || expandedSubgroups.has(subgroup);
        if (!def || !firstMember) continue;

        nodes.push(
          <div key={`subgroup-${subgroup}`} className="mt-0.5 first:mt-0">
            {renderPageHeader(
              {
                label: def.label,
                icon: def.icon,
                active: subgroupActive || subgroupExpanded,
                ariaLabel:
                  members.length > 1
                    ? `${def.label} — ${members.length} stations`
                    : `Go to ${def.label}`,
                onClick: () => {
                  if (subgroupExpanded && !subgroupActive) {
                    closeSubgroup(subgroup);
                    return;
                  }
                  if (!subgroupExpanded) {
                    openSubgroup(subgroup);
                    if (!subgroupActive) onNavigate(firstMember.id);
                  }
                },
                onMouseEnter: onRowHover ? () => onRowHover(firstMember) : undefined,
                disclosure: { expanded: subgroupExpanded },
              },
              accent,
            )}
            {subgroupExpanded
              ? renderStaggeredNest(
                  `nest-subgroup-${subgroup}`,
                  `${def.label} stations`,
                  members.map((member) => ({
                    id: member.id,
                    label: member.label,
                    icon: member.icon,
                    active: member.id === activePage.id,
                    onClick: () => onNavigate(member.id),
                    onMouseEnter: onRowHover ? () => onRowHover(member) : undefined,
                  })),
                  accent,
                )
              : null}
          </div>,
        );
        continue;
      }

      lastSubgroup = undefined;
      nodes.push(
        <div key={page.id} className="mt-0.5 first:mt-0">
          {renderRow(page, 'floor', accent)}
        </div>,
      );
    }

    return nodes;
  };

  /**
   * Vercel-style Scan Stations drill — Back + title + floor benches.
   * Only altitude that list-replaces; domains never enter this shape.
   */
  const renderStationsDrill = () => {
    const section = SPINE_SECTIONS.find((s) => s.id === 'floor');
    if (!section) return null;
    const accent = spineAccentFor('floor');
    const pages = pagesForSection(otherPages, 'floor');
    return (
      <div>
        <button
          type="button"
          onClick={() => onStationsDrillChange(false)}
          aria-label="Back to pages"
          className="ds-raw-button mb-1 grid h-9 w-full grid-cols-[1.25rem_1fr_1.25rem] items-center gap-2 rounded-lg px-2 transition-colors duration-150 hover:bg-surface-hover"
        >
          <ChevronLeft className="h-3.5 w-3.5 shrink-0 justify-self-start text-text-muted" aria-hidden />
          <span className="min-w-0 truncate text-center text-role-body font-semibold leading-tight">
            {section.label}
          </span>
          <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
        </button>
        <div
          id="spine-section-floor"
          role="group"
          aria-label={section.label}
          className="mt-0.5"
        >
          {pages.length === 0 ? (
            <p className="px-2 py-2 text-role-caption text-text-muted">No matching pages</p>
          ) : (
            renderFloorPages(pages, accent)
          )}
        </div>
      </div>
    );
  };

  /**
   * THE map — flat domain list + Scan Stations enter row. There is no
   * all-sections drill (2026-08-02); only Scan Stations list-replaces.
   */
  const renderMap = () => {
    if (stationsDrillOpen) return renderStationsDrill();

    const groups = SPINE_SECTIONS.map((section) => ({
      section,
      pages: pagesForSection(otherPages, section.id),
    })).filter((g) => g.pages.length > 0);

    return (
      <ul role="group" aria-label="Sections" className="list-none p-0">
        {groups.map(({ section, pages }, index) => {
          const accent = spineAccentFor(section.id);

          // Scan Stations — enter row only; benches live inside the drill.
          if (section.id === 'floor') {
            return (
              <li key={section.id} aria-label={section.label} className={cn(index > 0 && 'mt-1')}>
                {renderStationsEnterRow(accent)}
              </li>
            );
          }

          return (
            <li
              key={section.id}
              aria-label={section.label}
              className={cn(index > 0 && 'mt-1')}
            >
              <div id={`spine-section-${section.id}`} className="mt-0.5 first:mt-0">
                {pages.map((page) => (
                  <div key={page.id} className="mt-0.5 first:mt-0">
                    {renderRow(page, section.id, accent)}
                  </div>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    );
  };

  /**
   * One flat destination row. Deliberately NOT the section/page/child row chrome
   * from the hierarchy: those encode depth (indent, child count, chevron), and
   * depth is exactly what a flat result list has thrown away. Reusing them here
   * would draw a tree that no longer exists.
   */
  const renderResultRow = (destination: NavDestination, match: NavMatch) => {
    const Icon = destination.icon;
    const accent = spineAccentFor(destination.sectionId);
    const isCursor = destination.key === activeResultKey;
    return (
      <li key={destination.key}>
        <button
          type="button"
          role="option"
          aria-selected={isCursor}
          onClick={() => {
            goToDestination(destination);
            setNavFilter('');
          }}
          onMouseEnter={() => {
            const page = destination.pageId === activePage.id
              ? activePage
              : otherPages.find((pg) => pg.id === destination.pageId);
            if (page) onRowHover?.(page);
          }}
          className={cn(
            'ds-raw-button group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors duration-150',
            isCursor ? accent.activePage : accent.idlePage,
          )}
        >
          <Icon
            className={navIconStrokeClass(
              'page',
              cn(
                'h-3.5 w-3.5 shrink-0',
                isCursor ? accent.activePageIcon : accent.idlePageIcon,
              ),
            )}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-role-body font-semibold leading-tight">
              {splitNavHighlight(destination.label, match.ranges).map((part, i) =>
                part.hit ? (
                  // Marks the characters that justified the row. Underline, not
                  // a fill: a background chip inside a 12px label at this
                  // density reads as a second chip beside the section eyebrow.
                  <span key={i} className="underline decoration-2 underline-offset-2">
                    {part.text}
                  </span>
                ) : (
                  <span key={i}>{part.text}</span>
                ),
              )}
            </span>
            {destination.context ? (
              <span
                className={cn(
                  'block truncate text-role-micro uppercase tracking-widest',
                  isCursor ? 'text-white/70' : 'text-text-faint',
                )}
              >
                {destination.context}
              </span>
            ) : null}
          </span>
        </button>
      </li>
    );
  };

  const renderSearchResults = () => (
    <ul role="listbox" aria-label="Matching destinations" className="list-none p-0">
      {results.length === 0 ? (
        // Names the query back. "No results" leaves the operator unsure whether
        // the place does not exist or the box simply is not working.
        <li className="px-2 py-2 text-role-caption text-text-muted">
          No destination matches “{navFilter.trim()}”
        </li>
      ) : (
        results.map(({ item, match }) => renderResultRow(item, match))
      )}
    </ul>
  );

  return (
    <div role="menu" aria-label="Pages" className={cn('flex h-full min-h-0 flex-col', className)}>
      {/* Home / Search / Media / Chat used to pin here as four full rows. They
          are icons in the spine's 40px top band (`SpineTopPins`) when open, and
          peek from the collapsed sidebar toggle (`SidebarCollapseControl`) on
          hover/focus — they cost 137px of the map as rows, which was five
          sections below the fold vs one. They stay `kind:'top'` in the registry
          so ⌘K and the flat search still rank them. */}
      {/* `data-spine-scrollport` is the geometry probe's handle. The map's
          height against THIS box is the question every spine layout change has
          to answer, and `.claude/rules/verify.md` requires that answer to come
          from the real runner — so the port names itself rather than making a
          spec guess at a class chain that will drift. */}
      <div data-spine-scrollport className="min-h-0 flex-1 overflow-y-auto p-1">
        <AnimatePresence mode="wait" initial={false}>
          {/* Keyed on the MODE, not the query: typing must update the list in
              place, never replay the crossfade on every keystroke. The swap
              animates once, when the body changes what KIND of thing it is —
              the map (hierarchy) or the ranked results (flat). That is now the
              body's only swap; the drill it was built for is gone. */}
          <motion.div
            key={searching ? 'search' : stationsDrillOpen ? 'stations-drill' : 'map'}
            initial={bodySwapPresence.initial}
            animate={bodySwapPresence.animate}
            exit={bodySwapPresence.exit}
            transition={bodySwapTransition}
          >
            {searching ? renderSearchResults() : renderMap()}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="shrink-0">
        {/* One placeholder, because the box now does ONE thing everywhere: it
            searches every destination. It used to say "Filter sections…" at the
            root and "Filter pages…" in a drill — two behaviours from one field,
            and the root one described filtering categories rather than finding
            a page. */}
        {/* `density="row"` — shared ~33px band (spine + station recent rails).
            The 32px field is the floor's touch target; no vertical band pad. */}
        <TechRailSearchBar
          value={navFilter}
          onChange={setNavFilter}
          onKeyDown={handleFilterKeyDown}
          placeholder="Go to…"
          density="row"
        />
        {bottomPages.length > 0 ? (
          <div className="border-t border-border-soft p-1">
            {bottomPages.map((page) => renderRow(page, 'bottom', neutralAccent, { pinned: true }))}
          </div>
        ) : null}
        <StaffAccountFooter />
      </div>
    </div>
  );
}
