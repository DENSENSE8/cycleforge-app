/**
 * Server-side reachability probe for an AI endpoint, run at SAVE time.
 *
 * The failure this exists to prevent: a tenant pastes `http://localhost:11434/v1`
 * — perfectly correct from their laptop — and the deployed server, which is the
 * thing that will actually make the call, cannot see it at all. Without a probe
 * that saves cleanly and fails later as "AI is not working", with nothing in the
 * UI to suggest the URL was the problem.
 *
 * **What this validates is REACHABILITY AND AUTH, not feature support.**
 * A 404 from `/models` counts as success: plenty of OpenAI-compatible servers do
 * not implement that route, and refusing to save a working endpoint because it
 * lacks an optional listing API would be a worse bug than the one being fixed.
 * A 401/403 is a failure, because it means we reached something and it refused
 * us — which is exactly the Cloudflare Access misconfiguration that motivated
 * the headers channel in the first place.
 *
 * DB-free and fetch-injectable so the policy is unit-testable without network.
 */

import { aiRequestHeaders } from '@/lib/ai/provider';

export interface ProbeTarget {
  baseURL: string;
  apiKey?: string;
  headers?: Record<string, string>;
}

export type ProbeResult =
  | { ok: true; models: string[]; note?: string }
  | { ok: false; reason: string };

/** Bounded so a save cannot hang on a black-holed address. */
export const PROBE_TIMEOUT_MS = 8_000;

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

/**
 * Confirm the model the tenant named is actually served.
 *
 * A warning, never a hard failure: the listing may be empty (see above), and a
 * model can be pulled after the endpoint is connected. Blocking the save here
 * would make a correct config unsavable for a transient reason.
 */
export function modelWarning(models: string[], named: string | undefined): string | null {
  if (!named || models.length === 0) return null;
  if (models.includes(named)) return null;
  return `The endpoint is reachable but does not currently list "${named}". Available: ${models
    .slice(0, 5)
    .join(', ')}${models.length > 5 ? '…' : ''}`;
}
