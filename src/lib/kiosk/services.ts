/**
 * Front-desk service SoT — the `/kiosk/v2` command menu.
 *
 * Two KINDS live here, and the difference is load-bearing:
 *
 * - `kind: 'command'` — the center work surfaces. These map 1:1 onto
 *   `KioskCommandId`, which is also a subset of the CHECK vocabulary on
 *   `counter_sessions.active_command`, so a command tile is a session state.
 * - `kind: 'staff'` — a tool the counter STAFF opens on top of whatever
 *   command is running (History, Custom amount). It sets no `active_command`
 *   and survives being closed: the session underneath is untouched. It is
 *   therefore NOT a command id and must never reach `serviceIdToCommand`,
 *   which is why the parameter of that function is the narrow
 *   {@link KioskCommandServiceId} — a staff tile cannot be passed to it
 *   without the compiler saying so.
 *
 * Buyback and Pickup were deleted 2026-09-23 — see `commands.ts`.
 */

import { History, ReceivingModeRepair, Receipt, SalesPrice } from '@/components/Icons';
import type { KioskCommandId } from './commands';

/** The commerce commands — every one of them a `KioskCommandId`. */
export type KioskCommandServiceId = 'sales' | 'repair';
/** Staff tools that ride ON TOP of a command; they own no session state. */
export type KioskStaffServiceId = 'history' | 'custom-amount';
export type KioskServiceId = KioskCommandServiceId | KioskStaffServiceId;

type KioskServiceIcon = (props: { className?: string }) => JSX.Element;

export interface KioskServiceTile {
  id: KioskServiceId;
  /** `command` swaps the work surface; `staff` opens a tool over it. */
  kind: 'command' | 'staff';
  blurb: string;
  /** Only `live` services render as actionable; `wip` stay in the SoT for reuse. */
  status: 'live' | 'wip';
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
  /**
   * THE name of this command — the one word the mode menu, the Settings
   * picker and every other surface print. Sales is "Sales" everywhere
   * (operator 2026-09-23); it used to be `Buy / Sell` on the tile, `Retail`
   * here and a hard-coded `Sales` override in the menu — three names for one
   * mode. The tile's separate `label` (the retired welcome-screen caption)
   * went with it.
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
    // Square's Keypad (Square's own word). A tool over the running command,
    // not a product: it adds a line to the ONE cart (a sale in Sales, a
    // typed-in device in Repair), so it lives in this menu rather than as a
    // tile in the catalog (operator 2026-09-24).
    commandLabel: 'Keypad',
    blurb: 'Ring up an amount the catalog does not carry',
    status: 'live',
    icon: Receipt,
    iconTone: 'text-text-success',
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
export function liveKioskCommandServices(): KioskServiceTile[] {
  return KIOSK_SERVICES.filter((s) => s.status === 'live' && s.kind === 'command');
}

/** Narrow a tile id to the command half, so `serviceIdToCommand` stays total. */
export function isKioskCommandServiceId(id: KioskServiceId): id is KioskCommandServiceId {
  return id === 'sales' || id === 'repair';
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

/** Map COMMAND tile id → session command id (`sales` → `retail`). */
export function serviceIdToCommand(id: KioskCommandServiceId): KioskCommandId {
  if (id === 'sales') return 'retail';
  return id;
}

export function commandToServiceId(command: KioskCommandId): KioskCommandServiceId {
  if (command === 'retail') return 'sales';
  return command;
}
