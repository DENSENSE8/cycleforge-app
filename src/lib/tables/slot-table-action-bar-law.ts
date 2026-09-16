/**
 * **THE ACTION BAR NEVER CHANGES HEIGHT.** Engine law for the slot-table
 * selection strip, on every PRODUCT_TABLES peer.
 *
 * ## The law
 *
 * > The action bar's height is declared by the BAND. It is never derived from
 * > its children, and no press inside it may change it.
 *
 * Operator 2026-09-15: *"the action buttons bar should not expand or collapse
 * in height from clicking on an action — it should stay the same height."*
 *
 * ## Why it kept happening
 *
 * The band is a flex row of controls, so its height was whatever its tallest
 * child happened to be — which made every child a silent vote on the band's
 * geometry, and made a CONDITIONAL child a vote that changes mid-interaction.
 * Three independent causes, all live at once on the Stock strip:
 *
 * 1. **A taller primitive.** `TextField` is locked to `h-11 pb-1 pt-5` because
 *    it IS its floating label. Beside `size="sm"` (32px) Buttons it set the
 *    band to 60px.
 * 2. **A conditional control.** The reason-note field mounted only when the
 *    picked reason had `requires_note`, so choosing a reason grew the bar.
 * 3. **A conditional child inside a control.** `ReasonCodePicker` appended its
 *    own "Reason needs a note" line inside the same `<label>`, so the control
 *    had no fixed height of its own to begin with.
 *
 * Each was individually defensible and the sum was a bar that jumped under the
 * operator's cursor while they were aiming at it. On a strip whose buttons
 * commit irreversible writes, geometry that moves on press is a mis-click
 * generator, which is why this is a law and not a preference.
 *
 * ## How the law is enforced — four places, one rule
 *
 * | layer | file |
 * |---|---|
 * | the rule | THIS module — the height token + the predicates |
 * | the gate | `slot-table-action-bar-law.test.ts` (verify **Unit tests**) |
 * | the CLI | `scripts/action-bar-height-guard.ts` (verify **Action bar**, `always`) |
 * | at runtime | {@link useFixedBandHeight} — dev-mode `ResizeObserver` |
 *
 * Static analysis cannot prove a React tree has constant height, so the
 * runtime guard is the one with real teeth: it measures the mounted band and
 * fails loudly the first time the height moves. The static gate catches the
 * three known causes before they ship; the runtime guard catches the fourth
 * nobody thought of.
 *
 * ## What a new strip row must do
 *
 * - Put {@link SLOT_TABLE_ACTION_BAR_BAND_CLASS} on the band. It carries the
 *   fixed height, `flex-nowrap` and `overflow-hidden` — so a child that grows
 *   or a row that would wrap CLIPS instead of resizing the band. Clipping is a
 *   visible bug a reviewer fixes; a resizing toolbar is one an operator eats.
 * - Size every control with {@link SLOT_TABLE_ACTION_BAR_CONTROL_CLASS} (or a
 *   `size="sm"` primitive, which already matches it).
 * - Render NO conditional control. A fact that only sometimes applies goes in
 *   a fixed-width cell that is empty when it does not apply, or out of the band
 *   entirely. `requires_note` is the worked example: the note cell is always
 *   mounted and disabled until a reason needs it.
 */
import { PRODUCT_TABLES } from '@/lib/tables/table-catalog';

/**
 * The band's height, as a Tailwind token. 40px: a 32px control plus the 4px
 * padding either side that keeps a focus ring from clipping on the band edge.
 */
export const SLOT_TABLE_ACTION_BAR_HEIGHT_CLASS = 'h-10' as const;

/** Measured px height the runtime guard and the gate both assert. */
export const SLOT_TABLE_ACTION_BAR_HEIGHT_PX = 40;

/**
 * The band. `h-10` declares the height, `flex-nowrap` refuses a second line,
 * and `overflow-hidden` makes an oversized child clip rather than push.
 *
 * `flex-wrap` is the single most important omission here: it was on the Stock
 * band, and it is what turned "one more control appeared" into "the toolbar is
 * now two rows tall".
 */
export const SLOT_TABLE_ACTION_BAR_BAND_CLASS = [
  'flex w-full min-w-0 flex-nowrap items-center gap-2 overflow-hidden',
  SLOT_TABLE_ACTION_BAR_HEIGHT_CLASS,
  'border-b border-border-hairline bg-surface-card px-3',
].join(' ');

/** Every interactive cell in the band. Matches `size="sm"` on house primitives. */
export const SLOT_TABLE_ACTION_BAR_CONTROL_CLASS = 'h-8' as const;

/**
 * Source files that render INTO the action-bar band and are therefore bound by
 * this law. Grows when a family gains a strip; never shrinks silently — a file
 * leaving this list means that surface stopped having an action bar.
 */
export const SLOT_TABLE_ACTION_BAR_FILES = [
  'src/components/inventory/location-stock-grid/StockActionBar.tsx',
  'src/components/inventory/location-stock-grid/StockVerbRow.tsx',
  'src/components/inventory/location-stock-grid/StockAdjustRow.tsx',
  'src/components/inventory/location-stock-grid/StockMoveRow.tsx',
  'src/components/inventory/location-stock-grid/StockReplaceRow.tsx',
  'src/components/inventory/location-stock-grid/StockPairComposer.tsx',
] as const;

/**
 * The band host — the file that must carry {@link SLOT_TABLE_ACTION_BAR_BAND_CLASS}
 * and mount the runtime guard.
 */
export const SLOT_TABLE_ACTION_BAR_HOST =
  'src/components/inventory/location-stock-grid/StockActionBar.tsx' as const;

/**
 * Primitives whose height is fixed ABOVE the control scale, so they cannot
 * appear in the band. `TextField` is the whole reason this list exists; the
 * band's text cell is `StockStripInput`.
 */
export const SLOT_TABLE_ACTION_BAR_BANNED_IMPORTS = [
  { symbol: 'TextField', reason: 'h-11 + a required floating label. Use StockStripInput.' },
] as const;

/**
 * Class fragments that make a band or a cell size itself from content. Each is
 * a cause that actually shipped.
 */
export const SLOT_TABLE_ACTION_BAR_BANNED_CLASSES = [
  { fragment: 'flex-wrap', reason: 'a wrapped row is a second line — the band doubles.' },
  { fragment: 'h-auto', reason: 'height from content is height that moves.' },
  { fragment: 'min-h-', reason: 'a floor without a ceiling still grows.' },
  { fragment: 'py-', reason: 'pad-to-size cannot line up with an h-* scale; set the height.' },
] as const;

/** Peers this law covers — derived, never hand-copied. */
export function slotTableActionBarPeerIds(): string[] {
  return PRODUCT_TABLES.map((table) => table.tableId);
}

/** Human-facing summary for a LEDGER, a PR body, or an agent that asks. */
export const SLOT_TABLE_ACTION_BAR_LAW = {
  invariant:
    'The action bar declares its own height. No child sets it and no press changes it.',
  heightPx: SLOT_TABLE_ACTION_BAR_HEIGHT_PX,
  bandClass: SLOT_TABLE_ACTION_BAR_BAND_CLASS,
  controlClass: SLOT_TABLE_ACTION_BAR_CONTROL_CLASS,
  noConditionalControls:
    'A sometimes-relevant field is always mounted and disabled, never conditionally rendered.',
  operator: '2026-09-15',
  gate: 'scripts/action-bar-height-guard.ts + slot-table-action-bar-law.test.ts',
  runtime: 'useFixedBandHeight — dev-mode ResizeObserver on the mounted band.',
} as const;
