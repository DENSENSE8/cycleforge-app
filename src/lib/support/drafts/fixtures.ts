/**
 * Draft-context builders shared by the unit tests and the support-draft eval
 * (`scripts/ai-eval/support-drafts.ts`). Pure data — no DB, no network.
 */
import type { SupportOrderRef } from '@/lib/support/conversation/model';
import type { SupportDraftContext, SupportDraftFact, SupportDraftItemFacts, SupportDraftMessage } from './context';

let nextMessageId = 1000;

export function draftMessage(over: Partial<SupportDraftMessage> & Pick<SupportDraftMessage, 'direction' | 'body'>): SupportDraftMessage {
  nextMessageId += 1;
  return {
    id: nextMessageId,
    occurredAt: '2026-10-02T17:00:00.000Z',
    authorLabel: null,
    deliveryState: over.direction === 'outbound' ? 'sent' : null,
    replyDisposition: over.direction === 'inbound' ? 'pending' : null,
    ...over,
  };
}

export function draftOrder(over: Partial<SupportOrderRef> = {}): SupportOrderRef {
  return {
    orderId: 501,
    orderNumber: '12-34567-89012',
    platform: 'ebay',
    accountLabel: null,
    primary: true,
    externalReference: null,
    customerName: 'Dana Ortiz',
    customerEmail: null,
    products: [{ orderLineId: 501, sku: 'AMP-200', title: 'Studio Amplifier 200', quantity: 1 }],
    fulfillment: { kind: 'pending', at: null, trackingNumber: null },
    ...over,
  };
}

export function draftFact(over: Partial<SupportDraftFact> & Pick<SupportDraftFact, 'text'>): SupportDraftFact {
  return { citation: { type: 'repair', label: 'Repair RS-1', ref: 'repair_service:1' }, ...over };
}

/** A customer conversation on eBay, today Sunday 2026-10-04, with one pending question. */
export function draftContext(
  over: Omit<Partial<SupportDraftContext>, 'item'> & { item?: Partial<SupportDraftItemFacts> } = {},
): SupportDraftContext {
  const { item, ...rest } = over;
  return {
    item: {
      id: 77,
      kind: 'conversation',
      channel: 'ebay',
      purpose: 'customer_conversation',
      subject: 'Amplifier order',
      requesterName: 'Dana Ortiz',
      requesterEmail: null,
      requesterHandle: 'dana_o',
      accountLabel: 'usav-main',
      externalTicketId: null,
      ...item,
    },
    today: '2026-10-04',
    messages: [draftMessage({ direction: 'inbound', body: 'Hi, when will my amplifier ship?' })],
    orders: [draftOrder()],
    facts: [],
    photos: [],
    ...rest,
  };
}
