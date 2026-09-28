/**
 * `/api/v1/label-prints` + `/api/v1/paperwork-prints` +
 * `/api/v1/label-ingestions/{id}/{pdf,prints}` wire contract — the Labels &
 * documents desk's print queue (labels · paperwork · printed) and both print
 * logs. Framework-free: the web desk and the desktop shell parse the same
 * shapes. Tenant, actor and "is this a reprint" are server-owned, never client input.
 */
import { z } from 'zod';
import type { LabelIngestionState } from '@/lib/label-ingestions/types';

/** How a print job left the browser (`label_print_events.channel`, `paperwork_print_events.channel`). */
export const LABEL_PRINT_CHANNELS = ['THERMAL_USB', 'THERMAL_SERIAL', 'DESKTOP_HOST', 'BROWSER_DIALOG'] as const;
export type LabelPrintChannel = (typeof LABEL_PRINT_CHANNELS)[number];

/**
 * Labels = stored labels with no print row (oldest arrival first). Paperwork =
 * orders paired to a stored label with a printable packing slip or stored
 * manual not yet printed (oldest first). Printed = printed labels + orders with
 * a paperwork print (each newest print first).
 */
export const LABEL_PRINT_VIEWS = ['labels', 'paperwork', 'printed'] as const;
export type LabelPrintView = (typeof LABEL_PRINT_VIEWS)[number];

/** One Print all press covers at most this many labels (and one queue read returns at most this many rows per list). */
export const MAX_LABEL_PRINT_BATCH = 500;
/** One paperwork press covers at most this many documents (several per order). */
export const MAX_PAPERWORK_PRINT_BATCH = 2000;

export const labelPrintQueueQuerySchema = z.object({
  view: z.enum(LABEL_PRINT_VIEWS).default('labels'),
  limit: z.coerce.number().int().min(1).max(MAX_LABEL_PRINT_BATCH).default(MAX_LABEL_PRINT_BATCH),
}).strict();

/** The print station a batch went to (`readPrintStation()`); both optional — an unknown station logs null. */
const stationFields = {
  stationId: z.string().trim().min(1).max(100).nullable().optional(),
  stationName: z.string().trim().min(1).max(120).nullable().optional(),
};

export const labelPrintRecordBodySchema = z.object({
  batchId: z.uuid(),
  channel: z.enum(LABEL_PRINT_CHANNELS),
  printerName: z.string().trim().min(1).max(120).nullable().optional(),
  ...stationFields,
  ingestionIds: z
    .array(z.number().int().positive())
    .min(1)
    .max(MAX_LABEL_PRINT_BATCH)
    .refine((ids) => new Set(ids).size === ids.length, 'Label ids must be unique.'),
}).strict();

export type LabelPrintRecordBody = z.infer<typeof labelPrintRecordBodySchema>;

export const PAPERWORK_DOC_KINDS = ['packing_slip', 'manual'] as const;
export type PaperworkDocKind = (typeof PAPERWORK_DOC_KINDS)[number];

const paperworkPrintItemSchema = z
  .object({
    orderId: z.number().int().positive(),
    kind: z.enum(PAPERWORK_DOC_KINDS),
    documentId: z.number().int().positive().nullable().optional(),
    manualId: z.number().int().positive().nullable().optional(),
  })
  .strict()
  .refine(
    (item) => (item.kind === 'packing_slip' ? item.documentId != null && item.manualId == null : item.manualId != null && item.documentId == null),
    'A packing slip names its documentId, a manual its manualId.',
  );

export const paperworkPrintRecordBodySchema = z.object({
  batchId: z.uuid(),
  channel: z.enum(LABEL_PRINT_CHANNELS),
  printerName: z.string().trim().min(1).max(120).nullable().optional(),
  ...stationFields,
  items: z
    .array(paperworkPrintItemSchema)
    .min(1)
    .max(MAX_PAPERWORK_PRINT_BATCH)
    .refine(
      (items) => new Set(items.map((i) => `${i.orderId}:${i.kind}:${i.documentId ?? i.manualId}`)).size === items.length,
      'Paperwork items must be unique per order.',
    ),
}).strict();

export type PaperworkPrintRecordBody = z.infer<typeof paperworkPrintRecordBodySchema>;
export type PaperworkPrintItem = PaperworkPrintRecordBody['items'][number];

/** One printable label on the desk — paired to an order or not. */
export interface LabelPrintRow {
  /** `label_ingestions.id`. */
  id: number;
  state: LabelIngestionState;
  rowVersion: number;
  source: string;
  fileBasename: string;
  carrier: string | null;
  trackingNumber: string | null;
  quarantineReasonCode: string | null;
  observedAt: string;
  /** The paired order (`orders.id`); null = an unpaired label. */
  orderId: number | null;
  /** The paired order's number, else the marketplace reference read off the label. */
  orderRef: string | null;
  /** ShipStation v1 shipment id — present on ShipStation labels, the key Pair to order sends. */
  shipstationShipmentId: number | null;
  printCount: number;
  lastPrintedAt: string | null;
  lastPrintedBy: string | null;
  /** The station the latest print went to; null when never printed or unknown. */
  lastStationName: string | null;
  /** The paired order's `account_source` — the platform the card names. Null when unpaired. */
  orderAccountSource: string | null;
  /** The paired order's product lines (every `orders` row sharing its order number), SKU-identity titles. Empty when unpaired. */
  orderLines: LabelOrderLine[];
}

/** One product line of the order a label ships. */
export interface LabelOrderLine {
  title: string;
  quantity: number;
}

/** One paperwork document of an order — a packing slip or a manual resolved for it (order › item # › SKU). */
export interface PaperworkDocumentRow {
  /** `doc:<documents.id>` | `manual:<product_manuals.id>` — the desk's document key. */
  key: string;
  kind: PaperworkDocKind;
  /** Packing slip: `documents.id`. */
  documentId: number | null;
  /** Manual: `product_manuals.id`. */
  manualId: number | null;
  title: string;
  /** Same-origin bytes; null = a Drive-only manual (listed, never printed). */
  src: string | null;
  /** Prints of this document for this order. */
  printCount: number;
  lastPrintedAt: string | null;
}

/** One order's paperwork — one card per order. */
export interface PaperworkPrintRow {
  /** The paired order (`orders.id`). */
  orderId: number;
  orderRef: string;
  orderAccountSource: string | null;
  /** Same SKU-identity titles as labels. */
  orderLines: LabelOrderLine[];
  /** Packing slips (newest first) then manuals (order › item # › SKU, newest first), printed or not. */
  documents: PaperworkDocumentRow[];
  /** Paperwork prints of this order, every document. */
  printCount: number;
  lastPrintedAt: string | null;
  lastPrintedBy: string | null;
  lastStationName: string | null;
  /** Earliest arrival of the order's stored labels — the Paperwork sort (oldest first). */
  observedAt: string;
}

/**
 * True totals — each list stops at the limit. `printed` = printed labels +
 * orders with a paperwork print.
 */
export type LabelPrintCounts = Record<LabelPrintView, number>;

export type LabelPrintQueue =
  | { view: 'labels'; rows: LabelPrintRow[]; counts: LabelPrintCounts }
  | { view: 'paperwork'; rows: PaperworkPrintRow[]; counts: LabelPrintCounts }
  | { view: 'printed'; labels: LabelPrintRow[]; paperwork: PaperworkPrintRow[]; counts: LabelPrintCounts };

/** One row of a label's print log. */
export interface LabelPrintEvent {
  id: number;
  batchId: string;
  channel: LabelPrintChannel;
  printerName: string | null;
  stationName: string | null;
  isReprint: boolean;
  printedAt: string;
  printedBy: string | null;
}

export interface LabelPrintRecordResult {
  batchId: string;
  /** Labels this call logged (a retried batch logs nothing twice). */
  recorded: number[];
}

export interface PaperworkPrintRecordResult {
  batchId: string;
  /** Documents this call logged (a retried batch logs nothing twice; ids not resolving for the order log nothing). */
  recorded: number;
}

export function buildLabelPrintComponents(): Record<string, unknown> {
  return {
    LabelPrintChannel: { type: 'string', enum: LABEL_PRINT_CHANNELS },
    LabelPrintView: { type: 'string', enum: LABEL_PRINT_VIEWS },
    PaperworkDocKind: { type: 'string', enum: PAPERWORK_DOC_KINDS },
  };
}

export function buildLabelPrintOpenApi(): Record<string, unknown> {
  const error = { $ref: '#/components/schemas/Error' };
  const id = { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } };
  const rejected = { description: 'Rejected', content: { 'application/json': { schema: error } } };
  const station = {
    stationId: { type: ['string', 'null'], minLength: 1, maxLength: 100 },
    stationName: { type: ['string', 'null'], minLength: 1, maxLength: 120 },
  };
  return {
    '/api/v1/label-prints': {
      get: {
        parameters: [
          { name: 'view', in: 'query', required: false, schema: { $ref: '#/components/schemas/LabelPrintView' } },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: MAX_LABEL_PRINT_BATCH } },
        ],
        responses: {
          '200': { description: 'Print queue by view: labels (unprinted labels, paired or not), paperwork (one row per paired order with unprinted slips / manuals), printed (printed labels + paperwork orders); true counts for all three views' },
          '400': { description: 'Invalid query', content: { 'application/json': { schema: error } } },
        },
      },
      post: {
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['batchId', 'channel', 'ingestionIds'], properties: { batchId: { type: 'string', format: 'uuid' }, channel: { $ref: '#/components/schemas/LabelPrintChannel' }, printerName: { type: ['string', 'null'], maxLength: 120 }, ...station, ingestionIds: { type: 'array', minItems: 1, maxItems: MAX_LABEL_PRINT_BATCH, uniqueItems: true, items: { type: 'integer', minimum: 1 } } } } } } },
        responses: { '200': { description: 'Print batch logged; a replayed batch logs nothing twice' }, '400': rejected },
      },
    },
    '/api/v1/paperwork-prints': {
      post: {
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['batchId', 'channel', 'items'],
                properties: {
                  batchId: { type: 'string', format: 'uuid' },
                  channel: { $ref: '#/components/schemas/LabelPrintChannel' },
                  printerName: { type: ['string', 'null'], maxLength: 120 },
                  ...station,
                  items: {
                    type: 'array',
                    minItems: 1,
                    maxItems: MAX_PAPERWORK_PRINT_BATCH,
                    items: {
                      type: 'object',
                      required: ['orderId', 'kind'],
                      properties: {
                        orderId: { type: 'integer', minimum: 1 },
                        kind: { $ref: '#/components/schemas/PaperworkDocKind' },
                        documentId: { type: ['integer', 'null'], minimum: 1, description: 'Packing slip `documents.id`' },
                        manualId: { type: ['integer', 'null'], minimum: 1, description: 'Manual `product_manuals.id`' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Paperwork print batch logged ({ batchId, recorded }); documents that do not resolve for the order log nothing; a replayed batch logs nothing twice' }, '400': rejected },
      },
    },
    '/api/v1/label-ingestions/{id}/pdf': {
      get: { parameters: [id], responses: { '200': { description: 'The stored label PDF', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } }, '404': { description: 'Not found', content: { 'application/json': { schema: error } } }, '409': { description: 'No stored PDF yet', content: { 'application/json': { schema: error } } } } },
    },
    '/api/v1/label-ingestions/{id}/prints': {
      get: { parameters: [id], responses: { '200': { description: 'The label print log, newest first' }, '404': { description: 'Not found', content: { 'application/json': { schema: error } } } } },
    },
  };
}
