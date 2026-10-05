/**
 * The repair desk's STATUS STAGES — the sidebar's Status stage facet on
 * `/repair` and Sales › Repair service (owner ruling 2026-10-04: status
 * picks are controls, never a chip rail in the list body). Owner 2026-09-30:
 * they read in the shop's words, one stage of a device's stay each, grouping
 * the stored statuses that mean it:
 * - Arriving — the box is on its way (`Incoming Shipment`);
 * - Still needs work — here, the repair is not finished (`Pending Repair`,
 *   `Awaiting Parts`, `Awaiting Additional Parts Payment`: waiting on parts or
 *   the parts money is still before the repair);
 * - Completed — repaired and still here, waiting on the customer
 *   (`Repaired, Contact Customer`, `Awaiting Payment`, `Awaiting Pickup`);
 * - Closed — the device left or the ticket ended (`Done`, `Shipped`,
 *   `Picked Up`, `Cancelled`); only present when Status loads closed tickets.
 * Several OR together and narrow the loaded tickets client-side
 * (`useTriageCut`); the sidebar's Status (`?tab=`) still decides what is
 * loaded. Legacy free-text statuses nobody mapped share Other. The counts are
 * `src/lib/nav/facets/repair.ts`.
 */

/** `?repairStatus=arriving,needs-work` — the picked stages (`/repair` and Sales › Repair service). */
export const REPAIR_STATUS_CHIP_PARAM = 'repairStatus';

/** The desk loads at most this many tickets (`useRepairsTable`; the API's page cap) — the counts read the same rows. */
export const REPAIR_DESK_LIST_LIMIT = 500;

const OTHER_KEY = 'other';

/** The stages, in the order a device moves through them. */
const REPAIR_STATUS_GROUPS = [
  { id: 'arriving', label: 'Arriving', statuses: ['Incoming Shipment'] },
  { id: 'needs-work', label: 'Still needs work', statuses: ['Pending Repair', 'Awaiting Parts', 'Awaiting Additional Parts Payment'] },
  { id: 'completed', label: 'Completed', statuses: ['Repaired, Contact Customer', 'Awaiting Payment', 'Awaiting Pickup'] },
  { id: 'closed', label: 'Closed', statuses: ['Done', 'Shipped', 'Picked Up', 'Cancelled'] },
] as const satisfies readonly { id: string; label: string; statuses: readonly string[] }[];

const GROUP_OF_STATUS: Readonly<Record<string, string>> = Object.fromEntries(
  REPAIR_STATUS_GROUPS.flatMap((group) => group.statuses.map((status) => [status, group.id])),
);

/** Every stage, in stage order, then Other — the facet's options. */
export const REPAIR_STATUS_CHIP_OPTIONS: readonly { value: string; label: string }[] = [
  ...REPAIR_STATUS_GROUPS.map((group) => ({ value: group.id, label: group.label })),
  { value: OTHER_KEY, label: 'Other' },
];

/** Every stage key, in stage order, then Other. */
export const REPAIR_STATUS_CHIP_KEYS: readonly string[] = REPAIR_STATUS_CHIP_OPTIONS.map((option) => option.value);

/** The stage a stored status counts under. */
export function repairStatusChipKey(status: string | null | undefined): string {
  return GROUP_OF_STATUS[(status || '').trim()] ?? OTHER_KEY;
}
