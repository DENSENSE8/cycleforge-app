'use client';

/**
 * `/m/support?item=<id>` — one Support item as a full phone screen with an X
 * back to the list it was opened from (SURFACE_LAW §7: a record is a screen,
 * never a sheet). Read from the LOCAL bundle (`useSupportItem`): the subject in
 * full, the local status, purpose and work flags; the facts (Support #, the
 * provider number as metadata, platform / account, order, customer through the
 * contact face — never a raw relay address — owners, next follow-up); then the
 * whole thread with each message's reply disposition / delivery state.
 *
 * Two dock verbs, both local writes that never reach a customer: Add note
 * (internal) and Log message (a customer message received elsewhere — not on
 * an internal record, which has no customer). No Send / Copy & open here.
 */

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Lock, MessageSquare } from '@/components/Icons';
import { DetailFact, DetailFacts, DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { SupportChip } from '@/components/ui/SupportChip';
import { DetailDock, type DetailDockVerb } from '@/design-system/components/DetailDock';
import { DetailRecordFrame } from '@/design-system/components/DetailHubScreen';
import { TicketStatusPill } from '@/design-system/components/TicketStatusPill';
import { mobileJobReturn } from '@/lib/mobile/nav-trail';
import { supportMobileHref } from '@/lib/nav/route-tree';
import { scrubRelayAddresses, supportContactFace } from '@/lib/support/contact-face';
import {
  SUPPORT_CHANNEL_LABEL,
  supportLocalStatus,
  type SupportItemBundle,
  type SupportPurpose,
} from '@/lib/support/conversation/model';
import { supportHeaderFlags } from '@/lib/support/record/support-record-model';
import { useSupportItem } from '@/lib/support/record/use-support-item';
import { formatMonthDayTimePST } from '@/utils/date';
import { MobileSupportMessageSheet, type MobileSupportWrite } from './MobileSupportMessageSheet';
import { MobileSupportThread } from './MobileSupportThread';

const PURPOSE_LINE: Readonly<Record<SupportPurpose, string>> = {
  customer_conversation: 'Customer conversation',
  internal_record: 'Internal record',
  unclassified: 'Not yet marked as a customer conversation or an internal record',
};

function SupportRecordBody({ bundle, onWrite }: { bundle: SupportItemBundle; onWrite: (write: MobileSupportWrite) => void }) {
  const { item, messages } = bundle;
  const status = supportLocalStatus(
    {
      purpose: item.purpose,
      lifecycle: item.lifecycle,
      pendingInboundCount: item.pendingInboundCount,
      lastOutboundAt: item.lastOutboundAt,
      resolvedAt: item.resolution?.resolvedAt ?? null,
    },
    Date.now(),
  );
  const contact = supportContactFace(item.requester);
  const order = item.primaryOrder;
  const owners = item.task?.assignees ?? [];
  // Like the desk: a customer may be in it unless it is an internal record (unclassified included).
  const customer = item.purpose !== 'internal_record';
  const verbs: DetailDockVerb<MobileSupportWrite>[] = [
    { id: 'note', label: 'Add note', icon: <Lock />, primary: !customer, testId: 'mobile-support-add-note' },
    ...(customer
      ? [{ id: 'customer' as const, label: 'Log message', icon: <MessageSquare />, primary: true, testId: 'mobile-support-log-customer-message' }]
      : []),
  ];

  return (
    <>
      <div className="flex flex-1 flex-col divide-y divide-mode-rule" data-testid="mobile-support-record" data-item={item.id}>
        <section aria-label="Support item" className="flex flex-col items-start gap-2 bg-mode-panel px-mode-page py-3">
          <p className="break-words text-mode-body font-semibold text-mode-ink" data-testid="mobile-support-subject">
            {item.subject?.trim() ? scrubRelayAddresses(item.subject.trim()) : 'No subject yet'}
          </p>
          <span className="flex flex-wrap items-center gap-1.5">
            {/* The helpdesk status hues are the local statuses' faces; On-hold is the vocabulary's `hold`. */}
            <TicketStatusPill status={status === 'on_hold' ? 'hold' : status} size="md" />
            {supportHeaderFlags(item.flags).map((flag) => (
              <SupportChip key={flag.flag} tone={flag.tone} label={flag.label} testId={`mobile-support-flag-${flag.flag}`} />
            ))}
          </span>
        </section>

        <DetailFacts label="Support item facts">
          <DetailFact label="Support #" value={String(item.id)} mono copy={String(item.id)} />
          {item.externalTicketId ? (
            <DetailFact
              label="Provider #"
              value={`${SUPPORT_CHANNEL_LABEL[item.channel]} #${item.externalTicketId}`}
              mono
              copy={item.externalTicketId}
            />
          ) : null}
          <DetailFact label="Purpose" value={PURPOSE_LINE[item.purpose]} />
          <DetailFact
            label="Platform"
            value={order?.platform ?? item.accountLabel}
            hint={order?.platform ? item.accountLabel : null}
          />
          <DetailFact
            label="Order"
            value={order ? (order.orderNumber ? `#${order.orderNumber}` : `Order ${order.orderId}`) : null}
            mono
            copy={order?.orderNumber ?? null}
          />
          {customer ? <DetailFact label="Customer" value={contact.label} hint={contact.detail} copy={contact.email} /> : null}
          <DetailFact label="Owners" value={owners.length > 0 ? owners.map((owner) => owner.name).join(', ') : 'Unassigned'} />
          {item.task?.nextFollowUpAt ? (
            <DetailFact label="Follow up" value={formatMonthDayTimePST(item.task.nextFollowUpAt)} />
          ) : null}
        </DetailFacts>

        <section aria-labelledby="mobile-support-conversation">
          <DetailSectionHeading id="mobile-support-conversation">Conversation</DetailSectionHeading>
          <MobileSupportThread item={item} messages={messages} />
        </section>
      </div>
      <DetailDock label="Support item actions" verbs={verbs} onVerb={onWrite} />
    </>
  );
}

export function MobileSupportRecord({ supportItemId }: { supportItemId: number }) {
  const searchParams = useSearchParams();
  const back =
    mobileJobReturn(searchParams?.get('back')) ??
    supportMobileHref({ status: searchParams?.get('status'), q: searchParams?.get('q') });
  const bundle = useSupportItem(supportItemId);
  const [write, setWrite] = useState<MobileSupportWrite | null>(null);

  return (
    <>
      <DetailRecordFrame
        record={bundle.data}
        state={{
          loading: bundle.isPending,
          error: bundle.isError ? bundle.error.message || 'Could not load this Support item.' : null,
          onRetry: () => void bundle.refetch(),
          missing: 'This Support item no longer exists.',
        }}
        bar={{ title: `Support #${supportItemId}`, subtitle: 'Support', backHref: back, close: true }}
      >
        {(live) => <SupportRecordBody bundle={live} onWrite={setWrite} />}
      </DetailRecordFrame>
      <MobileSupportMessageSheet supportItemId={supportItemId} write={write} onClose={() => setWrite(null)} />
    </>
  );
}
