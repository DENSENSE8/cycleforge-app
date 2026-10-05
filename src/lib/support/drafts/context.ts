/**
 * What a Support draft is written FROM — pure and client-safe. The reader
 * (`context-read.ts`) fills it from the LOCAL store only; the prompt, the
 * validators and the eval all consume this one shape, so a fixture and a live
 * item are interchangeable.
 *
 * Every fact carries the citation that proves it. A claim in a draft that no
 * fact (or staff-written thread line) proves is a validator warning, never a
 * silent pass.
 */
import type {
  DeliveryState,
  ReplyDisposition,
  SupportChannel,
  SupportDraftCitation,
  SupportDraftKind,
  SupportItemKind,
  SupportMessageDirection,
  SupportOrderRef,
  SupportPurpose,
} from '@/lib/support/conversation/model';
import type { PhotoEvidence } from '@/lib/support/photo-evidence';

/** A completed action a reply might state. Each needs a source before a draft may say it happened. */
export type SupportClaimKind = 'refund' | 'shipped' | 'delivered' | 'replaced' | 'repaired' | 'warranty_approved';

export interface SupportDraftMessage {
  /** thread_messages.id */
  id: number;
  direction: SupportMessageDirection;
  body: string;
  /** ISO instant. */
  occurredAt: string;
  authorLabel: string | null;
  deliveryState: DeliveryState | null;
  replyDisposition: ReplyDisposition | null;
}

/** One grounded statement about a linked record, with its proof. */
export interface SupportDraftFact {
  citation: SupportDraftCitation;
  /** One line the model may rely on. */
  text: string;
  /** Completed actions this record proves (a Done repair proves `repaired`). */
  proves?: SupportClaimKind[];
}

export interface SupportDraftItemFacts {
  id: number;
  kind: SupportItemKind;
  channel: SupportChannel;
  purpose: SupportPurpose;
  subject: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
  requesterHandle: string | null;
  accountLabel: string | null;
  externalTicketId: string | null;
}

export interface SupportDraftContext {
  item: SupportDraftItemFacts;
  /** Warehouse civil day `YYYY-MM-DD` (America/Los_Angeles). */
  today: string;
  /** The canonical SUPPORT_TICKET thread, oldest first: inbound, outbound and internal. */
  messages: SupportDraftMessage[];
  /** Exact linked orders (orders.id), primary first. */
  orders: SupportOrderRef[];
  /** Repairs, receiving, serials, warranty, manuals, past replies, retrieved records. */
  facts: SupportDraftFact[];
  /** Deterministic photo facts (OCR, decoded identifiers, our-data matches). */
  photos: PhotoEvidence[];
}

/** The newest inbound customer message — the draft's source boundary. */
export function newestInboundMessage(messages: readonly SupportDraftMessage[]): SupportDraftMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].direction === 'inbound') return messages[i];
  }
  return null;
}

/**
 * The draft kind an item calls for right now: a proactive check-in only on a
 * post-purchase check-in item the customer has not written on yet; a reply
 * everywhere else.
 */
export function draftKindFor(itemKind: SupportItemKind, messages: readonly SupportDraftMessage[]): SupportDraftKind {
  return itemKind === 'post_purchase_check_in' && !newestInboundMessage(messages) ? 'check_in' : 'reply';
}

/** Order facts as prompt lines — same citation shape as every other fact. */
export function orderFacts(orders: readonly SupportOrderRef[]): SupportDraftFact[] {
  return orders.map((o) => {
    const products = o.products.map((p) => `${p.quantity > 1 ? `${p.quantity} × ` : ''}${p.title}${p.sku ? ` (SKU ${p.sku})` : ''}`);
    const f = o.fulfillment;
    const fulfillment = !f
      ? 'fulfillment unknown'
      : f.kind === 'pending'
        ? 'not shipped yet'
        : `${f.kind.replace('_', ' ')}${f.at ? ` ${f.at.slice(0, 10)}` : ''}${f.trackingNumber ? `, tracking ${f.trackingNumber}` : ''}`;
    const proves: SupportClaimKind[] = [];
    if (f && f.kind !== 'pending') proves.push('shipped');
    if (f && (f.kind === 'delivered' || f.kind === 'picked_up')) proves.push('delivered');
    const label = `Order ${o.orderNumber ?? `#${o.orderId}`}${o.platform ? ` (${o.platform})` : ''}`;
    return {
      citation: { type: 'order', label, ref: `orders:${o.orderId}` },
      text: `${label}${o.primary ? ' [primary]' : ''}: ${products.join('; ') || 'no line items'}; ${fulfillment}.`,
      proves,
    };
  });
}

/** Photo evidence as citations — one per decoded identifier, else one per photo. */
function photoCitations(photos: readonly PhotoEvidence[]): SupportDraftCitation[] {
  const out: SupportDraftCitation[] = [];
  for (const photo of photos) {
    if (photo.decoded.length === 0) {
      out.push({ type: 'photo', label: photo.caption?.trim() || `Photo ${photo.photoId}`, ref: `photos:${photo.photoId}` });
      continue;
    }
    for (const token of photo.decoded) {
      out.push({ type: 'photo', label: `OCR ${token.value}`, ref: `photos:${photo.photoId}` });
    }
  }
  return out;
}

/** Thread citations: the message being answered, plus the conversation as a whole. */
function threadCitations(messages: readonly SupportDraftMessage[]): SupportDraftCitation[] {
  const latest = newestInboundMessage(messages);
  const out: SupportDraftCitation[] = [];
  if (latest) out.push({ type: 'thread', label: 'Customer message', ref: `thread_messages:${latest.id}` });
  const earlier = messages.filter((m) => m.id !== latest?.id && m.direction !== 'internal');
  if (earlier.length) out.push({ type: 'thread', label: `Conversation (${earlier.length} earlier)`, ref: null });
  if (messages.some((m) => m.direction === 'internal')) out.push({ type: 'thread', label: 'Internal notes', ref: null });
  return out;
}

/** Every distinct citation, in a stable order: thread, orders, facts, photos. */
export function contextCitations(context: SupportDraftContext): SupportDraftCitation[] {
  const all = [
    ...threadCitations(context.messages),
    ...orderFacts(context.orders).map((f) => f.citation),
    ...context.facts.map((f) => f.citation),
    ...photoCitations(context.photos),
  ];
  const seen = new Set<string>();
  return all.filter((c) => {
    const key = `${c.type}|${c.label}|${c.ref ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
