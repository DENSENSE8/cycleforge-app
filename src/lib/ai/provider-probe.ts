/** Server-side reachability probe for an AI endpoint, run at SAVE time. */

import { aiRequestHeaders } from '@/lib/ai/provider';

interface ProbeTarget {
  baseURL: string;
  apiKey?: string;
  headers?: Record<string, string>;
}

type ProbeResult =
  | { ok: true; models: string[]; note?: string }
  | { ok: false; reason: string };

/** Bounded so a save cannot hang on a black-holed address. */
const PROBE_TIMEOUT_MS = 8_000;

export async function probeAiEndpoint(
  target: ProbeTarget,
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<ProbeResult> {
  let url: string;
  try {
    url = `${target.baseURL.replace(/\/+$/, '')}/models`;
    // Reject a syntactically valid but unusable value early (e.g. "notaurl").
    new URL(url);
  } catch {
    return { ok: false, reason: 'That is not a valid URL.' };
  }

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'GET',
      headers: aiRequestHeaders({ apiKey: target.apiKey ?? '', headers: target.headers }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      return {
        ok: false,
        reason:
          'The server could not reach that URL before timing out. If the model runs on your own machine or LAN, set a server-reachable URL (tunnel) instead.',
      };
    }
    return {
      ok: false,
      reason:
        'The server could not connect to that URL. A localhost or LAN address is reachable from your machine but not from Cycle Forge — use a tunnel URL.',
    };
  }

  if (res.status === 401 || res.status === 403) {
    return {
      ok: false,
      reason:
        `The endpoint answered but rejected our credentials (HTTP ${res.status}). Check the API key, and the Cloudflare Access client ID/secret if the tunnel is behind CF Access.`,
    };
  }

  if (res.status === 404 || res.status === 405) {
    // Reachable and authenticated; it just does not implement /models.
    return { ok: true, models: [], note: 'Reachable. This endpoint does not list models, which is fine.' };
  }

  if (!res.ok) {
    return { ok: false, reason: `The endpoint answered with HTTP ${res.status}.` };
  }

  try {
    const data = (await res.json()) as { data?: { id?: string }[] };
    const models = (data?.data ?? []).map((m) => String(m?.id ?? '')).filter(Boolean);
    return { ok: true, models };
  } catch {
    return { ok: true, models: [], note: 'Reachable, but the model list was not readable.' };
  }
}

/** Confirm the model the tenant named is actually served. */
export function modelWarning(models: string[], named: string | undefined): string | null {
  if (!named || models.length === 0) return null;
  if (models.includes(named)) return null;
  return `The endpoint is reachable but does not currently list "${named}". Available: ${models
    .slice(0, 5)
    .join(', ')}${models.length > 5 ? '…' : ''}`;
}
