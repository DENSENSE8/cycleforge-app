/**
 * Order status writes from chat (ROI row 4) — YELLOW, confirm-before-write:
 *
 *   set_order_flag      priority / hold / damaged / discrepancy / awaiting customer / ready (or clear)
 *   mark_out_of_stock   an open line shortage per order line
 *   clear_out_of_stock  clear every open shortage on the lines
 *   bulk_scan_out       packed cartons on To ship → scanned out (the dock path)
 *
 * The operator pastes many order #s / item #s at once; each resolves through
 * the find_records door, and anything that does not resolve to exactly one
 * order is listed under "Couldn't match" — never guessed. The proposal shows
 * a table of exactly the lines that will change, with the count, before the
 * operator's yes (`confirmable-write.ts`).
 */

import { z } from 'zod';
import type { OrgId } from '@/lib/tenancy/constants';
import { brandReportEnvelope } from '@/lib/assistant/tool-artifact';
import { ORDER_ROW_FLAG_IDS, resolveOrderRowFlag, type OrderRowFlagId } from '@/lib/orders/order-row-flags';
import { invalidateAllOrdersApiCaches } from '@/lib/orders/invalidation';
import { sqlOrderHasShipConfirm } from '@/lib/orders/order-grain-sql';
import { loadPackedOnToShip } from '@/lib/outbound/packed-on-to-ship';
import {
  buildConfirmableWriteTool,
  type ConfirmableWriteDeps,
  type ConfirmableWriteSpec,
  type ProposeOutcome,
} from './confirmable-write';
import type { AssistantToolCtx, AssistantToolDef } from './types';

export const SET_ORDER_FLAG_TOOL = 'set_order_flag';
export const MARK_OOS_TOOL = 'mark_out_of_stock';
export const CLEAR_OOS_TOOL = 'clear_out_of_stock';
export const BULK_SCAN_OUT_TOOL = 'bulk_scan_out';

/** Most identifiers one message may carry — past this, ask for a narrower paste. */
const MAX_TOKENS = 200;
/** Rows a preview table shows (the artifact cap); the count always states the whole set. */
const TABLE_ROWS = 200;

// ─── pasted identifiers → order lines ────────────────────────────────────────

const TIME_LIKE = /^\d{1,2}(:\d{2})?(am|pm|a|p)?$/i;

/**
 * The identifiers in a paste: whitespace / comma / semicolon separated, a
 * leading "#" dropped, at least 4 characters with a digit (order #s, item #s,
 * SKUs) — so the words and times around them ("mark", "3pm") are not looked up.
 */
export function extractIdentifierTokens(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const token = raw.replace(/^[#("'[]+|[)"'\].:!?]+$/g, '').replace(/^#/, '');
    if (token.length < 4 || !/\d/.test(token) || TIME_LIKE.test(token)) continue;
    const key = token.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(token);
  }
  return out;
}

export interface OrderLine {
  id: number;
  orderNumber: string;
  itemNumber: string | null;
  sku: string | null;
  title: string;
  status: string | null;
  flag: OrderRowFlagId | null;
  outOfStock: boolean;
}

export interface Unmatched {
  token: string;
  why: string;
}

const LINES_SQL = `SELECT o.id, o.order_id, o.item_number, o.sku, o.product_title, o.status,
       o.is_out_of_stock, f.flag
  FROM orders o
  LEFT JOIN order_flags f ON f.order_id = o.id AND f.organization_id = o.organization_id
 WHERE o.organization_id = $1
   AND (o.order_id = ANY($2::text[]) OR o.id = ANY($3::int[]))
 ORDER BY o.order_id, o.id
 LIMIT 2000`;

const norm = (s: string | null | undefined) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function toLine(r: Record<string, unknown>): OrderLine {
  const flag = resolveOrderRowFlag(r.flag);
  return {
    id: Number(r.id),
    orderNumber: String(r.order_id ?? '').trim() || `line ${Number(r.id)}`,
    itemNumber: (r.item_number as string | null) ?? null,
    sku: (r.sku as string | null) ?? null,
    title: String(r.product_title ?? '').trim() || String(r.sku ?? '').trim() || 'Untitled item',
    status: (r.status as string | null) ?? null,
    flag: flag ? flag.id : null,
    outOfStock: r.is_out_of_stock === true,
  };
}

/**
 * Resolve each token through find_records to exactly one order (all its
 * lines). With `narrowToItem`, a token that names a line's item # / SKU
 * (rather than the order #) keeps only the lines it names.
 */
export async function resolveOrderTokens(
  ctx: Pick<AssistantToolCtx, 'organizationId' | 'staffId'>,
  tokens: readonly string[],
  deps: Pick<ConfirmableWriteDeps, 'find' | 'query'>,
  narrowToItem: boolean,
): Promise<{ lines: OrderLine[]; unmatched: Unmatched[] }> {
  const unmatched: Unmatched[] = [];
  const hits: Array<{ token: string; orderNumber: string | null; rowId: number | null }> = [];
  const queue = [...tokens];
  const worker = async () => {
    for (let token = queue.shift(); token !== undefined; token = queue.shift()) {
      const { payload } = await deps.find({ orgId: ctx.organizationId, staffId: ctx.staffId, query: token, limit: 25, surface: 'assistant' });
      const orders = payload.relaxed ? [] : payload.rows.filter((r) => r.entityType === 'order');
      if (orders.length === 0) {
        unmatched.push({ token, why: 'no order matches' });
        continue;
      }
      const numbers = [...new Set(orders.map((r) => String(r.facets?.order_id ?? '').trim()).filter(Boolean))];
      const exact = numbers.filter((n) => norm(n) === norm(token));
      const pick = exact.length === 1 ? exact : numbers;
      if (pick.length > 1) {
        unmatched.push({ token, why: `matches ${pick.length} orders` });
        continue;
      }
      if (pick.length === 1) hits.push({ token, orderNumber: pick[0], rowId: null });
      else if (orders.length === 1) hits.push({ token, orderNumber: null, rowId: orders[0].id });
      else unmatched.push({ token, why: `matches ${orders.length} order lines` });
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, tokens.length) }, worker));

  const numbers = [...new Set(hits.flatMap((h) => (h.orderNumber ? [h.orderNumber] : [])))];
  const rowIds = [...new Set(hits.flatMap((h) => (h.rowId ? [h.rowId] : [])))];
  const all = hits.length
    ? (await deps.query(ctx.organizationId, LINES_SQL, [ctx.organizationId, numbers, rowIds])).rows.map(toLine)
    : [];

  const chosen = new Map<number, OrderLine>();
  for (const hit of hits) {
    const lines = all.filter((l) => (hit.orderNumber ? l.orderNumber === hit.orderNumber : l.id === hit.rowId));
    const named = narrowToItem && norm(hit.orderNumber) !== norm(hit.token)
      ? lines.filter((l) => norm(l.itemNumber) === norm(hit.token) || norm(l.sku) === norm(hit.token))
      : [];
    for (const l of named.length > 0 ? named : lines) chosen.set(l.id, l);
    if (lines.length === 0) unmatched.push({ token: hit.token, why: 'no order matches' });
  }
  unmatched.sort((a, b) => tokens.indexOf(a.token) - tokens.indexOf(b.token));
  return { lines: [...chosen.values()], unmatched };
}

// ─── shared preview / result shaping ─────────────────────────────────────────

type Row = Record<string, string | number | boolean | null>;

function withUnmatched(rows: Row[], unmatched: readonly Unmatched[], columns: readonly string[], changeColumn: string): Row[] {
  const shown = rows.slice(0, TABLE_ROWS - Math.min(unmatched.length, 50));
  const more = rows.length - shown.length;
  const out = [...shown];
  if (more > 0) out.push({ [columns[0]]: `… and ${more} more`, [changeColumn]: `${more} more lines` });
  for (const u of unmatched.slice(0, 50)) {
    out.push({ ...Object.fromEntries(columns.map((c) => [c, null])), [columns[0]]: u.token, [changeColumn]: `Couldn't match (${u.why}) — not changed` });
  }
  return out;
}

const unmatchedSentence = (unmatched: readonly Unmatched[]) =>
  unmatched.length ? ` Couldn't match ${unmatched.length}: ${unmatched.slice(0, 12).map((u) => u.token).join(', ')}${unmatched.length > 12 ? ', …' : ''} (not changed).` : '';

const orderCount = (lines: readonly OrderLine[]) => new Set(lines.map((l) => l.orderNumber)).size;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const lineWord = (lines: readonly OrderLine[]) =>
  lines.length === orderCount(lines) ? plural(lines.length, 'order') : `${plural(lines.length, 'line')} on ${plural(orderCount(lines), 'order')}`;

function table(title: string, columns: string[], rows: Row[]) {
  return { kind: 'table' as const, title: title.slice(0, 120), columns, rows, entityHint: 'order line', idColumn: 'Order #' };
}

function tokensOf(ctx: AssistantToolCtx, typed: string | undefined): string[] | { error: string } {
  const tokens = extractIdentifierTokens(typed ?? ctx.userMessage ?? '');
  if (tokens.length > MAX_TOKENS) return { error: `That is ${tokens.length} identifiers — send at most ${MAX_TOKENS} at a time. Nothing was changed.` };
  return tokens;
}

/** The preview's model summary: nothing written yet, and the exact question to ask. */
const confirmAsk = (question: string) => `NOT changed yet. Reply with exactly this question and stop: "${question}" — call this tool with action "confirm" only after the user replies yes ("cancel" if they decline).`;

async function readLines(deps: ConfirmableWriteDeps, orgId: OrgId, ids: readonly number[]): Promise<OrderLine[]> {
  return (await deps.query(orgId, LINES_SQL, [orgId, [], [...ids]])).rows.map(toLine);
}

const flagName = (flag: OrderRowFlagId | null) => (flag ? resolveOrderRowFlag(flag)?.label ?? flag : 'No flag');

// ─── set_order_flag ──────────────────────────────────────────────────────────

const flagFields = z.object({
  orders: z.string().max(20000).optional().describe('The order #s / item #s as the user pasted them (omit to read them from the message).'),
  flag: z.enum([...ORDER_ROW_FLAG_IDS, 'none']).optional().describe('priority, hold, damaged, discrepancy, awaiting_customer, ready — or none to clear the flag.'),
});
type FlagPayload = { orderIds: number[]; flag: OrderRowFlagId | null; staffId: number | null };

const setFlagSpec: ConfirmableWriteSpec<typeof flagFields, FlagPayload> = {
  name: SET_ORDER_FLAG_TOOL,
  kind: 'order.set_flag',
  permission: 'orders.create',
  description:
    'Flag orders: priority, hold, damaged, discrepancy, awaiting_customer, ready (or none to clear), for one or many pasted order #s / item #s. Two steps: action "propose" with flag (orders are read from the message) shows exactly what will change and returns needs_confirmation — ASK the user to confirm and stop. On their next message, "confirm" (yes) or "cancel" (no) with no other arguments.',
  fields: flagFields,
  pendingPhrase: (p) => `${p.flag ? `set the ${flagName(p.flag)} flag on` : 'clear the flag on'} ${plural(p.orderIds?.length ?? 0, 'order line')}`,
  propose: async (ctx, input, deps): Promise<ProposeOutcome<FlagPayload>> => {
    if (!input.flag) return { ok: false, error: 'Which flag? priority, hold, damaged, discrepancy, awaiting_customer, ready, or none. Nothing was changed.' };
    const flag = input.flag === 'none' ? null : input.flag;
    const tokens = tokensOf(ctx, input.orders);
    if ('error' in tokens) return { ok: false, error: tokens.error };
    if (tokens.length === 0) return { ok: false, error: 'No order numbers in the message — ask the user to paste them. Nothing was changed.' };
    const { lines, unmatched } = await resolveOrderTokens(ctx, tokens, deps, false);
    const change = lines.filter((l) => l.flag !== flag);
    const columns = ['Order #', 'Item', 'Status', 'Flag now', 'Will be'];
    const rows = change.map((l) => ({ 'Order #': l.orderNumber, Item: l.title, Status: l.status, 'Flag now': flagName(l.flag), 'Will be': flagName(flag) }));
    if (change.length === 0) {
      const summary = `Nothing to change: ${lines.length ? `${lineWord(lines)} already ${flag ? `flagged ${flagName(flag)}` : 'unflagged'}.` : 'no order matched.'}${unmatchedSentence(unmatched)}`;
      return { ok: true, answer: unmatched.length
        ? brandReportEnvelope({ artifact: table("Couldn't match", columns, withUnmatched([], unmatched, columns, 'Will be')), summary, answer: summary }, SET_ORDER_FLAG_TOOL)
        : { ok: true, status: 'no_change', summary } };
    }
    return {
      ok: true,
      payload: { orderIds: change.map((l) => l.id), flag, staffId: ctx.staffId },
      preview: (mutationId) =>
        brandReportEnvelope(
          {
            artifact: table(`${flag ? `Flag ${flagName(flag)}` : 'Clear flag'} · ${lineWord(change)} · confirm`, columns, withUnmatched(rows, unmatched, columns, 'Will be')),
            summary: `Ready to ${flag ? `flag ${flagName(flag)}` : 'clear the flag on'} ${lineWord(change)} (change #${mutationId}).${unmatchedSentence(unmatched)} ${confirmAsk(`Flag ${lineWord(change)} ${flagName(flag)}? Reply yes to confirm.${unmatchedSentence(unmatched)}`)}`,
            answer: `Flag ${lineWord(change)} ${flagName(flag)}? Reply yes to confirm.${unmatchedSentence(unmatched)}`,
          },
          SET_ORDER_FLAG_TOOL,
        ),
    };
  },
  settled: async (ctx, payload, mutationId, _ref, deps) => {
    await invalidateAllOrdersApiCaches([], ctx.organizationId).catch(() => null);
    const lines = await readLines(deps, ctx.organizationId, payload.orderIds);
    const columns = ['Order #', 'Item', 'Status', 'Flag'];
    return brandReportEnvelope(
      {
        artifact: table(`${payload.flag ? `Flagged ${flagName(payload.flag)}` : 'Flag cleared'} · ${lineWord(lines)}`, columns, lines.map((l) => ({ 'Order #': l.orderNumber, Item: l.title, Status: l.status, Flag: flagName(l.flag) }))),
        summary: `Done: ${lineWord(lines)} ${payload.flag ? `flagged ${flagName(payload.flag)}` : 'unflagged'} (change #${mutationId}; say "undo that" to revert).`,
        answer: `Done — ${lineWord(lines)} ${payload.flag ? `flagged ${flagName(payload.flag)}` : 'unflagged'}. Change #${mutationId} can be undone.`,
      },
      SET_ORDER_FLAG_TOOL,
    );
  },
};

// ─── mark / clear out of stock ───────────────────────────────────────────────

const oosFields = z.object({
  items: z.string().max(20000).optional().describe('The order #s / item #s as the user pasted them (omit to read them from the message).'),
});
type OosPayload = { orderIds: number[] };

function oosSpec(mark: boolean): ConfirmableWriteSpec<typeof oosFields, OosPayload> {
  const name = mark ? MARK_OOS_TOOL : CLEAR_OOS_TOOL;
  const verb = mark ? 'mark out of stock' : 'clear out of stock on';
  const state = (oos: boolean) => (oos ? 'Out of stock' : 'In stock');
  return {
    name,
    kind: mark ? 'order.mark_out_of_stock' : 'order.clear_out_of_stock',
    permission: 'orders.create',
    description: mark
      ? 'Mark order lines OUT OF STOCK for one or many pasted order #s / item #s (an item # marks only that line). Two steps: action "propose" (identifiers are read from the message) shows exactly which lines change and returns needs_confirmation — ASK the user to confirm and stop. Next message: "confirm" (yes) or "cancel" (no).'
      : 'Clear OUT OF STOCK (back in stock) on order lines for one or many pasted order #s / item #s. Two steps: action "propose" (identifiers are read from the message) shows exactly which lines change and returns needs_confirmation — ASK the user to confirm and stop. Next message: "confirm" (yes) or "cancel" (no).',
    fields: oosFields,
    pendingPhrase: (p) => `${verb} ${plural(p.orderIds?.length ?? 0, 'order line')}`,
    propose: async (ctx, input, deps): Promise<ProposeOutcome<OosPayload>> => {
      const tokens = tokensOf(ctx, input.items);
      if ('error' in tokens) return { ok: false, error: tokens.error };
      if (tokens.length === 0) return { ok: false, error: 'No order or item numbers in the message — ask the user to paste them. Nothing was changed.' };
      const { lines, unmatched } = await resolveOrderTokens(ctx, tokens, deps, true);
      const change = lines.filter((l) => l.outOfStock !== mark);
      const columns = ['Order #', 'Item #', 'Item', 'Now', 'Will be'];
      const rows = change.map((l) => ({ 'Order #': l.orderNumber, 'Item #': l.itemNumber ?? l.sku, Item: l.title, Now: state(l.outOfStock), 'Will be': state(mark) }));
      if (change.length === 0) {
        const summary = `Nothing to change: ${lines.length ? `${lineWord(lines)} already ${state(mark).toLowerCase()}.` : 'no order matched.'}${unmatchedSentence(unmatched)}`;
        return { ok: true, answer: unmatched.length
          ? brandReportEnvelope({ artifact: table("Couldn't match", columns, withUnmatched([], unmatched, columns, 'Will be')), summary, answer: summary }, name)
          : { ok: true, status: 'no_change', summary } };
      }
      return {
        ok: true,
        payload: { orderIds: change.map((l) => l.id) },
        preview: (mutationId) =>
          brandReportEnvelope(
            {
              artifact: table(`${mark ? 'Mark out of stock' : 'Clear out of stock'} · ${lineWord(change)} · confirm`, columns, withUnmatched(rows, unmatched, columns, 'Will be')),
              summary: `Ready to ${verb} ${lineWord(change)} (change #${mutationId}).${unmatchedSentence(unmatched)} ${confirmAsk(`${mark ? 'Mark' : 'Clear out of stock on'} ${lineWord(change)}${mark ? ' out of stock' : ''}? Reply yes to confirm.${unmatchedSentence(unmatched)}`)}`,
              answer: `${mark ? 'Mark' : 'Clear out of stock on'} ${lineWord(change)}${mark ? ' out of stock' : ''}? Reply yes to confirm.${unmatchedSentence(unmatched)}`,
            },
            name,
          ),
      };
    },
    settled: async (ctx, payload, mutationId, _ref, deps) => {
      await invalidateAllOrdersApiCaches([], ctx.organizationId).catch(() => null);
      const lines = await readLines(deps, ctx.organizationId, payload.orderIds);
      const columns = ['Order #', 'Item #', 'Item', 'Stock'];
      const done = lines.filter((l) => l.outOfStock === mark).length;
      return brandReportEnvelope(
        {
          artifact: table(`${mark ? 'Marked out of stock' : 'Out of stock cleared'} · ${lineWord(lines)}`, columns, lines.map((l) => ({ 'Order #': l.orderNumber, 'Item #': l.itemNumber ?? l.sku, Item: l.title, Stock: state(l.outOfStock) }))),
          summary: `Done: ${done} of ${lineWord(lines)} now ${state(mark).toLowerCase()} (change #${mutationId}; say "undo that" to revert).`,
          answer: `Done — ${done} of ${lineWord(lines)} now ${state(mark).toLowerCase()}. Change #${mutationId} can be undone.`,
        },
        name,
      );
    },
  };
}

// ─── bulk_scan_out ───────────────────────────────────────────────────────────

const scanFields = z.object({
  orders: z
    .string()
    .max(20000)
    .optional()
    .describe('Only these order #s (as pasted). Omit for every packed order still on To ship.'),
});
type ScanPayload = { shipments: Array<{ shipmentId: number; tracking: string }>; staffId: number | null };

const SCANNED_SQL = `SELECT o.id, o.order_id, o.product_title, o.shipment_id, stn.tracking_number_raw AS tracking,
       ${sqlOrderHasShipConfirm('o')} AS scanned_out
  FROM orders o
  JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
 WHERE o.organization_id = $1 AND o.shipment_id = ANY($2::int[])
 ORDER BY o.order_id, o.id`;

const MAX_SHIPMENTS = 500;

const scanOutSpec: ConfirmableWriteSpec<typeof scanFields, ScanPayload> = {
  name: BULK_SCAN_OUT_TOOL,
  kind: 'order.scan_out',
  permission: 'shipping.mark_shipped',
  description:
    'Scan out PACKED orders still on the To ship desk (record that the cartons left the building) — all of them, or only pasted order #s. Two steps: action "propose" shows a table of exactly which orders will be scanned out with the count and returns needs_confirmation — ASK the user to confirm and stop. Next message: "confirm" (yes) or "cancel" (no).',
  fields: scanFields,
  pendingPhrase: (p) => `scan out ${plural(p.shipments?.length ?? 0, 'packed carton')}`,
  propose: async (ctx, input, deps): Promise<ProposeOutcome<ScanPayload>> => {
    const tokens = tokensOf(ctx, input.orders);
    if ('error' in tokens) return { ok: false, error: tokens.error };
    let unmatched: Unmatched[] = [];
    let rowIds: number[] | null = null;
    let named: OrderLine[] = [];
    if (tokens.length > 0) {
      const resolved = await resolveOrderTokens(ctx, tokens, deps, false);
      unmatched = resolved.unmatched;
      named = resolved.lines;
      rowIds = named.map((l) => l.id);
    }
    const packed = rowIds && rowIds.length === 0 ? [] : await loadPackedOnToShip(ctx.organizationId, rowIds);
    if (packed.length > MAX_SHIPMENTS) {
      return { ok: false, error: `${packed.length} packed cartons are on To ship — more than ${MAX_SHIPMENTS} at once. Ask the user to paste the order numbers to scan out. Nothing was changed.` };
    }
    const onDesk = new Set(packed.flatMap((s) => s.order_row_ids.map(Number)));
    const orderNumbers = new Set(named.filter((l) => !onDesk.has(l.id)).map((l) => l.orderNumber));
    for (const n of orderNumbers) {
      if (!named.some((l) => l.orderNumber === n && onDesk.has(l.id))) unmatched.push({ token: n, why: 'not packed on To ship, or already scanned out' });
    }
    const columns = ['Order #', 'Tracking', 'Channel', 'Packed'];
    const rows = packed.flatMap((s) =>
      s.order_ids.map((orderId) => ({
        'Order #': orderId,
        Tracking: s.tracking,
        Channel: s.account_source,
        Packed: new Date(s.packed_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
      })),
    );
    if (packed.length === 0) {
      const summary = `No packed orders ${tokens.length ? 'among those' : 'are waiting on To ship'} — nothing to scan out.${unmatchedSentence(unmatched)}`;
      return { ok: true, answer: unmatched.length
        ? brandReportEnvelope({ artifact: table("Couldn't match", columns, withUnmatched([], unmatched, columns, 'Packed')), summary, answer: summary }, BULK_SCAN_OUT_TOOL)
        : { ok: true, status: 'no_change', summary } };
    }
    const orders = new Set(rows.map((r) => r['Order #'])).size;
    const counted = `${plural(orders, 'order')} on ${plural(packed.length, 'carton')}`;
    return {
      ok: true,
      payload: { shipments: packed.map((s) => ({ shipmentId: Number(s.shipment_id), tracking: s.tracking })), staffId: ctx.staffId },
      preview: (mutationId) =>
        brandReportEnvelope(
          {
            artifact: table(`Scan out ${counted} · confirm`, columns, withUnmatched(rows, unmatched, columns, 'Packed')),
            summary: `Ready to scan out ${counted} (change #${mutationId}); this cannot be undone.${unmatchedSentence(unmatched)} ${confirmAsk(`Scan out ${counted}? This cannot be undone. Reply yes to confirm.${unmatchedSentence(unmatched)}`)}`,
            answer: `Scan out ${counted}? This cannot be undone. Reply yes to confirm.${unmatchedSentence(unmatched)}`,
          },
          BULK_SCAN_OUT_TOOL,
        ),
    };
  },
  settled: async (ctx, payload, mutationId, _ref, deps) => {
    const ids = payload.shipments.map((s) => s.shipmentId);
    const rows = (await deps.query(ctx.organizationId, SCANNED_SQL, [ctx.organizationId, ids])).rows;
    const out = rows.filter((r) => r.scanned_out === true);
    const refused = rows.length - out.length;
    const columns = ['Order #', 'Tracking', 'Item', 'Result'];
    return brandReportEnvelope(
      {
        artifact: table(`Scanned out · ${plural(out.length, 'order')}`, columns, rows.slice(0, TABLE_ROWS).map((r) => ({
          'Order #': String(r.order_id ?? ''),
          Tracking: String(r.tracking ?? ''),
          Item: String(r.product_title ?? ''),
          Result: r.scanned_out === true ? 'Scanned out' : 'Not scanned out (refused: cancelled or delivered)',
        }))),
        summary: `Done: ${plural(out.length, 'order')} scanned out (change #${mutationId}).${refused ? ` ${refused} refused by the scan-out check (cancelled or already delivered).` : ''}`,
        answer: `Done — ${plural(out.length, 'order')} scanned out.${refused ? ` ${refused} refused (cancelled or delivered).` : ''}`,
      },
      BULK_SCAN_OUT_TOOL,
    );
  },
};

/** Spec of every order-status tool, by name — the pending-confirmation note reads it. */
export const ORDER_STATUS_SPECS = {
  [SET_ORDER_FLAG_TOOL]: setFlagSpec,
  [MARK_OOS_TOOL]: oosSpec(true),
  [CLEAR_OOS_TOOL]: oosSpec(false),
  [BULK_SCAN_OUT_TOOL]: scanOutSpec,
} as const;

export function buildOrderStatusTools(
  sessionId: string | null,
  turnStartedAt: Date,
  deps?: ConfirmableWriteDeps,
): Array<AssistantToolDef<z.ZodTypeAny, unknown>> {
  return Object.values(ORDER_STATUS_SPECS).map((spec) =>
    buildConfirmableWriteTool(spec as ConfirmableWriteSpec<z.ZodObject<z.ZodRawShape>, unknown>, sessionId, turnStartedAt, deps),
  );
}

