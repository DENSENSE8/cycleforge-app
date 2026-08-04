/**
 * MasterNav spine accent — ONE neutral treatment for every row, at every
 * altitude. Compose from house surface/text tokens only; never a page-local hex
 * and never a chromatic Tailwind hue.
 *
 * Consumers: `SidebarNavList`, `CommandBar`. Guard: `main-nav-groups.guard.test.ts`.
 *
 * ## The eight section hues are DELETED (2026-08-02)
 *
 * From 2026-08-01 this module carried `SPINE_SECTION_ACCENTS`, a total
 * `Record<SpineSectionId, …>` of 8 sections × 14 fields — sky / amber / teal /
 * emerald / cyan / indigo / green / orange. Every one of those hues was picked
 * for contrast and defended on the merits, and the map still lost:
 *
 * - **Hue was never the thing being read.** A section's identity is its label
 *   and its position in {@link SPINE_SECTIONS}; the colour restated a fact the
 *   row already carried, and only once you had learned the mapping.
 * - **It cost the spine its calm.** Eight saturated fills in one 240px column
 *   is a paint chart, not chrome — the single loudest reason the spine read as
 *   "generated" rather than designed.
 * - **Its stated job was already done elsewhere.** The ⌘K palette groups by
 *   labelled section bands (`CommandBarNavGroup.label` + `sectionIcon`), and
 *   `nav-destinations.ts` carries a parent `context` string on every flat
 *   search row. Neither needed a colour to say which section a row belongs to.
 *
 * Do not re-introduce a per-section hue. If a section ever genuinely needs to
 * be distinguished at a glance, the answer is its glyph and its grouping — the
 * two channels that survive greyscale, glare, and colour-blindness.
 *
 * ## The ladder (2026-08-03): one soft selected wash, Cloudflare-quiet
 *
 * A neutral spine answers two questions with one grey ramp on a white
 * (`bg-surface-card`) column:
 *
 * | Rung | State | Treatment |
 * |---|---|---|
 * | 1 | hover — "the pointer is here" | `bg-surface-hover` wash |
 * | 2 | selected / expanded — "this is open or where you are" | `bg-surface-sunken`, default ink, **no ring** |
 *
 * **Active pages, owning sections, and expanded section headers share rung 2.**
 * The earlier solid `bg-surface-inverse` chip, then the `surface-strong` + inset
 * hairline seated chip, both read too loud next to Cloudflare's soft Account-
 * home wash. Operator call: a ton softer — sunken grey, no ring, same wash at
 * every altitude.
 *
 * Hover stays on `surface-hover` (lighter than sunken) so the pointer wash does
 * not collide with the selected wash.
 */

import type { SpineSectionId } from '@/lib/sidebar-navigation';

export type SpineAccentClasses = {
  /** Active L1 page fill (selected chip). */
  activePage: string;
  /** Inactive L1 page / section row (hover wash included). */
  idlePage: string;
  /** Active L1 icon on the selected chip. */
  activePageIcon: string;
  /** Idle L1 icon. */
  idlePageIcon: string;
  /** Active mode / subgroup child wash. */
  childActive: string;
  /** Idle mode row. */
  childIdle: string;
  /** Active mode / subgroup child icon (on the selected chip). */
  childActiveIcon: string;
  /** Idle mode icon — spine child rows and the ⌘K palette's row glyphs. */
  childIdleIcon: string;
  /** Root section row when expanded (or owning the active page). */
  sectionActive: string;
  /** Root section idle / collapsed. */
  sectionIdle: string;
  /**
   * Root section icon when expanded — and the ⌘K band-heading glyph, which is
   * the same field's second job.
   *
   * It matches {@link SpineAccentClasses.sectionIdleIcon} on purpose: a section
   * row's state is carried by its soft fill, so tinting the glyph would say the
   * same thing twice. It also has to survive the ⌘K band heading, whose label
   * is `text-text-faint` — default ink there would put a near-black glyph
   * beside deliberately quiet uppercase micro text.
   */
  sectionActiveIcon: string;
  /** Root section icon idle. */
  sectionIdleIcon: string;
  /**
   * ⌘K palette selected-row wash — full `data-[selected=true]:*` tokens so
   * Tailwind scans them (never string-prefix at the consumer).
   */
  cmdkSelected: string;
  /** ⌘K selected-row icon tint — full `group-data-[selected=true]:*` tokens. */
  cmdkSelectedIcon: string;
};

/** Shared selected / expanded wash — soft sunken grey, no ring (Cloudflare-quiet). */
const SELECTED_CHIP = 'bg-surface-sunken text-text-default';

/**
 * The one spine treatment. Named `NEUTRAL` because that is the ruling, not
 * because there is a chromatic sibling to contrast it with — there is not.
 */
export const SPINE_NEUTRAL_ACCENT: SpineAccentClasses = {
  activePage: SELECTED_CHIP,
  idlePage: 'text-text-default hover:bg-surface-hover',
  activePageIcon: 'text-text-default',
  idlePageIcon: 'text-text-muted',
  childActive: SELECTED_CHIP,
  childIdle: 'text-text-default hover:bg-surface-hover',
  childActiveIcon: 'text-text-default',
  childIdleIcon: 'text-text-muted',
  sectionActive: SELECTED_CHIP,
  sectionIdle: 'text-text-default hover:bg-surface-hover',
  sectionActiveIcon: 'text-text-muted',
  sectionIdleIcon: 'text-text-muted',
  cmdkSelected: 'data-[selected=true]:bg-surface-sunken data-[selected=true]:text-text-default',
  cmdkSelectedIcon: 'group-data-[selected=true]:[&_svg]:text-text-default',
};

/**
 * Resolve the accent for a spine row.
 *
 * The parameter is retained deliberately: every call site still knows which
 * section a row belongs to, and keeping the seam means a future per-section
 * *non-colour* distinction (a divider, a glyph rule) has somewhere to live
 * without re-threading four components. It has exactly one answer today.
 */
export function spineAccentFor(
  _sectionId?: SpineSectionId | null,
): SpineAccentClasses {
  return SPINE_NEUTRAL_ACCENT;
}
