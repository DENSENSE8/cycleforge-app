/** Browser-side reader for the `/api/v1` envelope: `{ data }` on success, `{ error: { code, message } }` on failure. */

import { z } from 'zod';

const errorEnvelope = z.object({ error: z.object({ code: z.string(), message: z.string() }).passthrough() });

/**
 * A v1 call that did not return `data` — carries the server's code when it sent one,
 * and `details`: any extra fields the server put beside `code`/`message` (`v1Error` `extra`).
 */
export class V1RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'V1RequestError';
  }
}

/**
 * Call a v1 endpoint and return its validated `data`. JSON bodies are sent as
 * `application/json`; a contract drift in the response throws rather than
 * reaching the UI as a half-shaped object.
 */
export async function v1Request<T>(
  path: string,
  data: z.ZodType<T>,
  init: { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal; fallbackMessage: string },
): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    cache: 'no-store',
    signal: init.signal,
    ...(init.body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(init.body) }),
  });
  const raw: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = errorEnvelope.safeParse(raw);
    if (!err.success) throw new V1RequestError(`${init.fallbackMessage} (${res.status})`, res.status, null);
    const { code, message, ...details } = err.data.error;
    throw new V1RequestError(message, res.status, code, details);
  }
  const ok = z.object({ data }).safeParse(raw);
  if (!ok.success) throw new V1RequestError(`${init.fallbackMessage} (unexpected response)`, res.status, null);
  return ok.data.data;
}
