/** Multimodal PO field extraction for Incoming desk intake. */

import { postToAiProvider } from '@/lib/ai/failover';
import { isSelfHostedAiRuntime } from '@/lib/ai/provider';
import { readDataUrlImagesWithLocalOcr } from '@/lib/document-intake/document-ocr';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  emptyInboundOrderDraft,
  emptyInboundOrderLine,
  type InboundOrderDraft,
  type InboundOrderLine,
  type InboundOrderType,
} from '@/lib/inbound/inbound-order-draft';

type ExtractConfidence = 'high' | 'medium' | 'low';

const DEFAULT_AI_MODEL = 'gemma-4-e4b';
const TOOL_NAME = 'report_po_intake_fields';

const ORDER_SYSTEM_PROMPT = [
  'You extract purchase-order / marketplace order fields from text and/or image(s) into a strict schema.',
  '',
  'Rules:',
  '- Only return fields you actually find. Omit fields entirely if absent.',
  '- Never invent values. If a field is unreadable in the image, omit it.',
  '- When multiple images are provided, treat them as pages of the SAME order',
  '  (scroll captures). Merge line_items across pages; do not invent a second order.',
  '- platform is one of: amazon, ebay, goodwill, walmart, shopify, manual (lowercase).',
  '- order_id is the marketplace order number or PO number.',
  '- line_items must list each product with sku and/or item_name. Include quantity',
  '  only when the document states it clearly — never guess quantity.',
  '- tracking_number is a carrier tracking id when present.',
  '- Confidence: high = explicit label; medium = inferred from layout; low = guessed.',
  '',
  'Call the `report_po_intake_fields` tool exactly once and stop. Do not reply with prose.',
].join('\n');

const PICKUP_SYSTEM_PROMPT = [
  'You extract local-pickup purchasing paperwork from text and/or image(s) into a strict schema.',
  '',
  'Rules:',
  '- Only return facts you can read. Omit unreadable or absent fields; never invent values.',
  '- Multiple images are pages of the SAME pickup record unless the pages clearly identify different sellers or dates.',
  '- seller is the person or vendor CycleForge is buying from.',
  '- order_id is only a printed pickup/order/reference number. Never manufacture one from the seller or date.',
  '- order_date is the pickup/document date in YYYY-MM-DD. Use the document year when shown.',
  '- payment_method is the printed method such as CASH, ZELLE, or VENMO.',
  '- total_paid_cents and unit_cost_cents are integer US cents, never decimal dollars.',
  '- line_items contains every written product row. Preserve condition and missing-parts details.',
  '- condition_grade is BRAND_NEW, USED_A, USED_B, USED_C, or PARTS only when supported by a marked grade.',
  '- parts_status is COMPLETE or MISSING_PARTS only when supported by the form.',
  '- quantity stays omitted when it cannot be read; do not assume one.',
  '',
  'Call the `report_po_intake_fields` tool exactly once and stop. Do not reply with prose.',
].join('\n');

const REPORT_TOOL = {
  type: 'function',
  function: {
    name: TOOL_NAME,
    description: 'Report purchase-order fields extracted from text and/or image.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        platform: {
          type: 'object',
          additionalProperties: false,
          properties: {
            value: { type: 'string' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
          required: ['value', 'confidence'],
        },
        order_id: {
          type: 'object',
          additionalProperties: false,
          properties: {
            value: { type: 'string' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
          required: ['value', 'confidence'],
        },
        seller: {
          type: 'object',
          additionalProperties: false,
          properties: {
            value: { type: 'string' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
          required: ['value', 'confidence'],
        },
        order_date: { type: 'string', description: 'Document date as YYYY-MM-DD.' },
        payment_method: { type: 'string' },
        total_paid_cents: { type: 'integer', minimum: 0, maximum: 1_000_000_000 },
        tracking_number: {
          type: 'object',
          additionalProperties: false,
          properties: {
            value: { type: 'string' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
          required: ['value', 'confidence'],
        },
        carrier_code: {
          type: 'object',
          additionalProperties: false,
          properties: {
            value: { type: 'string' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
          required: ['value', 'confidence'],
        },
        listing_url: {
          type: 'object',
          additionalProperties: false,
          properties: {
            value: { type: 'string' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
          required: ['value', 'confidence'],
        },
        line_items: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              sku: { type: 'string' },
              item_name: { type: 'string' },
              quantity: { type: 'integer', minimum: 1, maximum: 10_000 },
              line_item_id: { type: 'string' },
              listing_url: { type: 'string' },
              unit_cost_cents: { type: 'integer', minimum: 0, maximum: 1_000_000_000 },
              condition_grade: { type: 'string', enum: ['BRAND_NEW', 'USED_A', 'USED_B', 'USED_C', 'PARTS'] },
              parts_status: { type: 'string', enum: ['COMPLETE', 'MISSING_PARTS'] },
              missing_parts_note: { type: 'string' },
              condition_note: { type: 'string' },
              confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            },
          },
        },
        notes: { type: 'string' },
      },
    },
  },
} as const;

type ConfField = { value?: string; confidence?: ExtractConfidence };

type RawExtract = {
  platform?: ConfField;
  order_id?: ConfField;
  seller?: ConfField;
  order_date?: string;
  payment_method?: string;
  total_paid_cents?: number;
  tracking_number?: ConfField;
  carrier_code?: ConfField;
  listing_url?: ConfField;
  line_items?: Array<{
    sku?: string;
    item_name?: string;
    quantity?: number;
    line_item_id?: string;
    listing_url?: string;
    unit_cost_cents?: number;
    condition_grade?: 'BRAND_NEW' | 'USED_A' | 'USED_B' | 'USED_C' | 'PARTS';
    parts_status?: 'COMPLETE' | 'MISSING_PARTS';
    missing_parts_note?: string;
    condition_note?: string;
    confidence?: ExtractConfidence;
  }>;
  notes?: string;
};

interface OpenAiChatResponse {
  choices?: Array<{
    message?: {
      tool_calls?: Array<{
        function?: { name?: string; arguments?: string };
      }>;
      content?: string | null;
    };
  }>;
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

type ExtractPoIntakeInput = {
  /** The operator-selected classifier controls the extraction vocabulary. */
  type?: InboundOrderType;
  /** Pasted / typed order text. */
  text?: string | null;
  /** data:image/...;base64,... or https URL the model can fetch. */
  imageDataUrl?: string | null;
  /** Multiple pages of the SAME order (scroll captures). Max 6. */
  imageDataUrls?: string[] | null;
};

type ExtractPoIntakeResult = {
  draft: InboundOrderDraft;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
};

function fieldValue(f: ConfField | string | undefined): string {
  return String(typeof f === 'string' ? f : f?.value ?? '').trim();
}

function evidenceHasText(evidence: string, value: string): boolean {
  const normalize = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]+/g, '');
  const needle = normalize(value);
  return needle.length >= 2 && normalize(evidence).includes(needle);
}

function evidenceHasMoney(evidence: string, cents: number): boolean {
  const dollars = cents / 100;
  const fixed = dollars.toFixed(2);
  const marked = Number.isInteger(dollars) ? [`$${dollars}`, `$${fixed}`] : [`$${fixed}`];
  return marked.some((value) => evidence.includes(value))
    || new RegExp(`(?:^|[^0-9])${fixed.replace('.', '\\.')}(?:[^0-9]|$)`).test(evidence);
}

export function parseInboundExtractJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('response did not contain a JSON object');
  return JSON.parse(trimmed.slice(start, end + 1));
}

/** The model's report → an InboundOrderDraft. Quantities the model did not say stay null (asked for, never assumed). */
export function draftFromExtractArgs(
  raw: RawExtract,
  type: InboundOrderType = 'PO',
  evidenceText = '',
): InboundOrderDraft {
  const base = emptyInboundOrderDraft(type);
  const requireEvidence = type === 'PICKUP' && Boolean(evidenceText.trim());
  const fallbackListingUrl = fieldValue(raw.listing_url);
  const lines: InboundOrderLine[] = (raw.line_items ?? [])
    .map((li) => {
      const sku = String(li.sku ?? '').trim();
      const title = String(li.item_name ?? '').trim();
      const cost = li.unit_cost_cents != null && Number.isFinite(li.unit_cost_cents) && li.unit_cost_cents >= 0
        ? Math.round(li.unit_cost_cents)
        : null;
      return {
        ...emptyInboundOrderLine(),
        lineKey: String(li.line_item_id ?? '').trim(),
        sku: requireEvidence && sku && !evidenceHasText(evidenceText, sku) ? '' : sku,
        title: requireEvidence && title && !evidenceHasText(evidenceText, title) ? '' : title,
        quantity:
          li.quantity != null && Number.isFinite(li.quantity) && li.quantity >= 1 ? Math.floor(li.quantity) : null,
        unitCostCents: requireEvidence && cost != null && !evidenceHasMoney(evidenceText, cost) ? null : cost,
        listingUrl: String(li.listing_url ?? fallbackListingUrl).trim(),
        conditionGrade: li.condition_grade ?? null,
        partsStatus: li.parts_status ?? null,
        missingPartsNote: String(li.missing_parts_note ?? '').trim(),
        conditionNote: String(li.condition_note ?? '').trim(),
      };
    })
    .filter((l) => l.sku || l.title || l.quantity != null);
  const tracking = fieldValue(raw.tracking_number);
  const reportedOrder = fieldValue(raw.order_id);
  const seller = fieldValue(raw.seller);
  const paymentMethod = String(raw.payment_method ?? '').trim().toUpperCase();
  const paidCents = raw.total_paid_cents != null && Number.isFinite(raw.total_paid_cents) && raw.total_paid_cents >= 0
    ? Math.round(raw.total_paid_cents)
    : null;
  const reportedDate = String(raw.order_date ?? '');
  const evidencedDate = /^\d{4}-\d{2}-\d{2}$/.test(reportedDate)
    && (!requireEvidence || evidenceText.includes(reportedDate.slice(0, 4)));

  return {
    ...base,
    platform: type === 'PICKUP' ? 'manual' : fieldValue(raw.platform).toLowerCase(),
    orderNumber: requireEvidence && (!/^LCPU-[A-Z0-9-]+$/i.test(reportedOrder) || !evidenceHasText(evidenceText, reportedOrder)) ? '' : reportedOrder,
    vendor: requireEvidence && seller && !evidenceHasText(evidenceText, seller) ? '' : seller,
    orderDate: evidencedDate ? reportedDate : null,
    tracking: [{ number: tracking, carrier: fieldValue(raw.carrier_code) }],
    lines: lines.length > 0 ? lines : [{ ...emptyInboundOrderLine(), listingUrl: fallbackListingUrl }],
    notes: String(raw.notes ?? '').trim(),
    pickup: {
      paymentMethod: requireEvidence && paymentMethod && !evidenceHasText(evidenceText, paymentMethod) ? '' : paymentMethod,
      paidCents: requireEvidence && paidCents != null && !evidenceHasMoney(evidenceText, paidCents) ? null : paidCents,
    },
  };
}

function normalizeImageUrls(input: ExtractPoIntakeInput): string[] {
  const fromList = (input.imageDataUrls ?? [])
    .map((u) => String(u ?? '').trim())
    .filter(Boolean);
  const single = String(input.imageDataUrl ?? '').trim();
  const urls = fromList.length > 0 ? fromList : single ? [single] : [];
  return urls.slice(0, 6);
}

export async function extractPoIntake(
  orgId: OrgId,
  input: ExtractPoIntakeInput,
): Promise<ExtractPoIntakeResult> {
  const text = String(input.text ?? '').trim();
  const type = input.type ?? 'PO';
  const imageUrls = normalizeImageUrls(input);
  if (!text && imageUrls.length === 0) {
    throw new Error(`Provide ${type === 'PICKUP' ? 'pickup paperwork' : 'purchase-order text'} or an image to extract`);
  }
  const localOcr = type === 'PICKUP' && imageUrls.length > 0
    ? await readDataUrlImagesWithLocalOcr(orgId, imageUrls)
    : null;
  const localOcrText = localOcr?.text ?? '';

  const userContent: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  > = [];
  if (text || localOcrText) {
    const combined = [text, localOcrText ? `Local OCR transcript:\n${localOcrText}` : ''].filter(Boolean).join('\n\n');
    userContent.push({
      type: 'text',
      text:
        combined.length > 20_000
          ? `${combined.slice(0, 20_000)}\n\n[…truncated]`
          : combined,
    });
  } else if (imageUrls.length > 1) {
    userContent.push({
      type: 'text',
      text: `Extract ${type === 'PICKUP' ? 'local-pickup paperwork' : 'purchase-order'} fields from these ${imageUrls.length} images (pages of one record).`,
    });
  } else {
    userContent.push({
      type: 'text',
      text: `Extract ${type === 'PICKUP' ? 'local-pickup paperwork' : 'purchase-order'} fields from this image.`,
    });
  }
  if (type !== 'PICKUP') {
    for (const url of imageUrls) userContent.push({ type: 'image_url', image_url: { url } });
  }
  // Pickup images never go to a managed provider or a general chat model. The
  // 5070 Ti's dedicated `unlimited-ocr` model reads bytes first; only its OCR
  // transcript is sent to the self-hosted structured extractor.

  const requestBody = {
    model: DEFAULT_AI_MODEL,
    temperature: 0,
    max_tokens: 2048,
    messages: [
      { role: 'system', content: type === 'PICKUP' ? PICKUP_SYSTEM_PROMPT : ORDER_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    tools: [REPORT_TOOL],
    tool_choice: 'required',
  };

  const { res, served } = await postToAiProvider(orgId, 'chat', {
    path: '/chat/completions',
    body: requestBody,
    // Paperwork structuring is private too: Vercel reaches the configured
    // self-hosted chat model after Unlimited OCR. Never spill the transcript
    // to a paid managed model when the local runtime is unavailable.
    selfHostedOnly: type === 'PICKUP',
    headers: {
      'X-Source': type === 'PICKUP' ? 'cycle-forge-local-pickup-extract' : 'cycle-forge-inbound-po-extract',
    },
    buildBody: (config) => {
      if (!isSelfHostedAiRuntime(config)) {
        return { ...requestBody, model: config.model || DEFAULT_AI_MODEL };
      }
      return {
        model: config.model || DEFAULT_AI_MODEL,
        temperature: 0,
        max_tokens: 2048,
        chat_template_kwargs: { enable_thinking: false },
        messages: [
          {
            role: 'system',
            content: `${type === 'PICKUP' ? PICKUP_SYSTEM_PROMPT : ORDER_SYSTEM_PROMPT}\n\nThis runtime has no tool-call parser. Return exactly one JSON object and no prose. Use the report_po_intake_fields parameter names. platform, order_id, and seller use {"value":"...","confidence":"high|medium|low"}; line_items use the direct field names.`,
          },
          { role: 'user', content: userContent },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: TOOL_NAME, schema: REPORT_TOOL.function.parameters },
        },
      };
    },
  });

  const model = served.model || DEFAULT_AI_MODEL;
  if (!res.ok) {
    const errText = (await res.text()).slice(0, 500);
    throw new Error(`AI provider ${served.source} returned ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as OpenAiChatResponse;
  const message = data.choices?.[0]?.message;
  const toolArgs = message?.tool_calls?.[0]?.function?.arguments;
  const content = String(message?.content ?? '').trim();
  if (!toolArgs && !content) throw new Error(`Model "${model}" did not return ${TOOL_NAME} fields`);

  let parsed: unknown;
  try {
    parsed = toolArgs ? JSON.parse(toolArgs) : parseInboundExtractJson(content);
  } catch (err) {
    throw new Error(
      `Model "${model}" returned invalid extraction JSON: ${
        err instanceof Error ? err.message : 'unknown'
      }`,
    );
  }

  return {
    draft: draftFromExtractArgs(parsed as RawExtract, type, [text, localOcrText].filter(Boolean).join('\n')),
    model: data.model ?? model,
    usage: {
      input_tokens: data.usage?.prompt_tokens ?? 0,
      output_tokens: data.usage?.completion_tokens ?? 0,
    },
  };
}
