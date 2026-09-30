/**
 * The repair cards' STATUS CHIPS — right of the count on the shared select
 * bar, counted in cards. Owner 2026-09-30: they read in the shop's words, one
 * chip per stage of a device's stay, each grouping the stored statuses that
 * mean it:
 * - Arriving — the box is on its way (`Incoming Shipment`);
 * - Still needs work — here, the repair is not finished (`Pending Repair`,
 *   `Awaiting Parts`, `Awaiting Additional Parts Payment`: waiting on parts or
 *   the parts money is still before the repair);
 * - Completed — repaired and still here, waiting on the customer
 *   (`Repaired, Contact Customer`, `Awaiting Payment`, `Awaiting Pickup`);
 * - Closed — the device left or the ticket ended (`Done`, `Shipped`,
 *   `Picked Up`, `Cancelled`); only painted when Status loads closed tickets.
 * Several OR together and narrow the loaded tickets client-side
 * (`useTriageCut`); the sidebar's Status (`?tab=`) still decides what is
 * loaded. Legacy free-text statuses nobody mapped share Other.
 */

import type { StatusChip } from '@/design-system/components/QueueStatusChips';

/** `?repairStatus=arriving,needs-work` — the lit chips (`/repair` and Sales › Repair service). */
export const REPAIR_STATUS_CHIP_PARAM = 'repairStatus';

const OTHER_KEY = 'other';

/** The stages, in the order a device moves through them. */
const REPAIR_STATUS_GROUPS = [
  { id: 'arriving', label: 'Arriving', tone: 'info', statuses: ['Incoming Shipment'] },
  { id: 'needs-work', label: 'Still needs work', tone: 'warning', statuses: ['Pending Repair', 'Awaiting Parts', 'Awaiting Additional Parts Payment'] },
  { id: 'completed', label: 'Completed', tone: 'success', statuses: ['Repaired, Contact Customer', 'Awaiting Payment', 'Awaiting Pickup'] },
  { id: 'closed', label: 'Closed', tone: 'neutral', statuses: ['Done', 'Shipped', 'Picked Up', 'Cancelled'] },
] as const satisfies readonly { id: string; label: string; tone: StatusChip<string>['tone']; statuses: readonly string[] }[];

const GROUP_OF_STATUS: Readonly<Record<string, string>> = Object.fromEntries(
  REPAIR_STATUS_GROUPS.flatMap((group) => group.statuses.map((status) => [status, group.id])),
);

/** Every chip key, in stage order, then Other. */
export const REPAIR_STATUS_CHIP_KEYS: readonly string[] = [...REPAIR_STATUS_GROUPS.map((group) => group.id), OTHER_KEY];

/** The chip a stored status counts under. */
export function repairStatusChipKey(status: string | null | undefined): string {
  return GROUP_OF_STATUS[(status || '').trim()] ?? OTHER_KEY;
}

/** One chip per stage present in `repairs`, in stage order, with its card count. */
export function repairStatusChips(repairs: readonly { status?: string | null }[]): StatusChip<string>[] {
  const counts = new Map<string, number>();
  for (const repair of repairs) {
    const key = repairStatusChipKey(repair.status);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const chips: StatusChip<string>[] = [];
  for (const group of REPAIR_STATUS_GROUPS) {
    const count = counts.get(group.id) ?? 0;
    if (count > 0) chips.push({ id: group.id, label: group.label, tone: group.tone, count });
  }
  const other = counts.get(OTHER_KEY) ?? 0;
  if (other > 0) chips.push({ id: OTHER_KEY, label: 'Other', tone: 'neutral', count: other });
  return chips;
}
