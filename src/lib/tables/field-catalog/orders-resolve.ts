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

import type {
  CompoundSlotValue,
  CompoundSubtitlePart,
} from '@/components/tables/compound/compound-row-model';
import { nonSentinelTimestamp } from '@/components/dashboard/orders-queue/helpers';
import { conditionGradeTextClass, orderRowQtyTone } from '@/lib/condition-tone';
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

function stamp(...candidates: (string | null | undefined)[]): string | null {
  for (const candidate of candidates) {
    const raw = nonSentinelTimestamp(candidate);
    if (!raw) continue;
    const formatted = formatMonthDayTimePST(raw);
    if (formatted && formatted !== '—') return formatted;
  }
  return null;
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
    at: stamp(row.test_date_time, row.test_activity_at),
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
    at: stamp(row.packed_at, row.pack_activity_at),
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
    at: stamp(row.ship_confirmed_at),
    station: null,
  };
}

function moneyText(value: unknown): string | null {
  const amount = Number(value);
  return Number.isFinite(amount) ? formatCurrency(amount) : null;
}

/**
 * Resolve one bound field for one row. Unknown field id → null (the cell
 * dashes); the layout resolver has already dropped stale bindings, so this is
 * defense in depth, not a code path a valid layout reaches.
 */
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
      if (ctx.editableFieldIds?.includes(fieldId)) {
        parts.push({ text: EMPTY_META_DASH, toneClass: 'text-text-faint', key: fieldId });
      }
      continue;
    }
    if (fieldId === 'orders.qty') {
      const qty = Number(value.text);
      const countTone = orderRowQtyTone(Number.isFinite(qty) ? qty : 1);
      parts.push({
        text: value.text,
        // Dark + bold under the title. Notes keep the muted caption; qty 2+
        // still warns, but a quantity of 1 is no longer the gray subtitle.
        toneClass:
          countTone === 'text-text-muted'
            ? 'font-semibold text-text-default'
            : `font-semibold ${countTone}`,
        key: fieldId,
        // Two digits, always. A quantity is 1 on most rows and 10–99 on a few,
        // and sizing to content shifted every fact after it sideways on exactly
        // those rows — the ones an operator most needs to notice. Reserving the
        // wider case costs one character on the common row and keeps the line
        // scannable straight down the grid. Three-digit quantities overflow the
        // reservation rather than truncate, which is the right failure.
        widthCh: 2,
      });
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
      });
      continue;
    }
    parts.push({ text: value.text, key: fieldId });
  }
  return parts;
}
