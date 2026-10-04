/**
 * The Live feed BOARD's pure faces: which section a lane sits under, its tone
 * bar, its header's meta row, the late split of its rows, and a row's
 * age / time. One place, so the lane, the ticket and the phone switcher read
 * one truth.
 */

import { useEffect, useState } from 'react';
import { triageRowKeyId } from '@/design-system/components/triage-card-list/triage-row-id';
import { liveFeedCarrierLabel, type LiveFeedStatusKind } from '@/lib/live-feed/statuses';
import type { LiveFeedBoardColumn, LiveFeedItem } from '@/lib/live-feed/types';
import { marketplaceThumbUrl } from '@/lib/photos/marketplace-thumb-url';
import { formatLaneAgeCompact, formatStageClockTimePST } from '@/utils/date';

/** An item key is unique within its status; rows speak numbers (a deterministic hash — rows render on the server too). */
export const liveFeedRowId = (item: LiveFeedItem): number => triageRowKeyId(`${item.statusId}:${item.key}`);

/** The row's product: the lead line's title and thumb; a record with no line reads as its reason, customer or carrier package. */
export function liveFeedProduct(item: LiveFeedItem): { title: string; photoUrl: string | null } {
  const fallback =
    item.channel === 'in_person' ? (item.customer ?? item.ref ?? 'In-person record') : `${liveFeedCarrierLabel(item.carrier)} package`;
  return { title: item.line?.title || item.reason || fallback, photoUrl: marketplaceThumbUrl(item.line?.photoUrl ?? null) };
}

/** The board's two sections (operator 2026-10-03): open lanes are the work, done lanes the output. */
export const LIVE_FEED_SECTION_LABEL: { readonly [kind in LiveFeedStatusKind]: string } = {
  open: 'Work now',
  done: 'Done',
};

/** Late = marked late or aging (the board's `lateCount`). */
export function isLiveFeedLate(item: LiveFeedItem): boolean {
  return item.urgency === 'late' || item.urgency === 'aging';
}

/** A lane's rows, late pinned first (the server already orders them late-first; this only splits). */
export function splitLateItems(items: readonly LiveFeedItem[]): { late: LiveFeedItem[]; rest: LiveFeedItem[] } {
  const late: LiveFeedItem[] = [];
  const rest: LiveFeedItem[] = [];
  for (const item of items) (isLiveFeedLate(item) ? late : rest).push(item);
  return { late, rest };
}

/**
 * The 3px tone bar: an open lane with late rows is danger (any `late`) or
 * warning (aging only); open with nothing late is info; a done lane is
 * success, neutral when empty.
 */
export function liveFeedLaneAccent(column: LiveFeedBoardColumn): string {
  if (column.status.kind === 'done') return column.count > 0 ? 'bg-fill-success' : 'bg-mode-edge';
  if (column.lateCount > 0) return column.items.some((item) => item.urgency === 'late') ? 'bg-fill-danger' : 'bg-fill-warning';
  return 'bg-fill-info';
}

/**
 * The header's second row. Open lanes: `3 late · oldest 2d`. Done lanes: the
 * top groups as inline facts (`USPS 17 · UPS 6 · FedEx 5`), then `+n`.
 * `now` is null until the client mounts — ages are never painted on the server.
 */
export function liveFeedLaneMeta(column: LiveFeedBoardColumn, now: number | null): string {
  if (column.status.kind === 'open') {
    const parts: string[] = [];
    if (column.lateCount > 0) parts.push(`${column.lateCount} late`);
    const age = column.oldestAt && now != null ? formatLaneAgeCompact(column.oldestAt, now) : null;
    if (age) parts.push(`oldest ${age}`);
    if (parts.length > 0) return parts.join(' · ');
    return column.count > 0 ? 'None late' : '';
  }
  const facts = column.groups.map((group) => `${group.label} ${group.count}`).join(' · ');
  return column.groupsMore > 0 ? `${facts} +${column.groupsMore}` : facts;
}

/** A done lane against the previous equal-length period: `▲ 4 vs prev`, `▼ 2 vs prev`, `= prev`; null with no comparison. */
export function liveFeedLaneDelta(column: LiveFeedBoardColumn): string | null {
  if (column.status.kind !== 'done' || column.previousCount == null) return null;
  const delta = column.count - column.previousCount;
  if (delta === 0) return '= prev';
  return `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)} vs prev`;
}

/** A row's first fact: how long it has sat (open) or when it happened (done). */
export function liveFeedTicketWhen(item: LiveFeedItem, kind: LiveFeedStatusKind, now: number | null): string {
  if (!item.at) return '—';
  if (kind === 'done') return formatStageClockTimePST(item.at);
  return now == null ? '' : (formatLaneAgeCompact(item.at, now) ?? '—');
}

/** The row's identity: order number, else PO, else its in-person handle. */
export function liveFeedTicketIdentity(item: LiveFeedItem): string {
  return item.orderId ?? item.poNumber ?? item.ref ?? item.tracking ?? 'No number';
}

/** The client's clock for ages, ticking each minute; null on the server and the first client render. */
export function useBoardNow(): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}