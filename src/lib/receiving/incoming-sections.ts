/**
 * Inbound › On the way under the default sort, cut by URGENCY — the receiving
 * twin of To-ship's ship-by sections: the top of the list is always the next
 * thing to walk to.
 *
 *   Delivered · not scanned → Arriving today → In transit → Awaiting tracking → Other
 *
 * A purchase sits in the most urgent section ANY of its lines reaches (one
 * delivered box makes the purchase a walk to the dock). The server orders the
 * pages by the same ladder (`sort=urgency`), so page 1 starts where the dock does.
 */

import type { RowGroup } from '@/lib/group-rows';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

export const INCOMING_SECTIONS = ['delivered', 'today', 'transit', 'awaiting', 'other'] as const;
export type IncomingSection = (typeof INCOMING_SECTIONS)[number];

export const INCOMING_SECTION_LABELS: Readonly<Record<IncomingSection, string>> = {
  delivered: 'Delivered · not scanned',
  today: 'Arriving today',
  transit: 'In transit',
  awaiting: 'Awaiting tracking',
  other: 'Other',
};

/** The `?sort=` the Incoming lane asks the server for when the operator picked none. */
export const INCOMING_URGENCY_SORT = 'urgency';

const SECTION_OF_STATE: Readonly<Partial<Record<NonNullable<ReceivingLineRow['delivery_state']>, IncomingSection>>> = {
  DELIVERED_UNOPENED: 'delivered',
  ARRIVING_TODAY: 'today',
  IN_TRANSIT: 'transit',
  AWAITING_TRACKING: 'awaiting',
};

const RANK: Readonly<Record<IncomingSection, number>> = { delivered: 0, today: 1, transit: 2, awaiting: 3, other: 4 };

export function isIncomingSection(value: string): value is IncomingSection {
  return (INCOMING_SECTIONS as readonly string[]).includes(value);
}

/** A purchase's section: the most urgent any of its lines reaches. */
export function incomingSectionOf(rows: readonly Pick<ReceivingLineRow, 'delivery_state'>[]): IncomingSection {
  let best: IncomingSection = 'other';
  for (const row of rows) {
    const section = (row.delivery_state && SECTION_OF_STATE[row.delivery_state]) || 'other';
    if (RANK[section] < RANK[best]) best = section;
  }
  return best;
}

/**
 * Purchases → their sections, in ladder order, empty sections dropped. Order
 * inside a section is the input's. The band key IS the section id, so the
 * cursor and both faces read one `[band, groups][]` order.
 */
export function cutIncomingSections<T extends Pick<ReceivingLineRow, 'delivery_state'>>(
  groups: readonly RowGroup<T>[],
): [IncomingSection, RowGroup<T>[]][] {
  const bySection = new Map<IncomingSection, RowGroup<T>[]>();
  for (const group of groups) {
    const section = incomingSectionOf(group.rows);
    const bucket = bySection.get(section);
    if (bucket) bucket.push(group);
    else bySection.set(section, [group]);
  }
  return INCOMING_SECTIONS.filter((section) => bySection.has(section)).map((section) => [section, bySection.get(section)!]);
}
