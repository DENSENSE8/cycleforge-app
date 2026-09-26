/** Kiosk V2 pane chrome — shared header hairline Y on one trail row. */

import { cornerClass, MOBILE_SCAN_CARD_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

// (KIOSK_MODE_SPINE_ROW / _ROW_IDLE / _ICON deleted 2026-09-14, Phase 1 — the last three survivors of the retired command spine.

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

/** Touch-friendly pane action floor (~56px) — twin of {@link KIOSK_PANE_HEADER_BAND}. */
export const KIOSK_PANE_FOOTER_BAND = cn(
  'flex h-14 shrink-0 items-stretch bg-surface-card p-0',
  'border-t border-border-soft',
);

// (KIOSK_PANE_HEADER_TITLE deleted 2026-09-23 — its last mounts were the Buyback / Pickup band titles and the Paperwork / customer-face…

/** In-body section label row — the `KIOSK_SECTION_LABEL` + divider + inset triple, which was hand-composed at eight sites (one of them at… */
export const KIOSK_SECTION_LABEL_ROW = cn(
  'border-b border-border-hairline px-4 py-2',
  'text-role-micro uppercase tracking-[0.16em] text-text-soft',
);
/**
 * Dense meta chrome — SKU, category row labels, quiet status (not form fields).
 * Keep body/input type at tablet-readable size so iOS does not zoom.
 */
export const KIOSK_META = 'text-role-micro font-semibold text-text-soft';

/** Product tile title — arm’s-length readable on iPad landscape. */
export const KIOSK_TILE_TITLE =
  'text-sm font-semibold leading-tight text-text-default line-clamp-2 break-words text-pretty';

/**
 * Checkout section micro label (repair / sales panes).
 * Hairline border lives on the host when the section needs a divider.
 */
export const KIOSK_SECTION_LABEL =
  'text-role-micro uppercase tracking-[0.16em] text-text-soft';

/** Selectable pill chrome (repair issue chips). */
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

// (Spine tokens deleted 2026-09-14, Phase 0 of the kiosk DS unification — the command/utility spines came down 2026-09-13 and these were…

// (KIOSK_CART_COL / _PX deleted 2026-09-14, Phase 0 — the fixed cart column died with the right utility spine, which made the cart a…


/** Live line-count badge riding the cart glyph (one-symbol). */
export const KIOSK_CART_COUNT_BADGE = cn(
  'pointer-events-none absolute -right-1 -top-1 z-10 flex h-4 min-w-4 items-center justify-center px-1',
  'bg-fill-info text-role-micro leading-none text-white tabular-nums',
  cornerClass('pill'),
);

// (KIOSK_UTILITY_SPINE_FACE deleted 2026-09-14, Phase 0 — right spine chrome,
// zero consumers. See the Phase 0 ledger at the top of the spine block.)


/**
 * THE kiosk centre surface — one white, full-bleed plane per pane.
 * operator asked every kiosk form to inherit (2026-09-15): *"it should be very
 */
export const KIOSK_CENTRE_SURFACE =
  'flex min-h-0 min-w-0 flex-1 flex-col bg-surface-card';

/**
 * Utility SHEET face — the bounded card the paperwork and triage panels still wear on the centre stage.
 * a full-width slab across the glass. Operator 2026-09-14: *"the cart icon
 */
export const KIOSK_UTILITY_SHEET = cn(
  'mx-auto my-3 flex min-h-0 w-full max-w-2xl min-w-0 flex-1 flex-col overflow-hidden',
  'border border-border-soft bg-surface-card',
  MOBILE_SCAN_CARD_CORNER,
);

/** The stage plane behind an open utility SHEET — the other half of the flat-sheet ruling above. */
export const KIOSK_UTILITY_STAGE = 'bg-surface-sunken';

// (KIOSK_CART_LINE_ROW deleted 2026-09-14, Phase 2 — the cart's flat hairline
// row. Lines are KioskCartLineCard now: a rounded touch card with KioskChip
// facts, per SURFACE_LAW §5, "lists on a phone-shaped surface are cards".)

/** Customer-face shell — same card plane, no operational chrome. */
export const KIOSK_CUSTOMER_FACE = cn(
  'flex h-full w-full flex-col bg-surface-card text-text-default',
);

