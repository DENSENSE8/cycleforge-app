/**
 * `pnpm ai:eval`'s provider pin for `/api/assistant/chat`, honoured OUTSIDE
 * production only: the eval measures ONE endpoint per run (the local model, or
 * one gateway model), so the route narrows its chain to that single member —
 * no silent failover muddying a per-model pass count — without anyone editing
 * `.env`.
 *
 *   x-ai-eval-provider: local | gateway      required; anything else → no pin
 *   x-ai-eval-model: <id>                    optional short model id token
 *   x-ai-eval-base-url: http://127.0.0.1:<port>/v1
 *                                            optional, LOCAL pin only: a
 *                                            candidate model on another
 *                                            loopback port, compared without
 *                                            restarting the dev server
 *
 * An invalid model id or base URL drops the WHOLE pin (the turn runs the normal
 * chain) rather than half-applying it: a pass count attributed to the wrong
 * endpoint is worse than no eval pin at all.
 */

export interface EvalPin {
  provider: 'local' | 'gateway';
  model: string | null;
  baseURL: string | null;
}

/** Gateway ids look like `workers-ai/@cf/meta/llama-4-scout-17b-16e-instruct`; local ids like `cf-v2`. */
const MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,119}$/;

/** Exactly `http://127.0.0.1:<port>/v1` or `http://localhost:<port>/v1` — no path tricks, no credentials, no query. */
const LOOPBACK_BASE_URL_RE = /^http:\/\/(?:127\.0\.0\.1|localhost):(\d{2,5})\/v1$/;

export function parseEvalBaseURL(raw: string): string | null {
  const match = LOOPBACK_BASE_URL_RE.exec(raw);
  if (!match) return null;
  const port = Number(match[1]);
  return port >= 1 && port <= 65535 ? raw : null;
}

export function readEvalPin(
  header: (name: string) => string | null,
  env: Record<string, string | undefined> = process.env,
): EvalPin | null {
  if (env.NODE_ENV === 'production') return null;
  const provider = header('x-ai-eval-provider');
  if (provider !== 'local' && provider !== 'gateway') return null;

  const rawModel = header('x-ai-eval-model')?.trim() || null;
  if (rawModel !== null && !MODEL_ID_RE.test(rawModel)) return null;

  const rawBaseURL = header('x-ai-eval-base-url')?.trim() || null;
  if (rawBaseURL === null) return { provider, model: rawModel, baseURL: null };
  if (provider !== 'local') return null;
  const baseURL = parseEvalBaseURL(rawBaseURL);
  return baseURL ? { provider, model: rawModel, baseURL } : null;
}
