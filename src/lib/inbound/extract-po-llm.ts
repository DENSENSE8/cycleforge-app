/** Multimodal PO field extraction for Incoming desk intake. */

import { postToAiProvider } from '@/lib/ai/failover';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  EMPTY_PO_INTAKE_DRAFT,
  type PoIntakeConfidence,
  type PoIntakeDraft,
  type PoIntakeLineDraft,
} from '@/lib/inbound/po-intake-draft';

const DEFAULT_AI_MODEL = 'gemma-4-e4b';
const TOOL_NAME = 'report_po_intake_fields';

const SYSTEM_PROMPT = [
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
              confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            },
          },
        },
        notes: { type: 'string' },
      },
    },
  },
} as const;

type ConfField = { value?: string; confidence?: PoIntakeConfidence };

type RawExtract = {
  platform?: ConfField;
  order_id?: ConfField;
  seller?: ConfField;
  tracking_number?: ConfField;
  carrier_code?: ConfField;
  listing_url?: ConfField;
  line_items?: Array<{
    sku?: string;
    item_name?: string;
    quantity?: number;
    line_item_id?: string;
    listing_url?: string;
    confidence?: PoIntakeConfidence;
  }>;
  notes?: string;
};

interface OpenAiChatResponse {
  choices?: Array<{
    message?: {
      tool_calls?: Array<{
        function?: { name?: string; arguments?: string };
      }>;
    };
  }>;
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export type ExtractPoIntakeInput = {
  /** Pasted / typed order text. */
  text?: string | null;
  /** data:image/...;base64,... or https URL the model can fetch. */
  imageDataUrl?: string | null;
  /** Multiple pages of the SAME order (scroll captures). Max 6. */
  imageDataUrls?: string[] | null;
};

export type ExtractPoIntakeResult = {
  draft: PoIntakeDraft;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
};

function fieldValue(f: ConfField | undefined): string {
  return String(f?.value ?? '').trim();
}

export function draftFromExtractArgs(raw: RawExtract): PoIntakeDraft {
  const base = EMPTY_PO_INTAKE_DRAFT();
  const platform = fieldValue(raw.platform).toLowerCase() || base.platform;
  const fallbackListingUrl = fieldValue(raw.listing_url);
  const lines: PoIntakeLineDraft[] = (raw.line_items ?? [])
    .map((li) => ({
      sku: String(li.sku ?? '').trim(),
      itemName: String(li.item_name ?? '').trim(),
      quantity:
        li.quantity != null && Number.isFinite(li.quantity) && li.quantity >= 1
          ? String(Math.floor(li.quantity))
          : '',
      lineItemId: String(li.line_item_id ?? '').trim(),
      listingUrl: String(li.listing_url ?? fallbackListingUrl).trim(),
    }))
    .filter((l) => l.sku || l.itemName || l.quantity);

  return {
    ...base,
    platform,
    orderId: fieldValue(raw.order_id),
    seller: fieldValue(raw.seller),
    trackingNumber: fieldValue(raw.tracking_number),
    carrierCode: fieldValue(raw.carrier_code),
    lines: lines.length > 0
      ? lines
      : [{ ...base.lines[0]!, listingUrl: fallbackListingUrl }],
    notes: String(raw.notes ?? '').trim(),
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
  const imageUrls = normalizeImageUrls(input);
  if (!text && imageUrls.length === 0) {
    throw new Error('Provide purchase-order text or an image to extract');
  }

  const userContent: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  > = [];
  if (text) {
    userContent.push({
      type: 'text',
      text:
        text.length > 12_000
          ? `${text.slice(0, 12_000)}\n\n[…truncated]`
          : text,
    });
  } else if (imageUrls.length > 1) {
    userContent.push({
      type: 'text',
      text: `Extract purchase-order fields from these ${imageUrls.length} images (pages of one order).`,
    });
  } else {
    userContent.push({
      type: 'text',
      text: 'Extract purchase-order fields from this image.',
    });
  }
  for (const url of imageUrls) {
    userContent.push({
      type: 'image_url',
      image_url: { url },
    });
  }

  const requestBody = {
    model: DEFAULT_AI_MODEL,
    temperature: 0,
    max_tokens: 2048,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    tools: [REPORT_TOOL],
    tool_choice: 'required',
  };

  const { res, served } = await postToAiProvider(orgId, 'chat', {
    path: '/chat/completions',
    body: requestBody,
    headers: {
      'content-type': 'application/json',
      'X-Source': 'cycle-forge-inbound-po-extract',
    },
    buildBody: (config) => ({
      ...requestBody,
      model: config.model || DEFAULT_AI_MODEL,
    }),
  });

  const model = served.model || DEFAULT_AI_MODEL;
  if (!res.ok) {
    const errText = (await res.text()).slice(0, 500);
    throw new Error(`AI provider ${served.source} returned ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as OpenAiChatResponse;
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall?.function?.arguments) {
    throw new Error(`Model "${model}" did not return a ${TOOL_NAME} tool call`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(toolCall.function.arguments);
  } catch (err) {
    throw new Error(
      `Model "${model}" returned invalid JSON in tool args: ${
        err instanceof Error ? err.message : 'unknown'
      }`,
    );
  }

  return {
    draft: draftFromExtractArgs(parsed as RawExtract),
    model: data.model ?? model,
    usage: {
      input_tokens: data.usage?.prompt_tokens ?? 0,
      output_tokens: data.usage?.completion_tokens ?? 0,
    },
  };
}
