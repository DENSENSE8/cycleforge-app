/**
 * Ticket-mode “what happened” fact picker — templates over linkage + timeline.
 * No `replacements` table; compose from order linkage stamps the operator can
 * already see.
 */

import type { OrderLinkage } from '@/lib/order-linkage';
import type { TimelineItem } from '@/lib/timeline/types';

type WhatHappenedFact = {
  id: string;
  label: string;
  /** Canonical sentence inserted into the draft (and Zendesk body on send). */
  sentence: string;
};

function formatWhen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function productFace(title: string | null | undefined, sku: string | null | undefined): string {
  const t = (title || '').trim();
  if (t) return t;
  const s = (sku || '').trim();
  return s || 'this product';
}

/**
 * Prefer a later outbound / warranty ship signal when the timeline names one;
 * otherwise offer packed / tested / received facts the operator can pick.
 */
export function buildWhatHappenedFacts(input: {
  productTitle?: string | null;
  productSku?: string | null;
  linkage: OrderLinkage | null | undefined;
  timeline: ReadonlyArray<TimelineItem>;
  receivedAt?: string | null;
  testedAt?: string | null;
  packedAt?: string | null;
}): WhatHappenedFact[] {
  const product = productFace(
    input.productTitle ?? input.linkage?.order?.productTitle,
    input.productSku ?? input.linkage?.order?.sku,
  );
  const facts: WhatHappenedFact[] = [];

  const shipEvent = input.timeline.find((ev) => {
    const label = `${ev.title ?? ''} ${ev.subtitle ?? ''}`.toLowerCase();
    return (
      label.includes('ship') ||
      label.includes('replacement') ||
      label.includes('reship') ||
      label.includes('warranty')
    );
  });
  const shipWhen = formatWhen(shipEvent?.at ?? null);
  if (shipEvent && shipWhen) {
    facts.push({
      id: 'replacement-ship',
      label: 'Replacement shipped',
      sentence: `Shipped a replacement for ${product} to this customer on ${shipWhen}.`,
    });
  }

  const packedWhen = formatWhen(input.packedAt);
  if (packedWhen) {
    facts.push({
      id: 'packed',
      label: 'Packed',
      sentence: `Packed ${product} on ${packedWhen}.`,
    });
  }

  const testedWhen = formatWhen(input.testedAt);
  if (testedWhen) {
    facts.push({
      id: 'tested',
      label: 'Tested',
      sentence: `Tested ${product} on ${testedWhen}.`,
    });
  }

  const receivedWhen = formatWhen(input.receivedAt);
  if (receivedWhen) {
    facts.push({
      id: 'received',
      label: 'Received',
      sentence: `Received ${product} on ${receivedWhen}.`,
    });
  }

  if (facts.length === 0) {
    facts.push({
      id: 'working',
      label: 'Working this carton',
      sentence: `Working ${product} on this carton now.`,
    });
  }

  return facts;
}
