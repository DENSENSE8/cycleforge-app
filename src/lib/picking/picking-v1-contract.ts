/**
 * `/api/v1/picking/*` — the pick loop a phone (web `/m/pick` or a native app) drives.
 * Client-safe: Zod only. The same schemas validate requests on the server, parse
 * responses on the client, and render the published OpenAPI components.
 */

import { z } from 'zod';
import type {
  DirectedPickNext,
  PickBoardRow,
  PickBoardScope,
} from '@/lib/picking/directed-pick';

const id = z.number().int().positive();
const instant = z.string().datetime({ offset: true });

// ── Requests ────────────────────────────────────────────────────────────────

export const pickNextBodySchema = z
  .object({
    runStartedAt: instant.optional().describe('When this picker began the run; progress counts picks since then.'),
    skipOrderIds: z.array(id).max(500).default([]).describe('Orders skipped this run — never fed back.'),
  })
  .strict();

export const pickBoardQuerySchema = z.object({
  scope: z.enum(['unassigned', 'all']).default('unassigned'),
});

export const pickOrderBodySchema = z.object({ orderId: id }).strict();

export const pickToteBodySchema = z
  .object({
    orderId: id,
    toteScan: z.string().trim().min(1).max(512).describe('Raw scan: H-{id}, numeric id, or an external tote barcode.'),
  })
  .strict();

export const PICK_NOTE_MAX = 1000;

export const pickNoteBodySchema = z
  .object({
    allocationIds: z.array(id).min(1).max(200).describe('Units on the line the note is about.'),
    text: z.string().trim().min(1).max(PICK_NOTE_MAX),
  })
  .strict();

// ── Responses (`data`) ──────────────────────────────────────────────────────

const location = z.object({ name: z.string().nullable(), barcode: z.string().nullable(), room: z.string().nullable() });
const staffRef = z.object({ staffId: z.number().int(), name: z.string().nullable() });
const owner = staffRef.extend({ via: z.enum(['assigned', 'sku', 'backup']) });

export const directedPickNextSchema: z.ZodType<DirectedPickNext> = z.object({
  sessionId: z.number().int().nullable().describe('Open picking session on `order`; null when the run is empty.'),
  order: z
    .object({
      orderId: z.number().int(),
      orderLabel: z.string(),
      accountSource: z.string().nullable(),
      itemNumber: z.string().nullable(),
      deadlineAt: z.string().nullable(),
      rush: z.boolean(),
      unitsRemaining: z.number().int(),
      toteCode: z.string().nullable().describe('OPEN tote already paired to the order — arm it without a scan.'),
      owner: owner.nullable(),
      backups: z.array(staffRef),
    })
    .nullable(),
  line: z
    .object({
      key: z.string(),
      orderId: z.number().int(),
      sku: z.string(),
      title: z.string(),
      imageUrl: z.string().nullable(),
      location: location.nullable(),
      units: z.array(
        z.object({
          allocationId: z.number().int(),
          serialUnitId: z.number().int(),
          serialNumber: z.string().nullable(),
          unitUid: z.string().nullable(),
        }),
      ),
      platforms: z.array(z.object({ platformSku: z.string().nullable(), platformItemId: z.string().nullable() })),
    })
    .nullable(),
  progress: z.object({ done: z.number().int(), total: z.number().int() }),
  stagedTotes: z.array(z.string()).describe('Totes staged for pack by sessions this call closed.'),
  unassignedCount: z.number().int(),
});

const pickBoardRowSchema: z.ZodType<PickBoardRow> = z.object({
  orderId: z.number().int(),
  orderLabel: z.string(),
  accountSource: z.string().nullable(),
  deadlineAt: z.string().nullable(),
  rush: z.boolean(),
  openUnits: z.number().int(),
  title: z.string(),
  imageUrl: z.string().nullable(),
  location: location.nullable(),
  owner: owner.nullable(),
  backups: z.array(staffRef),
  heldBy: staffRef.nullable().describe("Another picker's live session on the order."),
});

export const pickBoardSchema: z.ZodType<{ scope: PickBoardScope; rows: PickBoardRow[] }> = z.object({
  scope: z.enum(['unassigned', 'all']),
  rows: z.array(pickBoardRowSchema),
});

export const pickSessionSchema = z.object({
  sessionId: z.number().int(),
  reopen: z.boolean().describe("true when the caller's open session on the order was reused."),
});

export const pickReleaseSchema = z.object({ released: z.number().int().describe('Sessions ended.') });

export const pickToteSchema = z.object({
  toteId: z.number().int(),
  toteCode: z.string(),
  alreadyPaired: z.boolean(),
});

export const pickNoteSchema = z.object({ recorded: z.number().int() });

// ── OpenAPI ─────────────────────────────────────────────────────────────────

function component(schema: z.ZodType, io: 'input' | 'output' = 'output'): Record<string, unknown> {
  const { $schema: _dialect, ...rest } = z.toJSONSchema(schema, { target: 'draft-2020-12', io });
  return rest;
}

const envelope = (ref: string) => ({
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: { data: { $ref: `#/components/schemas/${ref}` } },
});

export function buildPickingV1Components(): Record<string, unknown> {
  return {
    PickNextBody: component(pickNextBodySchema, 'input'),
    PickOrderBody: component(pickOrderBodySchema, 'input'),
    PickToteBody: component(pickToteBodySchema, 'input'),
    PickNoteBody: component(pickNoteBodySchema, 'input'),
    DirectedPickNext: component(directedPickNextSchema),
    PickBoard: component(pickBoardSchema),
    PickSession: component(pickSessionSchema),
    PickRelease: component(pickReleaseSchema),
    PickTote: component(pickToteSchema),
    PickNote: component(pickNoteSchema),
    DirectedPickNextPayload: envelope('DirectedPickNext'),
    PickBoardPayload: envelope('PickBoard'),
    PickSessionPayload: envelope('PickSession'),
    PickReleasePayload: envelope('PickRelease'),
    PickTotePayload: envelope('PickTote'),
    PickNotePayload: envelope('PickNote'),
  };
}

const json = (ref: string) => ({ content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } } });
const body = (ref: string) => ({ required: true, ...json(ref) });
const sessionParam = { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } };
const errors = {
  '400': { description: 'Invalid request', ...json('Error') },
  '401': { description: 'Authenticated device or session required' },
  '403': { description: 'Missing orders.view' },
};

export function buildPickingV1OpenApi(): Record<string, unknown> {
  return {
    '/api/v1/picking/next': {
      post: {
        description:
          "The caller's next directed pick. Closes the caller's finished sessions (staging their totes), then opens or reuses a session on the first eligible order. Calling it claims that order for the caller.",
        requestBody: body('PickNextBody'),
        responses: { '200': { description: 'Next line, or an empty run', ...json('DirectedPickNextPayload') }, ...errors },
      },
    },
    '/api/v1/picking/board': {
      get: {
        description: 'Orders with open picks: `unassigned` (no owner) or `all`.',
        parameters: [{ name: 'scope', in: 'query', required: false, schema: { type: 'string', enum: ['unassigned', 'all'], default: 'unassigned' } }],
        responses: { '200': { description: 'Pick board', ...json('PickBoardPayload') }, ...errors },
      },
    },
    '/api/v1/picking/release': {
      post: {
        description: "End the caller's open session(s) on an order without staging its tote (skip / pass). Picked units stay picked.",
        requestBody: body('PickOrderBody'),
        responses: { '200': { description: 'Sessions released', ...json('PickReleasePayload') }, ...errors },
      },
    },
    '/api/v1/picking/sessions': {
      post: {
        description: 'Open (or reuse) the caller’s picking session on a chosen order.',
        requestBody: body('PickOrderBody'),
        responses: {
          '200': { description: 'Session', ...json('PickSessionPayload') },
          ...errors,
          '404': { description: 'Order not in this workspace', ...json('Error') },
          '409': { description: 'Order not pickable', ...json('Error') },
        },
      },
    },
    '/api/v1/picking/sessions/{id}/tote': {
      post: {
        description: "Pair a tote to the order of the caller's open session before the first unit leaves its bin.",
        parameters: [sessionParam],
        requestBody: body('PickToteBody'),
        responses: {
          '200': { description: 'Tote paired (or already paired)', ...json('PickTotePayload') },
          ...errors,
          '404': { description: 'Tote not found', ...json('Error') },
          '409': { description: "Session not active (ended, or not the caller's), or the tote carries another order", ...json('Error') },
        },
      },
    },
    '/api/v1/picking/sessions/{id}/notes': {
      post: {
        description: 'Record a picker note on units of the session.',
        parameters: [sessionParam],
        requestBody: body('PickNoteBody'),
        responses: {
          '200': { description: 'Note recorded', ...json('PickNotePayload') },
          ...errors,
          '404': { description: "An allocation is not on this session (or the session is not the caller's)", ...json('Error') },
        },
      },
    },
  };
}
