/**
 * Kiosk V2 pane chrome — shared header hairline Y + far-left mode spine.
 *
 * Catalog and Repair Details (and any future detail header) must compose the
 * same band so the top hairline reads as one continuous seam across columns.
 * Hosts stay `p-0`; content inset lives on this band / list rows only.
 *
 * Mode selection is a left push spine (`KioskModeSpine`) — never a bottom pill
 * dock. Region contract: `.claude/rules/display/kiosk-shell.md`.
 */

import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

/**
 * Touch-friendly pane title row (~56px). Taller than desk
 * `PRIMARY_CHROME_ROW_FACE` (`h-7`) — tablet counter, not ops densify.
 * Upper band owns `border-b`; bodies never add a matching `border-t`.
 */
export const KIOSK_PANE_HEADER_BAND = cn(
  // pl-0: leading control (KioskSpineToggle) shares the Catalog instrument
  // column with ProductSelector's flush back cell — same as staff HEADER_INSET_X.
  'flex h-14 shrink-0 items-center gap-3 bg-surface-card pl-0 pr-4',
  'border-b border-border-soft',
  cornerClass('flush'),
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
  cornerClass('flush'),
);

/** Pane title face inside {@link KIOSK_PANE_HEADER_BAND}. */
export const KIOSK_PANE_HEADER_TITLE =
  // first:pl-4: title-only bands (no leading toggle) keep a readable inset.
  'min-w-0 flex-1 first:pl-4 text-lg font-semibold tracking-tight text-text-default';

/**
 * Collapsed mode-spine width — **0 / off-screen**, matching staff
 * `SidebarNavColumn`. Open snaps to {@link KIOSK_MODE_SPINE_EXPANDED_W_PX};
 * there is no intermediate icon-only rail (that ate Catalog width on every
 * counter visit). Reopen via `KioskSpineToggle` in the Catalog / Pickup header.
 */
export const KIOSK_MODE_SPINE_COLLAPSED_W_PX = 0;

/**
 * Expanded mode-spine width (icon + labels). Matches staff MasterNav
 * `SIDEBAR_SPINE_WIDTH` so the kiosk variation reads as the same family.
 * Paired with {@link KIOSK_MODE_SPINE_EXPANDED_W_PX}.
 */
export const KIOSK_MODE_SPINE_EXPANDED_W = 'w-[240px]';

/** Numeric twin of {@link KIOSK_MODE_SPINE_EXPANDED_W}. */
export const KIOSK_MODE_SPINE_EXPANDED_W_PX = 240;

/** Outer face of the mode spine column (card plane + trailing hairline). */
export const KIOSK_MODE_SPINE_FACE = cn(
  'flex h-full flex-col bg-surface-card',
  'border-r border-border-soft',
  cornerClass('flush'),
);

/**
 * One mode row in the spine — touch-tall, flush, icon-leading.
 * Active wash = sunken (MasterNav neutral selected).
 */
export const KIOSK_MODE_SPINE_ROW = cn(
  'ds-raw-button flex w-full items-center gap-3 px-3 text-left',
  'h-14 shrink-0 transition-colors duration-150',
  cornerClass('flush'),
);

export const KIOSK_MODE_SPINE_ROW_ACTIVE = 'bg-surface-sunken text-text-default';
export const KIOSK_MODE_SPINE_ROW_IDLE =
  'text-text-soft hover:bg-surface-hover hover:text-text-default';
