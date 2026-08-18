'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronsRight } from '@/components/Icons';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import { buildNavDestinations, type NavDestination } from '@/lib/nav/nav-destinations';
import { searchNav, splitNavHighlight, type NavMatch } from '@/lib/nav/nav-search';
import { TechRailSearchBar } from '@/components/sidebar/tech/TechRailSearchBar';
import {
  spineAccentFor,
  spineRailLineClass,
  type SpineAccentClasses,
} from '@/lib/nav/spine-section-accent';
import {
  SPINE_SECTIONS,
  getStationSubgroupDef,
  spineSectionIdForPage,
  stationSubgroupMembers,
  type SidebarPageNav,
  type SpineSectionId,
  type StationSubgroupId,
} from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';
import { StaffAccountFooter } from './StaffAccountFooter';

/**
 * Row height + glyph size for every destination row in this map (2026-08-16)
 * — deliberately its OWN local token, not `PRIMARY_CHROME_ROW_FACE` (28px,
 * shared by the scan bar / carton identity row 1 / Displays top / grid column
 * headers app-wide). A short destination list — Scan Stations' 7 benches, a
 * domain section's 2-3 pages — used to huddle at 28px rows near the top of a
 * column that runs the full viewport height, leaving most of it visibly
 * empty. Taller rows spend that space instead of wasting it, and the glyph
 * scales with the row so it stays proportionate rather than shrinking inside
 * a box that grew around it. This trades the previous cross-column seam
 * match (spine row 1 bottom ↔ the scan bar's) for legibility + fill — a
 * deliberate call, not an oversight; nothing else in the app reads this
 * token, so nothing else moved.
 *
 * **Settled at `h-10` / 16px icon (2026-08-16, second pass).** A first pass
 * went to `h-14` (56px) paired with `role-display` (24px) text — genuinely
 * too much: 56px rows and 24px labels are BUTTON scale, not repeated
 * nav-list-row scale, and no reference sidebar (VS Code ~13px/22px rows,
 * Linear/GitHub ~14px/32px, Slack/Notion ~14-15px/28-32px) runs anywhere
 * near that for an item that repeats a dozen times down a column. `h-10`
 * (40px) is generous against the 28px it replaced without reading as
 * oversized, and pairs with `role-title` (18px, see below) the way the
 * glyph below pairs with it — back to 16px, proportionate at this text size
 * rather than the 20px the 24px-text pass needed.
 */
const SPINE_ROW_FACE_CLASS = 'h-10 shrink-0';
const SPINE_ROW_ICON_CLASS = 'h-4 w-4 shrink-0';

/**
 * The page list inside the sidebar spine — **ONE flat scrolling map**.
 *
 * The body is every reachable destination in {@link SPINE_SECTIONS} order —
 * **Scan Stations first (2026-08-03)**, because the benches are what this
 * product is for — grouped by spacing/order alone, no rule between sections
 * (2026-08-16, the map has zero horizontal hairlines top to bottom, matching
 * the context rail beside it); a footer-pinned {@link TechRailSearchBar} (`density="row"`,
 * the shared ~33px band used by station recent rails too) sits above the
 * footer band — Operations Studio · Admin · Settings — then
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
 * **Box to box, not spaced (2026-08-03).** Sections used to carry a soft
 * `mt-1` gap between blocks — the only thing left marking that the root axis
 * is deliberately mixed (Scan Stations is an INPUT MODEL among business
 * DOMAINS). That gap is gone: the spine matches the rest of the app's
 * squared-off, flush-box chrome (`ui-design-system.md` → Ops chrome is
 * flush-square), and every row in this column — L1, child, subgroup, drill
 * back header, search result — now abuts its neighbor with zero vertical
 * margin or padding. What marks the axis split now is the SHAPE difference
 * (Scan Stations alone carries a drill trailing chevron and a Back header),
 * not a gap. A row's own hover/active fill is what still shows where you are.
 *
 * ## Multi-child L1 discloses in place
 *
 * Click expands / collapses — it does not navigate. Destination is a child
 * row (or a leaf L1). Every nest opens through {@link renderNest} —
 * **instantly, with no animation**. Expanding every nest at once was measured
 * at **64 rows / ~1790px against a ~600px scrollport**, so it is an accordion:
 * opening one closes the others.
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
 * (`renderChildLikeRow`) that costs no vertical space — the one thing THIS
 * measurement (`sidebar-open-close.spec.ts` MEASURE tests) used to be short
 * of, before rows grew (see next). The row gets its height from an explicit
 * box, not from `py-*` — a box, not a padded label.
 *
 * **Monochrome, uniform, and STILL (2026-08-08).** There is no per-section hue
 * — {@link spineAccentFor} returns one treatment for every row at every
 * altitude (`src/lib/nav/spine-section-accent.ts` carries the ruling). Hierarchy
 * is INDENT + the nesting rail + weight; identity is grouping and order. Ink
 * is CONSTANT now (2026-08-16, see the accent module) — `spineAccentFor`
 * no longer dims idle rows. L1 / drill-back / nested children share
 * {@link SPINE_ROW_FACE_CLASS} (`h-10`, 40px — bumped from the shared
 * `PRIMARY_CHROME_ROW_FACE`'s 28px, settled here after a `h-14`/56px
 * overshoot; see the constant's own docblock above). **`text-role-title`**
 * label (18px, bumped from `role-body`'s 14px — a `role-display`/24px
 * overshoot came and went the same day). `role-title` bakes its own 600
 * weight, the same `font-semibold` value the rail's `RailRowBody` title
 * carries at its own (`role-caption`) size — so the spine and the rail
 * beside it read as one typographic FAMILY (weight + ink), each sized for
 * its own row height and density — the 36px-parent / 24px-child jump that
 * preceded it was 1.5×, which is enough to read as two systems.
 *
 * Nothing on a row travels on hover: the glyph's 2px CSS lift stays deleted,
 * because a structural anchor in a 20-row column should not move under the
 * pointer, and the wash answers hover on its own. The older motion bans stand
 * and are about cost, not taste — a framer `whileHover` here would re-render
 * React on every mousemove across the list, a row-level `scale` breaks the
 * baseline every dense surface beside it aligns to, and a hover weight shift
 * reflows text mid-pointer.
 *
 * **Every row carries its glyph, at the same light page stroke and the same
 * ink as its own label.** A child / station-subgroup row is the switch between
 * one page's siblings, which is the job the GlobalHeader page switcher draws
 * with the same icon set — two doors onto one destination must not disagree
 * about whether it has a face. What child rows do NOT get is the heavier L2
 * weight: at 2.25 a child glyph out-draws its own parent at 1.5. Subordination
 * is the indent, the rail, and the ink step (soft vs muted) — never a second
 * type size, and never a colour.
 *
 * **This component has NO motion. None.** (2026-08-08.) It does not import the
 * motion barrel, and it should not start. Every state change — mounting the
 * map, selecting a row, opening a nest, entering the Scan Stations drill,
 * switching to ranked search results — happens on one frame.
 *
 * That is a navigator on a scan bench doing what it is for. Everything in this
 * column is a thing the operator has clicked a hundred times and is reaching
 * for by muscle memory; any duration at all is time inserted between the reach
 * and the target. Four treatments were tried and all four are gone:
 *
 *  - a **selection wash settle** (`spineActiveWash`, 150ms) — imperceptible
 *    once the fill became a few-percent plane step;
 *  - a **per-row nest cascade** (`spineRowStagger*`, 15ms × index) — reads as
 *    a wave travelling down-and-right rather than a disclosure;
 *  - a **one-block nest height expand** (`collapseHeight`) — no sweep, same
 *    delay;
 *  - a **body crossfade** (`spineBodySwap`, 120ms on `mode="wait"`) — the
 *    wait meant the outgoing list finished fading before the incoming one
 *    mounted, so entering Scan Stations cost ~240ms and flashed an empty
 *    column between two lists.
 *
 * `spineRowStagger*` survives in the catalog for ⌘K — a palette revealing
 * ranked results is a genuinely different job. Nothing else does.
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
  // There is no motion state here, because there is no motion here. See the
  // "this component has NO motion" note above for the four treatments that
  // were tried and why each one lost.
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
   * Station subgroups the operator has expanded (Receiving · Walk-In). Default
   * is **collapsed** — opening one nest closes the others (accordion). Owning
   * the active page still forces open so you cannot hide the bench you are on.
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
   * Hierarchy is carried by the **nesting rail** plus the indent — never by a
   * heavier stroke, never by a smaller type size, and never by a colour (ink
   * is constant across idle/current now, 2026-08-16 — see
   * `src/lib/nav/spine-section-accent.ts`). A child glyph at the L2 weight
   * (2.25) would out-draw its own parent at 1.5, which inverts the ladder it
   * was supposed to express.
   *
   * **Same {@link SPINE_ROW_FACE_CLASS} box (40px) and same `text-role-title`
   * label as its parent** (rail-matched 2026-08-16, both bumped same day from
   * a 28px/`role-body` (14px) box that was reading thin against the column's
   * full height — see the constant's own docblock for the `h-14`/56px
   * overshoot that came before this size). It used to be a 24px row at 12px
   * against a 36px/14px parent; a 1.5× height jump inside one list makes
   * parent and child read as two different kinds of object rather than two
   * altitudes of one. Weight is now constant (600) — the fill on
   * `accent.child*` plus the rail line's darkened token (below)
   * is what says "you are here", same two-signal shape industry side-nav
   * tokens use (a paired width + colour token on ONE element).
   *
   * ## The rail (2026-08-03; centered 2026-08-03; width bumped 2026-08-16)
   *
   * A left line spanning the nested block, in place of relying on indent
   * alone. Two properties earned it a place in a phase whose measurement ruled
   * *against* the richer pattern it came from:
   *
   * 1. **It costs no vertical space.** It is a thin gutter line, so the
   *    map's height is unchanged — which is the only currency the spine is
   *    short of (measured: 732px of map against a 685px port on the widest page).
   * 2. **It survives greyscale.** Same reason the section hues were deleted: the
   *    channels this column may spend are shape and grouping, not colour.
   *
   * **Centered under the parent glyph** via a token-only gutter: `ml-2` matches
   * the parent's `px-2`, `w-4` matches the glyph — the line sits on the icon's
   * centre without an arbitrary `ml-[Npx]`. Width is `w-0.5` (2026-08-16, up
   * from a `w-px` hairline) — the darkened active token needs enough width to
   * read as a bar, not a barely-visible pixel; kept constant across idle/active
   * (see {@link spineRailLineClass}) rather than only widening on select, so it
   * is genuinely one element, not a line that swaps shape depending on state.
   *
   * It is drawn **per row, not per group**, and that is deliberate rather than
   * lazy. Child pages arrive inside a `<ul>`, but station-subgroup members
   * arrive as flat siblings of every other page in the section — there is no
   * element wrapping just them to hang a group rail on. Adjacent rows carry no
   * vertical margin, so per-row segments abut into one continuous line in both
   * shapes, and the active row's own segment darkens to mark where you are —
   * `spineRailLineClass(active)` on the SAME `<div>`, never a second element.
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
        {/* Rail gutter: `ml-2` matches the parent's `px-2` and `w-4` matches
            {@link SPINE_ROW_ICON_CLASS} (16px — briefly 20px during the
            same-day `h-14`/24px overshoot; the gutter tracks whatever the
            glyph size settles at), so the line lands on the icon's centre
            without an arbitrary `ml-[Npx]`. ONE line, two tokens (2026-08-16,
            corrected same day) — {@link spineRailLineClass} toggles this SAME
            element between the structural "lessened gray" guide (idle) and a
            darkened bar (active); it is never joined by a second bar
            elsewhere on the row. Full row height (`self-stretch`) puts its
            centre on the icon's centre for free. */}
        <div className="ml-2 flex w-4 shrink-0 justify-center" aria-hidden>
          <div className={spineRailLineClass(opts.active)} />
        </div>
        <button
          type="button"
          onClick={opts.onClick}
          onMouseEnter={opts.onMouseEnter}
          // The visual "you are here" signal (fill + spineRailLineClass's
          // darkened bar) was purely visual until now — nothing told a
          // screen reader which row is current. `aria-current="page"` is the
          // WAI-ARIA APG signal for exactly this (a nav link to the page the
          // user is already on).
          aria-current={opts.active ? 'page' : undefined}
          className={cn(
            'ds-raw-button group flex min-w-0 flex-1 items-center gap-2 rounded-none pl-1 pr-2 text-left transition-colors duration-150',
            SPINE_ROW_FACE_CLASS,
            opts.active ? accent.childActive : accent.childIdle,
          )}
        >
          {RowIcon ? (
            <RowIcon
              className={navIconStrokeClass(
                'page',
                cn(
                  SPINE_ROW_ICON_CLASS,
                  opts.active ? accent.childActiveIcon : accent.childIdleIcon,
                ),
              )}
            />
          ) : null}
          {/* Rail-matched title weight/ink (2026-08-16) — `font-semibold
              text-text-default`, same as RailRowBody's title line, bumped to
              `role-body` (14px) for nav-row legibility. Weight is constant
              now (ink already is); active/idle reads from `accent.child*`
              background + the rail line's token, not font weight. */}
          {/* `title` — a long child label (a station name, a deep page) truncates
              with no other way to reveal itself. RailRowBody does this
              (`titleAttr`); the spine rows never had. */}
          <span className="min-w-0 flex-1 truncate text-role-title" title={opts.label}>
            {opts.label}
          </span>
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
    return (
      <button
        type="button"
        onClick={opts.onClick}
        onMouseEnter={opts.onMouseEnter}
        aria-label={opts.ariaLabel}
        aria-expanded={opts.disclosure ? opts.disclosure.expanded : undefined}
        // See renderChildLikeRow — same `aria-current="page"` signal for the
        // same reason. A disclosure-only row (multi-child parent, subgroup
        // header) never passes `active: true` in the first place, so this
        // stays `undefined` there without a separate check.
        aria-current={opts.active ? 'page' : undefined}
        className={cn(
          'ds-raw-button group flex w-full items-center gap-2 rounded-none px-2 text-left transition-colors duration-150',
          // L1 + Scan Stations enter + drill-back share SPINE_ROW_FACE_CLASS.
          // Nested children stay the same height too (renderChildLikeRow) —
          // one size, every altitude (see the module docblock).
          SPINE_ROW_FACE_CLASS,
          opts.active ? accent.activePage : accent.idlePage,
        )}
      >
        <PageIcon
          className={navIconStrokeClass(
            'page',
            cn(
              SPINE_ROW_ICON_CLASS,
              opts.active ? accent.activePageIcon : accent.idlePageIcon,
            ),
          )}
        />
        {/* Rail-matched title weight/ink (2026-08-16) — `font-semibold
            text-text-default`, same as RailRowBody's title line, bumped to
            `role-title` (18px, see the module docblock) for nav-row
            legibility + fill. "You are here" reads from `accent.activePage`'s
            background fill alone — an L1 row is full-width, so the fill reads
            clearly with no bar (a nested row's fill is narrower against its
            indent, which is why THAT row also gets `spineRailLineClass`'s
            darkened rail token). `title` — same truncation-tooltip reasoning
            as renderChildLikeRow. */}
        <span className="min-w-0 flex-1 truncate text-role-title" title={opts.label}>{opts.label}</span>
        {opts.drill ? (
          <ChevronsRight className={cn(SPINE_ROW_ICON_CLASS, 'text-text-faint')} aria-hidden />
        ) : opts.disclosure ? (
          <ChevronDown
            className={cn(
              // No rotate transition (2026-08-08). It was the last moving
              // thing on this interaction, and it was moving on the control
              // the operator had just committed to — a 150ms tell that the
              // click registered, on a click whose result (the nest) is
              // already there instantly. Snap it.
              SPINE_ROW_ICON_CLASS,
              'text-text-faint',
              !opts.disclosure.expanded && '-rotate-90',
            )}
          />
        ) : null}
      </button>
    );
  };

  /**
   * Nest body — every in-place dropdown (L1 children · Receiving benches).
   *
   * **It is INSTANT. There is no animation here at all** (ruled 2026-08-08),
   * and the two things it replaced are worth recording so neither returns.
   *
   * First it cascaded: a 15ms-per-row stagger with each row fading in from a
   * 2px offset. On a five-row nest that reads as a wave travelling
   * down-and-right — a nav dropdown announcing its contents one at a time
   * rather than disclosing them.
   *
   * Then it expanded as one block (height 0 → auto). Better, and still the
   * wrong idea: this list is a navigator on a scan bench, and the operator
   * clicking a nest already knows what is in it. Any duration at all is time
   * between the click and the row they were reaching for. A disclosure whose
   * contents are fixed and known does not need to be *shown* arriving — it
   * needs to be there.
   *
   * So: a plain `<ul>`. No `motion.*`, no presence, no `overflow-hidden`
   * (nothing clips), no transition. The rows and the rotated chevron paint on
   * the same frame as the click.
   */
  const renderNest = (
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
    <ul key={nestKey} role="group" aria-label={ariaLabel} className="list-none p-0">
      {rows.map((row) => (
        <li key={row.id}>{renderChildLikeRow(row, accent)}</li>
      ))}
    </ul>
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
            // The fill means "you are here" and NOTHING else (2026-08-08).
            //
            // It first also meant "expanded", so standing on Sales with
            // Shipping open showed two filled rows. Dropping that left one
            // case behind: an ANCESTOR of the current page still filled,
            // because `activePage` for `/products?view=manuals` IS Products —
            // so Products and Manuals both lit.
            //
            // `!hasChildren` closes it. A multi-child parent is never a
            // destination (its click discloses), and whenever it owns the
            // active page its children are force-open, so the actually-current
            // child row is always on screen carrying the fill. The parent
            // adds nothing but a second lit row.
            active: isPageActive && !hasChildren,
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
          ? renderNest(
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
        // The ONE surviving proxy fill, and it is not the ancestor case.
        // Scan Stations list-REPLACES, so when the operator is on a bench the
        // genuinely-current row is not rendered on this map at all — this row
        // is its only representation. Dropping it would leave the root map
        // showing no location whatsoever for seven of the app's pages.
        // Everywhere else the current row is on screen, so its ancestor stays
        // quiet.
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

        const def = getStationSubgroupDef(subgroup);
        const members = stationSubgroupMembers(subgroup, pages);
        const subgroupActive = members.some((m) => m.id === activePage.id);
        const firstMember = members[0];
        const subgroupExpanded = subgroupActive || expandedSubgroups.has(subgroup);
        if (!def || !firstMember) continue;

        nodes.push(
          <div key={`subgroup-${subgroup}`}>
            {renderPageHeader(
              {
                label: def.label,
                icon: def.icon,
                // A subgroup header NEVER fills. It is a disclosure, not a
                // destination, and when it owns the active station that
                // station is force-expanded — so the row that is genuinely
                // current is always rendered directly beneath it. Filling
                // both is the ancestor duplication this rule removes.
                active: false,
                // Disclosure only — never navigates. Same contract as
                // multi-child L1 pages (Shipping · Locations): expand shows
                // the benches; the operator picks Arrival / Unbox / etc.
                ariaLabel: `${def.label} — ${members.length} stations`,
                onClick: () => {
                  if (subgroupExpanded && !subgroupActive) {
                    closeSubgroup(subgroup);
                    return;
                  }
                  if (!subgroupExpanded) {
                    openSubgroup(subgroup);
                  }
                },
                onMouseEnter: onRowHover ? () => onRowHover(firstMember) : undefined,
                disclosure: { expanded: subgroupExpanded },
              },
              accent,
            )}
            {subgroupExpanded
              ? renderNest(
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
        <div key={page.id}>
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
          className={cn(
            'ds-raw-button grid w-full grid-cols-[1rem_1fr_1rem] items-center gap-2 rounded-none px-2 text-text-default transition-colors duration-150 hover:bg-surface-hover',
            // Same SPINE_ROW_FACE_CLASS as every other row (see module docblock).
            SPINE_ROW_FACE_CLASS,
          )}
        >
          <ChevronLeft className={cn(SPINE_ROW_ICON_CLASS, 'justify-self-start')} aria-hidden />
          {/* Rail-matched title role (2026-08-16) — see renderPageHeader.
              `title` — same truncation-tooltip reasoning too. */}
          <span className="min-w-0 truncate text-center text-role-title" title={section.label}>
            {section.label}
          </span>
          <span className={SPINE_ROW_ICON_CLASS} aria-hidden />
        </button>
        <div id="spine-section-floor" role="group" aria-label={section.label}>
          {pages.length === 0 ? (
            <p className="px-2 py-1 text-role-caption text-text-soft">No matching pages</p>
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
        {groups.map(({ section, pages }) => {
          const accent = spineAccentFor(section.id);
          /**
           * Section boundary — NO hairline (2026-08-16, superseding the
           * "hairline below every section" ruling this replaced). The rail
           * beside this column (`RailRow` / recent activity) has no dividers
           * between its rows either — grouping there reads from spacing and
           * the day-band eyebrow alone, never a rule. Matching that removes
           * the last horizontal line left in the spine now that ink is
           * constant and the section hue is gone; the root axis split (Scan
           * Stations as an INPUT MODEL among business DOMAINS) still reads
           * from the drill's own Back-header shape, not from a rule.
           */
          const seam = '';

          // Scan Stations — enter row only; benches live inside the drill.
          if (section.id === 'floor') {
            return (
              <li key={section.id} aria-label={section.label} className={seam}>
                {renderStationsEnterRow(accent)}
              </li>
            );
          }

          return (
            <li key={section.id} aria-label={section.label} className={seam}>
              <div id={`spine-section-${section.id}`}>
                {pages.map((page) => (
                  <div key={page.id}>{renderRow(page, section.id, accent)}</div>
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
            'ds-raw-button group flex w-full items-center gap-2 rounded-none px-2 py-1 text-left transition-colors duration-150',
            isCursor ? accent.activePage : accent.idlePage,
          )}
        >
          <Icon
            className={navIconStrokeClass(
              'page',
              cn(
                SPINE_ROW_ICON_CLASS,
                isCursor ? accent.activePageIcon : accent.idlePageIcon,
              ),
            )}
          />
          <span className="min-w-0 flex-1">
            {/* Rail-matched title role (2026-08-16) — see renderPageHeader.
                `title` carries the raw label — the truncated content here is
                highlight spans, not plain text, so the tooltip can't just
                read the DOM like the other rows; it needs the source string. */}
            <span className="block truncate text-role-title" title={destination.label}>
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
                // The cursor row no longer fills saturated, so the old
                // `text-white/70` here would render white-on-white. It steps
                // up one ink rung instead, same as the label above it.
                className={cn(
                  'block truncate text-role-micro uppercase tracking-widest',
                  isCursor ? 'text-text-soft' : 'text-text-faint',
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
        <li className="px-2 py-1 text-role-caption text-text-soft">
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
          are icons in the spine's 40px top band (`SpineTopPins`) when open —
          they cost 137px of the map as rows, which was five sections below the
          fold vs one. They stay `kind:'top'` in the registry so ⌘K and the flat
          search still rank them. */}
      {/* `data-spine-scrollport` is the geometry probe's handle. The map's
          height against THIS box is the question every spine layout change has
          to answer, and `.claude/rules/verify.md` requires that answer to come
          from the real runner — so the port names itself rather than making a
          spec guess at a class chain that will drift. */}
      {/* The body swaps between three KINDS of list — the map, the Scan
          Stations drill, and ranked search results — and it swaps INSTANTLY
          (2026-08-08). It used to crossfade through `spineBodySwap`
          (opacity-only, 120ms, `AnimatePresence mode="wait"`).
          `mode="wait"` is what made that expensive: the outgoing list had to
          finish fading before the incoming one mounted, so entering Scan
          Stations cost ~240ms of round trip and briefly showed an EMPTY
          column between two lists. On a bench navigator that is time between
          a click and the bench being reached for.
          Nothing is keyed or wrapped now: the three branches render different
          elements, so React swaps them on the same frame. */}
      <div data-spine-scrollport className="min-h-0 flex-1 overflow-y-auto p-0">
        {searching ? renderSearchResults() : renderMap()}
      </div>

      <div className="flex w-full shrink-0 flex-col">
        {/* One placeholder, because the box now does ONE thing everywhere: it
            searches every destination. It used to say "Filter sections…" at the
            root and "Filter pages…" in a drill — two behaviours from one field,
            and the root one described filtering categories rather than finding
            a page. */}
        {/* `density="row"` — shared h-8 floor band (spine + station recent rails).
            Sign-in below is the true column floor (aligns with context filters). */}
        <TechRailSearchBar
          value={navFilter}
          onChange={setNavFilter}
          onKeyDown={handleFilterKeyDown}
          placeholder="Go to…"
          density="row"
        />
        {bottomPages.length > 0 ? (
          <div className="w-full p-0">
            {bottomPages.map((page) => renderRow(page, 'bottom', neutralAccent, { pinned: true }))}
          </div>
        ) : null}
        <StaffAccountFooter />
      </div>
    </div>
  );
}
