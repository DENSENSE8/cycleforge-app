/**
 * `POST /api/identify` (+ `GET ?q=`) wire contract. Framework-free: the web
 * shell, the Tauri app and the probe script all parse this shape.
 */

import { z } from 'zod';
import { CONDITION_GRADES } from '@/lib/conditions';

export const IDENTIFY_MAX_LINES = 50;
export const IDENTIFY_MAX_LINE_CHARS = 256;
export const IDENTIFY_MAX_INPUT_CHARS = 20_000;
export const IDENTIFY_DEFAULT_LIMIT = 8;
export const IDENTIFY_MAX_LIMIT = 25;

/** Candidate kinds — the `SearchHitEntityType` vocabulary, so `search_query_log.opened_entity_type` stays one language. */
export const IDENTIFY_KINDS = [
  'order',
  'unit',
  'receiving',
  'sku',
  'repair',
  'fba',
  'warranty',
  'ticket',
  'location',
] as const;
export type IdentifyKind = (typeof IDENTIFY_KINDS)[number];

/** Where the record sits in the workflow — derived with the desks' own predicates. */
export const IDENTIFY_STAGES = ['exception', 'picking', 'to_ship', 'shipped', 'receiving'] as const;
export type IdentifyStage = (typeof IDENTIFY_STAGES)[number];

/** What a token looks like, before any search. A token may carry several. */
export const IDENTIFY_TOKEN_KINDS = [
  'handle',
  'digital_link',
  'gs1',
  'tracking',
  'order_number',
  'marketplace_item',
  'gtin',
  'fnsku',
  'asin',
  'po',
  'serial',
  'sku',
  'model',
  'grade',
  'word',
] as const;
export type IdentifyTokenKind = (typeof IDENTIFY_TOKEN_KINDS)[number];

/** The field a candidate matched on — the "why" line. */
export const IDENTIFY_MATCH_FIELDS = [
  'handle',
  'digital_link',
  'gs1',
  'tracking',
  'order_id',
  'item_number',
  'serial',
  'sku',
  'gtin',
  'fnsku',
  'asin',
  'po',
  'brand',
  'title',
  'keyword',
  'fuzzy',
] as const;
export type IdentifyMatchField = (typeof IDENTIFY_MATCH_FIELDS)[number];

const contextId = z
  .string()
  .trim()
  .max(96)
  .regex(/^[a-z0-9-]+(?:\.[a-z0-9-]+)?$/i, 'context is `<pageId>` or `<pageId>.<sectionId>`');

export const IdentifyRequestSchema = z
  .object({
    /** Anything pasted or scanned; one identifier per line for a batch. */
    q: z
      .string()
      .max(IDENTIFY_MAX_INPUT_CHARS)
      .refine((v) => v.trim().length > 0, 'q is empty'),
    /** The caller's NavContext page id, optionally `.<sectionItemId>` — ranks that scope first. */
    context: contextId.optional(),
    /** Candidates per line. */
    limit: z.coerce.number().int().min(1).max(IDENTIFY_MAX_LIMIT).optional(),
  })
  .strict();
export type IdentifyRequest = z.infer<typeof IdentifyRequestSchema>;

export const IdentifyBrandSchema = z
  .object({
    id: z.number().int().positive(),
    name: z.string().min(1),
    kind: z.string().min(1),
    confidence: z.number().min(0).max(1),
    source: z.string().min(1),
    /** Top brand/franchise ancestor — display "Bose" for a Wave SKU. */
    root: z.object({ id: z.number().int().positive(), name: z.string().min(1) }).strict().nullable(),
  })
  .strict();
export type IdentifyBrand = z.infer<typeof IdentifyBrandSchema>;

export const IdentifyActionSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    /** Where the verb is performed; absent = on the record's own page (`href`). */
    href: z.string().startsWith('/').optional(),
  })
  .strict();
export type IdentifyAction = z.infer<typeof IdentifyActionSchema>;

export const IdentifyCandidateSchema = z
  .object({
    kind: z.enum(IDENTIFY_KINDS),
    entityId: z.number().int().positive(),
    title: z.string(),
    subtitle: z.string().nullable(),
    brand: IdentifyBrandSchema.nullable(),
    confidence: z.number().min(0).max(1),
    matchedOn: z.object({ field: z.enum(IDENTIFY_MATCH_FIELDS), token: z.string().min(1) }).strict(),
    /** Page + sidebar context + record param that open it. */
    href: z.string().startsWith('/'),
    actions: z.array(IdentifyActionSchema),
    stage: z.enum(IDENTIFY_STAGES).nullable(),
    /** True when the candidate belongs to the caller's `context` (ranked first). */
    inContext: z.boolean(),
  })
  .strict();
export type IdentifyCandidate = z.infer<typeof IdentifyCandidateSchema>;

export const IDENTIFY_LINE_MODES = ['single', 'list', 'none'] as const;
export type IdentifyLineMode = (typeof IDENTIFY_LINE_MODES)[number];

export const IdentifyLineSchema = z
  .object({
    input: z.string().min(1),
    /** `single` = one exact, unique identifier match (open it); `list` = ranked candidates. */
    mode: z.enum(IDENTIFY_LINE_MODES),
    tokens: z.array(
      z.object({ text: z.string().min(1), kinds: z.array(z.enum(IDENTIFY_TOKEN_KINDS)) }).strict(),
    ),
    filters: z
      .object({
        brands: z.array(
          z.object({ id: z.number().int().positive(), name: z.string().min(1), token: z.string().min(1) }).strict(),
        ),
        conditions: z.array(z.enum(CONDITION_GRADES)),
      })
      .strict(),
    candidates: z.array(IdentifyCandidateSchema),
  })
  .strict();
export type IdentifyLine = z.infer<typeof IdentifyLineSchema>;

export const IdentifyResponseSchema = z
  .object({
    /** `batch` when the input held more than one line. */
    mode: z.enum(['single', 'list', 'none', 'batch']),
    lines: z.array(IdentifyLineSchema),
    /** More distinct lines were pasted than {@link IDENTIFY_MAX_LINES}; the rest were dropped. */
    truncated: z.boolean(),
    context: z.string().nullable(),
  })
  .strict();
export type IdentifyResponse = z.infer<typeof IdentifyResponseSchema>;
