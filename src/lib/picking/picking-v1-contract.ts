/**
 * `/api/v1/picking/sessions` — open a picking session on an order (`/m/pick/[orderId]`, or a native app).
 * Client-safe: Zod only. The same schemas validate requests on the server, parse
 * responses on the client, and render the published OpenAPI components.
 */

import { z } from 'zod';

const id = z.number().int().positive();

// ── Requests ────────────────────────────────────────────────────────────────

export const pickOrderBodySchema = z.object({ orderId: id }).strict();

// ── Responses (`data`) ──────────────────────────────────────────────────────

export const pickSessionSchema = z.object({
  sessionId: z.number().int(),
  reopen: z.boolean().describe("true when the caller's open session on the order was reused."),
});

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
    PickOrderBody: component(pickOrderBodySchema, 'input'),
    PickSession: component(pickSessionSchema),
    PickSessionPayload: envelope('PickSession'),
  };
}

const json = (ref: string) => ({ content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } } });
const body = (ref: string) => ({ required: true, ...json(ref) });
const errors = {
  '400': { description: 'Invalid request', ...json('Error') },
  '401': { description: 'Authenticated device or session required' },
  '403': { description: 'Missing orders.view' },
};

export function buildPickingV1OpenApi(): Record<string, unknown> {
  return {
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
  };
}
