/**
 * Session titles — name a chat thread from a SUMMARY of its first user message,
 * using the org's own AI provider chain, so the sidebar/header/Recent list show
 * "Unshipped orders for today" instead of a raw truncation or a standing
 * "New conversation" placeholder.
 *
 * Contract:
 * - {@link generateSessionTitle} NEVER throws and NEVER returns an empty or
 *   placeholder string. A provider miss falls back to {@link fallbackTitle}
 *   (the cleaned first line of the message), which is still a real name.
 * - It is a background write by design: session creation persists a provisional
 *   {@link fallbackTitle} immediately, then this replaces it once the model
 *   answers — the chat turn never waits on it.
 */

import { postToAiProvider } from '@/lib/ai/failover';
import type { OrgId } from '@/lib/tenancy/constants';
import { stripHarmony } from '@/lib/ai/harmony';

const MAX_TITLE_LEN = 80;

const TITLE_SYSTEM_PROMPT =
  'You name chat sessions for a warehouse operations app. Given the user\u2019s ' +
  'first message, reply with a terse 3\u20136 word title that captures its intent. ' +
  'Title Case. No surrounding quotes, no trailing punctuation, no emoji, no ' +
  'preamble. Reply with ONLY the title. Example message: "how many orders are ' +
  'still unshipped today" \u2192 Unshipped Orders Today.';

/**
 * A real title derived from the message itself — the first non-empty line,
 * whitespace-collapsed and capped. Used both as the instant provisional title
 * and as the fallback when the model is unavailable. Never a placeholder.
 */
export function fallbackTitle(message: string): string {
  const firstLine =
    message
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? '';
  const collapsed = firstLine.replace(/\s+/g, ' ').trim();
  if (!collapsed) return 'Untitled chat';
  return collapsed.length > MAX_TITLE_LEN
    ? `${collapsed.slice(0, MAX_TITLE_LEN - 1).trimEnd()}\u2026`
    : collapsed;
}

/**
 * Strip a model title down to a bare name: no quotes, no trailing dots, capped.
 *
 * Harmony first: a self-hosted `gpt-oss` answers this prompt with
 * `<|channel|>analysis<|message|>We need to produce a title…` and the sidebar
 * showed exactly that (measured 2026-09-06). `stripHarmony` keeps only the
 * `final` channel; a pure-analysis reply reduces to '' and the caller falls
 * back to the message's own first line.
 */
function sanitizeTitle(raw: string): string {
  const cleaned = stripHarmony(raw)
    .replace(/[\r\n]+/g, ' ')
    .replace(/^\s*(?:title\s*[:\-]\s*)/i, '')
    .replace(/^["'`\u201c\u2018]+|["'`\u201d\u2019]+$/g, '')
    .replace(/[\s.。!?！？]+$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned.length > MAX_TITLE_LEN
    ? `${cleaned.slice(0, MAX_TITLE_LEN - 1).trimEnd()}\u2026`
    : cleaned;
}

/**
 * Summarize the first user message into a short session title via the org's
 * chat provider chain. Returns a cleaned fallback on ANY failure (no provider,
 * timeout, non-OK, empty completion) — the caller always gets a usable name.
 *
 * `fetchTitle` is injected in tests so the parse/sanitize path is exercised
 * without a network or a configured provider.
 */
export async function generateSessionTitle(
  orgId: OrgId,
  firstMessage: string,
  fetchTitle: typeof postToAiProvider = postToAiProvider,
): Promise<string> {
  const message = firstMessage.trim();
  if (!message) return 'Untitled chat';
  try {
    const attempt = await fetchTitle(orgId, 'chat', {
      path: '/chat/completions',
      headers: { 'X-Source': 'cycle-forge-title' },
      buildBody: (config) => ({
        model: config.model,
        stream: false,
        temperature: 0.2,
        max_tokens: 24,
        messages: [
          { role: 'system', content: TITLE_SYSTEM_PROMPT },
          { role: 'user', content: message.slice(0, 500) },
        ],
      }),
      body: null,
      timeoutMs: 15_000,
    });
    if (!attempt.res.ok) return fallbackTitle(message);
    const json = (await attempt.res.json().catch(() => null)) as
      | { choices?: Array<{ message?: { content?: unknown } }> }
      | null;
    const content = json?.choices?.[0]?.message?.content;
    const title = typeof content === 'string' ? sanitizeTitle(content) : '';
    return title || fallbackTitle(message);
  } catch {
    return fallbackTitle(message);
  }
}
