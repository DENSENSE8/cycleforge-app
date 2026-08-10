'use client';

/**
 * The desk's ONE data-in CTA (Band 1 trailing).
 *
 * Import and Add used to be two solid pills side by side — a blue popover
 * trigger and a green button — which spent the band's whole trailing budget on
 * two spellings of "get orders into this queue". They are now one quiet `+`
 * whose panel carries **Import** (a CSV file, then channel sync) and **Add**
 * (one order typed by hand), with Backfill where it already was.
 *
 * One cube on purpose: getting data in is an occasional act, so it sits as a
 * peer of the band's other cells rather than as a solid fill competing with the
 * lifecycle tabs — and the verbs are named in WORDS as tabs inside the panel,
 * never as a row of separated glyphs (`AGENTS.md` → Band-1 same-topic controls
 * are tabs).
 *
 * Golden source: Labels station header; reused by Dashboard · Outbound,
 * `/test` Shipping, and `/pack`.
 */

import { OrdersSyncPopover } from '@/components/unshipped/OrdersSyncPopover';

export function OutboundOrderChromeActions({ onNewOrder }: { onNewOrder: () => void }) {
  return <OrdersSyncPopover onNewOrder={onNewOrder} />;
}
