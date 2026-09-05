/**
 * Orders slot resolvers — row + fieldId → the resolved facts a slot cell
 * paints. Pure functions; no React, no hooks.
 *
 * This is the family's `resolveField` half of the slot contract
 * (`docs/todo/slot-based-metadata-table-PLAN.md` §6.3): the catalog names the
 * fact, this module reads it off the `ShippedOrder` row the feed already
 * returns. The stage-step readers absorb the Slice 1 `ordersTestedStep`
 * prototype (`orders-compound-view.ts`) and add its packed / scanned-out
 * siblings, one resolver per catalog field — never a `row[path]` generic.
 *
 * `OrdersSlotContext` carries the two facts the ROW resolves better than the
 * wire does: tester/packer display names already run through the staff-name
 * map + `normalizePersonName` by the queue view layer. Wire-name fallbacks
 * keep the resolvers useful without it.
 */

import {
  COMPOUND_MONEY_TONE_CLASS,
  type CompoundSlotValue,
  type CompoundSubtitlePart,
} from '@/components/tables/compound/compound-row-model';
import { nonSentinelTimestamp } from '@/components/dashboard/orders-queue/helpers';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import { lineQtySubtitlePart } from '@/lib/tables/slot-table-line-qty';
import { EMPTY_MONEY_FACE } from '@/lib/tables/slot-table-line-money';
import { conditionGradeTableLabel, EMPTY_META_DASH } from '@/lib/conditions';
import { catalogById, type FieldDef } from '@/lib/tables/field-catalog/types';
import { ORDERS_FIELD_CATALOG } from '@/lib/tables/field-catalog/orders';
import { shortageCoverageFromWire } from '@/lib/orders/shortage-coverage';
import { packBenchShortLabel } from '@/lib/packing/pack-bench-display';
import type { ShippedOrder } from '@/types/orders';
import { formatCurrency } from '@/utils/_number';
import { formatMonthDayTimePST } from '@/utils/date';

export interface OrdersSlotContext {
  /** Normalized tester face from the queue view layer (`---` = missing). */
  testerDisplay?: string | null;
  /** Normalized packer face from the queue view layer (`---` = missing). */
  packerDisplay?: string | null;
  /**
   * Subtitle fields the mounting surface made EDITABLE in place (a select
   * editor claims the part by key). A blank editable field keeps a faint
   * `--` placeholder part instead of dropping — an in-place editor with no
   * part would have nothing to click. Read-only mounts omit this and blanks
   * drop exactly as before.
   */
  editableFieldIds?: readonly string[];
}

const ORDERS_FIELDS_BY_ID = catalogById(ORDERS_FIELD_CATALOG);

/** `---` and blanks are the queue's "nobody" faces — a step line omits them. */
function person(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s && s !== '---' ? s : null;
}

function stamp(...candidates: (string | null | undefined)[]): {
  at: string | null;
  atInstant?: string;
} {
  for (const candidate of candidates) {
    const raw = nonSentinelTimestamp(candidate);
    if (!raw) continue;
    const formatted = formatMonthDayTimePST(raw);
    if (formatted && formatted !== '—') return { at: formatted, atInstant: raw };
  }
  return { at: null };
}

type OrdersRow = ShippedOrder & Record<string, unknown>;

function str(row: OrdersRow, key: string): string | null {
  const s = String(row[key] ?? '').trim();
  return s || null;
}

function staffId(...candidates: unknown[]): number | null {
  for (const candidate of candidates) {
    const id = Number(candidate);
    if (Number.isFinite(id) && id > 0) return id;
  }
  return null;
}

/**
 * Pick step facts. Wire columns are still the legacy tester/test_date family
 * until a dedicated pick projection exists — the catalog id is `orders.picked`.
 */
function pickedStep(row: OrdersRow, ctx: OrdersSlotContext): CompoundSlotValue {
  return {
    kind: 'stage_event',
    who: person(ctx.testerDisplay) ?? person(str(row, 'tested_by_name') ?? str(row, 'tester_name')),
    // Scan actor first, assignee fallback — same precedence as the name.
    whoStaffId: staffId(row.tested_by, row.tester_id),
    ...stamp(row.test_date_time, row.test_activity_at),
    // Not projected by the To-ship feed yet — blank until a bench stamp lands.
    station: str(row, 'test_location_name'),
  };
}

function packedStep(row: OrdersRow, ctx: OrdersSlotContext): CompoundSlotValue {
  const benchName = str(row, 'pack_location_name');
  return {
    kind: 'stage_event',
    who: person(ctx.packerDisplay) ?? person(str(row, 'packed_by_name') ?? str(row, 'packer_name')),
    whoStaffId: staffId(row.packed_by, row.packer_id),
    ...stamp(row.packed_at, row.pack_activity_at),
    station: benchName
      ? packBenchShortLabel({
          locationName: benchName,
          locationKind: String(row.pack_location_kind ?? ''),
        })
      : null,
  };
}

function scannedOutStep(row: OrdersRow): CompoundSlotValue {
  return {
    kind: 'stage_event',
    who: person(str(row, 'shipped_out_by_name')),
    whoStaffId: staffId(row.shipped_out_by),
    ...stamp(row.ship_confirmed_at),
    station: null,
  };
}

/**
 * The empty PRICE face — the currency mark with nothing after it.
 *
 * Not {@link EMPTY_META_DASH}: an unpriced row still has a price SLOT, and the
 * `$` is what says so at a glance in a line of otherwise unmarked facts
 * (operator 2026-09-04). Still not `$0.00`, which is a figure somebody would
 * have had to charge.
 */
export { EMPTY_MONEY_FACE } from '@/lib/tables/slot-table-line-money';

function moneyText(value: unknown): string | null {
  // Null / empty is ABSENT, not zero. `Number(null)` is 0, so the bare
  // `Number.isFinite` test printed `$0.00` on every row the channel never sent
  // a sale amount for — a figure nobody charged, indistinguishable from a real
  // free line. An unpriced row paints the `--` placeholder instead.
  if (value == null || String(value).trim() === '') return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? formatCurrency(amount) : null;
}

/**
 * Resolve one bound field for one row. Unknown field id → null (the cell
 * dashes); the layout resolver has already dropped stale bindings, so this is
 * defense in depth, not a code path a valid layout reaches.
 */

/**
 * A date fact's face — the SAME `stamp` the step readers use, so a bound date
 * track and a stage line cannot format the same instant two ways.
 */
function dateText(row: OrdersRow, key: string): string | null {
  return stamp(row[key] as string | null | undefined).at;
}

/** First non-blank of a `a|b` alias chain — the shape `paths` documents. */
function firstStr(row: OrdersRow, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = str(row, key);
    if (value) return value;
  }
  return null;
}

/**
 * A boolean fact's face. `null` when the row does not carry the flag at all,
 * so an absent fact reads as a dash rather than as a confident "No" — the two
 * are different answers and only one of them is ours to give.
 */
function flagText(value: unknown, on: string, off: string): string | null {
  if (value == null || value === '') return null;
  return value === true || value === 'true' || value === 't' ? on : off;
}

export function resolveOrdersSlotValue(
  record: ShippedOrder,
  fieldId: string,
  ctx: OrdersSlotContext = {},
): CompoundSlotValue | null {
  const row = record as OrdersRow;
  switch (fieldId) {
    case 'orders.picked':
      return pickedStep(row, ctx);
    case 'orders.packed':
      return packedStep(row, ctx);
    case 'orders.scanned_out':
      return scannedOutStep(row);
    case 'orders.item_number':
      return { kind: 'value', text: str(row, 'item_number') };
    case 'orders.qty':
      return { kind: 'value', text: str(row, 'quantity') };
    case 'orders.condition': {
      const label = conditionGradeTableLabel(str(row, 'condition'));
      return { kind: 'value', text: label === EMPTY_META_DASH ? null : label };
    }
    case 'orders.notes':
      return { kind: 'value', text: str(row, 'notes') };
    case 'orders.coverage':
      return {
        kind: 'value',
        text: shortageCoverageFromWire(row.shortage_coverage).label,
      };
    case 'orders.amount':
      return { kind: 'value', text: moneyText(record.sale_amount) };
    case 'orders.sku':
      return { kind: 'value', text: str(row, 'sku') };
    case 'orders.tracking':
      return {
        kind: 'value',
        text: firstStr(row, 'tracking_number', 'shipping_tracking_number'),
      };
    case 'orders.carrier':
      return { kind: 'value', text: str(row, 'carrier') };
    case 'orders.delivery_status':
      // The carrier's own words when it gave them; the CODE is the fallback so
      // a status we have no label for still reads as something, not a dash.
      return {
        kind: 'value',
        text: firstStr(row, 'latest_status_label', 'latest_status_code'),
      };
    case 'orders.delivery_event':
      return { kind: 'value', text: dateText(row, 'latest_event_at') };
    case 'orders.exception':
      return { kind: 'value', text: flagText(row.has_exception, 'Exception', 'Clear') };
    case 'orders.platform':
      return { kind: 'value', text: str(row, 'account_source') };
    case 'orders.flag': {
      // `row_flag` is `{ flag, by, at }` — the wire returns the whole object,
      // and only the flag itself belongs in a track.
      const raw = row.row_flag;
      const flag =
        raw && typeof raw === 'object'
          ? String((raw as Record<string, unknown>).flag ?? '').trim()
          : '';
      return { kind: 'value', text: flag || null };
    }
    case 'orders.note_count': {
      const count = Number(row.note_count);
      // Zero is honest ABSENCE here, not a value: printing `0` in a column an
      // operator scans for "has this been discussed" is a row of noise.
      return { kind: 'value', text: Number.isFinite(count) && count > 0 ? String(count) : null };
    }
    case 'orders.urgent': {
      // One-sided on purpose: "Urgent" is a fact worth painting and "not
      // urgent" is the ordinary state of nearly every row. A column of "No" is
      // a column of noise.
      // Read as unknown on purpose: the ROW TYPE now says boolean (the queue
      // order reads it), but a pg driver / cached payload can still hand over
      // `'t'` or `'true'`, and narrowing the type must not silently narrow what
      // this tolerates at runtime.
      const urgent: unknown = row.is_urgent;
      const on = urgent === true || urgent === 'true' || urgent === 't';
      return { kind: 'value', text: on ? 'Urgent' : null };
    }
    case 'orders.stock':
      return { kind: 'value', text: flagText(row.is_out_of_stock, 'Out', 'In stock') };
    case 'orders.serial':
      return { kind: 'value', text: str(row, 'serial_number') };
    case 'orders.age':
      return { kind: 'value', text: dateText(row, 'created_at') };
    case 'orders.order_id':
      return { kind: 'value', text: str(row, 'order_id') };
    default:
      return null;
  }
}

/**
 * Resolve the slot values for every mounted slot TRACK of one row, keyed by
 * track key — the record `CompoundRowView.slots` carries. Non-slot columns and
 * unbound tracks contribute nothing.
 */
export function ordersSlotValues(
  record: ShippedOrder,
  columns: readonly { key: string; fieldId?: string }[],
  ctx: OrdersSlotContext = {},
): Readonly<Record<string, CompoundSlotValue>> | undefined {
  let slots: Record<string, CompoundSlotValue> | undefined;
  for (const col of columns) {
    if (!col.fieldId || !col.key.startsWith('status:')) continue;
    const value = resolveOrdersSlotValue(record, col.fieldId, ctx);
    if (!value) continue;
    (slots ??= {})[col.key] = value;
  }
  return slots;
}

/**
 * The compound ITEM cell's secondary line for bound subtitle fields — TONED
 * PARTS in binding order (the layout's array IS the display order, so an org
 * chooses `qty · condition · note` by binding in that order).
 *
 * Contextual faces come from the fields' own SoTs, never invented here:
 * - `orders.qty` paints the BARE number in the queue's count tone
 *   (`orderRowQtyTone`: 1 reads quiet, >1 reads warning — the "is this a
 *   multi" glance the flat Qty column already trained operators on);
 * - `orders.condition` paints the grade label in its grade tone
 *   (`conditionGradeTextClass`).
 * Everything else rides the quiet default. Blank values drop their part —
 * unless the field is in `ctx.editableFieldIds`, where a faint `--` part
 * holds the editor's click target (see {@link OrdersSlotContext}).
 *
 * Each part carries its fieldId as `key` so a subtitle-select editor can
 * claim it by key rather than by position.
 */
/**
 * Reserved character widths for the under-title facts, declared ONCE so the
 * painted face and the empty `--` placeholder can never disagree — a fact that
 * reserves five characters when it has a value and two when it does not is not
 * a reservation, it is a jump.
 *
 * - `orders.condition` — 5ch: the widest table grade is `L-NEW` / `PARTS`
 *   (`conditionGradeTableLabel`: NEW · L-NEW · REF · A · B · C · PARTS).
 * - `orders.amount` — 8ch: holds `$9,999.99`.
 *
 * Quantity keeps its own 2ch reservation inside `lineQtySubtitlePart`, which is
 * where that fact's face already lives.
 */
const SUBTITLE_RESERVED_WIDTH_CH: Readonly<Record<string, number>> = {
  'orders.condition': 5,
  'orders.amount': 8,
};

export function ordersSubtitleParts(
  record: ShippedOrder,
  subtitleFieldIds: readonly string[],
  ctx: OrdersSlotContext = {},
): CompoundSubtitlePart[] {
  const row = record as OrdersRow;
  const parts: CompoundSubtitlePart[] = [];
  for (const fieldId of subtitleFieldIds) {
    const field: FieldDef | undefined = ORDERS_FIELDS_BY_ID.get(fieldId);
    if (!field) continue;
    if (fieldId === 'orders.item_number') {
      // The item number is consumed by the product-title hover actions. Keep
      // its raw value in the view model so the shared cell can edit/copy it,
      // but do not paint it in the under-title line.
      parts.push({ text: str(row, 'item_number') ?? '', key: fieldId });
      continue;
    }
    const value = resolveOrdersSlotValue(record, fieldId, ctx);
    if (!value || value.kind !== 'value' || !value.text) {
      // An empty fact paints its placeholder when the desk can WRITE it (the
      // in-place editor needs a click target) — and, for the AMOUNT, always:
      // operator 2026-09-04, "must display the price even if empty". A money
      // slot that disappears on an unpriced row takes its reserved box with it
      // and every fact after it slides left, which is exactly the alignment the
      // fixed widths below exist to hold.
      if (fieldId === 'orders.amount' || ctx.editableFieldIds?.includes(fieldId)) {
        parts.push({
          // Money keeps its currency mark when there is no figure yet
          // (operator 2026-09-04): `$-` reads as an empty PRICE, where a bare
          // `--` reads as an empty anything and loses the one thing that says
          // what this slot is for. The slot stays the money hue even empty —
          // colouring it faint made an unpriced row look like a missing fact
          // rather than a price waiting for a figure.
          text: fieldId === 'orders.amount' ? EMPTY_MONEY_FACE : EMPTY_META_DASH,
          toneClass: fieldId === 'orders.amount' ? COMPOUND_MONEY_TONE_CLASS : 'text-text-faint',
          key: fieldId,
          // The SAME reservation the painted face carries — an empty part that
          // sized to its two dashes would defeat the point of reserving at all.
          ...(SUBTITLE_RESERVED_WIDTH_CH[fieldId] != null
            ? { widthCh: SUBTITLE_RESERVED_WIDTH_CH[fieldId] }
            : null),
        });
      }
      continue;
    }
    if (fieldId === 'orders.qty') {
      parts.push(lineQtySubtitlePart(fieldId, value.text));
      continue;
    }
    if (fieldId === 'orders.condition') {
      const grade = conditionGradeTextClass(str(row, 'condition'));
      parts.push({
        text: value.text,
        toneClass:
          grade === 'text-text-muted' || grade === 'text-text-faint'
            ? 'font-semibold text-text-default'
            : `font-semibold ${grade}`,
        key: fieldId,
        // FIXED, like the qty before it (operator 2026-09-04: the under-title
        // facts must line up down the column). Sizing to content moved the
        // amount and the note sideways on every row, which is what stopped the
        // line being scannable. See {@link SUBTITLE_RESERVED_WIDTH_CH}.
        widthCh: SUBTITLE_RESERVED_WIDTH_CH['orders.condition'],
      });
      continue;
    }
    if (fieldId === 'orders.amount') {
      parts.push({
        text: value.text,
        // GREEN and bold (operator 2026-09-04). Same face as the amount TRACK
        // ({@link COMPOUND_MONEY_TONE_CLASS}) — one paint, no per-desk fork.
        toneClass: COMPOUND_MONEY_TONE_CLASS,
        key: fieldId,
        widthCh: SUBTITLE_RESERVED_WIDTH_CH['orders.amount'],
      });
      continue;
    }
    parts.push({ text: value.text, key: fieldId });
  }
  return parts;
}
