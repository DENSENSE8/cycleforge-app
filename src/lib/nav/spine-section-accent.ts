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
 * | **owns child**  | `text-text-default`                  | `bg-surface-hover`  `#f8fafc`|
 * | **current page**| `text-text-default` `#0f172a`| `bg-surface-canvas`  `#eef2f7`|
 *
 * **The fill is a plane step against chrome, not against the work canvas.**
 * MasterNav's host is {@link appChromeClass} (`bg-surface-card` white) —
 * same token as GlobalHeader / `<body>`. Painting the current row in
 * `bg-surface-card` too made "you are here" identical to idle on every
 * leaf L1 (Packing · Scan out): nested benches still had
 * {@link spineRailLineClass}, leaves had nothing. The current row therefore
 * steps to `bg-surface-canvas`, the same canvas/chrome delta the content
 * shell already uses. No hue, no `surface-strong` press, no leading bar on
 * L1 — just a fill that actually contrasts. Dark themes flip with the
 * tokens.
 *
 * **The icon shares its label's ink exactly, at every state.** A glyph one
 * step lighter than its own label makes a row read as two objects; sharing
 * the value makes it read as one mark. Never re-tint a glyph here.
 *
 * ## Bans
 *
 * - **No ring, no shadow, no bevel.** Ops chrome is flush-square and flat;
 *   "depth" is the plane step, never an inset highlight.
 * - **No fill for `expanded` alone.** A parent that is merely open gets
 *   nothing from expansion — the chevron says open, and a fill would make
 *   "expanded" compete with "you are here". A parent that **owns the current
 *   child** gets {@link SpineAccentClasses.ownsActive}. Two strengths, one
 *   location.
 *
 * ### The "no leading bar on L1" ban is LIFTED (2026-09-05, operator ruling)
 *
 * It read: *"No hue, no `surface-strong` press, no leading bar on L1 — just a
 * fill that actually contrasts."* The clause carried its own condition, and the
 * condition failed. Measured against the ground this column actually renders on
 * (`appChromeClass` white), the sanctioned fill was **1.13:1** and its
 * successor **1.19:1** — both far under the 3:1 floor for a non-text indicator.
 * A ban justified by "the fill is enough" cannot survive the fill not being
 * enough, and no amount of neutral wash gets there: to clear 3:1 on white a
 * flat fill has to reach roughly `#949494`, which on a nav row reads as a
 * pressed button, not a location.
 *
 * So the current page is marked on **two channels that do not depend on
 * luminance alone**: a 2px leading bar in `text-default` ink, and the weight
 * step. The bar is the accessible signal (`#0f172a` on white ≈ 17:1); the fill
 * is the quiet secondary wash.
 *
 * ### The "no hue" ban is LIFTED for the WASH only (2026-09-05, operator
 * ruling: "the coloring should be a bit lighter and a bit more friendly and
 * inviting")
 *
 * The greys were doing two jobs and failing the second. `surface-strong`
 * `#e2e8f0` is the heaviest neutral on the ramp — the token the app uses for
 * skeletons, tracks and disabled controls — so the current page wore the exact
 * fill that means "inert" everywhere else, and the whole column read cold and
 * administrative.
 *
 * The ladder is now LIGHTER and tinted:
 *
 * | State | Fill | On white |
 * |---|---|---|
 * | idle | none | — |
 * | hover | `surface-hover` `#f8fafc` | 1.03:1 |
 * | owns the current child | `surface-sunken` `#f1f5f9` | 1.08:1 |
 * | **current page** | `surface-accent` `#f0f4fb` **+ the 2px ink bar** | wash 1.07:1 · bar ≈17:1 |
 *
 * Three things make the hue legal where it was banned:
 *
 * 1. **The indicator is the bar, not the wash.** The ban's own arithmetic
 *    (above) established that no wash on this ground clears 3:1. Once the
 *    accessible channel is a 17:1 ink bar, the fill is free to be a tint
 *    instead of a press — it is no longer carrying the state.
 * 2. **`surface-accent` is a house token** (`themes/light.ts`, `#f0f4fb`),
 *    already themed per accent family, so this does not fork a colour or
 *    smuggle a raw hex past `color-neutrals.test.ts`.
 * 3. **One voice, still.** The tint is a 7%-luminance blue wash, not Scan
 *    Blue ink — DESIGN.md's One-Voice Rule reserves `#2563eb` for live facts,
 *    and no row here paints it.
 *
 * What is still banned: no ring, no shadow, no bevel, no hue on INK (labels
 * and glyphs stay `text-default` at every state), no second hue, and no
 * numbers-as-colour. A monochrome count on a section header is allowed and
 * shipped — see `SidebarNavList`'s `renderSection`.
 *
 * **Hover is now LIGHTER than the current page again**, which an earlier pass
 * banned ("a wash lighter than canvas made a merely-hovered row out-shout the
 * page the operator was actually on"). That argument held while the current
 * page was a bare fill with no bar. It has the bar now, so the strongest mark
 * in the column belongs to the current page whatever the washes do, and hover
 * gets to be the faintest touch on the ramp instead of the heaviest.
 */

import { cn } from '@/utils/_cn';

export type SpineAccentClasses = {
  /** The page you are ON — the strongest fill. */
  activePage: string;
  /**
   * L1 / subgroup that owns the current child — lighter than
   * {@link SpineAccentClasses.activePage}. Never `aria-current`.
   */
  ownsActive: string;
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
 * Current page: the tinted wash PLUS the 2px ink bar.
 *
 * The bar is what answers "where am I" — `#0f172a` on white ≈ 17:1, the only
 * channel on this ground that clears the 3:1 floor for a non-text indicator
 * (the full arithmetic is in the module docblock; read it before re-deriving
 * this, because two earlier passes re-derived it against the wrong plane).
 *
 * The ground is `appChromeClass` white: `SidebarShell` paints it as the
 * aside's only child and covers the `appCanvasClass` the column itself
 * carries. Two hosts — docked column and hover-peek card — one white ground.
 *
 * The wash is `surface-accent` `#f0f4fb` as of 2026-09-05, down from
 * `surface-strong` `#e2e8f0`: lighter, and the accent family's own tint rather
 * than the skeleton/disabled grey. It contributes about 1.07:1, which is
 * decoration by construction — it is riding on top of an indicator that
 * already passes, not standing in for one. The fill token MUST still differ
 * from {@link appChromeClass} or a leaf destination paints as idle.
 */
const CURRENT_PAGE =
  'relative bg-surface-accent text-text-default before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-text-default before:content-[\'\']';

/**
 * Parent of the current child — one step quieter, and NEUTRAL.
 *
 * It keeps the grey wash while the current page took the tint, so the two
 * states differ by hue as well as by the bar: "the section holding your page"
 * and "your page" are no longer two grey steps a floor operator has to
 * measure against each other.
 */
const OWNS_ACTIVE = 'bg-surface-sunken text-text-default';

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
 * carried by the background step (`CURRENT_PAGE` canvas vs chrome idle vs
 * `hover:bg-surface-hover`); nested rows add {@link spineRailLineClass}'s
 * darkened token on top, since a plain fill is a weaker signal on an
 * indented row than on a full-width L1 one. The label WEIGHT moved with it
 * — see `SidebarNavList.tsx` (`text-role-body font-semibold` for spine
 * rows: same `font-semibold` the rail's title carries, bumped up for
 * nav-row legibility at this density). `spine-section-accent.test.ts`
 * fails if this fill collapses back onto chrome.
 */
export const SPINE_ACCENT: SpineAccentClasses = {
  activePage: CURRENT_PAGE,
  ownsActive: OWNS_ACTIVE,
  idlePage: 'text-text-default hover:bg-surface-hover',
  activePageIcon: 'text-text-default',
  idlePageIcon: 'text-text-default',
  childActive: CURRENT_PAGE,
  childIdle: 'text-text-default hover:bg-surface-hover',
  childActiveIcon: 'text-text-default',
  childIdleIcon: 'text-text-default',
  cmdkSelected: 'data-[selected=true]:bg-surface-accent data-[selected=true]:text-text-default',
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

/**
 * {@link SpineAccentClasses.activePage}, scoped to shadcn's `data-[active=true]`
 * row state — what `sidebarMenuButtonVariants` needs to paint the current page.
 *
 * Spelled out as a LITERAL rather than derived from `CURRENT_PAGE` at runtime:
 * Tailwind scans source text, so a computed variant string emits no CSS and
 * fails silently as a row with no fill. `spine-section-accent.test.ts` asserts
 * the two stay in step.
 */
export const SPINE_ACCENT_DATA_ACTIVE = [
  'relative',
  'data-[active=true]:bg-surface-accent',
  'data-[active=true]:text-text-default',
  // The accessible half of the mark — see "the leading bar ban is LIFTED".
  "data-[active=true]:before:content-['']",
  'data-[active=true]:before:absolute',
  'data-[active=true]:before:inset-y-0',
  'data-[active=true]:before:left-0',
  'data-[active=true]:before:w-0.5',
  'data-[active=true]:before:bg-text-default',
].join(' ');
