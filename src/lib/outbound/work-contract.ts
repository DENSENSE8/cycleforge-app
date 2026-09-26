import { z } from 'zod';

export const MAX_OUTBOUND_WORK_PAGE_SIZE = 100;

/** §3 saved work views. */
export const OUTBOUND_SAVED_VIEW_IDS = ['all', 'triage', 'ready', 'pending', 'at-risk', 'ship-now', 'exceptions', 'completed'] as const;
export const outboundSavedViewIdSchema = z.enum(OUTBOUND_SAVED_VIEW_IDS);
export type OutboundSavedViewId = z.infer<typeof outboundSavedViewIdSchema>;

export const outboundSavedViewSchema = z.object({
  id: outboundSavedViewIdSchema,
  label: z.string().min(1),
  /** States the server rule, so an operator can tell why a record is listed. */
  membership: z.string().min(1),
}).strict();
export type OutboundSavedView = z.infer<typeof outboundSavedViewSchema>;

/** Stable order: these are the queue's first controls in every client. */
export const OUTBOUND_SAVED_VIEWS: readonly OutboundSavedView[] = Object.freeze([
  { id: 'all', label: 'All', membership: 'Every outbound record the caller may read.' },
  { id: 'triage', label: 'Triage', membership: 'Not packed, shipped or acknowledged yet; includes orders still waiting on catalog pairing.' },
  { id: 'ready', label: 'Ready', membership: 'No unit picked, packed, labeled or scanned out, and not out of stock.' },
  { id: 'pending', label: 'Pending', membership: 'A unit is picked, packed or labeled without a matched or applied label.' },
  { id: 'at-risk', label: 'At risk', membership: 'Not scanned out, and either urgent or within two hours of its assignment deadline.' },
  { id: 'ship-now', label: 'Ship now', membership: 'Packed or labeled with a matched or applied label.' },
  { id: 'exceptions', label: 'Exceptions', membership: 'Out of stock, or the latest label ingestion is quarantined or failed.' },
  { id: 'completed', label: 'Completed', membership: 'A unit has been scanned out.' },
].map((view) => outboundSavedViewSchema.parse(view)));

/**
 * Public, client-safe request contract. Tenant identity is deliberately not a
 * query parameter: the authenticated server session is the only authority.
 */
export const outboundWorkQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_OUTBOUND_WORK_PAGE_SIZE).default(50),
  /** Tenant-scoped operational lookup; identity is still derived from auth. */
  query: z.string().trim().min(1).max(120).optional(),
  /**
   * One order by its internal id (`orders.id`) — the record screen's exact
   * read. Still tenant-scoped and still inside `view`; never a partial match.
   */
  id: z.coerce.number().int().positive().max(2_147_483_647).optional(),
  /** Saved work view; the server, not the client, decides its membership. */
  view: outboundSavedViewIdSchema.default('all'),
}).strict();

export const OUTBOUND_WAREHOUSE_STAGES = ['READY', 'PICKED', 'PACKED', 'LABELED', 'SCANNED_OUT', 'OUT_OF_STOCK'] as const;
export const OUTBOUND_LABEL_STATES = ['NONE', 'RECEIVED', 'STAGED', 'PARSED', 'MATCHED', 'QUARANTINED', 'APPLYING', 'APPLIED', 'FAILED'] as const;
export type OutboundWarehouseStage = (typeof OUTBOUND_WAREHOUSE_STAGES)[number];
export type OutboundLabelState = (typeof OUTBOUND_LABEL_STATES)[number];

/**
 * The route an operator chose when acknowledging an order on the Triage board:
 * PICK = a good unit is in stock → picker → pack; QC = no good unit → picker
 * pulls repair parts → QC → picker → pack. Mirrors `orders_fulfillment_route_chk`.
 */
export const OUTBOUND_FULFILLMENT_ROUTES = ['PICK', 'QC'] as const;
export const outboundFulfillmentRouteSchema = z.enum(OUTBOUND_FULFILLMENT_ROUTES);
export type OutboundFulfillmentRoute = z.infer<typeof outboundFulfillmentRouteSchema>;

/** The server-produced next permitted action (§3). */
export const OUTBOUND_NEXT_ACTION_KINDS = ['START_PICK', 'CONTINUE_FULFILLMENT', 'APPLY_LABEL', 'RESOLVE_EXCEPTION', 'VIEW_RECEIPT'] as const;
export const outboundNextActionKindSchema = z.enum(OUTBOUND_NEXT_ACTION_KINDS);
export type OutboundNextActionKind = z.infer<typeof outboundNextActionKindSchema>;
export const OUTBOUND_NEXT_ACTION_LABELS: Readonly<Record<OutboundNextActionKind, string>> = Object.freeze({
  START_PICK: 'Start pick',
  CONTINUE_FULFILLMENT: 'Continue fulfillment',
  APPLY_LABEL: 'Apply label',
  RESOLVE_EXCEPTION: 'Resolve exception',
  VIEW_RECEIPT: 'View receipt',
});
export const outboundNextActionSchema = z.object({
  kind: outboundNextActionKindSchema,
  label: z.string().min(1),
  command: z.literal('APPLY_LABEL').nullable(),
}).strict();
export type OutboundNextAction = z.infer<typeof outboundNextActionSchema>;

/**
 * One authority for the response shape: the TypeScript type, the runtime
 * contract test and the published OpenAPI component are all derived from this
 * schema, so a field cannot be added to one and missed by the others.
 */
export const outboundWorkItemSchema = z.object({
  id: z.number().int(),
  reference: z.string(),
  source: z.string().nullable(),
  product: z.object({
    title: z.string(),
    sku: z.string().nullable(),
    /** The marketplace listing's item number (`orders.item_number`). */
    itemNumber: z.string().nullable(),
    /** The order is paired to the SKU catalog (`orders.sku_catalog_id` set). Acknowledge refuses an unpaired order. */
    paired: z.boolean(),
    condition: z.string().nullable(),
    quantity: z.string(),
    price: z.string().nullable(),
    /** The SKU's one photo: the Zoho item image, else the catalog image; null when neither exists. */
    thumbnail: z.object({ alt: z.string(), url: z.string().nullable(), version: z.null() }).strict(),
  }).strict(),
  priority: z.object({ urgent: z.boolean(), outOfStock: z.boolean(), shipBy: z.string().nullable() }).strict(),
  warehouseStage: z.enum(OUTBOUND_WAREHOUSE_STAGES),
  tracking: z.object({
    shipmentId: z.string().nullable(), number: z.string().nullable(),
    carrier: z.string().nullable(), category: z.string().nullable(),
  }).strict(),
  label: z.object({ ingestionId: z.number().int().nullable(), state: z.enum(OUTBOUND_LABEL_STATES) }).strict(),
  documents: z.object({ count: z.number().int() }).strict(),
  /** Triage acknowledgment: who acknowledged the order, when, and on which route. All null until acknowledged. */
  acknowledgment: z.object({
    at: z.string().nullable(),
    by: z.number().int().nullable(),
    byName: z.string().nullable(),
    route: outboundFulfillmentRouteSchema.nullable(),
  }).strict(),
  /** Units of this SKU in the org: `ready` = STOCKED or TESTED, `received` = RECEIVED (not yet tested). */
  stock: z.object({ ready: z.number().int(), received: z.number().int() }).strict(),
  /** The order's ONE live shipping label (either/or: */
  shippingLabel: z.object({
    live: z.boolean(),
    documentId: z.number().int().nullable(),
    source: z.string().nullable(),
    tracking: z.string().nullable(),
    carrier: z.string().nullable(),
    shipstationLabelId: z.string().nullable(),
  }).strict(),
  /** Server-derived DISPLAY revision: */
  // `.describe()` (not just the doc-comment): z.toJSONSchema drops JS comments,
  // and a client reading only the published component must still be told this
  // value is not safe to send back as an expected version.
  rowVersion: z.string().describe('Display revision: the latest of the order and allocated-unit timestamps. NOT an optimistic-concurrency token — do not use it as an expected row version.'),
  /** §2.3 optimistic-concurrency token: */
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/).describe('Send this back as the expected fingerprint when invoking a command on this record. Digest (scheme outbound-work/v2) of the material state of the whole LOGICAL ORDER SET this record belongs to: warehouse stage, label state, latest ingestion id and row version, shipment, the set membership, and every active allocation with its unit status. A digest issued under a different scheme version is never accepted, so refresh after a server upgrade rather than replaying a stored token.'),
  /**
   * The already-authorized commands for this record. `nextAction.command` is
   * derived from this same list server-side and must never contradict it; the
   * projection test asserts the equivalence on every row it produces.
   */
  allowedActions: z.array(z.literal('APPLY_LABEL')),
  /** Every saved view this record belongs to, computed by the same SQL that filters the page. */
  views: z.array(outboundSavedViewIdSchema).min(1),
  nextAction: outboundNextActionSchema,
}).strict();
export type OutboundWorkItem = z.infer<typeof outboundWorkItemSchema>;

export const outboundWorkPageSchema = z.object({
  /** The applied saved view; echoed so a client never assumes its request won. */
  view: outboundSavedViewIdSchema,
  /** The server's view catalog. Clients render these controls, they do not author them. */
  views: z.array(outboundSavedViewSchema).min(1),
  items: z.array(outboundWorkItemSchema),
  nextCursor: z.string().nullable(),
}).strict();
export type OutboundWorkPage = z.infer<typeof outboundWorkPageSchema>;

/** Published response components, generated from the schemas above by Zod's own JSON Schema emitter. */
export function buildOutboundWorkComponents(): Record<string, unknown> {
  const { $schema: _itemDialect, ...item } = z.toJSONSchema(outboundWorkItemSchema, { target: 'draft-2020-12' });
  const { $schema: _pageDialect, ...page } = z.toJSONSchema(outboundWorkPageSchema, { target: 'draft-2020-12' });
  return {
    OutboundWorkItem: item,
    // Only the item is referenced rather than inlined; everything else about
    // the page component is generated, so a new page field cannot be forgotten.
    OutboundWorkPage: {
      ...page,
      properties: {
        ...(page.properties as Record<string, unknown>),
        items: { type: 'array', items: { $ref: '#/components/schemas/OutboundWorkItem' } },
      },
    },
  };
}

/** This is intentionally data-only so Swift/OpenAPI generation never imports DB code. */
export function buildOutboundWorkOpenApi(): Record<string, unknown> {
  return {
    '/api/v1/outbound/work': {
      get: {
        parameters: [
          { name: 'cursor', in: 'query', required: false, schema: { type: 'string' } },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: MAX_OUTBOUND_WORK_PAGE_SIZE, default: 50 } },
          { name: 'query', in: 'query', required: false, schema: { type: 'string', minLength: 1, maxLength: 120 } },
          { name: 'id', in: 'query', required: false, description: 'Exactly one order by its internal id; the page then holds that order or nothing.', schema: { type: 'integer', minimum: 1, maximum: 2147483647 } },
          { name: 'view', in: 'query', required: false, description: 'Saved work view; membership is server-defined.', schema: { type: 'string', enum: [...OUTBOUND_SAVED_VIEW_IDS], default: 'all' } },
        ],
        responses: {
          '200': {
            description: 'Tenant-scoped outbound work projection',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/OutboundWorkPage' } } },
          },
          '400': { description: 'Invalid cursor, saved view or page size' },
          '401': { description: 'Authenticated device or session required' },
          '403': { description: 'orders.view permission required' },
        },
      },
    },
  };
}
