/**
 * The one way an `/api/v1` handler answers: `{ data }` on success and
 * `{ error: { code, message } }` on failure — including the auth failures
 * `withAuth` and the proxy raise in front of it. Edge-safe (no DB, no Node APIs),
 * so `proxy.ts` uses it too.
 */

import { NextResponse, type NextRequest } from 'next/server';
import type { z } from 'zod';
import type { V1SessionErrorCode } from '@/lib/auth/v1-session-contract';
import type { LabelIngestionErrorCode } from '@/lib/label-ingestions/contracts';
import type { LabelBuyErrorCode } from '@/lib/label-buys/contracts';

/** Codes every v1 route may answer with; family contracts add their own. */
export const V1_BASE_ERROR_CODES = [
  'INVALID_REQUEST',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'STEPUP_REQUIRED',
  'TRIAL_EXPIRED',
  'FEATURE_GATED',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL',
] as const;

export type V1ErrorCode =
  | (typeof V1_BASE_ERROR_CODES)[number]
  | V1SessionErrorCode
  | LabelIngestionErrorCode
  | LabelBuyErrorCode;

const NO_STORE = { 'cache-control': 'no-store' };

export function v1Data(data: unknown, init: { status?: number; headers?: Record<string, string> } = {}): NextResponse {
  return NextResponse.json({ data }, { status: init.status ?? 200, headers: { ...NO_STORE, ...init.headers } });
}

export function v1Error(
  status: number,
  code: V1ErrorCode,
  message: string,
  init: { extra?: Record<string, unknown>; headers?: Record<string, string> } = {},
): NextResponse {
  return NextResponse.json({ error: { code, message, ...init.extra } }, { status, headers: { ...NO_STORE, ...init.headers } });
}

/** The domain layer's `{ ok: false, status, error }` answer, as a v1 error. */
export function v1DomainError(failure: { status: 400 | 404 | 409; error: string }): NextResponse {
  const code = failure.status === 404 ? 'NOT_FOUND' : failure.status === 409 ? 'CONFLICT' : 'INVALID_REQUEST';
  return v1Error(failure.status, code, failure.error);
}

type Parsed<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

/** Validate a JSON body; a missing, malformed or off-contract body is one 400. */
export async function readV1Json<S extends z.ZodType>(request: Request, schema: S, message: string): Promise<Parsed<z.output<S>>> {
  const parsed = schema.safeParse(await request.json().catch(() => undefined));
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, response: v1Error(400, 'INVALID_REQUEST', message) };
}

export function readV1Query<S extends z.ZodType>(request: NextRequest, schema: S, message: string): Parsed<z.output<S>> {
  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, response: v1Error(400, 'INVALID_REQUEST', message) };
}

/**
 * A positive integer path segment, counted from the end (`…/label-ingestions/{id}/apply` → 2).
 * `withAuth` drops Next's route params, so handlers read the path.
 */
export function v1PathId(request: NextRequest, fromEnd: number): number | null {
  const id = Number(request.nextUrl.pathname.split('/').at(-fromEnd));
  return Number.isInteger(id) && id > 0 ? id : null;
}
