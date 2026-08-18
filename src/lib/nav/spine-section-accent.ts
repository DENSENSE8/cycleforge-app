/**
 * MasterNav spine + ⌘K palette row treatment — **monochrome, one ladder**.
 *
 * Consumers: `SidebarNavList`, `CommandBar`. Guard: `main-nav-groups.guard.test.ts`.
 *
 * ## Per-section hue is deleted (2026-08-08) — the third and final ruling
 *
 * The nine-hue map was born 2026-08-01, deleted 2026-08-02, restored
 * 2026-08-07, and is now deleted again with the reasoning that closes it.
 * Each round argued about *volume* — how saturated, how many rows, which
 * shade — and every round the answer got quieter, which is the shape of an
 * idea that does not work rather than one that needs tuning.
 *
 * What settled it was seeing it: with a section drilled open, EVERY row in
 * that section carries the section's tint, so the tint marks nothing. Worse,
 * it actively cost legibility — the one genuinely selected row became a
 * slightly different shade of the same colour as its four siblings, so the
 * change made "where am I" *harder* to answer, which was the only question
 * the colour was there to help with. A channel that is on for every row in
 * view carries zero bits.
 *
 * Two more things it got wrong, both structural rather than tunable:
 *
 *  - **A section header became a solid saturated bar** — the shape every
 *    product on the operator's screen uses for a warning banner.
 *  - **Colored body text at nav size** reads as unfinished software. Ink is
 *    the channel this column uses for hierarchy (idle vs current); spending
 *    it on identity left nothing for state.
 *
 * Section identity now comes from **grouping and order** (a hairline at each
 * boundary, `SPINE_SECTIONS` order) — which is what a label was already
 * doing, and is why the redundancy objection kept coming back.
 *
 * **This does not touch colour where colour marks a THING rather than a
 * door.** `receiving-type-meta.ts` / `TicketChip` / the functional-hue table
 * still agree that repair is orange; `workflowStageDot` still tones a
 * lifecycle. Those paint records. A nav row is not a record — it is the
 * doorway to one, and doorways in this app are now uniformly quiet.
 * `REPAIR_ICON_TINT` is deleted from nav for exactly that reason.
 *
 * ## The ladder — SUPERSEDED 2026-08-16, ink is now constant
 *
 * This section documented the original three-ink-step ladder (child idle →
 * parent idle → current page). It is kept below for the archaeology — the
 * fill-ascends-toward-white reasoning still holds — but the ink column no
 * longer varies: every row (idle or current, L1 or child) now paints
 * `text-text-default`, matching the context rail beside it
 * (`RailRowBody` — full ink at every state, selection is background-only).
 * See the note above `SPINE_ACCENT` for the reasoning and the date.
 *
 * Three ink steps and three planes, every one an existing house token; this
 * pass introduced no new colour values.
 *
 * | State           | Ink (historical)             | Plane                        |
 * |-----------------|------------------------------|------------------------------|
 * | child idle      | ~~`text-text-soft` `#64748b`~~ → `text-text-default` | none (the spine's own ground)|
 * | parent idle     | ~~`text-text-muted` `#475569`~~ → `text-text-default` | none                         |
 * | hover           | ~~one ink step up~~ (ink is constant now) | `bg-surface-hover`  `#f8fafc`|
 * | **current page**| `text-text-default` `#0f172a`| `bg-surface-card`   `#ffffff`|
 *
 * **The fill ASCENDS toward white, and that is deliberate.** The spine sits
 * one plane below the work surface (`bg-surface-canvas` `#eef2f7`), so the
 * row you are standing on rises to meet the surface it opens rather than
 * pressing into the column. Darkening instead would need `surface-strong`,
 * which at this size reads as a pressed button. Same direction Linear uses
 * (its dark sidebar selects LIGHTER); inverted here only because the theme
 * is light. Dark themes flip automatically — every value is a token.
 *
 * **The icon shares its label's ink exactly, at every state.** A glyph one
 * step lighter than its own label makes a row read as two objects; sharing
 * the value makes it read as one mark. Never re-tint a glyph here.
 *
 * ## Bans
 *
 * - **No hue, anywhere in this module.** A chromatic class here is the bug
 *   this file now exists to prevent, and the guard fails on the class regex —
 *   not on a hardcoded list, so a new hue cannot sneak in under a new name.
 * - **No ring, no shadow, no bevel.** Ops chrome is flush-square and flat;
 *   "depth" is the plane step, never an inset highlight.
 * - **No second fill for `expanded`.** A parent that is merely open gets
 *   NOTHING — its chevron and its revealed children already say so, and
 *   giving it a wash makes an expanded sibling compete with the page you are
 *   actually on. The fill means "you are here" and nothing else.
 */

import { cn } from '@/utils/_cn';

export type SpineAccentClasses = {
  /** The page you are ON — the only row that fills. */
  activePage: string;
  /** Every other L1 / section row. */
  idlePage: string;
  /** Active L1 icon — SAME ink value as its label. */
  activePageIcon: string;
  /** Idle L1 icon — SAME ink value as its label. */
  idlePageIcon: string;
  /** Active child (page mode / station in a subgroup). */
  childActive: string;
  /** Idle child row — one ink step quieter than an idle parent. */
  childIdle: string;
  /** Active child icon — SAME ink value as its label. */
  childActiveIcon: string;
  /** Idle child icon — SAME ink value as its label. */
  childIdleIcon: string;
  /**
   * ⌘K palette selected-row wash — full `data-[selected=true]:*` tokens so
   * Tailwind scans them (never string-prefix at the consumer).
   */
  cmdkSelected: string;
  /** ⌘K selected-row icon tint — full `group-data-[selected=true]:*` tokens. */
  cmdkSelectedIcon: string;
};

/**
 * Current page: rises to the work surface's own white, ink to full contrast.
 * No `border-l` here — the child rail carries "you are here" for nested rows
 * (see {@link spineRailLineClass}); L1 rows carry it on the fill alone,
 * matching a top-level item in a reference sidebar (filled row, no bar) vs a
 * nested one (bar, per the rail below).
 */
const CURRENT_PAGE = 'bg-surface-card text-text-default';

/**
 * ONE rail-line element, TWO tokens (2026-08-16, corrected same day).
 *
 * The first attempt added a SECOND bar — a `border-l` on the row's own
 * button, layered on top of the existing nesting-rail hairline
 * (`renderChildLikeRow`'s gutter line), which already darkened slightly on
 * active. Two elements for one state is the "double bar" that produced —
 * exactly the anti-pattern industry sidebar-nav guidance calls out:
 * *"active state should not rely on color alone — pair a border-width token
 * with a color-border token on the SAME element for selected vs
 * unselected"* (Atlassian / USWDS side-nav token pattern).
 *
 * So there is exactly ONE physical line, always mounted, always in the
 * SAME position (the nesting-rail gutter — already the row's leading edge
 * within its own indent group, already `self-stretch` to the row's full
 * height so its centre lands on the icon's centre for free). Only its
 * COLOR TOKEN changes: `border-soft` (the "lessened gray" structural guide)
 * when idle, `text-default` (darkened) when this row is the one you are on.
 * Width stays constant across both states — `w-0.5`, bumped from the
 * original `w-px` hairline so the darkened state reads as a genuine bar,
 * not a barely-visible pixel.
 */
export function spineRailLineClass(active: boolean): string {
  return cn(
    'w-0.5 self-stretch transition-colors duration-150',
    active ? 'bg-text-default' : 'bg-border-soft',
  );
}

/**
 * THE treatment. One object, every row, every altitude, both consumers.
 *
 * It is still called an "accent" because ~40 call sites and one guard read it
 * by that name, and renaming a module the same week its contents were
 * replaced would make the git history harder to follow than the name is
 * confusing. There is exactly one of these now; `spineAccentFor` survives so
 * consumers keep a single resolution point if a treatment ever varies again.
 *
 * ## Ink is now CONSTANT — selection is background-only (2026-08-16)
 *
 * The three-step ink ladder documented above this constant (`text-text-soft`
 * idle child → `text-text-muted` idle parent → `text-text-default` current)
 * is retired. It made every idle spine row read thin and gray beside the
 * context rail immediately to its right, whose rows (`RailRowBody` —
 * `text-role-caption font-semibold text-text-default`) are ALWAYS full ink
 * regardless of selection; only the row's background changes. Two navigators
 * sitting side by side with two different "am I looking at a label or a
 * whisper" rules read as two different products.
 *
 * Ink is now `text-text-default` at every state, for both L1 and child rows
 * and their icons — matching the rail's ink exactly. "You are here" is
 * carried by the background step (`CURRENT_PAGE` fill vs
 * `hover:bg-surface-hover` vs nothing); nested rows add
 * {@link spineRailLineClass}'s darkened token on top, since a plain fill is
 * a weaker signal on an indented row than on a full-width L1 one. The label
 * WEIGHT moved with it — see `SidebarNavList.tsx` (`text-role-body
 * font-semibold` for spine rows: same `font-semibold` the rail's title
 * carries, bumped up for nav-row legibility at this density).
 */
export const SPINE_ACCENT: SpineAccentClasses = {
  activePage: CURRENT_PAGE,
  idlePage: 'text-text-default hover:bg-surface-hover',
  activePageIcon: 'text-text-default',
  idlePageIcon: 'text-text-default',
  childActive: CURRENT_PAGE,
  childIdle: 'text-text-default hover:bg-surface-hover',
  childActiveIcon: 'text-text-default',
  childIdleIcon: 'text-text-default',
  cmdkSelected: 'data-[selected=true]:bg-surface-card data-[selected=true]:text-text-default',
  cmdkSelectedIcon: 'group-data-[selected=true]:[&_svg]:text-text-default',
};

/*
 * `SPINE_NEUTRAL_ACCENT` is deleted, not aliased. It named the treatment for
 * rows that were NOT sections (top pins, footer, unmapped) back when sections
 * had hues and chrome did not — so with the hue gone there is nothing left to
 * split, and an alias pointing at `SPINE_ACCENT` would be a second name for
 * one object plus a knip finding. Callers use `spineAccentFor(null)`.
 */

/**
 * Resolve a row's treatment. Takes the section id purely so call sites keep
 * one resolution point; the answer is the same for every section, which is
 * the entire ruling.
 */
export function spineAccentFor(_sectionId?: string | null): SpineAccentClasses {
  return SPINE_ACCENT;
}
