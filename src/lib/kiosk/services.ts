/**
 * Front-desk command SoT — `/kiosk` welcome tiles + `/kiosk/v2` command rail.
 *
 * On v2 these are **commands** that swap the center work surface; they never
 * own or clear the cart session. Bringing a WIP command online is a one-line
 * `status: 'live'` flip.
 */

import {
  PackageCheck,
  ReceivingModeRepair,
  SalesPrice,
  RefreshCw,
} from '@/components/Icons';

export type KioskServiceId = 'sales' | 'pickup' | 'repair' | 'buyback';

type KioskServiceIcon = (props: { className?: string }) => JSX.Element;

export interface KioskServiceTile {
  id: KioskServiceId;
  label: string;
  blurb: string;
  /** Only `live` services render as actionable; `wip` stay in the SoT for reuse. */
  status: 'live' | 'wip';
  /**
   * When false, the proven `/kiosk` welcome tiles omit this command.
   * Buyback is v2-register only until portrait cutover.
   */
  welcome: boolean;
  icon: KioskServiceIcon;
  /**
   * Command ink — ONE semantic text token per command, so the glyph reads as
   * that command everywhere it mounts (dropdown trigger, dropdown option, any
   * future rail) without a per-call-site colour.
   *
   * Operator 2026-09-14: "repair orange and sales green and more colors for
   * other". Mapped onto the theme's semantic ink, never a raw hex — these
   * resolve per theme (`src/design-system/themes/registry.ts`) so the commands
   * stay legible on dark / ember / cyberpunk too.
   */
  iconTone: string;
  /** Dense sentence-case command label for the v2 rail. */
  commandLabel: string;
}

export const KIOSK_SERVICES: ReadonlyArray<KioskServiceTile> = [
  {
    id: 'repair',
    label: 'Repair Drop-off',
    commandLabel: 'Repair',
    blurb: 'Check in a device for service',
    status: 'live',
    welcome: true,
    icon: ReceivingModeRepair,
    // Orange/amber. Same ink `StatCard` already gives the repair lane.
    iconTone: 'text-text-warning',
  },
  {
    id: 'sales',
    label: 'Buy / Sell',
    commandLabel: 'Retail',
    blurb: 'Start a counter sale or trade-in',
    status: 'live',
    welcome: true,
    icon: SalesPrice,
    // Green — money in.
    iconTone: 'text-text-success',
  },
  {
    id: 'buyback',
    label: 'Buyback',
    commandLabel: 'Buyback',
    blurb: 'Evaluate a trade-in / buyback',
    status: 'live',
    welcome: false,
    icon: RefreshCw,
    // Blue — the inbound/appraise direction, opposite the green sale.
    iconTone: 'text-text-info',
  },
  {
    id: 'pickup',
    label: 'Order Pickup',
    commandLabel: 'Pickup',
    blurb: 'Collect a ready order',
    status: 'live',
    welcome: true,
    // PackageCheck — collect a ready order. ShoppingCart is reserved for the
    // right utility Cart slot; leave ReceivingModePickup alone for receiving.
    icon: PackageCheck,
    // Violet — pickup hands over a READY OUTBOUND order, which is the ink the
    // outbound/ready grid already uses for that work.
    iconTone: 'text-text-fulfillment',
  },
];

export function liveKioskServices(): KioskServiceTile[] {
  return KIOSK_SERVICES.filter((s) => s.status === 'live');
}

/** Welcome-tile subset — excludes v2-only commands like buyback. */
export function welcomeKioskServices(): KioskServiceTile[] {
  return KIOSK_SERVICES.filter((s) => s.status === 'live' && s.welcome);
}

/** Map service tile id → session command id (`sales` → `retail`). */
export function serviceIdToCommand(
  id: KioskServiceId,
): 'repair' | 'retail' | 'buyback' | 'pickup' {
  if (id === 'sales') return 'retail';
  return id;
}

export function commandToServiceId(
  command: 'repair' | 'retail' | 'buyback' | 'pickup',
): KioskServiceId {
  if (command === 'retail') return 'sales';
  return command;
}
