/** The published `/api/v1` document — every family's paths and components under one root. */

import { V1_BASE_ERROR_CODES } from '@/lib/api/v1-route';
import { buildV1SessionComponents, buildV1SessionOpenApi, V1_SESSION_ERROR_CODES } from '@/lib/auth/v1-session-contract';
import {
  buildLabelIngestionComponents,
  buildLabelIngestionOpenApi,
  LABEL_INGESTION_ERROR_CODES,
} from '@/lib/label-ingestions/contracts';
import { buildLabelPrintComponents, buildLabelPrintOpenApi } from '@/lib/label-prints/contracts';
import { buildOutboundWorkComponents, buildOutboundWorkOpenApi } from '@/lib/outbound/work-contract';
import { buildPickingV1Components, buildPickingV1OpenApi } from '@/lib/picking/picking-v1-contract';
import { buildReminderFeedComponents, buildReminderFeedOpenApi } from '@/lib/reminders/reminder-openapi';

/** Every code any v1 route (or the auth in front of it) can answer with. */
const V1_ERROR_CODES = [...new Set([...V1_BASE_ERROR_CODES, ...V1_SESSION_ERROR_CODES, ...LABEL_INGESTION_ERROR_CODES])];

export function buildV1OpenApi(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: { title: 'CycleForge V1', version: '1.0.0' },
    paths: {
      ...buildLabelIngestionOpenApi(),
      ...buildLabelPrintOpenApi(),
      ...buildOutboundWorkOpenApi(),
      ...buildReminderFeedOpenApi(),
      ...buildV1SessionOpenApi(),
      ...buildPickingV1OpenApi(),
    },
    // Native clients authenticate every call with the token from POST /api/v1/session.
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', description: 'Opaque session token from POST /api/v1/session.' },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: { code: { type: 'string', enum: V1_ERROR_CODES }, message: { type: 'string' } },
            },
          },
        },
        ...buildLabelIngestionComponents(),
        ...buildLabelPrintComponents(),
        ...buildOutboundWorkComponents(),
        ...buildReminderFeedComponents(),
        ...buildV1SessionComponents(),
        ...buildPickingV1Components(),
      },
    },
  };
}
