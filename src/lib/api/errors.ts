import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { safeRandomUUID } from '@/lib/safe-uuid';

/**
 * Structured API error with HTTP status code.
 * Throw this in route handlers or hooks to return a typed error response.
 */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string, details?: string) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message);
  }

  static notFound(entity: string, id?: string | number) {
    return new ApiError(404, `${entity} not found${id != null ? `: ${id}` : ''}`);
  }

  static conflict(message: string) {
    return new ApiError(409, message);
  }

  static internal(message = 'Internal server error', details?: string) {
    return new ApiError(500, message, details);
  }
}

/** Converts any caught error into a standardized NextResponse. */
export function errorResponse(err: unknown, context?: string): NextResponse {
  if (err instanceof ApiError) {
    const body: Record<string, unknown> = { error: err.message };
    if (err.details) body.details = err.details;
    return NextResponse.json(body, { status: err.statusCode });
  }

  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return NextResponse.json(
      { error: 'Validation failed', details: issues },
      { status: 400 },
    );
  }

  const requestId = safeRandomUUID();
  console.error(`[${context ?? 'api'}:${requestId}]`, err);
  const body: Record<string, unknown> = {
    error: 'INTERNAL',
    message: 'Something went wrong — try again',
    requestId,
  };
  if (process.env.NODE_ENV !== 'production') {
    body.details = err instanceof Error ? err.message : String(err);
  }
  return NextResponse.json(
    body,
    { status: 500, headers: { 'x-request-id': requestId } },
  );
}
