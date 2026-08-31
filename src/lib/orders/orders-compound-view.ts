/**
 * Orders row → {@link CompoundRowView}. Pure; no React, no hooks.
 *
 * The second family adapter into the shared compound renderer. It exists so
 * Orders can join the one layout WITHOUT copying a cell — which is the whole
 * point of the view-model seam.
 *
 * Dense identity (To-ship): stage stays on the state pill; tester / station /
 * packer ride the item secondary when there is no operator note — so the
 * compound grid answers “where is this / who touched it” without mounting
 * ORDERS_QUEUE_COLUMNS.
 */

import {
  firstNote,
  type CompoundRowView,
  type CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import { packBenchShortLabel } from '@/lib/packing/pack-bench-display';
import type { ShippedOrder } from '@/types/orders';
import { formatCurrency } from '@/utils/_number';
import { formatMonthDayTimePST } from '@/utils/date';
import { nonSentinelTimestamp } from '@/components/dashboard/orders-queue/helpers';

/**
 * Fulfillment lane → the three-tone vocabulary.
 *
 * `BLOCKED` is the only lane that needs a human, so it is the only `alert`.
 * `TESTED` / packed / shipped are progress that has completed a step (`done`);
 * everything else is ordinary queue movement and stays neutral, so a floor
 * screen reserves its one loud colour for the row that is actually stuck.
 */
export function ordersStateTone(stateLabel: string | null | undefined): CompoundStateTone {
  const s = String(stateLabel || '').toUpperCase();
  if (!s) return 'neutral';
  if (s.includes('BLOCK') || s.includes('OUT OF STOCK') || s.includes('EXCEPTION') || s.includes('HOLD')) {
    return 'alert';
  }
  if (s.includes('TESTED') || s.includes('PACKED') || s.includes('SHIPPED') || s.includes('SCANNED') || s.includes('READY')) {
    return 'done';
  }
  return 'neutral';
}

export interface OrdersCompoundParts {
  /**
   * Lane label already resolved by `resolveRowStatus` for this queueMode.
   * `null` when the queue has no per-row status (every row would read the
   * same) — the state cell then paints nothing instead of a repeated word.
   */
  stateLabel: string | null;
  /** Whole days past ship-by; null when the order has no deadline. */
  delayDays: number | null;
  delayTip?: string;
  /** Normalized tester face (`---` when missing). */
  testerDisplay?: string | null;
  /** Normalized packer face (`---` when missing). */
  packerDisplay?: string | null;
  /**
   * Org triage flag mark — shown next to the title so the wash has a
   * non-colour carrier on the dense compound grid (selection still wins fill).
   */
  flagMark?: CompoundRowView['flagMark'];
  /**
   * Resolved slot values keyed by mounted TRACK key (`status:1`, …) — built
   * once per row from the materialized columns (`ordersSlotValues`).
   */
  slots?: CompoundRowView['slots'];
  /**
   * Bound-subtitle parts for the item cell (`ordersSubtitleParts`).
   * `undefined` = the layout binds no subtitles, keep the legacy note/identity
   * fallback; an array (even empty) = the org chose what rides under the
   * title, and that choice is final — a blank line, never the implicit
   * identity filler.
   */
  subtitleParts?: CompoundRowView['subtitleParts'];
}

/**
 * Compact identity line for the item secondary: tester · tested stamp · station · packer.
 * Empty parts are omitted; returns null when nothing to show.
 */
export function ordersIdentityLine(
  record: ShippedOrder,
  parts: Pick<OrdersCompoundParts, 'testerDisplay' | 'packerDisplay'>,
): string | null {
  const row = record as ShippedOrder & {
    pack_location_name?: string | null;
    pack_location_kind?: string | null;
    test_date_time?: string | null;
    test_activity_at?: string | null;
    packed_at?: string | null;
    pack_activity_at?: string | null;
  };
  const bits: string[] = [];

  const tester = String(parts.testerDisplay || '').trim();
  if (tester && tester !== '---') {
    const testedRaw =
      nonSentinelTimestamp(row.test_date_time) ?? nonSentinelTimestamp(row.test_activity_at);
    const stamp = testedRaw ? formatMonthDayTimePST(testedRaw) : null;
    bits.push(stamp && stamp !== '—' ? `${tester} · ${stamp}` : tester);
  }

  const benchName = String(row.pack_location_name || '').trim();
  if (benchName) {
    bits.push(
      packBenchShortLabel({
        locationName: benchName,
        locationKind: String(row.pack_location_kind || ''),
      }),
    );
  }

  const packer = String(parts.packerDisplay || '').trim();
  if (packer && packer !== '---') {
    const packedRaw =
      nonSentinelTimestamp(row.packed_at) ?? nonSentinelTimestamp(row.pack_activity_at);
    const stamp = packedRaw ? formatMonthDayTimePST(packedRaw) : null;
    bits.push(stamp && stamp !== '—' ? `Pack ${packer} · ${stamp}` : `Pack ${packer}`);
  }

  return bits.length > 0 ? bits.join(' · ') : null;
}

export function ordersCompoundView(
  record: ShippedOrder,
  parts: OrdersCompoundParts,
): CompoundRowView {
  const row = record as ShippedOrder & {
    tracking_number?: string | null;
    account_source?: string | null;
    carrier?: string | null;
  };
  const tracking = String(row.shipping_tracking_number || row.tracking_number || '').trim();
  const opNote = firstNote([record.notes]);
  const identity = ordersIdentityLine(record, parts);
  // The item secondary: bound subtitle PARTS (an explicit org choice) are
  // final — the cell paints them and ignores `note`. Otherwise the operator
  // note wins and identity fills an empty note line. When both note and
  // identity exist, identity rides the state tip so nothing is lost.
  const secondary = parts.subtitleParts !== undefined ? null : (opNote ?? identity);
  const stateTipParts = [parts.delayTip, opNote && identity ? identity : null].filter(Boolean);

  return {
    id: String(record.id),
    // NO photo on the orders row model — `ShippedOrder` carries no image field,
    // so this renders the typed placeholder. Adding one is a query + row-model
    // change (join the catalog listing image), not a cell change; until then the
    // column is an honest empty rather than a fabricated thumbnail.
    thumbUrl: null,
    title: record.product_title || '',
    note: secondary,
    flagMark: parts.flagMark ?? null,
    orderId: String(record.order_id || '').trim() || null,
    tracking: tracking || null,
    // Marketplace/channel the order came from — the platform SoT resolves the mark.
    platformValue: row.account_source || null,
    carrier: row.carrier || null,
    // `''`, not null: the shared compound row model takes a string and
    // `CompoundCells` renders it directly, so an empty label paints an empty
    // state cell — the same "nothing to say" the receiving grid already uses.
    // Widening the shared model to null would ripple through every compound
    // surface to say what `''` already says here.
    stateLabel: parts.stateLabel ?? '',
    stateTone: ordersStateTone(parts.stateLabel),
    stateTip: stateTipParts.length > 0 ? stateTipParts.join(' · ') : undefined,
    delay:
      parts.delayDays == null ? null : { days: parts.delayDays, overdue: parts.delayDays > 0 },
    delayTip: parts.delayTip,
    // What the order sold for. `sale_amount` arrives as a string or a number
    // depending on the query path, and an order with no recorded sale renders an
    // empty cell rather than a `$0.00` nobody charged.
    amount: (() => {
      const sale = Number(record.sale_amount);
      return Number.isFinite(sale) ? formatCurrency(sale) : null;
    })(),
    slots: parts.slots,
    subtitleParts: parts.subtitleParts,
  };
}
