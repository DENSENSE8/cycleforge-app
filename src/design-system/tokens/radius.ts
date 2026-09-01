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
   * Flush — data rows, table cells, solid {@link Button} CTAs
   * (`cornerClass('flush')`), industrial instrument chrome.
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
 * Prefer {@link cornerClass}(`'flush'`) for new industrial chrome (Kinetic
 * Ledger / Stitch zero-radius). Soft ladder steps remain for chips · legacy
 * card·canvas shells · true pills (avatars · switches) until those surfaces
 * migrate call-site by call-site — remapping `field`/`control` here would
 * silently rewrite `nestedCornerClass('card', …)` consumers.
 */
export type CornerRole =
  /** Flush with its container — grid cells, full-bleed rows, solid Button CTAs */
  | 'flush'
  /** Chips, badges, copy chips */
  | 'chip'
  /** List rows, menu items */
  | 'row'
  /** Soft menus / dropdown chrome (`rounded-lg`). Solid {@link Button} uses `flush`. */
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

// Zero-radius industrial: ops chrome is flush-square. Every LADDER role
// (flush…canvas) renders `rounded-none` (Wave 0b/0c/0d/0e). Two roles sit off
// that ladder: `pill` (dots · avatars · Switch) and `surface` (TriageScrollLayout
// right-pane panels). COMPOSER_SHELL_CORNER is a named constant, not a role.
// CORNER_PX is untouched for ladder math; `surface` is 12px to match `rounded-xl`.
const CORNER_CLASS: Record<CornerRole, string> = {
  flush: 'rounded-none',
  chip: 'rounded-none',
  row: 'rounded-none',
  control: 'rounded-none',
  field: 'rounded-none',
  card: 'rounded-none',
  canvas: 'rounded-none',
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
 * The ONE soft corner on an ops surface: the composer-shell family.
 *
 * `OmnichannelComposerDock` is a declared carve-out from the zero-radius law —
 * it is the ChatGPT-style prompt dock, and its shell (`rounded-2xl`), its
 * commit control (`rounded-full`) and its footer track
 * (`SlicedActionDock`'s `COMPOSER_PILL_TRACK`) have always been soft. Three
 * places had that corner as a literal and nothing named it, so a fourth
 * surface welded to the same shell had no way to match it except by guessing.
 *
 * It is deliberately NOT a `CornerRole`. The role ladder is the ops scale and
 * every non-`pill` rung renders flush; adding a soft rung there would hand
 * every workbench CTA a way to round itself. This is a named exemption for one
 * shell family, and a call site that reaches for it is claiming membership in
 * that family — which is checkable in review, unlike `rounded-2xl`.
 *
 * Law: ops chrome is flush-square; the composer dock, the kiosk counter face,
 * `cornerClass('surface')` (TriageScrollLayout panels only) and
 * {@link TRIAGE_PANEL_INNER_CORNER} (what sits inside those panels) are the
 * exemptions. None of them is a licence to round anything else.
 */
export const COMPOSER_SHELL_CORNER = 'rounded-2xl';

/**
 * Menu rows inside a {@link COMPOSER_SHELL_CORNER} drop panel padded `p-1`.
 *
 * Inner = outer − padding: 16px − 4px = 12px (`rounded-xl`). A square
 * highlight (`rounded-none`) inside that shell leaves a white sliver at each
 * corner; equal radii (`rounded-2xl` on the row) read as too round. The
 * ladder cannot express this pair — `nestedCornerClass('card', 1)` returns
 * flush — so it is a named exemption, same hatch as
 * {@link SEGMENTED_CONTROL_FACE_CORNER}.
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
 * That is exactly {@link nestedCorner}('card', 1.5) then ('control', 0.5) —
 * except {@link cornerClass} cannot express it, because every ladder rung
 * renders `rounded-none` under the zero-radius law. Hence named constants,
 * the same escape hatch {@link COMPOSER_SHELL_CORNER} uses.
 *
 * NOT a licence to round a control that is not inside a soft shell. Ops chrome
 * segmented controls take `appearance="flush"` and stay square.
 */
export const SEGMENTED_CONTROL_CORNER = 'rounded-lg';

/** The pressed/unpressed faces inside {@link SEGMENTED_CONTROL_CORNER}. */
export const SEGMENTED_CONTROL_FACE_CORNER = 'rounded-md';

/**
 * Floating menu / dropdown / popover panel — the 8px control rung the scale
 * already names for "soft menus / dropdown chrome".
 *
 * Named exemption, same hatch as {@link COMPOSER_SHELL_CORNER}: the ops ladder
 * stays flush-square (kiosk + desk surfaces), and a call site that reaches for
 * this constant is claiming to be a **drop panel**, which is checkable in
 * review. FilterMenu already shipped `rounded-lg` as a literal; this is that
 * face, once, so DropdownMenu / ContextMenu / the table chrome popovers cannot
 * disagree about whether a menu in this product has corners.
 *
 * Not a licence to round a table or a workbench card. Find-row tokens
 * (search, filter, sort, views, …) use {@link DATA_TABLE_TOOLBAR_CORNER}.
 */
export const DROPDOWN_SHELL_CORNER = 'rounded-lg';

/**
 * Rows inside a {@link DROPDOWN_SHELL_CORNER} panel padded `p-1`.
 *
 * Inner = outer − padding: 8px − 4px = 4px (`rounded`). Square
 * (`rounded-none`) highlights leave a sliver at each corner of the shell.
 * `nestedCornerClass('control', 1)` cannot express this: the ladder renders
 * flush. Same hatch as {@link COMPOSER_MENU_ITEM_CORNER}.
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
 * Like its two neighbours this is a NAMED exemption, not a `CornerRole`: the
 * ladder stays zero-radius, and a call site reaching for this constant is
 * claiming to be inside a triage panel — checkable in review, unlike a bare
 * `rounded-lg`. It is not a licence to round ops chrome that is not.
 */
export const TRIAGE_PANEL_INNER_CORNER = 'rounded-lg';

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
