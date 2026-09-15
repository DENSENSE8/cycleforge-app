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

import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

// (kioskSpineShortLabel deleted 2026-09-14, Phase 0 — expanded-rail grammar,
// zero consumers since the spines came down. See the Phase 0 ledger below.)

/** Shared command-cell chrome — touch-tall, flush. Sole consumer today:
 * ProductSelector's trail back button; folds into KioskPaneForm in Phase 1. */
export const KIOSK_MODE_SPINE_ROW = cn(
  'ds-raw-button flex w-full shrink-0 transition-colors duration-150',
  'min-h-14',
);

export const KIOSK_MODE_SPINE_ROW_IDLE =
  'text-text-soft hover:bg-surface-hover hover:text-text-default';

/** Spine glyph — smaller than the old 24px MasterNav-scale icon. */
export const KIOSK_MODE_SPINE_ICON = 'h-5 w-5 shrink-0';

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

/** Product tile title — arm’s-length readable on iPad landscape. */
export const KIOSK_TILE_TITLE = 'text-sm font-semibold leading-tight text-text-default';

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
// kioskSpineShortLabel all had ZERO consumers. Kept ROW + ROW_IDLE + ICON:
// ProductSelector's trail back button still wears them; they fold into
// KioskPaneForm's back affordance in Phase 1.)

// (KIOSK_CART_COL / _PX deleted 2026-09-14, Phase 0 — the fixed cart column
// died with the right utility spine; the ledger is a center-stage panel now.)


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
 * Utility panel face — cart / paperwork mounted in the CENTER stage.
 *
 * These are NOT a drawer and NOT a slide-out column: selecting a rail glyph
 * swaps the center work surface, exactly like the left command spine swaps it.
 * Full width of the center, no `border-l` (the rail already owns that seam) and
 * no fixed `w-80` — a floating panel over the work is the shape this replaces.
 */
export const KIOSK_UTILITY_PANEL_FACE = cn(
  'flex h-full min-h-0 w-full min-w-0 flex-col bg-surface-card',
);

// (KIOSK_CART_FACE deleted 2026-09-14, Phase 0 — the fixed w-80 cart column
// face; the cart renders as a center-stage panel via KIOSK_UTILITY_PANEL_FACE.)


/** Cart line row — horizontal hairline only, no inner card padding balloon. */
export const KIOSK_CART_LINE_ROW =
  'flex items-baseline justify-between gap-3 px-4 py-2.5';

/** Customer-face shell — same card plane, no operational chrome. */
export const KIOSK_CUSTOMER_FACE = cn(
  'flex h-full w-full flex-col bg-surface-card text-text-default',
);

