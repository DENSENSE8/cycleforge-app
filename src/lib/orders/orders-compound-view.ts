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
  type CompoundDelay,
  type CompoundRowView,
  type CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import { ordersNextStep } from '@/lib/orders/orders-next-step';
import { packBenchShortLabel } from '@/lib/packing/pack-bench-display';
import type { ShippedOrder } from '@/types/orders';
import {
  formatDateKeyMedium,
  formatDateKeyShort,
  formatMonthDayTimePST,
  getCurrentPSTDateKey,
  toPSTDateKey,
} from '@/utils/date';
import { getExternalUrlByItemNumber } from '@/utils/external-item-url';
import {
  formatQueueRowDateCell,
  nonSentinelTimestamp,
} from '@/components/dashboard/orders-queue/helpers';
import { shortageIdentityFromRow } from '@/lib/orders/order-shortage-identity';
import { shortagePipelineFrom } from '@/lib/orders/shortage-pipeline';

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
  if (
    s.includes('TESTED') ||
    s.includes('PACKED') ||
    s.includes('SHIPPED') ||
    s.includes('SCANNED') ||
    s.includes('READY') ||
    s.includes('TRANSIT') ||
    s.includes('DELIVER') ||
    s.includes('PICKED UP')
  ) {
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
  /**
   * True when a multi-line order parent already owns the ids — the leaf
   * fulfillment cell stays quiet so the same order # is not reprinted per SKU.
   */
  quietIdentity?: boolean;
  /**
   * Warehouse civil today (`YYYY-MM-DD`). Due-today ink vs future faint.
   * Omitted ⇒ `getCurrentPSTDateKey()` (tests pass it so the face is stable).
   */
  todayKey?: string;
  /**
   * Bundle / kit chip under the item title (from batch composition map).
   * Absent / null ⇒ flat listing title only.
   */
  kitFace?: CompoundRowView['kitFace'];
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

/**
 * Absolute ship-by for the STATUS line — deadline, then `ship_by_date`.
 * Never created-at: that stamp is when the order landed, not when it must
 * leave, and painting it as ship-by is how a missing deadline used to look
 * like a real one.
 */
function ordersShipByRaw(
  record: Pick<ShippedOrder, 'deadline_at' | 'ship_by_date'>,
): string | null {
  return nonSentinelTimestamp(record.deadline_at) ?? nonSentinelTimestamp(record.ship_by_date);
}

/** Civil-day delay facts the compound STATUS line paints. */
export function ordersShipByDelay(
  record: Pick<ShippedOrder, 'deadline_at' | 'ship_by_date'>,
  delayDays: number | null,
  todayKey: string,
): CompoundDelay {
  const raw = ordersShipByRaw(record);
  const parsed = raw ? toPSTDateKey(raw) : '';
  const dateKey = parsed && parsed !== 'Unknown' ? parsed : null;
  const days = delayDays ?? 0;
  return {
    days,
    overdue: days > 0,
    dateLabel: dateKey ? formatDateKeyShort(dateKey) : null,
    dateKey,
    dueToday: Boolean(dateKey && dateKey === todayKey),
    // Only meaningful while the deadline is still ahead: `delayDays` clamps at
    // zero, so without this the age face cannot tell "due in three weeks" from
    // "due tomorrow" — both arrive as 0.
    daysUntil: days > 0 ? null : civilDaysBetween(todayKey, dateKey),
  };
}

/**
 * Whole days from `fromKey` to `toKey`, both civil `YYYY-MM-DD`. Null when
 * either is missing or the target is in the past.
 *
 * Civil-day arithmetic on purpose (the same shape `getDaysLateNullable` uses):
 * a deadline is a DAY, and counting instants would make a row due tomorrow read
 * as "in 0d" all afternoon.
 */
function civilDaysBetween(fromKey: string, toKey: string | null): number | null {
  if (!toKey || !fromKey) return null;
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  if (![fy, fm, fd, ty, tm, td].every(Number.isFinite)) return null;
  const from = Math.floor(Date.UTC(fy, fm - 1, fd) / 86400000);
  const to = Math.floor(Date.UTC(ty, tm - 1, td) / 86400000);
  return to > from ? to - from : null;
}

/**
 * DATES column, top — WHEN THE ORDER WAS PLACED, with the import stamp as the
 * honest fallback.
 *
 * Two different facts, in preference order:
 *
 * 1. `order_date` — the channel's purchase instant (eBay / Amazon sync). This
 *    is the date an operator means by "order date", and the one a buyer quotes.
 * 2. `created_at` — when the row landed in this system. Every row has one,
 *    because it is the insert stamp.
 *
 * A manual row, a CSV import or a backfill carries no `order_date` at all, and
 * the cell must still say something — a blank top line on half the queue reads
 * as a broken column. So it falls back, and **the tooltip names which fact is
 * on screen** (`Ordered ·` vs `Imported ·`, and why). Staff can therefore tell
 * a real purchase date from the day we happened to import it, which is the one
 * thing a silent fallback would take away: the same failure this file's
 * `ordersShipByRaw` already refuses, where painting `created_at` as the ship-by
 * made a missing deadline look like a real one.
 *
 * Never the reverse preference, and never a fused "earliest of the two": the
 * import stamp is always later than the purchase, so mixing them would make the
 * column's own ordering meaningless.
 */
export function ordersOrderedAt(
  record: Pick<ShippedOrder, 'created_at' | 'order_date'>,
): NonNullable<CompoundRowView['orderedAt']> | null {
  const placedRaw = nonSentinelTimestamp(record.order_date);
  const placedKey = placedRaw ? toPSTDateKey(placedRaw) : '';
  if (placedKey && placedKey !== 'Unknown') {
    return {
      label: formatDateKeyShort(placedKey),
      tip: `Ordered · ${formatDateKeyMedium(placedKey, { weekday: 'short', withYear: true })}`,
      dateKey: placedKey,
    };
  }

  const importedRaw = nonSentinelTimestamp(record.created_at);
  const importedKey = importedRaw ? toPSTDateKey(importedRaw) : '';
  if (!importedKey || importedKey === 'Unknown') return null;
  return {
    label: formatDateKeyShort(importedKey),
    tip:
      `Imported · ${formatDateKeyMedium(importedKey, { weekday: 'short', withYear: true })}` +
      ' · no order date came from the channel',
    // The IMPORT day seeds the calendar so a correction starts near the truth —
    // but an edit commits `order_date`, which is why the fallback is still
    // named as an import in the tooltip.
    dateKey: importedKey,
  };
}

/**
 * ORDER-LEVEL rail — urgent only. Exception and out-of-stock are product
 * facts and paint on {@link ordersItemStatus}.
 */
export function ordersEdgeMark(
  record: Pick<ShippedOrder, 'is_urgent' | 'is_out_of_stock' | 'has_exception'>,
): CompoundRowView['edgeMark'] {
  if (record.is_urgent) {
    return { label: 'Urgent', barClass: 'bg-yellow-400', pulse: true, tickClass: 'bg-yellow-100' };
  }
  return null;
}

/**
 * PRODUCT-LEVEL mark on the item track. Exception wins over out of stock.
 * The cell paints an alert icon; this only names the fact. OOS tip is a
 * product-card fact blob — CompoundCells mounts the hover card from `card`.
 */
export function ordersItemStatus(
  record: Pick<
    ShippedOrder,
    | 'is_out_of_stock'
    | 'has_exception'
    | 'oos_kind'
    | 'oos_sku'
    | 'oos_qty_short'
    | 'oos_title'
    | 'oos_zoho_item_id'
    | 'sku'
    | 'product_title'
    | 'catalog_image_url'
    | 'quantity'
    | 'replenishment_status'
    | 'replenishment_po_number'
    | 'shortage_link_status'
  >,
): CompoundRowView['itemStatus'] {
  if (record.has_exception) {
    return {
      label: 'Exception',
      tip: 'This item is on the exceptions desk — it cannot ship as-is.',
    };
  }
  if (record.is_out_of_stock) {
    const identity = shortageIdentityFromRow(record);
    const sku = identity?.sku || String(record.sku || '').trim() || null;
    const title =
      identity?.title ||
      String(record.product_title || '').trim() ||
      (sku ? sku : 'Out of stock');
    const qtyRaw = Number(identity?.qtyShort ?? record.quantity ?? 1);
    const qtyShort = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;
    const kind =
      identity?.kind === 'kit_part' || identity?.kind === 'catalog_child'
        ? 'kit_part'
        : 'listing';
    const pipeline = shortagePipelineFrom({
      isOutOfStock: true,
      replenishmentStatus: record.replenishment_status,
      poNumber: record.replenishment_po_number,
      linkStatus: record.shortage_link_status,
      qtyShort,
    });
    const pipelineLabel = pipeline && pipeline.stage !== 'open' ? pipeline.label : null;
    return {
      label: pipelineLabel || 'Out of stock',
      tip: pipelineLabel || (sku ? `Out of stock · ${sku}` : 'Out of stock'),
      card: {
        thumbUrl: String(record.catalog_image_url || '').trim() || null,
        sku,
        title,
        qtyShort,
        kind,
        pipelineLabel,
      },
    };
  }
  return null;
}

/** Parent fold rollup — one triangle when any child is short. */
export function ordersGroupItemStatus(
  rows: readonly Pick<
    ShippedOrder,
    | 'is_out_of_stock'
    | 'has_exception'
    | 'oos_sku'
    | 'oos_title'
    | 'sku'
    | 'product_title'
    | 'catalog_image_url'
    | 'replenishment_status'
    | 'replenishment_po_number'
    | 'shortage_link_status'
  >[],
): CompoundRowView['itemStatus'] {
  if (rows.some((row) => Boolean(row.has_exception))) {
    return {
      label: 'Exception',
      tip: 'This item is on the exceptions desk — it cannot ship as-is.',
    };
  }
  const short = rows.filter((row) => Boolean(row.is_out_of_stock));
  if (short.length === 0) return null;
  const skus = short
    .map((row) => String(row.oos_sku || row.sku || '').trim())
    .filter(Boolean);
  const lead = short[0]!;
  const pipeline = shortagePipelineFrom({
    isOutOfStock: true,
    replenishmentStatus: lead.replenishment_status,
    poNumber: lead.replenishment_po_number,
    linkStatus: lead.shortage_link_status,
    qtyShort: short.length,
  });
  const names = short
    .map((row) => String(row.oos_title || row.product_title || row.oos_sku || row.sku || '').trim())
    .filter(Boolean);
  return {
    label: pipeline && pipeline.stage !== 'open' ? pipeline.label : 'Out of stock',
    tip: `${short.length} of ${rows.length} short${pipeline && pipeline.stage !== 'open' ? ` · ${pipeline.label}` : ''}`,
    card: {
      thumbUrl: String(lead.catalog_image_url || '').trim() || null,
      sku: skus[0] || null,
      title:
        short.length === 1
          ? String(lead.oos_title || lead.product_title || skus[0] || 'Out of stock')
          : names.length > 0
            ? names.join(' · ')
            : `${short.length} of ${rows.length} short`,
      qtyShort: short.length,
      kind: 'rollup',
      rollupSkus: skus,
      pipelineLabel: pipeline && pipeline.stage !== 'open' ? pipeline.label : null,
    },
  };
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
  const todayKey = parts.todayKey ?? getCurrentPSTDateKey();
  const delay = ordersShipByDelay(record, parts.delayDays, todayKey);
  // The deadline line paints its AGE (`2d late`), so the civil day now exists
  // ONLY here. The tooltip therefore states both — the date and the lateness in
  // words — rather than the bare `Ship by · …` it carried when the cell itself
  // printed the day.
  const shipByTooltip = (() => {
    const base = formatQueueRowDateCell(ordersShipByRaw(record))?.tooltip;
    if (!base) return undefined;
    if (delay.overdue && delay.days > 0) {
      return `${base} · ${delay.days} day${delay.days === 1 ? '' : 's'} late`;
    }
    if (delay.dueToday) return `${base} · due today`;
    if (delay.daysUntil != null) {
      return `${base} · in ${delay.daysUntil} day${delay.daysUntil === 1 ? '' : 's'}`;
    }
    return base;
  })();

  return {
    id: String(record.id),
    thumbUrl: String(record.catalog_image_url || '').trim() || null,
    title: record.product_title || '',
    // Listing join — the item number is the handle, the URL is derived. Absent
    // item number ⇒ no href, and the title stays plain text.
    titleHref: getExternalUrlByItemNumber(record.item_number) ?? null,
    note: secondary,
    flagMark: parts.flagMark ?? null,
    itemStatus: ordersItemStatus(record),
    edgeMark: ordersEdgeMark(record),
    orderId: String(record.order_id || '').trim() || null,
    tracking: tracking || null,
    trackings: (() => {
      const listed = Array.isArray(row.tracking_numbers)
        ? row.tracking_numbers.map((v: unknown) => String(v || '').trim()).filter(Boolean)
        : [];
      if (listed.length > 0) return listed;
      return tracking ? [tracking] : [];
    })(),
    quietIdentity: parts.quietIdentity === true,
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
    orderedAt: ordersOrderedAt(record),
    delay,
    delayTip: shipByTooltip,
    // Where it goes next, derived from the canonical lifecycle projection —
    // the same signals `resolveRowStatus` reads for the pill above it, so the
    // two lines of the status cell can never disagree about the stage.
    nextStep: ordersNextStep(record as Parameters<typeof ordersNextStep>[0]),
    // Line money is a subtitle (`orders.amount` via ensureLineMoneySubtitle).
    // Do not dual-write sale_amount onto a dead Amount track.
    amount: null,
    slots: parts.slots,
    subtitleParts: parts.subtitleParts,
    kitFace: parts.kitFace ?? null,
    detail: (() => {
      const serials = String(record.serial_number || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const location = String(record.pack_location_name || '').trim() || null;
      return {
        serials,
        location,
        unitRef: serials[0] ?? null,
        sku: String(record.sku || '').trim() || null,
      };
    })(),
  };
}
