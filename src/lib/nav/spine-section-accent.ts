/**
 * MasterNav section accent map — one named SoT for active fill / mode wash /
 * icon tint / hover wash per spine section. Top pin + footer use
 * {@link SPINE_NEUTRAL_ACCENT} (blue). Compose from Tailwind theme hues only —
 * never page-local hex.
 *
 * Consumers: `SidebarNavList`, `CommandBar`. Guard: `main-nav-groups.guard.test.ts`.
 */

import type { SpineSectionId } from '@/lib/sidebar-navigation';

export type SpineAccentClasses = {
  /** Active L1 page fill (solid). */
  activePage: string;
  /** Inactive L1 page / section row (hover wash included). */
  idlePage: string;
  /** Active L1 icon on solid fill. */
  activePageIcon: string;
  /** Idle L1 icon. */
  idlePageIcon: string;
  /** Active mode / subgroup child wash. */
  modeActive: string;
  /** Idle mode row. */
  modeIdle: string;
  /** Active mode icon. */
  modeActiveIcon: string;
  /** Idle mode icon. */
  modeIdleIcon: string;
  /** Root section row when that section owns the active page. */
  sectionActive: string;
  /** Root section idle. */
  sectionIdle: string;
  /** Root section icon when section-active on root. */
  sectionActiveIcon: string;
  /** Root section icon idle (hover tint via group). */
  sectionIdleIcon: string;
  /**
   * ⌘K palette selected-row wash — full `data-[selected=true]:*` tokens so
   * Tailwind scans them (never string-prefix at the consumer).
   */
  cmdkSelected: string;
  /** ⌘K selected-row icon tint — full `group-data-[selected=true]:*` tokens. */
  cmdkSelectedIcon: string;
};

/**
 * The leading nav glyph's hover / press travel — PURE CSS, never a framer
 * `whileHover`.
 *
 * A JS hover handler on a spine row re-renders React on every `mousemove`
 * across a 20-row list; the same 2px of travel costs nothing as a compositor
 * transform. The row itself never moves and never scales — a spine that
 * rescales breaks the baseline every dense surface beside it aligns to, so the
 * whole affordance is confined to the 14px icon.
 *
 * **Travel is VERTICAL only.** It used to carry `translate-x-0.5` beside a 1px
 * lift, which drifted the glyph toward the label it sits 8px from — the one
 * direction it has no room in. 2px straight up reads at a glance where 1px did
 * not, and press settles it back to rest.
 *
 * `motion-safe:` is load-bearing: the framer `MotionConfig` reduced-motion
 * floor covers `motion.*` elements only, so a CSS transform needs its own gate.
 * Under reduce the row still answers with the accent wash + icon tint.
 *
 * Requires `group` on the row button.
 */
export const SPINE_ICON_LIFT_CLASS =
  'transition-transform duration-150 ease-out ' +
  'motion-safe:group-hover:-translate-y-0.5 ' +
  'motion-safe:group-active:translate-y-0';

/** Neutral blue — top pin + footer (+ fallback). */
export const SPINE_NEUTRAL_ACCENT: SpineAccentClasses = {
  activePage: 'bg-blue-600 text-white ring-1 ring-inset ring-blue-400/30',
  idlePage: 'text-text-default hover:bg-surface-canvas',
  activePageIcon: 'text-white',
  idlePageIcon: 'text-text-muted',
  modeActive: 'bg-blue-600/15 text-blue-700 ring-1 ring-inset ring-blue-500/20',
  modeIdle: 'text-text-default hover:bg-surface-canvas',
  modeActiveIcon: 'text-blue-600',
  modeIdleIcon: 'text-text-muted',
  sectionActive: 'bg-surface-canvas text-text-default',
  sectionIdle: 'text-text-default hover:bg-surface-canvas',
  sectionActiveIcon: 'text-blue-600',
  sectionIdleIcon: 'text-text-muted group-hover:text-blue-600',
  cmdkSelected: 'data-[selected=true]:bg-blue-600/15 data-[selected=true]:text-blue-700',
  cmdkSelectedIcon: 'group-data-[selected=true]:[&_svg]:text-blue-600',
};

/**
 * Section personalities — one hue per spine section (2026-08-01 domain split):
 *   monitor     — cool sky observe
 *   floor       — amber scan-floor energy
 *   inbound     — teal arrival
 *   catalog     — emerald reference (inherits the retired `desk` hue)
 *   inventory   — cyan physical stock (inherits the retired `print` hue)
 *   fulfillment — indigo outbound
 *   sales       — green front desk
 *   support     — orange exception
 *
 * **Every section MUST appear here** — `SPINE_SECTION_ACCENTS` is a total
 * `Record<SpineSectionId, …>`, so adding a section without a hue is a type
 * error rather than a silent fall-through to neutral blue.
 *
 * **An active row is a fill PLUS an inset hairline, never a bare colour pop.**
 * The `ring-{hue}-400/30 ring-inset` sits inside the row's own radius, so the
 * selected destination reads as a seated, machined chip rather than a swatch —
 * the same "grain" the ops grid gets from `QUEUE_ROW.selectedClass`. Mode
 * (child) rows carry the softer `/20` ring over a `/15` wash so parentage is
 * legible without competing with the solid L1 fill above it.
 *
 * **A hue's SHADE is picked for contrast, not for symmetry.** These fills carry
 * white 12px caption text, so each one has to clear WCAG AA 4.5:1 on its own —
 * and several hues do not reach it at 600. `amber-600` on white is ≈2.9:1;
 * `amber-700` clears it at ≈4.7:1. Same for `orange` (support), `cyan`
 * (inventory), `teal` (inbound) and `green` (sales, ≈3.2:1 at 600), which is why
 * those five sit at 700 while sky / emerald / indigo sit at 600. Scan Stations
 * is the section a floor operator reads across a warehouse aisle; it is the last
 * one that may ship a contrast failure. Do not "restore" 600 for hue symmetry.
 *
 * **Three green-family hues now share the map** — `catalog` emerald-600,
 * `inbound` teal-700, `sales` green-700. They are two rows apart in
 * `SPINE_SECTIONS`, so at most one is a solid fill at a time. If they ever read
 * as one colour, re-hue Catalog — do NOT darken Sales past 700, which starts
 * reading black at 12px.
 */
export const SPINE_SECTION_ACCENTS: Record<SpineSectionId, SpineAccentClasses> = {
  monitor: {
    activePage: 'bg-sky-600 text-white ring-1 ring-inset ring-sky-400/30',
    idlePage: 'text-text-default hover:bg-surface-canvas',
    activePageIcon: 'text-white',
    idlePageIcon: 'text-text-muted',
    modeActive: 'bg-sky-600/15 text-sky-800 ring-1 ring-inset ring-sky-500/20',
    modeIdle: 'text-text-default hover:bg-surface-canvas',
    modeActiveIcon: 'text-sky-600',
    modeIdleIcon: 'text-text-muted',
    sectionActive: 'bg-sky-600/10 text-text-default',
    sectionIdle: 'text-text-default hover:bg-sky-600/10',
    sectionActiveIcon: 'text-sky-600',
    sectionIdleIcon: 'text-text-muted group-hover:text-sky-600',
    cmdkSelected: 'data-[selected=true]:bg-sky-600/15 data-[selected=true]:text-sky-800',
    cmdkSelectedIcon: 'group-data-[selected=true]:[&_svg]:text-sky-600',
  },
  floor: {
    activePage: 'bg-amber-700 text-white ring-1 ring-inset ring-amber-500/30',
    idlePage: 'text-text-default hover:bg-surface-canvas',
    activePageIcon: 'text-white',
    idlePageIcon: 'text-text-muted',
    modeActive: 'bg-amber-600/15 text-amber-900 ring-1 ring-inset ring-amber-600/20',
    modeIdle: 'text-text-default hover:bg-surface-canvas',
    modeActiveIcon: 'text-amber-600',
    modeIdleIcon: 'text-text-muted',
    sectionActive: 'bg-amber-600/10 text-text-default',
    sectionIdle: 'text-text-default hover:bg-amber-600/10',
    sectionActiveIcon: 'text-amber-600',
    sectionIdleIcon: 'text-text-muted group-hover:text-amber-600',
    cmdkSelected: 'data-[selected=true]:bg-amber-600/15 data-[selected=true]:text-amber-900',
    cmdkSelectedIcon: 'group-data-[selected=true]:[&_svg]:text-amber-600',
  },
  inbound: {
    // teal-700: teal-600 on white is ≈3.0:1, under the AA floor for 12px.
    activePage: 'bg-teal-700 text-white ring-1 ring-inset ring-teal-400/30',
    idlePage: 'text-text-default hover:bg-surface-canvas',
    activePageIcon: 'text-white',
    idlePageIcon: 'text-text-muted',
    modeActive: 'bg-teal-700/15 text-teal-900 ring-1 ring-inset ring-teal-600/20',
    modeIdle: 'text-text-default hover:bg-surface-canvas',
    modeActiveIcon: 'text-teal-700',
    modeIdleIcon: 'text-text-muted',
    sectionActive: 'bg-teal-700/10 text-text-default',
    sectionIdle: 'text-text-default hover:bg-teal-700/10',
    sectionActiveIcon: 'text-teal-700',
    sectionIdleIcon: 'text-text-muted group-hover:text-teal-700',
    cmdkSelected: 'data-[selected=true]:bg-teal-700/15 data-[selected=true]:text-teal-900',
    cmdkSelectedIcon: 'group-data-[selected=true]:[&_svg]:text-teal-700',
  },
  catalog: {
    activePage: 'bg-emerald-600 text-white ring-1 ring-inset ring-emerald-400/30',
    idlePage: 'text-text-default hover:bg-surface-canvas',
    activePageIcon: 'text-white',
    idlePageIcon: 'text-text-muted',
    modeActive: 'bg-emerald-600/15 text-emerald-800 ring-1 ring-inset ring-emerald-500/20',
    modeIdle: 'text-text-default hover:bg-surface-canvas',
    modeActiveIcon: 'text-emerald-600',
    modeIdleIcon: 'text-text-muted',
    sectionActive: 'bg-emerald-600/10 text-text-default',
    sectionIdle: 'text-text-default hover:bg-emerald-600/10',
    sectionActiveIcon: 'text-emerald-600',
    sectionIdleIcon: 'text-text-muted group-hover:text-emerald-600',
    cmdkSelected: 'data-[selected=true]:bg-emerald-600/15 data-[selected=true]:text-emerald-800',
    cmdkSelectedIcon: 'group-data-[selected=true]:[&_svg]:text-emerald-600',
  },
  inventory: {
    // cyan-700: cyan-600 on white sits near the AA floor for 12px captions.
    activePage: 'bg-cyan-700 text-white ring-1 ring-inset ring-cyan-400/30',
    idlePage: 'text-text-default hover:bg-surface-canvas',
    activePageIcon: 'text-white',
    idlePageIcon: 'text-text-muted',
    modeActive: 'bg-cyan-700/15 text-cyan-900 ring-1 ring-inset ring-cyan-600/20',
    modeIdle: 'text-text-default hover:bg-surface-canvas',
    modeActiveIcon: 'text-cyan-700',
    modeIdleIcon: 'text-text-muted',
    sectionActive: 'bg-cyan-700/10 text-text-default',
    sectionIdle: 'text-text-default hover:bg-cyan-700/10',
    sectionActiveIcon: 'text-cyan-700',
    sectionIdleIcon: 'text-text-muted group-hover:text-cyan-700',
    cmdkSelected: 'data-[selected=true]:bg-cyan-700/15 data-[selected=true]:text-cyan-900',
    cmdkSelectedIcon: 'group-data-[selected=true]:[&_svg]:text-cyan-700',
  },
  fulfillment: {
    activePage: 'bg-indigo-600 text-white ring-1 ring-inset ring-indigo-400/30',
    idlePage: 'text-text-default hover:bg-surface-canvas',
    activePageIcon: 'text-white',
    idlePageIcon: 'text-text-muted',
    modeActive: 'bg-indigo-600/15 text-indigo-800 ring-1 ring-inset ring-indigo-500/20',
    modeIdle: 'text-text-default hover:bg-surface-canvas',
    modeActiveIcon: 'text-indigo-600',
    modeIdleIcon: 'text-text-muted',
    sectionActive: 'bg-indigo-600/10 text-text-default',
    sectionIdle: 'text-text-default hover:bg-indigo-600/10',
    sectionActiveIcon: 'text-indigo-600',
    sectionIdleIcon: 'text-text-muted group-hover:text-indigo-600',
    cmdkSelected: 'data-[selected=true]:bg-indigo-600/15 data-[selected=true]:text-indigo-800',
    cmdkSelectedIcon: 'group-data-[selected=true]:[&_svg]:text-indigo-600',
  },
  sales: {
    // green-700, not green-600 (≈3.2:1 — the same AA failure amber/orange/cyan
    // had at 600) and not emerald, which `catalog` already owns. `green` is a
    // distinct hue on the ramp; the two sections sit two rows apart, so only
    // one is ever a solid fill at a time.
    activePage: 'bg-green-700 text-white ring-1 ring-inset ring-green-400/30',
    idlePage: 'text-text-default hover:bg-surface-canvas',
    activePageIcon: 'text-white',
    idlePageIcon: 'text-text-muted',
    modeActive: 'bg-green-700/15 text-green-900 ring-1 ring-inset ring-green-600/20',
    modeIdle: 'text-text-default hover:bg-surface-canvas',
    modeActiveIcon: 'text-green-700',
    modeIdleIcon: 'text-text-muted',
    sectionActive: 'bg-green-700/10 text-text-default',
    sectionIdle: 'text-text-default hover:bg-green-700/10',
    sectionActiveIcon: 'text-green-700',
    sectionIdleIcon: 'text-text-muted group-hover:text-green-700',
    cmdkSelected: 'data-[selected=true]:bg-green-700/15 data-[selected=true]:text-green-900',
    cmdkSelectedIcon: 'group-data-[selected=true]:[&_svg]:text-green-700',
  },
  support: {
    // orange-700: orange-600 on white is ≈3.6:1, under the AA floor for 12px.
    activePage: 'bg-orange-700 text-white ring-1 ring-inset ring-orange-400/30',
    idlePage: 'text-text-default hover:bg-surface-canvas',
    activePageIcon: 'text-white',
    idlePageIcon: 'text-text-muted',
    modeActive: 'bg-orange-700/15 text-orange-900 ring-1 ring-inset ring-orange-600/20',
    modeIdle: 'text-text-default hover:bg-surface-canvas',
    modeActiveIcon: 'text-orange-700',
    modeIdleIcon: 'text-text-muted',
    sectionActive: 'bg-orange-700/10 text-text-default',
    sectionIdle: 'text-text-default hover:bg-orange-700/10',
    sectionActiveIcon: 'text-orange-700',
    sectionIdleIcon: 'text-text-muted group-hover:text-orange-700',
    cmdkSelected: 'data-[selected=true]:bg-orange-700/15 data-[selected=true]:text-orange-900',
    cmdkSelectedIcon: 'group-data-[selected=true]:[&_svg]:text-orange-700',
  },
  // `studio` left this map 2026-08-02 with the section it belonged to: Workflow
  // Studio is a footer pin now, and footer pins wear SPINE_NEUTRAL_ACCENT like
  // Admin and Settings. Violet returned to the palette — do not re-add a key
  // here for a row that is not a section.
};

/** Resolve accent for a drill / root section; null → neutral (top/footer). */
export function spineAccentFor(
  sectionId: SpineSectionId | null | undefined,
): SpineAccentClasses {
  if (!sectionId) return SPINE_NEUTRAL_ACCENT;
  return SPINE_SECTION_ACCENTS[sectionId] ?? SPINE_NEUTRAL_ACCENT;
}
