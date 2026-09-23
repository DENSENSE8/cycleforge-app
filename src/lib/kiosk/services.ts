/**
 * Front-desk service SoT — `/kiosk` welcome tiles + `/kiosk/v2` command rail.
 *
 * Two KINDS live here, and the difference is load-bearing:
 *
 * - `kind: 'command'` — the four center work surfaces. These map 1:1 onto
 *   `KioskCommandId`, which is also the CHECK vocabulary on
 *   `counter_sessions.active_command`, so a command tile is a session state.
 * - `kind: 'staff'` — a tool the counter STAFF opens on top of whatever
 *   command is running (History). It owns no cart, sets no `active_command`,
 *   and survives being closed: the session underneath is untouched. It is
 *   therefore NOT a command id and must never reach `serviceIdToCommand`,
 *   which is why the parameter of that function is the narrow
 *   {@link KioskCommandServiceId} — a staff tile cannot be passed to it
 *   without the compiler saying so.
 *
 * Bringing a WIP tile online is a one-line `status: 'live'` flip.
 */

import {
  History,
  PackageCheck,
  ReceivingModeRepair,
  SalesPrice,
  RefreshCw,
} from '@/components/Icons';
import type { KioskCommandId } from './commands';

/** The four commerce commands — every one of them a `KioskCommandId`. */
export type KioskCommandServiceId = 'sales' | 'pickup' | 'repair' | 'buyback';
/** Staff tools that ride ON TOP of a command; they own no session state. */
export type KioskStaffServiceId = 'history';
export type KioskServiceId = KioskCommandServiceId | KioskStaffServiceId;

type KioskServiceIcon = (props: { className?: string }) => JSX.Element;

export interface KioskServiceTile {
  id: KioskServiceId;
  /** `command` swaps the work surface; `staff` opens a tool over it. */
  kind: 'command' | 'staff';
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
    kind: 'command',
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
    kind: 'command',
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
    kind: 'command',
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
    kind: 'command',
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
  {
    id: 'history',
    kind: 'staff',
    label: 'History',
    commandLabel: 'History',
    blurb: 'Find a past visit and reprint its paperwork',
    status: 'live',
    // Never a welcome tile: the welcome face is the CUSTOMER's, and History is
    // the staff book (kiosk-pos-modernization-HANDOFF Phase 4 — "do not expose
    // History on the attract/open customer face without PIN").
    welcome: false,
    icon: History,
    // Quiet ink. The four commerce commands own the saturated colours; a staff
    // tool that borrowed one would read as a fifth way to take money.
    iconTone: 'text-text-soft',
  },
];

export function liveKioskServices(): KioskServiceTile[] {
  return KIOSK_SERVICES.filter((s) => s.status === 'live');
}

/** The live tiles that swap the work surface — staff tools excluded. */
export function liveKioskCommandServices(): KioskServiceTile[] {
  return KIOSK_SERVICES.filter((s) => s.status === 'live' && s.kind === 'command');
}

/** Narrow a tile id to the command half, so `serviceIdToCommand` stays total. */
export function isKioskCommandServiceId(id: KioskServiceId): id is KioskCommandServiceId {
  return id !== 'history';
}

/**
 * Live commands as CHOOSER options — the org's default-command select in
 * Settings, sourced from this tile SoT so the words on the picker are the words
 * on the counter. Only `live` COMMANDS: an org cannot default to a `wip` pane
 * that would render nothing, and it cannot default to a staff tool at all —
 * History sets no `active_command`, so there would be nothing to store.
 */
export function kioskCommandOptions(): {
  command: KioskCommandId;
  label: string;
  blurb: string;
}[] {
  return liveKioskCommandServices().flatMap((service) =>
    isKioskCommandServiceId(service.id)
      ? [
          {
            command: serviceIdToCommand(service.id),
            label: service.commandLabel,
            blurb: service.blurb,
          },
        ]
      : [],
  );
}

/** Welcome-tile subset — excludes v2-only commands like buyback. */
export function welcomeKioskServices(): KioskServiceTile[] {
  return KIOSK_SERVICES.filter((s) => s.status === 'live' && s.welcome);
}

/** Map COMMAND tile id → session command id (`sales` → `retail`). */
export function serviceIdToCommand(id: KioskCommandServiceId): KioskCommandId {
  if (id === 'sales') return 'retail';
  return id;
}

export function commandToServiceId(command: KioskCommandId): KioskCommandServiceId {
  if (command === 'retail') return 'sales';
  return command;
}
