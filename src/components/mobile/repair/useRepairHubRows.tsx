'use client';

import type { DetailNavItem } from '@/components/mobile/detail/DetailParts';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import { detailDoor } from '@/lib/mobile/detail-door';
import { resolveRepairContact } from '@/lib/repair/contact-info';
import { customerUpdateDraft } from '@/lib/repair/customer-update-drafts';
import { repairStatusOperatorLabel } from '@/lib/repair-status';
import { ClipboardList, Images, MessageSquare, Printer, Wrench } from '@/components/Icons';
import { ticketBlockedReason, ticketThreadHref, useRepairTicketLink } from './useRepairWorkbench';
import { useRepairBenchRow } from './useRepairBenchSession';
import { useRepairPaperworkRow } from './useRepairPaperwork';
import { useRepairPhotosRow } from './useRepairPhotos';

/**
 * The hub's door registry. A new contextual screen plugs in by adding its row
 * here (its summary hook + one entry) — the hub layout never changes. Each
 * slice's hook is called unconditionally so the hook order is fixed.
 */
export function useRepairHubRows(repairId: number, repair: RSRecord | null): DetailNavItem[] {
  const photos = useRepairPhotosRow(repairId);
  const bench = useRepairBenchRow(repairId);
  const { link, error: linkError } = useRepairTicketLink(repairId);
  const paperwork = useRepairPaperworkRow(repairId);

  const contact = repair ? resolveRepairContact(repair) : null;
  const draft = repair
    ? customerUpdateDraft(repair.status ?? null, {
        firstName: (contact?.name ?? '').trim().split(/\s+/)[0] ?? '',
        device: repair.product_title ?? '',
        rsCode: `RS-${repairId}`,
      })
    : '';
  const ticketMeta = linkError
    ? `Could not check the ticket link — ${linkError}`
    : !link
      ? 'Checking the ticket link…'
      : link.state === 'linked'
        ? draft
          ? `Zendesk #${link.zendeskTicketId} · opens with a "${repairStatusOperatorLabel(repair?.status ?? '')}" draft`
          : `Zendesk #${link.zendeskTicketId}`
        : (ticketBlockedReason(link) ?? '');

  const base = `/m/rs/${repairId}`;

  return [
    detailDoor(base, 'photos', 'Photos', <Images />, photos),
    detailDoor(base, 'work', 'Bench log', <Wrench />, bench),
    { id: 'ticket', title: 'Ticket', icon: <MessageSquare />, href: ticketThreadHref(link, draft || undefined), meta: ticketMeta },
    detailDoor(base, 'paperwork', 'Paperwork', <Printer />, paperwork),
    detailDoor(base, 'record', 'Record', <ClipboardList />, { meta: 'Identifiers, state history, pickup audit' }),
  ];
}
