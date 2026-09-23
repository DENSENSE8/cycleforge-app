/**
 * Kiosk V2 POS catalog surface — RAISED product cards on a ground plane.
 *
 * Compose only in `ProductSelector` `layout="kiosk-split"`. Issue chips still
 * compose {@link KIOSK_PILL}* in kiosk-chrome (`pill` only).
 *
 * ## Direction change (was: flush edge-to-edge)
 * This file used to read "one continuous `bg-surface-card` plane; hairline
 * dividers; no floating rounded-xl cards" — the industrial ops profile the rest
 * of the app wears. The kiosk is the one surface a PAYING CUSTOMER looks at
 * over the counter, not an operator running a shift, and flush hairlines on
 * white made a 1,500-item catalog read as a spreadsheet of photos. Products are
 * objects you pick up; they should look pickable.
 *
 * ## Why the ground plane is the load-bearing part
 * Adding shadows was NOT enough, and doing only that is the trap. The house
 * rule — `tokens/shadows.ts` "depth needs a ground plane", restated as the
 * GROUND-PLANE RULE in `styles/globals.css` and spelled out at
 * `tokens/desk-stage.ts` — is that a raised surface cast onto card-white has
 * nothing to read against and flattens straight back out. So the grid HOST
 * moves to `surface-canvas` (a real ~6% step below card white, per `light.ts`)
 * and the cells keep their own `surface-card` fill. The lift is the contrast
 * between the two planes; the shadow only sells it.
 *
 * Corners and depth resolve through `cornerClass` / the elevation ladder — and
 * where a responsive variant is needed, through the literals in
 * {@link KIOSK_POS_AT_MD}, which a test pins back to those same roles. Never a
 * bare `rounded-xl` / `shadow-*` picked at a call site.
 */

import { cornerClass } from '@/design-system/tokens/radius';
import { TACTILE_PRESS_TRAVEL_CLASS } from '@/design-system/tokens/shadows';
import { KIOSK_PILL_ACTIVE } from '@/app/kiosk/kiosk-chrome';
import { cn } from '@/utils/_cn';
/**
 * Tablet-measure mirrors of the token roles used below.
 *
 * A responsive variant CANNOT be composed: `md:${cornerClass('surface')}`
 * builds the string at runtime and Tailwind's scanner only reads source text,
 * so the utility is never emitted (the same trap `ELEVATION_HOVER_CLASS`
 * documents). They are therefore literals — and `kiosk-pos-surface.test.ts`
 * pins each one to the role it mirrors, so a theme that moves `surface` or the
 * elevation ladder fails a test instead of silently drifting at `md:`.
 */
export const KIOSK_POS_AT_MD = {
  cornerSurface: 'md:rounded-xl',
  elevSoft: 'md:shadow-elev-soft',
  elevRaisedHover: 'md:hover:shadow-elev-raised',
} as const;

/**
 * Shared plane behind catalog + stage.
 *
 * The ONE SoT background (operator, 2026-09-14): `bg-surface-card` — the
 * design-system surface token every other surface shares. The kiosk's
 * former `#FAFAFA` ground (2026-09-13) is repealed: a page-local hex
 * beside the fixed-width intake forms put two whites on one screen.
 * Same token, every measure — phone and desk.
 */
export const KIOSK_POS_CANVAS = 'bg-surface-card';

/**
 * Landscape category column — fixed width, never flex leftover space.
 * Portrait stays full-bleed above the product stage.
 */
export const KIOSK_POS_SIDEBAR = cn(
  'max-h-[40vh] w-full border-b border-border-soft',
  'md:max-h-none md:w-64 md:shrink-0 md:border-b-0 md:border-r',
);

/**
 * Category accordion scroll body — flush list, no inset pill padding.
 */
export const KIOSK_POS_SIDEBAR_BODY = cn(KIOSK_POS_CANVAS, 'p-0');

/**
 * Category nav item — flush row (no rounded-xl POS exception).
 */
export const KIOSK_POS_CATEGORY = cn(
  'ds-raw-button flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors',
);

export const KIOSK_POS_CATEGORY_ACTIVE = KIOSK_PILL_ACTIVE;

/** Idle category — hairline hover wash on the shared card plane. */
export const KIOSK_POS_CATEGORY_IDLE =
  'bg-surface-card text-text-default hover:bg-surface-hover active:bg-surface-hover';

/** Wrapping category title — tight leading so long Bose names do not balloon. */
export const KIOSK_POS_CATEGORY_LABEL =
  'min-w-0 flex-1 text-sm font-semibold leading-snug text-text-default';

/** Nested sibling stack — divide-y hairlines, not gap cards. */
export const KIOSK_POS_CATEGORY_STACK = 'flex flex-col divide-y divide-border-hairline';

/**
 * Product tile CSS grid — seam-separated on a phone, gapped from `md` up.
 *
 * The old note here said a gap would "reveal a colored host" and paint an
 * unfilled trailing row as a gray block. That was true of the flush direction
 * and is still true at the phone measure, which is why `gap-0` survives there;
 * from `md` up the host colour IS the design, and a short final row simply
 * shows more ground the way the last row of any card grid does.
 */
export const KIOSK_POS_GRID = 'grid w-full gap-0 md:gap-3';

/**
 * How many catalog tiles load their photo EAGERLY, at high fetch priority.
 *
 * The LCP element on `/kiosk/v2` is a tile photo, and Lighthouse measured its
 * resource-load DELAY at 4.2 s on a production build: the grid is fetched
 * client-side, so no image is discoverable in the initial HTML, and every tile
 * declared `loading="lazy"` on top of that.
 *
 * The grid is `auto-fill minmax(148px, 1fr)`, so an iPad-landscape row holds at
 * most ~8 tiles and this is one row — above the fold by definition. Everything
 * past it stays lazy, which is what keeps a several-hundred-tile catalog from
 * requesting several hundred photos on open.
 *
 * Raise this only with a Lighthouse number in hand: more eager images is more
 * bandwidth competing with the LCP one, which is the trade this constant exists
 * to make visible.
 */
export const KIOSK_EAGER_TILE_COUNT = 8;

/**
 * Product card — edge-separated cell on a phone, raised object from `md` up.
 *
 * Phone: hairline bottom/right seams on card white, square, flat (the FIND
 * phone ruling — see {@link KIOSK_POS_CANVAS}).
 *
 * Tablet: full perimeter, `surface` corner, `raised`/`soft` at rest and full
 * `raised` on hover — a 24-card grid all at full lift is noise, so rest is the
 * quieter rung and the pointer picks one card out of the field.
 *
 * Press travel is NOT gated on the measure: the tactile lip is a control's own
 * thickness rather than a plane above the page, so it reads at any width, and
 * touch is the one input the phone definitely has.
 *
 * Transition is enumerated (never `transition-all`) and names `box-shadow`
 * explicitly — without it the hover lift would snap while the colour eased.
 */
export const KIOSK_POS_CARD = cn(
  'group relative flex flex-col overflow-hidden text-left',
  'bg-surface-card border-b border-r border-border-hairline',
  'md:border',
  KIOSK_POS_AT_MD.cornerSurface,
  KIOSK_POS_AT_MD.elevSoft,
  'transition-[box-shadow,transform,background-color,border-color] duration-150 ease-out',
  KIOSK_POS_AT_MD.elevRaisedHover,
  'md:hover:-translate-y-0.5',
  TACTILE_PRESS_TRAVEL_CLASS,
  'motion-reduce:transform-none motion-reduce:transition-none',
);

/**
 * Selected product cell — accent wash only.
 *
 * The wash lives on the CARD, so the image well and caption below must stay
 * transparent; painting either `bg-surface-card` covers the wash. The blue
 * perimeter is {@link KIOSK_POS_CARD_SELECTED_FRAME}.
 */
export const KIOSK_POS_CARD_SELECTED = 'bg-surface-accent border-blue-500';

/**
 * Selection frame — inset ring following the card's own corner AT EACH MEASURE.
 *
 * Concentric with {@link KIOSK_POS_CARD}: a rounded frame inside a square
 * phone cell would float off the corners, and a square frame inside a rounded
 * tablet card gets its corners clipped. Both radii come from the same
 * `surface` role (via {@link KIOSK_POS_AT_MD}), so the two can never disagree.
 */
export const KIOSK_POS_CARD_SELECTED_FRAME = cn(
  'pointer-events-none absolute inset-0 z-10 border-2 border-blue-500',
  cornerClass('flush'),
  KIOSK_POS_AT_MD.cornerSurface,
);

/**
 * Circular selection dot — top-LEFT of the cell, rendered ONLY once picked.
 *
 * There is deliberately no idle/outline variant. An empty ring on every tile
 * laid a decal over every product photo and reduced "selected" to a fill swap
 * on an always-present dot; the accent wash
 * ({@link KIOSK_POS_CARD_SELECTED}) plus {@link KIOSK_POS_CARD_SELECTED_FRAME}
 * already carry selection, and a flush grid of photos reads as tappable
 * without a permanent affordance marker on each cell.
 *
 * Sits above the selection frame so the check stays visible.
 */
export const KIOSK_POS_CARD_SELECT_DOT = cn(
  'absolute left-1.5 top-1.5 z-20 flex h-6 w-6 items-center justify-center',
  cornerClass('pill'),
);

export const KIOSK_POS_CARD_SELECT_DOT_ON = 'bg-blue-600 text-white';

/**
 * Grid CELL — the wrapper that holds a card and its corner controls.
 *
 * The card itself is a `<button>` (tap = pick the product), so the favorite pip
 * cannot live inside it: a button inside a button is invalid HTML and the inner
 * control never receives the tap. The cell is therefore the positioning
 * context, and `h-full` keeps the card stretched to the grid row the way it was
 * when it WAS the grid child — without it, one long product title makes a
 * short-captioned neighbour float at its own height.
 */
export const KIOSK_POS_CARD_CELL = 'relative h-full';

/**
 * Favorite pip — top-RIGHT of the cell, opposite the selection dot.
 *
 * Always mounted, unlike {@link KIOSK_POS_CARD_SELECT_DOT}, and that is not the
 * decal the select dot's note rejects. A hover-revealed control does not exist
 * on a counter tablet: there is no pointer to reveal it with, so "pin this
 * repair" would be unreachable on the one surface that needs it. It earns the
 * permanence by being QUIET when off — translucent card fill, faint ink — and
 * amber only once the SKU is actually pinned.
 *
 * 32px face: a glove/thumb target on the same z-layer as the selection frame.
 */
export const KIOSK_POS_CARD_FAVORITE_PIP = cn(
  'ds-raw-button absolute right-1.5 top-1.5 z-20 flex h-8 w-8 items-center justify-center',
  cornerClass('pill'),
  'transition-colors duration-150 ease-out',
);

/** Pinned — amber, the house favorite ink (`Star` in the admin catalog). */
export const KIOSK_POS_CARD_FAVORITE_PIP_ON = 'bg-amber-500 text-white';

/** Unpinned — present but recessive; the photo stays the loudest thing. */
export const KIOSK_POS_CARD_FAVORITE_PIP_OFF = cn(
  'bg-surface-card/70 text-text-faint',
  'hover:bg-surface-card hover:text-amber-600 active:bg-surface-card',
);

/**
 * Caption band under the image well — tight, no card padding balloon.
 * Transparent so {@link KIOSK_POS_CARD_SELECTED} shows through (see there).
 */
export const KIOSK_POS_CARD_CAPTION =
  'flex flex-1 flex-col justify-between gap-1 bg-transparent px-3 py-2';

/**
 * Square image well — transparent, so the cell plane (white at rest, accent
 * when selected) is what shows. Never a sunken grey box.
 */
export const KIOSK_POS_IMAGE_WELL =
  'relative aspect-square w-full flex-shrink-0 overflow-hidden bg-transparent';

/**
 * Browse stage scroll region.
 *
 * Horizontal + bottom padding only — the TOP is owned by
 * {@link KIOSK_POS_BROWSE_SCROLL_TOP_CLEARANCE} and the BOTTOM by
 * {@link KIOSK_POS_BROWSE_SCROLL_CTA_CLEARANCE}. The axes are split because a
 * shorthand (`p-0 md:p-3`) and a longhand clearance (`pt-24`) do not resolve by
 * class order: responsive variants sort AFTER base utilities in the generated
 * sheet, so `md:p-3` silently zeroed the tablet's top clearance while the
 * phone kept it. One axis per token; no shorthand over a longhand.
 *
 * Phone: no gutter, hairline rows (the FIND phone ruling). `md` up: ground on
 * every side of the raised cards.
 */
export const KIOSK_POS_BROWSE_SCROLL = 'min-h-0 flex-1 overflow-y-auto px-0 md:px-3 pb-0 md:pb-3';
/**
 * Action footer that hosts {@link KIOSK_POS_CTA} — a TRANSPARENT float.
 *
 * ## No ground under the key, of any colour
 * This was a card-white band with a top hairline, then briefly a canvas band.
 * Both are wrong the same way: a fill plus a rule is a second SHEET, so the
 * The answer is the one already shipped for the mobile print workspace
 * (`components/mobile/print/MobilePrintWorkspace.tsx:512`): the dock is an
 * absolutely-positioned, `bg-transparent`, `pointer-events-none` strip over the
 * scroll region, and the BUTTON alone re-enables pointer events. Whatever plane
 * the catalog is on shows straight through, and the content keeps scrolling
 * underneath instead of being shortened by a band.
 *
 * Bottom pad mirrors that precedent's `max(0.75rem, safe-area)` so the key
 * clears a home indicator — and the lip has somewhere to depress into, which a
 * bottom-flush tactile button never does.
 *
 * Requires a `relative` ancestor, and {@link KIOSK_POS_BROWSE_SCROLL_CTA_CLEARANCE}
 * on the scroll region so the last row is not parked under the key.
 */
export const KIOSK_POS_ACTION_BAR = cn(
  'pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center',
  'bg-transparent px-4 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]',
);

/**
 * Scroll clearance under a floating {@link KIOSK_POS_CTA}.
 *
 * Applied ONLY while the key is mounted: a permanent reserve would leave dead
 * space at the bottom of every browse with nothing to continue to.
 *
 * Stated at BOTH the base and `md` variant: it must defeat the scroll
 * region's own `pb-0` and `md:pb-3` on the same axis, and a base-only class
 * loses to a responsive one at tablet regardless of class order.
 */
export const KIOSK_POS_BROWSE_SCROLL_CTA_CLEARANCE = 'pb-24 md:pb-24';

/**
 * Floating header dock — trail + search bands as ONE glass unit over the grid.
 *
 * ## Why glass and not collapsed
 * The operator option on the table was collapsing search into an icon while
 * scrolling. Rejected for this surface: the kiosk's one job is find-the-
 * product, and that means typing is zero taps away at EVERY scroll position —
 * an icon costs a tap plus a reflow animation on the exact action a waiting
 * walk-in is watching. The cheaper win is transparency: the bands keep their
 * controls but stop being opaque sheets, so the product field reads as one
 * continuous surface with glass over it (the same ruling the mobile station
 * shells took — see `CartonMobileOpsClient`'s `bg-surface-card/95
 * backdrop-blur-md` and `MobileCaptureWindow`'s "ONE blurred bar floating on
 * top").
 *
 * `backdrop-blur` rather than raw transparency: product photos scrolling under
 * bare text destroy legibility exactly when it matters. Blur keeps the field
 * visible without giving the text nothing to sit on.
 *
 * The dock itself is `pointer-events-none` so the grid stays scrollable through
 * its margins; each band opts back in with
 * {@link KIOSK_POS_TOP_DOCK_INTERACTIVE}.
 *
 * {@link KIOSK_POS_BROWSE_SCROLL_TOP_CLEARANCE} on the scroll region so the
 * first row is not parked under the glass.
 */
export const KIOSK_POS_TOP_DOCK = cn(
  'pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col',
  // Same surface token as the canvas beneath, in the codebase's glass form
  // (`bg-surface-card/…` — the StaffPickerList / SwimlaneBoard vocabulary).
  'bg-surface-card/70 backdrop-blur-lg',
);
export const KIOSK_POS_TOP_DOCK_INTERACTIVE = 'pointer-events-auto';

/**
 * The trail band as it renders INSIDE {@link KIOSK_POS_TOP_DOCK}.
 *
 * `KIOSK_PANE_HEADER_BAND` (its in-flow sibling) is an opaque card-white strip
 * with a bottom seam — correct bolted to a pane, wrong here: inside the glass
 * dock that fill defeats the translucency and the seam cuts the dock in two,
 * which is exactly the "old squared-off" strip the operator was seeing. This
 * variant carries NO paint of its own; the dock's glass is the background.
 */
export const KIOSK_POS_TRAIL_BAND = 'flex h-14 shrink-0 items-center gap-2 bg-transparent';

/**
 * Word-control chip — the modern form for the row's ghost comboboxes
 * (command · All products · stance).
 *
 * Bare ghost text was the industrial answer: no container, no target, hover
 * only implied. A pill with a RESTING wash gives each word-control a visible
 * container — measured perception check: a transparent pill is indistinguishable
 * from bare text until hover, which is the defect this exists to fix. Rounded
 * objects, rounded keys, rounded chips: one shape language across the surface.
 *
 * Operator ruling: one SIZE too — `h-9` for words AND glyphs. A 28px glyph
 * beside a 36px word chip reads as two systems even when the outlines match.
 */
export const KIOSK_POS_TRAIL_CONTROL =
  'flex h-9 items-center rounded-full border border-border-soft bg-surface-card px-3 transition-colors hover:bg-surface-sunken';

/**
 * Glyph chip — icon buttons (search · close · back · paperwork · cart) wear
 * the SAME container as the word chips: identical radius, border, fill AND
 * height (`h-9 w-9` overrides HEADER_ICON_BTN_CLASS's h-7 w-7 — same conflict
 * group, later class wins through cn()).
 */
export const KIOSK_POS_TRAIL_ICON =
  'flex h-9 w-9 items-center justify-center rounded-full border border-border-soft bg-surface-card transition-colors hover:bg-surface-sunken';

/**
 * Entry field — the kiosk form control (mobile-native step path).
 *
 * No floating label, no entry divider: the prompt lives IN the entry as its
 * placeholder, one radius for every control on the surface (`surface`, same
 * as the cards), and the same border/fill vocabulary as the trail chips so
 * the whole kiosk reads as one system. Operator ruling: "removing the
 * floating text label, entry divider and making it all in the entry … all
 * aligned under one corner radius."
 */
export const KIOSK_POS_ENTRY =
  'flex h-12 w-full rounded-xl border border-border-soft bg-surface-card px-4 text-sm text-text-default outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-text-faint focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:bg-surface-canvas';

/** Multiline twin — notes and anything that wraps. */
export const KIOSK_POS_ENTRY_AREA =
  'flex min-h-28 w-full rounded-xl border border-border-soft bg-surface-card px-4 py-3 text-sm text-text-default outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-text-faint focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:bg-surface-canvas resize-none';

/**
 * Leading-glyph slot for an entry — the money mark on the price field.
 *
 * Operator 2026-09-15 asked for "a green price icon" on the repair form's
 * price, so the field states its KIND before anyone reads the placeholder. The
 * glyph is the house money mark (`Receipt`, documented in
 * `icons/commerce.tsx` as the price glyph — LedgerGrid's Price header and
 * `CHIP_TONES.price` already use it), tinted `text-text-success`. NOT a new
 * dollar glyph: a second money icon is the duplicate-glyph failure the icon
 * SoT exists to prevent.
 *
 * Three parts because an inline sibling would have to re-derive the field's
 * border and fill: the HOST is the positioning context, the GLYPH floats over
 * the field's own left inset, and the field takes `_INSET` so its text clears
 * the mark. `cn()` is tailwind-merge, so `_INSET`'s `pl-*` overrides the
 * field's `px-4` on the left only.
 */
export const KIOSK_POS_ENTRY_ICON_HOST = 'relative';
export const KIOSK_POS_ENTRY_ICON =
  'pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-success';
export const KIOSK_POS_ENTRY_ICON_INSET = 'pl-11';
/**
 * Form measure — the fixed-width column every ENTRY surface renders in.
 *
 * Operator ruling 2026-09-13: the product field is full-bleed (it is a
 * scanning surface — the more tiles on screen the better), but forms are
 * typing surfaces and want a MEASURE: a 1366px-wide input is hard to type
 * into and harder to proofread. `max-w-lg` (512px) keeps one-and-a-half
 * hands of touch targets per row; on a 390px phone `w-full` wins and the
 * same markup fills the screen exactly. Same move the desk took with
 * `DESK_STAGE_FIXED_CLASS` — content gets a measure, chrome goes edge to
 * edge.
 */
export const KIOSK_POS_FORM_MEASURE = 'mx-auto w-full max-w-lg';

/**
 * Scroll clearance under the floating header (one 56px band + breathing
 * room). Applied unconditionally (the dock is always mounted, unlike the CTA).
 */
export const KIOSK_POS_BROWSE_SCROLL_TOP_CLEARANCE = 'pt-20';
/**
 * The primary kiosk CTA — centred key, no cast of any kind.
 *
 * ## Width
 * `w-full` on a phone, capped and centred from `md` up. It used to be
 * `w-full flex-1` at every measure: a 1366px-wide "Continue" is not a button,
 * it is a coloured strip — no object to aim at, a label floating in a bar
 * whose ends are unreachable, nothing marking it as the ONE next step. At
 * 390px the opposite holds: the viewport IS the measure, so full width is the
 * biggest thumb target available and a cap would only shrink it.
 *
 * ## No shadow — operator ruling
 * This carried a hard 4px tactile lip. On the old opaque footer that read as a
 * key sitting on a tray; once the dock went transparent the same ink fell
 * across the product grid behind it, so it stopped reading as the button's own
 * thickness and started reading as a drop shadow smeared over the catalog.
 * Shadowless is the ruling: `shadow-none` is stated rather than merely omitted,
 * because {@link Button}'s own variant classes may carry one.
 *
 * ## The press
 * Travel only — the face drops and returns. With no lip to collapse there is
 * nothing for a scale to fight, so the primitive's `active:scale-[0.96]` is
 * still neutralised via an identical-prefix `enabled:active:scale-100`: a
 * simultaneous shrink and drop is two motions describing one press.
 */
export const KIOSK_POS_CTA = cn(
  // The dock is `pointer-events-none` so the catalog stays scrollable through
  // it; the key is the one thing in that strip that can be hit.
  'pointer-events-auto w-full md:max-w-sm',
  'shadow-none',
  TACTILE_PRESS_TRAVEL_CLASS,
  'enabled:active:scale-100',
  'transition-[transform,background-color] duration-100 ease-out',
  'motion-reduce:transform-none motion-reduce:transition-none',
);

/**
 * The secondary partner of {@link KIOSK_POS_CTA} — bounded and centred like
 * the key, just narrower and quieter.
 *
 * Exists so a two-action footer (Save · Pay, Add another · Continue) is ONE
 * decision expressed in two tokens, not a key next to an edge-to-edge strip
 * button. Same press travel, so both controls in a pair answer identically.
 */
export const KIOSK_POS_CTA_SECONDARY = cn(
  'pointer-events-auto w-full max-w-40',
  'shadow-none',
  TACTILE_PRESS_TRAVEL_CLASS,
  'enabled:active:scale-100',
  'transition-[transform,background-color,border-color] duration-100 ease-out',
  'motion-reduce:transform-none motion-reduce:transition-none',
);

/**
 * The History face's master rail — the twin of {@link KIOSK_POS_SIDEBAR}, one
 * step wider.
 *
 * A catalog category is one or two words, so 16rem fits it. A history row is
 * four facts on two lines (ticket · customer, then model · when), and at
 * `w-64` the customer name truncates on almost every real visit — the one
 * field an operator scans the rail FOR. The rail stacks above the detail on a
 * phone and becomes the left column from `md`, exactly like the catalog.
 */
export const KIOSK_POS_HISTORY_RAIL = cn(
  'flex min-h-0 w-full flex-col border-b border-border-soft',
  'md:w-80 md:shrink-0 md:border-b-0 md:border-r',
);
