/**
 * Shipping labels from the chat:
 *
 *   quote_label_rates  GREEN — order # (+ the operator's parcel words) → a fresh
 *                      ShipStation quote as an inline rate table, cheapest and
 *                      fastest marked; a missing weight is a "Still needed" ask.
 *   buy_label          confirm-before-write — re-quotes server-side, picks the
 *                      rate the operator named, and files the exact carrier /
 *                      service / price FROM THE QUOTE for a yes on a later turn.
 *                      The yes buys it (tracking on the order, label PDF in
 *                      documents → opened in the rail, ledger row), idempotent.
 *   void_label         confirm-before-write — a label bought in CycleForge,
 *                      behind the same PIN step-up the desk's void route needs.
 *   reprint            print_order_paperwork (unchanged).
 *
 * The model passes identifiers and the operator's words only — never a price,
 * rate id or address. Test-label mode (dev / sandbox org) is enforced by the
 * engine (`src/lib/shipping/shipstation/test-mode.ts`).
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { OrgId } from '@/lib/tenancy/constants';
import { brandReportEnvelope } from '@/lib/assistant/tool-artifact';
import type { ArtifactDocument } from '@/lib/assistant/ui-artifacts';
import { LABEL_PURPOSES, type LabelPurpose } from '@/lib/shipping/label-purpose';
import { shipStationCarrierToStored } from '@/lib/shipping/carrier-resolution';
import {
  chooseRate,
  formatMoney,
  markRates,
  parseParcelDimensions,
  parseParcelWeightOz,
  rateTotal,
} from '@/lib/shipping/label-rate-choice';
import type { ChatLabelBuyPayload, ChatLabelQuote, ChatLabelVoidPayload, VoidableLabel } from '@/lib/shipping/order-label-chat';
import type { Parcel, ShippingRateOption } from '@/lib/shipping/shipstation/types';
import {
  buildConfirmableWriteTool,
  type ConfirmableWriteDeps,
  type ConfirmableWriteSpec,
  type ProposeOutcome,
} from './confirmable-write';
import { cleanOrderRef, findOrderRowsByRef } from './order-document-tools';
import type { AssistantToolCtx, AssistantToolDef, AssistantToolDeps } from './types';

export const QUOTE_LABEL_RATES_TOOL = 'quote_label_rates';
export const BUY_LABEL_TOOL = 'buy_label';
export const VOID_LABEL_TOOL = 'void_label';

// The shipping domain module is `server-only` (throws outside the Next server) —
// loaded on call so this registry stays importable from node:test.
const shipping = () => import('@/lib/shipping/order-label-chat');

// ─── Shared inputs ──────────────────────────────────────────────────────────

const orderField = z.string().trim().min(1).max(120).describe('The order number exactly as the user typed it.');
const parcelFields = {
  weight: z.string().max(60).optional().describe('Parcel weight in the user\'s own words WITH its unit, e.g. "2 lb", "20 oz", "1.2 kg". Never convert it.'),
  dimensions: z.string().max(60).optional().describe('Box size in the user\'s words, e.g. "12x10x4" or "30x20x10 cm".'),
  purpose: z
    .enum(LABEL_PURPOSES)
    .default('outbound')
    .describe('outbound (default) to the customer; return = a return label from the customer\'s stored address back to the warehouse; replacement = a second parcel to the customer\'s stored address.'),
};

const PURPOSE_FACE: Record<LabelPurpose, string> = { outbound: 'Label', return: 'Return label', replacement: 'Replacement label' };

type ParcelWords = { weightOz: number | null; dimensions: Parcel['dimensions'] | null; unreadable: string[] };

function readParcelWords(input: { weight?: string; dimensions?: string }): ParcelWords {
  const unreadable: string[] = [];
  const weightOz = input.weight ? parseParcelWeightOz(input.weight) : null;
  if (input.weight && weightOz == null) unreadable.push(`Weight with a unit — "${input.weight}" is not one (e.g. "2 lb" or "20 oz")`);
  const dimensions = input.dimensions ? parseParcelDimensions(input.dimensions) : null;
  if (input.dimensions && !dimensions) unreadable.push(`Dimensions as L×W×H — "${input.dimensions}" is not (e.g. "12x10x4")`);
  return { weightOz, dimensions, unreadable };
}

function parcelFace(parcel: Parcel): string {
  const w = parcel.weight.unit === 'ounce' ? `${parcel.weight.value} oz` : `${parcel.weight.value} ${parcel.weight.unit}`;
  const d = parcel.dimensions;
  return d ? `${w}, ${d.length}×${d.width}×${d.height} ${d.unit === 'centimeter' ? 'cm' : 'in'}` : w;
}

/** "USPS Ground Advantage", not "USPS USPS Ground Advantage" — most service names already carry the carrier. */
function serviceFace(carrierName: string, serviceName: string): string {
  return serviceName.toLowerCase().startsWith(carrierName.toLowerCase()) ? serviceName : `${carrierName} ${serviceName}`;
}

/** A ledger row's codes, readable: stamps_com + usps_ground_advantage → "USPS Ground Advantage". */
function storedServiceFace(carrierCode: string | null, serviceCode: string | null): string {
  const carrier = shipStationCarrierToStored(carrierCode) ?? carrierCode ?? '';
  const service = (serviceCode ?? '')
    .split('_')
    .filter(Boolean)
    .map((w) => (/^(usps|ups|dhl|fedex)$/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
  return service ? serviceFace(carrier, service) : carrier;
}

function rateFace(r: Pick<ShippingRateOption, 'carrierName' | 'serviceName' | 'deliveryDays'>, total: number, currency: string): string {
  const days = r.deliveryDays != null ? ` (${r.deliveryDays} day${r.deliveryDays === 1 ? '' : 's'})` : '';
  return `${serviceFace(r.carrierName, r.serviceName)} ${formatMoney(total, currency)}${days}`;
}

function modeLine(q: { testMode: boolean; sandbox: boolean }): string {
  if (!q.testMode) return q.sandbox ? 'This ShipStation key is a sandbox key: labels bought here are TEST labels.' : '';
  return q.sandbox
    ? 'Test mode: a label bought here is a free ShipStation TEST label (no postage).'
    : 'Test mode without a ShipStation sandbox key: the rates are real, but buying is blocked in this environment — a purchase will be refused, no postage is ever charged.';
}

type OrderPick = { ok: true; orderId: number; orderRef: string } | { ok: false; message: string };

async function pickOrder(query: AssistantToolDeps['query'], orgId: OrgId, typed: string): Promise<OrderPick> {
  const ref = cleanOrderRef(typed);
  if (!ref) return { ok: false, message: 'The order number is empty.' };
  const rows = await findOrderRowsByRef({ query }, orgId, ref);
  if (rows.length === 0) return { ok: false, message: `No order "${ref}" exists in this workspace.` };
  return { ok: true, orderId: Number(rows[0].id), orderRef: String(rows[0].order_id ?? '').trim() || ref };
}

/** The Still-needed ask (plain, for the model to relay as one question). */
function stillNeeded(orderRef: string, q: Extract<ChatLabelQuote, { kind: 'needs' }> | null, unreadable: string[]) {
  const items = [...unreadable];
  if (q?.missing.includes('ship_to')) items.push('A ship-to address on the order (add the customer\'s shipping address on the order — addresses are never taken in chat)');
  if (q?.missing.includes('weight')) items.push('Parcel weight with a unit (e.g. "2 lb")');
  if (q?.missing.includes('weight') && q.dimensionsMissing) items.push('Box dimensions L×W×H in inches (optional, for exact UPS/FedEx rates)');
  return {
    quoted: false,
    order: orderRef,
    stillNeeded: items,
    summary: `Still needed for order ${orderRef}: ${items.join('; ')}. Ask the user one short question for exactly this, ending with a question mark. When they answer, call ${QUOTE_LABEL_RATES_TOOL} again with order "${orderRef}" and their words as weight / dimensions.`,
  };
}

// ─── quote_label_rates (GREEN) ──────────────────────────────────────────────

const quoteInput = z.object({ order: orderField, ...parcelFields });

export const quoteLabelRates: AssistantToolDef<typeof quoteInput> = {
  name: QUOTE_LABEL_RATES_TOOL,
  description:
    'Shipping label RATES for an order: "rates for order 4899", "how much to ship …", "quote a label", "return label for …". Pass the order number as typed, plus weight / dimensions only in the user\'s own words when they gave them. Shows an inline table (carrier, service, days, price; cheapest and fastest marked) from a live ShipStation quote, or says what is still needed (usually the weight). Never buys — buying is buy_label.',
  permission: 'shipping.buy_label',
  inputSchema: quoteInput,
  run: async (input, ctx, deps) => {
    const order = await pickOrder(deps.query, ctx.organizationId, input.order);
    if (!order.ok) return { quoted: false, order: input.order, summary: order.message };
    const words = readParcelWords(input);
    if (words.unreadable.length > 0) return stillNeeded(order.orderRef, null, words.unreadable);
    // A live ShipStation quote: hand the round's batch connection back first.
    await deps.releaseBatch?.();
    const q = await (await shipping()).quoteChatLabel(ctx.organizationId, {
      orderId: order.orderId,
      purpose: input.purpose,
      weightOz: words.weightOz,
      dimensions: words.dimensions,
    });
    if (q.kind === 'needs') return stillNeeded(order.orderRef, q, []);
    if (q.kind === 'unavailable') {
      return { quoted: false, order: order.orderRef, code: q.code, summary: `Could not get label rates for order ${order.orderRef}: ${q.error}` };
    }
    if (q.rates.length === 0) {
      return {
        quoted: false,
        order: order.orderRef,
        summary: `ShipStation returned no rates for order ${order.orderRef} (${parcelFace(q.parcel)} to ${q.destination}).${q.invalid.length ? ` Carriers said: ${q.invalid.join('; ')}.` : ''}`,
      };
    }

    const marks = markRates(q.rates);
    const shown = q.rates.slice(0, 12);
    const artifact = {
      kind: 'table' as const,
      title: `${PURPOSE_FACE[input.purpose]} rates · Order ${order.orderRef}`.slice(0, 120),
      columns: ['Pick', 'Carrier', 'Service', 'Days', 'Price'],
      rows: shown.map((r) => ({
        Pick: [r.rateId === marks.cheapest ? 'Cheapest' : null, r.rateId === marks.fastest ? 'Fastest' : null].filter(Boolean).join(' · ') || null,
        Carrier: r.carrierName,
        Service: r.serviceName,
        Days: r.deliveryDays ?? null,
        Price: formatMoney(rateTotal(r), r.currency),
      })),
      entityHint: 'shipping rate',
      identity: {
        title: `Order ${order.orderRef}`.slice(0, 120),
        subtitle: `${PURPOSE_FACE[input.purpose]} to ${q.destination} · ${parcelFace(q.parcel)}`.slice(0, 160),
        ids: [{ label: 'Order' as const, value: order.orderRef.slice(0, 80) }],
        chips: q.testMode || q.sandbox ? ['Test mode'] : undefined,
      },
    };
    const cheapest = q.rates.find((r) => r.rateId === marks.cheapest)!;
    const fastest = q.rates.find((r) => r.rateId === marks.fastest);
    const summary = [
      `${shown.length} rate${shown.length === 1 ? '' : 's'} for order ${order.orderRef} (${PURPOSE_FACE[input.purpose].toLowerCase()} to ${q.destination}, ${parcelFace(q.parcel)}) are in the table.`,
      `Cheapest: ${rateFace(cheapest, rateTotal(cheapest), cheapest.currency)}.`,
      fastest && fastest.rateId !== cheapest.rateId ? `Fastest: ${rateFace(fastest, rateTotal(fastest), fastest.currency)}.` : '',
      q.parcel.dimensions ? '' : 'No box dimensions on file — rates are by weight only.',
      modeLine(q),
      `To buy, the user names one ("buy the cheapest", "USPS Priority") → buy_label with the same order${input.weight || input.dimensions ? ', weight and dimensions' : ''}${input.purpose !== 'outbound' ? ` and purpose "${input.purpose}"` : ''}.`,
    ]
      .filter(Boolean)
      .join(' ');
    return brandReportEnvelope({ artifact, summary }, QUOTE_LABEL_RATES_TOOL);
  },
};

// ─── buy_label (confirm-before-write) ───────────────────────────────────────

const buyFields = z.object({
  order: orderField.optional(),
  rate: z
    .string()
    .trim()
    .max(120)
    .optional()
    .describe('Which rate, in the user\'s words: "cheapest", "fastest", or the carrier / service ("USPS Priority", "UPS Ground"). Never a price.'),
  ...parcelFields,
});

const buySpec: ConfirmableWriteSpec<typeof buyFields, ChatLabelBuyPayload> = {
  name: BUY_LABEL_TOOL,
  kind: 'shipping.buy_label',
  permission: 'shipping.buy_label',
  description:
    'BUY a shipping label for an order at a rate the user picked from quote_label_rates: "buy the cheapest", "buy USPS Priority for order 4899", "buy a return label". Two steps: action "propose" re-quotes and shows exactly the carrier, service and price that will be charged and returns needs_confirmation — ASK the user to confirm and stop. Next message: "confirm" (yes) or "cancel" (no). The purchase writes the tracking to the order and opens the label PDF beside the chat. Pass order, rate words, and the same weight / dimensions / purpose used for the quote. Never pass a price.',
  fields: buyFields,
  propose: async (ctx, input, deps): Promise<ProposeOutcome<ChatLabelBuyPayload>> => {
    if (!input.order) return { ok: false, error: 'Which order? Pass the order number.' };
    if (!input.rate) return { ok: false, error: 'Which rate? Show the rates with quote_label_rates and ask the user to pick one (cheapest, fastest, or a service).' };
    const order = await pickOrder((o, t, p) => deps.query(o, t, p ?? []), ctx.organizationId, input.order);
    if (!order.ok) return { ok: false, error: order.message };
    const words = readParcelWords(input);
    if (words.unreadable.length > 0) return { ok: true, answer: stillNeeded(order.orderRef, null, words.unreadable) };

    const q = await (await shipping()).quoteChatLabel(ctx.organizationId, {
      orderId: order.orderId,
      purpose: input.purpose,
      weightOz: words.weightOz,
      dimensions: words.dimensions,
    });
    if (q.kind === 'needs') return { ok: true, answer: stillNeeded(order.orderRef, q, []) };
    if (q.kind === 'unavailable') return { ok: false, error: `Could not quote order ${order.orderRef}: ${q.error} Nothing was bought.` };

    const picked = chooseRate(q.rates, input.rate);
    if (!picked.ok) {
      const options = picked.candidates.slice(0, 8).map((r) => rateFace(r, rateTotal(r), r.currency)).join('; ');
      return {
        ok: false,
        error:
          picked.reason === 'no_rates'
            ? `ShipStation returned no rates for order ${order.orderRef}. Nothing was bought.`
            : `"${input.rate}" ${picked.reason === 'ambiguous' ? 'matches more than one service' : 'matches no rate'} for order ${order.orderRef}. Ask the user to pick one of: ${options}.`,
      };
    }
    const r = picked.rate;
    const total = rateTotal(r);
    const payload: ChatLabelBuyPayload = {
      orderId: order.orderId,
      orderRef: order.orderRef,
      purpose: input.purpose,
      clientEventId: `chat-label:${randomUUID()}`,
      rateId: r.rateId,
      carrierId: r.carrierId,
      carrierCode: r.carrierCode,
      carrierName: r.carrierName,
      serviceCode: r.serviceCode,
      serviceName: r.serviceName,
      total,
      currency: r.currency,
      deliveryDays: r.deliveryDays ?? null,
      destination: q.destination,
      weightOz: q.parcel.weight.unit === 'ounce' ? q.parcel.weight.value : words.weightOz,
      dimensions: q.parcel.dimensions ?? null,
      testMode: q.testMode,
      sandbox: q.sandbox,
      staffId: ctx.staffId,
    };
    const test = q.sandbox;
    return {
      ok: true,
      payload,
      preview: (mutationId) =>
        brandReportEnvelope(
          {
            artifact: {
              kind: 'table',
              title: `Confirm ${test ? 'TEST ' : ''}${PURPOSE_FACE[input.purpose].toLowerCase()} · Order ${order.orderRef}`.slice(0, 120),
              columns: ['Carrier', 'Service', 'Days', 'Price', 'To', 'Parcel', 'Postage'],
              rows: [
                {
                  Carrier: r.carrierName,
                  Service: r.serviceName,
                  Days: r.deliveryDays ?? null,
                  Price: formatMoney(total, r.currency),
                  To: q.destination,
                  Parcel: parcelFace(q.parcel),
                  Postage: test ? 'TEST label — no postage' : q.testMode ? 'Blocked here (no sandbox key)' : 'Live — charged to ShipStation',
                },
              ],
              entityHint: 'label purchase',
            },
            summary: [
              `needs_confirmation (proposal ${mutationId}): buy a ${test ? 'TEST ' : ''}${PURPOSE_FACE[input.purpose].toLowerCase()} for order ${order.orderRef}: ${rateFace(r, total, r.currency)} to ${q.destination}.`,
              modeLine(q),
              'Say exactly this carrier, service and price back, ask the user to confirm (yes / no), and stop. Do not buy it yourself.',
            ]
              .filter(Boolean)
              .join(' '),
          },
          BUY_LABEL_TOOL,
        ),
    };
  },
  settled: async (ctx, payload, _mutationId, _targetRef, deps) => {
    const row = (
      await deps.query(
        ctx.organizationId,
        `SELECT tracking_number, carrier_code, service_code, cost, currency, label_document_id, is_test, shipment_id
           FROM shipping_label_purchases
          WHERE organization_id = $1 AND client_event_id = $2
          LIMIT 1`,
        [ctx.organizationId, payload.clientEventId],
      )
    ).rows[0];
    if (!row) return { ok: false, error: 'The purchase finished but its ledger row could not be read back — check the order\'s labels.' };
    const tracking = String(row.tracking_number ?? '');
    const cost = row.cost == null ? payload.total : Number(row.cost);
    const currency = String(row.currency ?? payload.currency);
    const test = row.is_test === true;
    const face = `${test ? 'TEST ' : ''}${PURPOSE_FACE[payload.purpose].toLowerCase()}`;
    const where = payload.purpose === 'return' ? 'Return labels are not stored with the order paperwork.' : 'The label PDF is open beside the chat — to print it, print_order_paperwork with this order.';
    const summary = `Bought the ${face} for order ${payload.orderRef}: ${serviceFace(payload.carrierName, payload.serviceName)}, tracking ${tracking}, ${formatMoney(cost, currency)}${test ? ' (test — no postage charged)' : ''}.${payload.purpose === 'return' ? '' : ' The tracking is on the order.'} ${where}`;
    const documentId = row.label_document_id == null ? null : Number(row.label_document_id);
    if (documentId == null) {
      return { ok: true, status: 'purchased', tracking, summary: payload.purpose === 'return' ? summary : `${summary} The label PDF could not be stored in documents, so nothing opened beside the chat — open it from ShipStation.` };
    }
    const artifact: ArtifactDocument = {
      kind: 'document',
      title: `Order ${payload.orderRef} · ${test ? 'TEST ' : ''}Shipping label`.slice(0, 120),
      subtitle: `${serviceFace(payload.carrierName, payload.serviceName)} · ${tracking}`.slice(0, 200),
      documents: [{ id: `doc:${documentId}`, label: 'Shipping label', docType: 'shipping_label', mime: 'application/pdf', url: `/api/documents/${documentId}/content` }],
      entityHint: 'order',
    };
    return brandReportEnvelope({ artifact, summary }, BUY_LABEL_TOOL);
  },
  pendingPhrase: (p) => `buy the ${p.sandbox ? 'TEST ' : ''}${serviceFace(p.carrierName, p.serviceName)} ${PURPOSE_FACE[p.purpose].toLowerCase()} for order ${p.orderRef} at ${formatMoney(p.total, p.currency)}`,
};

// ─── void_label (confirm-before-write, PIN step-up) ────────────────────────

const VOID_STEP_UP_SCOPE = 'shipping.void_label';
const STEP_UP_REFUSAL =
  'Voiding a label needs your PIN (step-up), and it has not been confirmed on this session. Nothing was voided. Tell the user to void it from the order\'s label panel (which asks for the PIN), or confirm the PIN there and then ask again.';

const voidFields = z.object({
  order: orderField.optional(),
  tracking: z.string().trim().max(80).optional().describe('Which label, when the order has several: its tracking number as typed.'),
  reason: z.string().trim().max(300).optional().describe('Why, in the user\'s words (e.g. "wrong box size").'),
});

const voidSpec: ConfirmableWriteSpec<typeof voidFields, ChatLabelVoidPayload> = {
  name: VOID_LABEL_TOOL,
  kind: 'shipping.void_label',
  permission: 'shipping.void_label',
  description:
    'VOID a shipping label bought in CycleForge for an order (carrier refund request; the tracking comes off the order and the label document is removed): "void the label on order 4899". Two steps: action "propose" shows exactly which label will be voided and returns needs_confirmation — ASK the user to confirm and stop. Next message: "confirm" (yes) or "cancel" (no). To reprint a label instead, use print_order_paperwork.',
  fields: voidFields,
  propose: async (ctx, input, deps): Promise<ProposeOutcome<ChatLabelVoidPayload>> => {
    if (!(await ctx.hasStepUp?.(VOID_STEP_UP_SCOPE))) return { ok: false, error: STEP_UP_REFUSAL };
    if (!input.order) return { ok: false, error: 'Which order? Pass the order number.' };
    const order = await pickOrder((o, t, p) => deps.query(o, t, p ?? []), ctx.organizationId, input.order);
    if (!order.ok) return { ok: false, error: order.message };
    const mod = await shipping();
    const all = await mod.listVoidableLabels(ctx.organizationId, order.orderId);
    const typed = input.tracking?.replace(/\s+/g, '').toUpperCase();
    const labels: VoidableLabel[] = typed ? all.filter((l) => (l.trackingNumber ?? '').replace(/\s+/g, '').toUpperCase() === typed) : all;
    if (labels.length === 0) {
      return {
        ok: false,
        error: typed
          ? `Order ${order.orderRef} has no active label with tracking ${input.tracking}${all.length ? ` (its labels: ${all.map((l) => l.trackingNumber).join(', ')})` : ''}. Nothing was voided.`
          : `Order ${order.orderRef} has no active label bought in CycleForge to void. Nothing was voided.`,
      };
    }
    if (labels.length > 1) {
      return { ok: false, error: `Order ${order.orderRef} has ${labels.length} active labels — ask which one: ${labels.map((l) => `${l.trackingNumber} (${l.purpose})`).join(', ')}.` };
    }
    const label = labels[0];
    let testMode: boolean;
    try {
      testMode = (await mod.chatLabelEngine.resolve(ctx.organizationId)).testMode;
    } catch (e) {
      return { ok: false, error: `${e instanceof Error ? e.message : String(e)} Nothing was voided.` };
    }
    if (testMode && !label.isTest) {
      return { ok: false, error: `Test-label mode: only TEST labels can be voided in this environment, and ${label.trackingNumber} on order ${order.orderRef} is a live label. Nothing was voided.` };
    }
    const payload: ChatLabelVoidPayload = {
      orderId: order.orderId,
      orderRef: order.orderRef,
      purchaseId: label.purchaseId,
      labelId: label.labelId,
      trackingNumber: label.trackingNumber,
      carrierCode: label.carrierCode,
      serviceCode: label.serviceCode,
      cost: label.cost,
      currency: label.currency,
      isTest: label.isTest,
      reason: input.reason || 'Voided from chat',
      staffId: ctx.staffId,
    };
    const price = label.cost != null ? formatMoney(label.cost, label.currency ?? 'USD') : null;
    return {
      ok: true,
      payload,
      preview: (mutationId) =>
        brandReportEnvelope(
          {
            artifact: {
              kind: 'table',
              title: `Confirm void${label.isTest ? ' (TEST label)' : ''} · Order ${order.orderRef}`.slice(0, 120),
              columns: ['Tracking', 'Service', 'Paid', 'Kind', 'Bought'],
              rows: [
                {
                  Tracking: label.trackingNumber,
                  Service: storedServiceFace(label.carrierCode, label.serviceCode),
                  Paid: price,
                  Kind: `${PURPOSE_FACE[label.purpose]}${label.isTest ? ' · TEST' : ''}`,
                  Bought: label.createdAt.slice(0, 10),
                },
              ],
              entityHint: 'label',
            },
            summary: `needs_confirmation (proposal ${mutationId}): void ${label.isTest ? 'the TEST' : 'the'} label ${label.trackingNumber} on order ${order.orderRef}${price ? ` (${price})` : ''}. Ask the user to confirm (yes / no) and stop.`,
          },
          VOID_LABEL_TOOL,
        ),
    };
  },
  settled: async (_ctx, payload) => ({
    ok: true,
    status: 'voided',
    summary: `Voided the ${payload.isTest ? 'TEST ' : ''}label ${payload.trackingNumber} on order ${payload.orderRef}${payload.isTest ? '' : ' — the carrier refund was requested'}. Its tracking is off the order and the label document is removed.`,
  }),
  pendingPhrase: (p) => `void the ${p.isTest ? 'TEST ' : ''}label ${p.trackingNumber} on order ${p.orderRef}`,
};

/** For the next turn's "PENDING CONFIRMATION" note (pending-confirmation.ts). */
export const LABEL_WRITE_SPECS = { [BUY_LABEL_TOOL]: buySpec, [VOID_LABEL_TOOL]: voidSpec } as const;

type WriteTool = AssistantToolDef<z.ZodTypeAny, unknown>;

export function buildLabelWriteTools(
  sessionId: string | null,
  turnStartedAt: Date,
  deps?: ConfirmableWriteDeps,
): WriteTool[] {
  const voidTool = buildConfirmableWriteTool(voidSpec, sessionId, turnStartedAt, deps);
  return [
    buildConfirmableWriteTool(buySpec, sessionId, turnStartedAt, deps),
    {
      ...voidTool,
      // The PIN is re-checked on the yes, not only when the void was proposed.
      run: async (input: unknown, ctx: AssistantToolCtx, toolDeps: AssistantToolDeps) => {
        const action = z.object({ action: z.string().optional() }).passthrough().parse(input).action;
        if (action === 'confirm' && !(await ctx.hasStepUp?.(VOID_STEP_UP_SCOPE))) return { ok: false, error: STEP_UP_REFUSAL };
        return voidTool.run(input, ctx, toolDeps);
      },
    },
  ];
}
