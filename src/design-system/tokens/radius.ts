/**
 * Corner-radius scale + the semantic role layer.
 *
 * ## The scale
 *
 * These values now mirror Tailwind's **stock** `borderRadius` byte for byte —
 * i.e. what the `rounded-*` classes in the app actually render. They previously
 * sat one step ABOVE the classes of the same name (`radii.lg` was 12px while
 * `rounded-lg` renders 8px), so any comment that paired a token name with a
 * class name shipped ~4px wrong. Realigning them removes that trap; it changed
 * no pixels, because nothing consumed the old values.
 *
 * This scale is deliberately NOT wired into `tailwind.config.mjs` — pointing
 * `theme.extend.borderRadius` at it would remap every `rounded-*` call site in
 * the app at once. The classes stay Tailwind's; this module is the typed mirror
 * plus the role layer below.
 *
 * ## The role layer
 *
 * Prefer {@link cornerClass} over a bare `rounded-*` for new surfaces: a ROLE
 * ("this is a card", "this is a control") survives a scale change, a raw class
 * does not. Same shape as the other visual axes — `elevationClass(role)`
 * (shadows), `focusRing(archetype, tone)`, the `inset-*` spacing intents, and
 * `text-role-*`. Radius was the one axis with a token file but no role layer.
 *
 * Nothing adopts this yet by design: migrating call sites is a visual change and
 * is being staged surface by surface. Existing `rounded-*` classes are correct
 * and are not a bug to fix on sight.
 */

/** Tailwind's stock borderRadius values — the typed mirror of what classes render. */
export const radius = {
  /**
   * Flush — scan-station edge-to-edge chrome, grid cells, hairline rows.
   * Desks use the ladder (`chip`…`canvas`). Do not default ops CTAs here.
   */
  none: '0px',
  /** 2px — hairline softening, rarely the right call */
  sm: '0.125rem',
  /** 4px — chips, badges */
  DEFAULT: '0.25rem',
  /** 6px — list rows, menu items */
  md: '0.375rem',
  /** 8px — soft menus / dropdown chrome (`control` role) */
  lg: '0.5rem',
  /** 12px — fields, ops tables, popovers */
  xl: '0.75rem',
  /** 16px — cards, panels, dialogs */
  '2xl': '1rem',
  /** 24px — full-bleed canvas / glass worksheets */
  '3xl': '1.5rem',
  /** Pills, circular buttons */
  full: '9999px',
} as const;

export type Radius = typeof radius;

/**
 * Interaction/containment role → corner. Pick by what the element IS, not by a
 * pixel value. Ordered smallest to largest; `pill` is outside the ladder.
 *
 * Prefer {@link cornerClass}(`'flush'`) only on scan stations (bleed benches)
 * and true grid cells. Desk / workbench chrome uses the ladder
 * (`chip` · `row` · `control` · `field` · `card` · `canvas`). `pill` is avatars
 * and switches. {@link Button} defaults to `surface`.
 */
export type CornerRole =
  /** Flush with its container — scan-station bleed, grid cells, hairline rows */
  | 'flush'
  /** Chips, badges, copy chips */
  | 'chip'
  /** List rows, menu items */
  | 'row'
  /** Soft menus / dropdown chrome (`rounded-lg`). Desk {@link Button} uses `surface`. */
  | 'control'
  /** Form fields, ops-table surfaces, popovers */
  | 'field'
  /** Cards, panels, dialogs, docks */
  | 'card'
  /** Glass worksheets / large canvas containers */
  | 'canvas'
  /**
   * Grok-style triage panels — TriageScrollLayout right-pane cards only.
   * Off the industrial ladder on purpose: remapping `card` would re-round every
   * ops surface. Agents retrieve `cornerClass('surface')`, never a raw `rounded-*`.
   */
  | 'surface'
  /** Pills, dots, avatars */
  | 'pill';

// Desk ladder uses the real Tailwind rungs. `flush` stays `rounded-none` for
// scan-station bleed and grid cells. `surface` matches `field` (12px).
const CORNER_CLASS: Record<CornerRole, string> = {
  flush: 'rounded-none',
  chip: 'rounded',
  row: 'rounded-md',
  control: 'rounded-lg',
  field: 'rounded-xl',
  card: 'rounded-2xl',
  canvas: 'rounded-3xl',
  surface: 'rounded-xl',
  pill: 'rounded-full',
};

/** Rendered px per role — the basis for the concentric math in {@link nestedCorner}. */
const CORNER_PX: Record<CornerRole, number> = {
  flush: 0,
  chip: 4,
  row: 6,
  control: 8,
  field: 12,
  card: 16,
  canvas: 24,
  surface: 12,
  pill: 9999,
};

/** Roles that participate in the size ladder, smallest first (`pill` + `surface` excluded). */
const CORNER_LADDER: CornerRole[] = ['flush', 'chip', 'row', 'control', 'field', 'card', 'canvas'];

/** The `rounded-*` class for a role. `cn()`-ready. */
export function cornerClass(role: CornerRole): string {
  return CORNER_CLASS[role];
}

/**
 * Composer-shell family corner — {@link OmnichannelComposerDock}.
 * Named so a call site claims that shell, not a guessed `rounded-2xl`.
 * Scan stations stay flush via {@link cornerClass}(`'flush'`) and `bleed`.
 */
export const COMPOSER_SHELL_CORNER = 'rounded-2xl';

/**
 * Menu rows inside a {@link COMPOSER_SHELL_CORNER} drop panel padded `p-1`.
 *
 * Inner = outer − padding: 16px − 4px = 12px (`rounded-xl`). A square
 * highlight (`rounded-none`) inside that shell leaves a white sliver at each
 * corner; equal radii (`rounded-2xl` on the row) read as too round.
 * Same hatch as {@link SEGMENTED_CONTROL_FACE_CORNER}.
 */
export const COMPOSER_MENU_ITEM_CORNER = 'rounded-xl';

/**
 * A segmented control's track and its two faces — the concentric pair for a
 * pick-one toggle sitting inside a SOFT shell ({@link VisibilityToggle}'s
 * default chrome; Internal │ Public on the composer dock, claim compose,
 * Send-photos).
 *
 * These name pixels that already shipped. `VisibilityToggle` carried
 * `rounded-lg` / `rounded-md` as literals inside the primitive, which meant the
 * one place the house states its corners could not see them and `ds_critique`
 * had nothing to check them against. Naming them changed no pixels.
 *
 * The values are the concentric result, not a preference. Inner = outer −
 * padding: the composer dock is {@link COMPOSER_SHELL_CORNER} (16px) with
 * `p-1.5` (6px), so the track wants 16 − 6 = 10 → the 8px rung → `rounded-lg`;
 * the track's own `p-0.5` (2px) puts the faces at 8 − 2 = 6 → `rounded-md`.
 * Named constants so VisibilityToggle and the composer dock cannot disagree.
 * Scan-station segmented chrome may still pass `appearance="flush"`.
 */
export const SEGMENTED_CONTROL_CORNER = 'rounded-lg';

/** The pressed/unpressed faces inside {@link SEGMENTED_CONTROL_CORNER}. */
export const SEGMENTED_CONTROL_FACE_CORNER = 'rounded-md';

/**
 * Floating menu / dropdown / popover panel — the 8px control rung the scale
 * already names for "soft menus / dropdown chrome".
 *
 * Same 8px rung as {@link cornerClass}(`'control'`). A call site that reaches
 * for this constant is a drop panel. Find-row tokens use
 * {@link DATA_TABLE_TOOLBAR_CORNER}.
 */
export const DROPDOWN_SHELL_CORNER = 'rounded-lg';

/**
 * Rows inside a {@link DROPDOWN_SHELL_CORNER} panel padded `p-1`.
 *
 * Inner = outer − padding: 8px − 4px = 4px (`rounded`). Square
 * (`rounded-none`) highlights leave a sliver at each corner of the shell.
 * Same hatch as {@link COMPOSER_MENU_ITEM_CORNER}.
 */
export const DROPDOWN_ITEM_CORNER = 'rounded';

/**
 * DataTable find-row tokens — search, filter, sort, views, date, fields,
 * zoom, fullscreen, the export glyph. Operator 2026-09-01: round them off;
 * a square token on that row reads as boxed-off, not industrial chrome.
 *
 * Same 8px rung as {@link DROPDOWN_SHELL_CORNER} so a closed trigger and the
 * panel it opens cannot disagree about corners. Named so a call site is
 * claiming the find row, not rounding a table cell or a workbench card.
 */
export const DATA_TABLE_TOOLBAR_CORNER = 'rounded-lg';

/**
 * Chrome INSIDE a `cornerClass('surface')` triage panel — the alerts, pickers,
 * fields and buttons an operator works in the exception editor.
 *
 * Operator 2026-08-31, on the order-exceptions display: round it off. The
 * ladder answer was flush, and flush is right where a control sits hard against
 * its container's inside face — but nothing here does. {@link TriageSections}
 * pads its panels `p-5`, so every control floats with 20px of clearance on all
 * sides and is concentrically constrained by nothing. {@link nestedCorner}
 * returns `flush` for that pair only because the arithmetic (12 − 20) goes
 * negative, which is the formula reporting "not concentric", not a design
 * finding. A square control inside a 12px panel it never touches reads as an
 * unstyled control, not as industrial chrome.
 *
 * 8px, one rung under the panel's 12px — the same relationship, and the same
 * value, as {@link SEGMENTED_CONTROL_CORNER} inside the composer shell.
 *
 * Same 8px rung as {@link cornerClass}(`'control'`).
 */
export const TRIAGE_PANEL_INNER_CORNER = 'rounded-lg';

/**
 * ─── Mobile scan surface ────────────────────────────────────────────────────
 *
 * The handheld scan screens (`/m/scan-out` first; the floor stations that clone
 * it next). These are the ONE place the house departs from flush-square, and it
 * is a deliberate operator call (2026-09-04), not a drift.
 *
 * ## Why a phone is not a desk
 *
 * Flush-square is the desk's grammar because a desk surface is a plane inside a
 * plane: a table butts against its toolbar, a cell against its column, and a
 * radius there would draw a box around something that is not a box. A phone has
 * no planes to butt against — every surface floats on the canvas, held in one
 * hand, and a hard corner on a floating card reads as an unstyled div rather
 * than as industrial intent. The device's own screen is radiused; chrome that
 * ignores that reads as a web page pasted onto a phone.
 *
 * These constants are therefore scoped BY SURFACE, not by preference. They do
 * not license rounding anywhere else: a desk table, a scan-station well, a
 * DataTable cell and a workbench plate all stay {@link cornerClass}(`'flush'`).
 *
 * ## The ladder
 *
 * Three rungs, one step apart, so nesting stays concentric without arithmetic:
 * window 24 → card 16 → row 12.
 *
 * There was a fourth, `MOBILE_SCAN_RETICLE_CORNER`, for the camera's aim
 * brackets. It was deleted with the reticle itself (the capture window draws
 * nothing on the feed now); a corner token with no surface to describe is a
 * token the next station will reach for and misuse.
 */

/**
 * The scan window's lip — the camera surface anchored to the bottom of a
 * handheld scan screen.
 *
 * TOP corners only. The bottom edge meets the device bezel, which supplies its
 * own radius; rounding it again leaves a sliver of canvas under the window and
 * reads as a floating sheet rather than the mouth of the screen. Pair with
 * `overflow-hidden` so the video is clipped to the lip.
 */
export const MOBILE_SCAN_WINDOW_CORNER = 'rounded-t-3xl';

/**
 * A card floating on the mobile scan canvas — the focus card carrying the scan
 * that just settled. One rung under {@link MOBILE_SCAN_WINDOW_CORNER}, so a
 * card sitting on the window's lip does not out-round the window.
 */
export const MOBILE_SCAN_CARD_CORNER = 'rounded-2xl';

/**
 * A history row on the mobile scan tape. One rung under
 * {@link MOBILE_SCAN_CARD_CORNER}: history is quieter than the live scan, and
 * the corner says so before the ink does.
 */
export const MOBILE_SCAN_ROW_CORNER = 'rounded-xl';

/**
 * Concentric inner corner: **inner = outer − padding**.
 *
 * A box nested inside a rounded container looks wrong unless its radius is the
 * outer radius minus the gap between them; equal radii read as too round on the
 * inside, and a too-small inner radius leaves a visible sliver at each corner.
 *
 * `padStep` is the Tailwind spacing step the outer container pads by — pass `3`
 * for `p-3`, i.e. the number you already wrote in the class. (Steps are 4px at
 * the default density; the density multiplier scales both radii together, so the
 * relationship holds.)
 *
 * The result snaps DOWN to the nearest role on the ladder, so it is always a
 * real house corner rather than an arbitrary px value.
 *
 * The house already documents one instance of this by hand — a glass
 * `rounded-3xl` worksheet with `p-3` takes `rounded-xl` inner fields
 * (`station-workbench.md`). That is exactly `nestedCorner('canvas', 3)`.
 */
export function nestedCorner(outer: CornerRole, padStep: number): CornerRole {
  const outerPx = outer === 'pill' ? CORNER_PX.canvas : CORNER_PX[outer];
  const target = outerPx - Math.max(0, padStep) * 4;
  if (target <= 0) return 'flush';

  let best: CornerRole = 'flush';
  for (const role of CORNER_LADDER) {
    if (CORNER_PX[role] <= target) best = role;
  }
  return best;
}

/** Convenience: the class for a concentric inner corner. */
export function nestedCornerClass(outer: CornerRole, padStep: number): string {
  return cornerClass(nestedCorner(outer, padStep));
}
