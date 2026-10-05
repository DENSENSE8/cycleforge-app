/**
 * How /support says a Support item: its local status's ink (the status chips
 * and the record's status verb), its title, and the URL params the desk reads.
 */

import type { StateName } from '@/design-system/tokens/lifecycle';
import { scrubRelayAddresses } from '@/lib/support/contact-face';
import type { SupportLocalStatus } from '@/lib/support/conversation/model';

/** `?item=<support_tickets.id>` — the open record. */
export const SUPPORT_RECORD_PARAM = 'item';
/** `?status=a,b` — the status chips (local statuses, canonical order); the server cuts by the same param. */
export const SUPPORT_STATUS_PARAM = 'status';

/** The local status's ink — the chips and the status verb say it the same way. */
export const SUPPORT_LOCAL_STATUS_TONE: Readonly<Record<SupportLocalStatus, StateName>> = {
  new: 'info',
  open: 'warning',
  pending: 'neutral',
  on_hold: 'neutral',
  solved: 'success',
  closed: 'neutral',
};

/** The subject as a surface prints it (relay addresses read as their label); the local number when there is none. Never "Ticket". */
export function supportItemTitle(item: { itemId: number; subject: string | null }): string {
  const subject = item.subject?.trim();
  return subject ? scrubRelayAddresses(subject) : `Support #${item.itemId}`;
}
