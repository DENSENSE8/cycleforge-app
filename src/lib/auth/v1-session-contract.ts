/** `/api/v1/session` — how a native client (iOS / Android / desktop) gets, reads and ends its bearer. */

import { z } from 'zod';

/** A native device is a phone or a personal machine; `station` stays a browser-kiosk concept. */
const V1_DEVICE_KINDS = ['phone', 'personal'] as const;

export const v1SessionCreateBodySchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(200),
  /** Workspace slug (the tenant subdomain). Required only when the account has several (ORG_CHOICE_REQUIRED). */
  workspace: z.string().trim().min(1).max(63).optional(),
  deviceKind: z.enum(V1_DEVICE_KINDS).default('phone'),
  /** Shown in the staffer's active-sessions list, e.g. "Mike's iPhone". */
  deviceLabel: z.string().trim().min(1).max(80).optional(),
  /** Sliding one-year session instead of the device kind's idle window. */
  persistent: z.boolean().optional(),
});

export const V1_SESSION_ERROR_CODES = [
  'INVALID_REQUEST',
  'INVALID_CREDENTIALS',
  'ACCOUNT_NOT_ACTIVE',
  'NO_WORKSPACE',
  'NOT_A_MEMBER',
  'ORG_CHOICE_REQUIRED',
  'RATE_LIMITED',
] as const;
type V1SessionErrorCode = (typeof V1_SESSION_ERROR_CODES)[number];

export function v1SessionError(code: V1SessionErrorCode, message: string) {
  return { error: { code, message } };
}

const instant = { type: 'string', format: 'date-time' };
const errorRef = { $ref: '#/components/schemas/Error' };

export function buildV1SessionComponents(): Record<string, unknown> {
  return {
    V1SessionCreateBody: {
      type: 'object',
      additionalProperties: false,
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string', minLength: 1, maxLength: 200 },
        workspace: { type: 'string', maxLength: 63, description: 'Workspace slug; required when the account belongs to more than one workspace.' },
        deviceKind: { type: 'string', enum: [...V1_DEVICE_KINDS], default: 'phone' },
        deviceLabel: { type: 'string', maxLength: 80 },
        persistent: { type: 'boolean', description: 'Sliding one-year session instead of the device idle window.' },
      },
    },
    V1SessionToken: {
      type: 'object',
      additionalProperties: false,
      required: ['data'],
      properties: {
        data: {
          type: 'object',
          additionalProperties: false,
          required: ['token', 'expiresAt', 'staffId', 'workspace'],
          properties: {
            token: { type: 'string', description: 'Send as `Authorization: Bearer <token>` on every /api/v1 call. Store in the platform keychain.' },
            expiresAt: instant,
            staffId: { type: 'integer' },
            workspace: { $ref: '#/components/schemas/V1Workspace' },
          },
        },
      },
    },
    V1Workspace: {
      type: 'object',
      additionalProperties: false,
      required: ['slug', 'name'],
      properties: {
        slug: { type: ['string', 'null'], description: 'Tenant subdomain; the value to send back as `workspace`.' },
        name: { type: 'string' },
      },
    },
    V1SessionOrgChoice: {
      type: 'object',
      required: ['error'],
      properties: {
        error: {
          type: 'object',
          required: ['code', 'message', 'workspaces'],
          properties: {
            code: { type: 'string', enum: ['ORG_CHOICE_REQUIRED'] },
            message: { type: 'string' },
            workspaces: { type: 'array', items: { $ref: '#/components/schemas/V1Workspace' } },
          },
        },
      },
    },
    V1SessionPrincipal: {
      type: 'object',
      additionalProperties: false,
      required: ['data'],
      properties: {
        data: {
          type: 'object',
          additionalProperties: false,
          required: ['staffId', 'name', 'role', 'permissions', 'deviceKind', 'expiresAt'],
          properties: {
            staffId: { type: 'integer' },
            name: { type: 'string' },
            role: { type: 'string' },
            permissions: { type: 'array', items: { type: 'string' }, description: 'Effective permissions — gate UI verbs on these.' },
            deviceKind: { type: 'string', enum: ['station', 'personal', 'phone'] },
            expiresAt: instant,
          },
        },
      },
    },
  };
}

export function buildV1SessionOpenApi(): Record<string, unknown> {
  return {
    '/api/v1/session': {
      post: {
        description:
          'Exchange account email + password for a bearer token. Same throttles, workspace rules and audit as web sign-in; the token is revocable from the web sessions list.',
        security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/V1SessionCreateBody' } } } },
        responses: {
          '201': { description: 'Session minted', content: { 'application/json': { schema: { $ref: '#/components/schemas/V1SessionToken' } } } },
          '400': { description: 'Invalid body', content: { 'application/json': { schema: errorRef } } },
          '401': { description: 'Invalid credentials (never reveals whether the email exists)', content: { 'application/json': { schema: errorRef } } },
          '403': { description: 'Account inactive, no workspace, or not a member of that workspace', content: { 'application/json': { schema: errorRef } } },
          '409': { description: 'Several workspaces — POST again with one slug as `workspace`', content: { 'application/json': { schema: { $ref: '#/components/schemas/V1SessionOrgChoice' } } } },
          '429': { description: 'Throttled; see Retry-After', content: { 'application/json': { schema: errorRef } } },
        },
      },
      get: {
        description: 'Who this bearer is: staff, workspace, role and effective permissions.',
        responses: {
          '200': { description: 'The session principal', content: { 'application/json': { schema: { $ref: '#/components/schemas/V1SessionPrincipal' } } } },
          '401': { description: 'Missing, expired or revoked token' },
        },
      },
      delete: {
        description: 'Sign out: revoke this bearer server-side.',
        responses: {
          '204': { description: 'Revoked' },
          '401': { description: 'Missing, expired or revoked token' },
        },
      },
    },
  };
}
