/** Front-desk service SoT — the `/kiosk/v2` command menu. */

import {
  History,
  ReceivingModePickup,
  ReceivingModeRepair,
  Receipt,
  SalesPrice,
} from '@/components/Icons';
import type { KioskCommandId } from './commands';

/** The commerce commands — every one of them a `KioskCommandId`. */
export type KioskCommandServiceId = 'sales' | 'repair';
/** Staff tools that ride ON TOP of a command; they own no session state. */
export type KioskStaffServiceId = 'history' | 'custom-amount' | 'local-pickup';
export type KioskServiceId = KioskCommandServiceId | KioskStaffServiceId;

type KioskServiceIcon = (props: { className?: string }) => JSX.Element;

interface KioskServiceTile {
  id: KioskServiceId;
  /** `command` swaps the work surface; `staff` opens a tool over it. */
  kind: 'command' | 'staff';
  blurb: string;
  /** Only `live` services render as actionable; `wip` stay in the SoT for reuse. */
  status: 'live' | 'wip';
  icon: KioskServiceIcon;
  /**
   * Command ink — ONE semantic text token per command, so the glyph reads as that command everywhere it mounts (dropdown trigger, dropdown…
   * Operator 2026-09-14: "repair orange and sales green and more colors for
   */
  iconTone: string;
  /**
   * THE name of this command — the one word the mode menu, the Settings picker and every other surface print.
   * (operator 2026-09-23); it used to be `Buy / Sell` on the tile, `Retail`
   */
  commandLabel: string;
}

export const KIOSK_SERVICES: ReadonlyArray<KioskServiceTile> = [
  {
    id: 'repair',
    kind: 'command',
    commandLabel: 'Repair',
    blurb: 'Check in a device for service',
    status: 'live',
    icon: ReceivingModeRepair,
    // Orange/amber. Same ink `StatCard` already gives the repair lane.
    iconTone: 'text-text-warning',
  },
  {
    id: 'sales',
    kind: 'command',
    commandLabel: 'Sales',
    blurb: 'Start a counter sale',
    status: 'live',
    icon: SalesPrice,
    // Green — money in.
    iconTone: 'text-text-success',
  },
  {
    id: 'custom-amount',
    kind: 'staff',
    // Square's Keypad (Square's own word).
    // tile in the catalog (operator 2026-09-24).
    commandLabel: 'Keypad',
    blurb: 'Ring up an amount the catalog does not carry',
    status: 'live',
    icon: Receipt,
    iconTone: 'text-text-success',
  },
  {
    id: 'local-pickup',
    kind: 'staff',
    commandLabel: 'Local pickup intake',
    blurb: 'Add a vendor pickup to Receiving and Sales',
    status: 'live',
    icon: ReceivingModePickup,
    iconTone: 'text-text-info',
  },
  {
    id: 'history',
    kind: 'staff',
    commandLabel: 'History',
    blurb: 'Find a past visit and reprint its paperwork',
    status: 'live',
    // Never on a customer face: History is the staff book
    // (kiosk-pos-modernization-HANDOFF Phase 4 — "do not expose History on the
    // attract/open customer face without PIN").
    icon: History,
    // Quiet ink. The commerce commands own the saturated colours; a staff
    // tool that borrowed one would read as another way to take money.
    iconTone: 'text-text-soft',
  },
];

/** The live tiles that swap the work surface — staff tools excluded. */
function liveKioskCommandServices(): KioskServiceTile[] {
  return KIOSK_SERVICES.filter((s) => s.status === 'live' && s.kind === 'command');
}

/** Narrow a tile id to the command half, so `serviceIdToCommand` stays total. */
export function isKioskCommandServiceId(id: KioskServiceId): id is KioskCommandServiceId {
  return id === 'sales' || id === 'repair';
}

/** Live commands as CHOOSER options — the org's default-command select in Settings, sourced from this tile SoT so the words on the picker… */
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

/** Map COMMAND tile id → session command id (`sales` → `retail`). */
export function serviceIdToCommand(id: KioskCommandServiceId): KioskCommandId {
  if (id === 'sales') return 'retail';
  return id;
}

export function commandToServiceId(command: KioskCommandId): KioskCommandServiceId {
  if (command === 'retail') return 'sales';
  return command;
}
