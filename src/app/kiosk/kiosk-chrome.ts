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
  'flex h-14 shrink-0 items-center gap-3 bg-surface-card px-4',
  'border-b border-border-soft',
  cornerClass('flush'),
);

/** Pane title face inside {@link KIOSK_PANE_HEADER_BAND}. */
export const KIOSK_PANE_HEADER_TITLE =
  'min-w-0 flex-1 text-lg font-semibold tracking-tight text-text-default';

/**
 * Collapsed mode-spine width (icon column). Always visible — never snaps to 0.
 * Inner expanded column stays {@link KIOSK_MODE_SPINE_EXPANDED_W}; the host
 * clips to this width when collapsed.
 */
export const KIOSK_MODE_SPINE_ICON_W_PX = 64;

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
