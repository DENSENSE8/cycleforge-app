/**
 * Kiosk V2 pane chrome — shared header hairline Y on one trail row.
 *
 * Callers: `KioskShell`, `KioskTopChrome`, `ProductSelector`, `ConsultStanceControls`.
 * Affected API: none. Schemas: `KioskServiceId`.
 * User: "Converting the left sidebar into just a top left drop down so repair
 * or sales or more and then an exit button so you can exit out of the kiosk
 * mode. The right sidebar should also be removed as well and everything placed
 * into the top header, the cart, the paperwork, the work, show, verify, etc."
 *
 * Catalog and detail headers compose the same band so the top hairline reads
 * as one continuous seam. Hosts stay `p-0`. Command selection is the ghost
 * dropdown on that trail; cart, paperwork, and stance sit on the same row.
 * Commands swap the center work surface only.
 * Live law: `AGENTS.md` + docs/todo/kiosk-pos-modernization-HANDOFF.md.
 */

import { cornerClass, MOBILE_SCAN_CARD_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

// (KIOSK_MODE_SPINE_ROW / _ROW_IDLE / _ICON deleted 2026-09-14, Phase 1 —
// the last three survivors of the retired command spine. Their only consumer
// was ProductSelector's hand-rolled trail back control, which is now an
// IconButton in the trail icon family (HEADER_ICON_BTN_CLASS +
// KIOSK_POS_TRAIL_ICON) like the search toggle beside it. kioskSpineShortLabel
// and the rest of the spine chrome went in Phase 0; see the ledger below.)

/**
 * Touch-friendly pane title row (~56px). Taller than desk
 * `PRIMARY_CHROME_ROW_FACE` (`h-7`) — tablet counter, not ops densify.
 * Upper band owns `border-b`; bodies never add a matching `border-t`.
 */
export const KIOSK_PANE_HEADER_BAND = cn(
  // Full-bleed host — title type owns its own in-band inset (px-3), never a page margin.
  'flex h-14 shrink-0 items-center gap-3 bg-surface-card pl-0 pr-0',
  'border-b border-border-soft',
);

/**
 * Touch-friendly pane action floor (~56px) — twin of {@link KIOSK_PANE_HEADER_BAND}.
 * Owns `border-t border-border-soft` so left (cart actions) and right (submit)
 * hairlines share one continuous Y with the same token as the header seam.
 * Never `border-border-hairline` here — that reads as a different weight from the top.
 */
export const KIOSK_PANE_FOOTER_BAND = cn(
  'flex h-14 shrink-0 items-stretch bg-surface-card p-0',
  'border-t border-border-soft',
);

/** Pane title face inside {@link KIOSK_PANE_HEADER_BAND}. */
export const KIOSK_PANE_HEADER_TITLE =
  // In-band type inset only — the host band stays edge-to-edge with column seams.
  'min-w-0 flex-1 px-3 text-lg font-semibold tracking-tight text-text-default';

// (KIOSK_BAND_SEARCH_ROW deleted 2026-09-14 — zero consumers since the trail
// search moved into the glass dock's inline field; recorded in the Phase 0
// ledger above.)


/**
 * In-body section label row — the `KIOSK_SECTION_LABEL` + divider + inset
 * triple, which was hand-composed at eight sites (one of them at `px-6`,
 * silently out of line with the other seven).
 *
 * The seam here is deliberately `border-border-hairline`, NOT the
 * `border-border-soft` of a band: a divider *inside* a body is a lighter fact
 * than the seam that closes a band. That distinction was the thing nothing
 * wrote down, which is why the two weights had been used interchangeably.
 */
export const KIOSK_SECTION_LABEL_ROW = cn(
  'border-b border-border-hairline px-4 py-2',
  'text-role-micro uppercase tracking-[0.16em] text-text-soft',
);

/**
 * The one horizontal inset for pane bodies.
 *
 * The surface carried four (`px-4` ×25, `px-6` ×7, `px-3` ×2, `px-8` ×1). Bands
 * are full-bleed and their titles inset themselves; bodies use this.
 */
export const KIOSK_BODY_INSET = 'px-4';

/**
 * Dense meta chrome — SKU, category row labels, quiet status (not form fields).
 * Keep body/input type at tablet-readable size so iOS does not zoom.
 */
export const KIOSK_META = 'text-role-micro font-semibold text-text-soft';

/**
 * Product tile title — arm’s-length readable on iPad landscape.
 *
 * Clamped at two lines because a customer can drop off several devices, so a
 * title is either ONE product or a summary of many — and the summary form is
 * an unbounded concatenation a tablet tile cannot absorb. Two lines then an
 * ellipsis keeps the grid on its rhythm. `line-clamp-2` brings its own
 * `overflow-hidden` and needs normal wrapping; never add `truncate` here —
 * its `whitespace-nowrap` would cancel the clamp
 * (law: `src/components/search/search-result-faces.tsx:154-158`).
 */
export const KIOSK_TILE_TITLE =
  'text-sm font-semibold leading-tight text-text-default line-clamp-2 break-words text-pretty';

/**
 * Checkout section micro label (repair / sales panes).
 * Hairline border lives on the host when the section needs a divider.
 */
export const KIOSK_SECTION_LABEL =
  'text-role-micro uppercase tracking-[0.16em] text-text-soft';

/**
 * Selectable pill chrome (repair issue chips).
 * Only house use of `cornerClass('pill')` on the kiosk counter face.
 * Category nav is flush in `kiosk-pos-surface`. Compose with
 * {@link KIOSK_PILL_ACTIVE} / {@link KIOSK_PILL_IDLE}.
 */
export const KIOSK_PILL = cn(
  'ds-raw-button flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
  cornerClass('pill'),
);

/** Selected pill — accent wash (Square chip selected). Pair with a trailing Check overlay. */
export const KIOSK_PILL_ACTIVE = 'bg-surface-accent text-text-default';

/** Idle pill — quiet sunken chip, hover wash. */
export const KIOSK_PILL_IDLE =
  'bg-surface-sunken text-text-default hover:bg-surface-hover active:bg-surface-hover';

/**
 * Issue/reason selected pill — warning wash so selected issues pop on intake.
 * Still a {@link KIOSK_PILL} compose; categories keep {@link KIOSK_PILL_ACTIVE}.
 */
export const KIOSK_PILL_ACTIVE_ISSUE =
  'bg-amber-50 text-amber-900 ring-1 ring-amber-200';

// (Spine tokens deleted 2026-09-14, Phase 0 of the kiosk DS unification —
// the command/utility spines came down 2026-09-13 and these were their
// orphaned chrome: COLLAPSED_W/_PX, EXPANDED_W/_PX, FACE, ROW_COLLAPSED,
// ROW_EXPANDED, LABEL, SEARCH_ROW, UTILITY_SPINE_FACE, and
// kioskSpineShortLabel all had ZERO consumers. ROW + ROW_IDLE + ICON followed
// them 2026-09-14 in Phase 1 — see the note above the pane bands.)

// (KIOSK_CART_COL / _PX deleted 2026-09-14, Phase 0 — the fixed cart column
// died with the right utility spine, which made the cart a CENTER-STAGE PANEL.
// SUPERSEDED 2026-09-14, Phase 2: it is a bounded rounded SHEET on that stage
// (KIOSK_UTILITY_SHEET). The stage-swap half of the Phase 0 ruling still holds
// — a utility slot hides the work surface rather than floating over it, so the
// sheet needs no backdrop and traps nothing. Only the panel's WIDTH changed.)


/**
 * Live line-count badge riding the cart glyph (one-symbol).
 * Position against a button-sized `relative` wrap — not the trail’s
 * `HEADER_ICON_WRAP` (h-full), or -top-* parks in the band gutter.
 * Callers: KioskTopChrome (~line 145). API: none. Schemas: none.
 * User: "ensure the qty for the cart is properly on the cart icon" /
 * "cart glyph with a one-symbol count badge top-right"
 */
export const KIOSK_CART_COUNT_BADGE = cn(
  'pointer-events-none absolute -right-1 -top-1 z-10 flex h-4 min-w-4 items-center justify-center px-1',
  'bg-fill-info text-role-micro leading-none text-white tabular-nums',
  cornerClass('pill'),
);

// (KIOSK_UTILITY_SPINE_FACE deleted 2026-09-14, Phase 0 — right spine chrome,
// zero consumers. See the Phase 0 ledger at the top of the spine block.)


/**
 * THE kiosk centre surface — one white, full-bleed plane per pane.
 *
 * This is the skeleton the repair service intake form established and the
 * operator asked every kiosk form to inherit (2026-09-15): *"it should be very
 * similar to the repair service intake form with the stepper on top and its
 * full width and then a fixed width in the middle. Why are you fixing width
 * for the entire display? … There should be no reason why you're wrapping the
 * cart form and then having another background for it. There should just be a
 * white background."*
 *
 * The measure belongs to the BODY, not to the plane: `KioskPaneForm` puts
 * `KIOSK_POS_FORM_MEASURE` on the scroll body while the step band and the
 * action floor run edge to edge. A bounded, cornered card here fixes the width
 * of the CHROME as well, which is what made the cart read as a popover.
 *
 * Mount: the outer element of a centre pane (cart, repair, buyback, pickup),
 * with `KioskPaneForm` inside it.
 */
export const KIOSK_CENTRE_SURFACE =
  'flex min-h-0 min-w-0 flex-1 flex-col bg-surface-card';

/**
 * Utility SHEET face — the bounded card the paperwork and triage panels still
 * wear on the centre stage.
 *
 * Was `KIOSK_UTILITY_PANEL_FACE` (`h-full w-full` edge-to-edge), which painted
 * a full-width slab across the glass. Operator 2026-09-14: *"the cart icon
 * brings up a full width popover component. This is a wrong display."*
 *
 * ## The CART left this face (2026-09-15)
 *
 * Bounding the whole panel was the wrong reading of that ruling: the cart is a
 * FORM, and a form's measure belongs to its body, so the cart now mounts
 * {@link KIOSK_CENTRE_SURFACE} — white, full-bleed, the repair intake
 * skeleton. This token survives for the two read-mostly panels that are still
 * a card on a stage; porting them is the next increment.
 *
 * FLAT either way: it composed `elevationClass('overlay')` for one session and
 * the operator rejected the blur — *"it should not display a depth drop
 * shadow."* Separation is the plane behind it ({@link KIOSK_UTILITY_STAGE})
 * plus the `border-border-soft` hairline, never a shadow. Nothing inside may
 * re-introduce one either — see `KioskCartLineCard`, which carried
 * `elevationClass('raised','soft')` per line and is now hairline-only.
 *
 * `MOBILE_SCAN_CARD_CORNER` is the same corner the mobile scan cards wear:
 * consume the `/m` SoT, never invent a kiosk radius.
 */
export const KIOSK_UTILITY_SHEET = cn(
  'mx-auto my-3 flex min-h-0 w-full max-w-2xl min-w-0 flex-1 flex-col overflow-hidden',
  'border border-border-soft bg-surface-card',
  MOBILE_SCAN_CARD_CORNER,
);

/**
 * The stage plane behind an open utility SHEET — the other half of the
 * flat-sheet ruling above.
 *
 * Scoped to the sheet-wearing slots, never a permanent repaint and never
 * behind the cart: `KIOSK_POS_CANVAS` is the ONE stage background (pinned by
 * `kiosk-pos-surface.test.ts`), the product cards and the glass dock are all
 * `bg-surface-card` over it, and sinking the stage for good would recolour the
 * whole browse surface. The cart is a full-bleed white surface now, so there is
 * nothing to contrast it against and it takes no second plane at all.
 *
 * `surface-sunken` is the neutral recessed rung. NOT `surface-bench` /
 * `-trough` / `-plate` / `-slot`: those are the scan-station packing-bench
 * family (birch on light, warm coal on dark) and borrowing one here would put
 * an Unbox well behind a counter tablet.
 */
export const KIOSK_UTILITY_STAGE = 'bg-surface-sunken';

// (KIOSK_CART_LINE_ROW deleted 2026-09-14, Phase 2 — the cart's flat hairline
// row. Lines are KioskCartLineCard now: a rounded touch card with KioskChip
// facts, per SURFACE_LAW §5, "lists on a phone-shaped surface are cards".)

/** Customer-face shell — same card plane, no operational chrome. */
export const KIOSK_CUSTOMER_FACE = cn(
  'flex h-full w-full flex-col bg-surface-card text-text-default',
);

