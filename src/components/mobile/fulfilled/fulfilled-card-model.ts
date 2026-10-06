/**
 * Fulfilled's PHONE card model (operator 2026-10-05, post-ship journey): one
 * order-grain entry of `GET /api/nav/fulfilled` → the {@link RecordCardMobile}
 * model, its urgency band, its clock face and where a tap opens. Pure, so the
 * section split, the worst-first order and the tap rule are unit-tested.
 */

import type { RecordCardMobileModel, RecordDeadlineTone } from '@/design-system/components/record-card/record-card-types';
import type { NavLocateEntry } from '@/lib/nav/context/schema';
import { compareJourneyUrgency, journeyClockFace, type JourneyClockFace, type JourneyClockTone } from '@/lib/nav/fulfilled/journey-clock';
import {
  FULFILLED_BUCKETS,
  FULFILLED_BUCKET_SECTION,
  FULFILLED_SECTIONS,
  type FulfilledBucketId,
  type FulfilledSectionId,
} from '@/lib/nav/locate/bucket-precedence';
import { formatOrderIdDisplay } from '@/lib/copy-chip-format';

/** Stages the customer half owns — a tap opens the check-in conversation when it has one. */
const CHECK_IN_STAGES: Readonly<Partial<Record<FulfilledBucketId, true>>> = {
  check_in_due: true,
  check_in_scheduled: true,
  checked_in: true,
  reply_due: true,
  happy: true,
  issue: true,
  no_reply: true,
  closed: true,
};

/** The clock's tone painted with the card's existing deadline tones. */
const CLOCK_TONE: Readonly<Record<JourneyClockTone, RecordDeadlineTone>> = {
  over: 'late',
  near: 'today',
  calm: 'later',
  none: 'none',
};

const BUCKET_LABEL = Object.fromEntries(FULFILLED_BUCKETS.map((b) => [b.id, b.label])) as Record<FulfilledBucketId, string>;

function isFulfilledBucket(id: string | undefined): id is FulfilledBucketId {
  return id !== undefined && id in FULFILLED_BUCKET_SECTION;
}

/** Where tapping the card goes, or null when the order names nothing to open. */
export function fulfilledMobileHref(entry: NavLocateEntry): string | null {
  const bucket = entry.buckets[0];
  const facts = entry.facts;
  const shipment = facts?.shipmentId ? `/m/shipping/shipments/${facts.shipmentId}` : null;
  if (isFulfilledBucket(bucket) && CHECK_IN_STAGES[bucket] && facts?.checkIn?.supportItemId) {
    return `/m/t/${facts.checkIn.supportItemId}`;
  }
  return shipment;
}

export interface FulfilledMobileCard {
  key: string;
  bucket: FulfilledBucketId;
  face: JourneyClockFace | null;
  href: string | null;
  model: RecordCardMobileModel;
}

export function fulfilledMobileCard(entry: NavLocateEntry, index: number, nowMs: number): FulfilledMobileCard | null {
  const bucket = entry.buckets[0];
  if (!isFulfilledBucket(bucket)) return null;
  const facts = entry.facts;
  const face = journeyClockFace(facts?.clock ?? null, nowMs);
  const label = BUCKET_LABEL[bucket];
  const clock = face ? (face.limit ? `${face.age} / ${face.limit}` : face.age) : null;
  const order = formatOrderIdDisplay(entry.ref);
  const title = [facts?.customer ?? facts?.title, facts?.carrier].filter((part): part is string => Boolean(part)).join(' · ') || 'Order';
  const key = entry.key ?? entry.ref;
  return {
    key,
    bucket,
    face,
    href: fulfilledMobileHref(entry),
    model: {
      key,
      leadId: index,
      channel: null,
      deadline: { face: clock ? `${label} · ${clock}` : label, tone: CLOCK_TONE[face?.tone ?? 'none'], tip: entry.detail },
      lines: [{ id: index, title, photoUrl: null, facts: {}, alert: false, alertNote: null }],
      aria: { card: `Order ${entry.ref}: ${label}`, open: `Open order ${entry.ref}` },
      ref: order || null,
    },
  };
}

export interface FulfilledMobileSection {
  id: FulfilledSectionId;
  label: string;
  cards: FulfilledMobileCard[];
}

/** Every section in {@link FULFILLED_SECTIONS} order (empty ones kept, so counts read 0), cards worst first. */
export function fulfilledMobileSections(entries: readonly NavLocateEntry[], nowMs: number): FulfilledMobileSection[] {
  const sections = FULFILLED_SECTIONS.map((s): FulfilledMobileSection => ({ id: s.id, label: s.label, cards: [] }));
  entries.forEach((entry, index) => {
    const card = fulfilledMobileCard(entry, index, nowMs);
    if (card) sections.find((s) => s.id === FULFILLED_BUCKET_SECTION[card.bucket])?.cards.push(card);
  });
  for (const section of sections) section.cards.sort((a, b) => compareJourneyUrgency(a.face, b.face));
  return sections;
}
