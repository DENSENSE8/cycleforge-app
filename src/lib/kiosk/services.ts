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
  },
  {
    id: 'sales',
    label: 'Buy / Sell',
    commandLabel: 'Retail',
    blurb: 'Start a counter sale or trade-in',
    status: 'live',
    welcome: true,
    icon: SalesPrice,
  },
  {
    id: 'buyback',
    label: 'Buyback',
    commandLabel: 'Buyback',
    blurb: 'Evaluate a trade-in / buyback',
    status: 'live',
    welcome: false,
    icon: RefreshCw,
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
