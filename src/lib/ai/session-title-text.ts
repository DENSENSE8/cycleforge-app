/**
 * Session-title text math — the ONE sanitizer both the writer and every reader
 * run, plus the message-derived fallback name.
 *
 * A session title is persisted memory: it is what the operator reads six weeks
 * later to find the thread where a problem was already solved. So the write
 * path sanitizes ({@link generateSessionTitle}) AND the read path sanitizes,
 * because rows written before harmony-stripping landed still hold raw control
 * tokens — the spine measured `<|channel|>analysis<|message|>User says…` in the
 * Sessions list on 2026-09-07. A display guard means no stale or drifted row
 * can ever paint model deliberation at an operator again.
 *
 * Client-safe by construction: this module imports only {@link stripHarmony}
 * (pure regex). `session-title.ts` reaches the provider chain through
 * `@/lib/ai/failover` → `org-provider`, which carries `server-only`, so the
 * shared sanitizer cannot live there.
 */

import { stripHarmony } from '@/lib/ai/harmony';

/** Titles are a nav row, not prose — the cap the writer has always used. */
export const MAX_TITLE_LEN = 80;

/** What a row with no usable name reads as. One string, every surface. */
export const UNTITLED_SESSION = 'Untitled session';

/**
 * A title that has been through {@link displaySessionTitle}.
 *
 * The brand exists because a session title is PERSISTED in two places: the row
 * itself, and any pin bound to it. A pin keeps its label forever, so a raw
 * `<|channel|>analysis…` string copied into one outlives every fix to the row
 * it came from. Requiring this type where a title is stored (see
 * `SessionPinInput` in `@/lib/quick-access/types`) makes that copy a compile
 * error instead of a defect nobody notices for six weeks.
 *
 * It is a plain string at runtime — assignable TO `string` everywhere, never
 * constructible FROM one except through the sanitizer below.
 */
export type DisplayTitle = string & { readonly __displayTitle: unique symbol };

/**
 * Strip a title down to a bare name: no Harmony markup, no quotes, no trailing
 * punctuation, single-spaced, capped. Returns `''` when nothing legible is
 * left — a pure-`analysis` reply reduces to empty, which is correct, and the
 * caller decides the fallback.
 */
export function sanitizeSessionTitle(raw: string): string {
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
 * The title to render for a session row. Never empty, never a control token.
 *
 * `fallback` lets a surface keep its own word for a nameless thread (the
 * header's current-session row says "Session"); everything else gets
 * {@link UNTITLED_SESSION}.
 */
export function displaySessionTitle(
  raw: string | null | undefined,
  fallback: string = UNTITLED_SESSION,
): DisplayTitle {
  if (!raw) return fallback as DisplayTitle;
  return (sanitizeSessionTitle(raw) || fallback) as DisplayTitle;
}
