import 'server-only';

/**
 * Paste import — text or screenshots of an order → {@link CapturedOrder}s for
 * review. Text goes through the deterministic parser first; the org's model
 * (the same `postToAiProvider` door the PO extractor uses) reads screenshots,
 * and text the parser found no product in. Nothing here writes.
 */

import { postToAiProvider } from '@/lib/ai/failover';
import type { OrgId } from '@/lib/tenancy/constants';
import { emptyCapturedOrder, parseOrderText, type CapturedOrder } from './order-text-parse';

const DEFAULT_AI_MODEL = 'gemma-4-e4b';
const TOOL_NAME = 'report_orders';

const SYSTEM_PROMPT = [
  'You read customer orders (emails, marketplace pages, notes, screenshots) into a strict schema.',
  'Only report what is written. Omit a field you cannot read; never invent a price, address, SKU or quantity.',
  'Several images are pages of the SAME order unless they clearly show different order numbers.',
  `Call the \`${TOOL_NAME}\` tool exactly once and stop.`,
].join('\n');

const str = { type: 'string' } as const;
const REPORT_TOOL = {
  type: 'function',
  function: {
    name: TOOL_NAME,
    description: 'Report every order found, with its customer, ship-to and product lines.',
    parameters: {
      type: 'object',
      properties: {
        orders: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              order_number: str, platform: str, customer_name: str, customer_phone: str, customer_email: str,
              ship_address1: str, ship_address2: str, ship_city: str, ship_state: str, ship_postal_code: str,
              ship_country: str, ship_by: str, tracking_number: str, note: str,
              lines: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    title: str, sku: str, item_number: str, condition: str,
                    quantity: { type: 'number' },
                    unit_price: { type: 'number', description: 'Price EACH in dollars.' },
                  },
                },
              },
            },
          },
        },
      },
      required: ['orders'],
    },
  },
};

type RawOrder = Record<string, unknown> & { lines?: Array<Record<string, unknown>> };

const text = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 300) : '');
const positive = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

function fromModel(raw: RawOrder): CapturedOrder {
  return {
    ...emptyCapturedOrder(),
    orderNumber: text(raw.order_number),
    platform: text(raw.platform),
    customerName: text(raw.customer_name),
    customerPhone: text(raw.customer_phone),
    customerEmail: text(raw.customer_email),
    shipTo: {
      address1: text(raw.ship_address1),
      address2: text(raw.ship_address2),
      city: text(raw.ship_city),
      state: text(raw.ship_state),
      postalCode: text(raw.ship_postal_code),
      country: text(raw.ship_country),
    },
    shipBy: text(raw.ship_by),
    trackingNumber: text(raw.tracking_number),
    note: text(raw.note),
    lines: (raw.lines ?? [])
      .map((l) => {
        const quantity = positive(l.quantity);
        return {
          title: text(l.title),
          sku: text(l.sku),
          itemNumber: text(l.item_number),
          quantity: quantity == null ? null : Math.trunc(quantity),
          unitPrice: positive(l.unit_price),
          condition: text(l.condition),
        };
      })
      .filter((l) => l.title || l.sku || l.itemNumber),
  };
}

async function askModel(orgId: OrgId, input: { text: string | null; imageDataUrls: string[] }): Promise<CapturedOrder[]> {
  const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [
    { type: 'text', text: input.text ? input.text.slice(0, 12_000) : 'Read the order(s) in these images.' },
    ...input.imageDataUrls.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
  ];
  const body = {
    model: DEFAULT_AI_MODEL,
    temperature: 0,
    max_tokens: 2048,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content },
    ],
    tools: [REPORT_TOOL],
    tool_choice: 'required',
  };
  const { res, served } = await postToAiProvider(orgId, 'chat', {
    path: '/chat/completions',
    body,
    headers: { 'content-type': 'application/json', 'X-Source': 'cycle-forge-order-capture' },
    buildBody: (config) => ({ ...body, model: config.model || DEFAULT_AI_MODEL }),
  });
  if (!res.ok) throw new Error(`AI provider ${served.source} returned ${res.status}`);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
  };
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) throw new Error('The model did not report any order');
  const parsed = JSON.parse(args) as { orders?: RawOrder[] };
  return (parsed.orders ?? []).map(fromModel);
}

export interface OrderCaptureResult {
  orders: CapturedOrder[];
  /** `text` = the deterministic parser; `model` = the org's AI provider. */
  source: 'text' | 'model';
}

export async function extractOrderCapture(
  orgId: OrgId,
  input: { text: string | null; imageDataUrls: string[] },
): Promise<OrderCaptureResult> {
  const parsed = input.text ? parseOrderText(input.text) : null;
  if (parsed && parsed.lines.length > 0) return { orders: [parsed], source: 'text' };
  try {
    const orders = await askModel(orgId, input);
    return { orders, source: 'model' };
  } catch (err) {
    // The parser's partial read (a customer, an address) still beats nothing.
    if (parsed) return { orders: [parsed], source: 'text' };
    throw err;
  }
}
