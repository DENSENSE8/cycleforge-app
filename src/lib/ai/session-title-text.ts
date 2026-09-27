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
 * Inline markdown a model puts in a title, removed rather than rendered.
 *
 * The writer asks for a name and gets `**Packing pace** for *tuan*`, and a nav
 * row is a LABEL — it paints text, so the operator read the asterisks (spine
 * measured 2026-09-07). Rendering real bold in a 13px truncating row is the
 * wrong answer to the same question: emphasis inside a name says nothing the
 * name does not, and it would have to be re-rendered in the header chip, the
 * ⌘K palette, a pin, a tooltip and the rename input, where markup cannot go at
 * all. So the markers come OFF once, here, for every reader.
 *
 * Order matters: fences and links first (their delimiters contain emphasis
 * characters), then paired emphasis from longest run to shortest.
 *
 * `_snake_case_` is deliberately NOT unwrapped unless the emphasised run holds
 * a space: `unit_id` and `SKU_12_A` are identifiers an operator retypes, and
 * eating their underscores would corrupt the one thing a title must keep
 * verbatim.
 */
function stripInlineMarkdown(text: string): string {
  return text
    // `code` / ``code`` → code
    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
    // [label](href) → label, ![alt](src) → alt
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    // ~~struck~~ → struck
    .replace(/~~([^~]+)~~/g, '$1')
    // ***both*** → both, **bold** → bold, *italic* → italic
    .replace(/\*{1,3}(?=\S)([^*]+?)(?<=\S)\*{1,3}/g, '$1')
    // __bold__ → bold (a double underscore is never part of an identifier we
    // paint in a title)
    .replace(/__(?=\S)([^_]+?)(?<=\S)__/g, '$1')
    // _emphasised phrase_ → emphasised phrase, but never `unit_id`
    .replace(/(^|\s)_(?=\S)([^_]*\s[^_]*)(?<=\S)_(?=\s|$)/g, '$1$2')
    // Leading block markers: heading hashes, quote carets, list bullets.
    .replace(/^\s*(?:#{1,6}\s+|>\s+|[-*+]\s+|\d+\.\s+)/, '');
}

/**
 * Hermes tool-call markup — the Qwen-family analogue of Harmony.
 *
 * `stripHarmony` only knows `<|channel|>` / `to=functions.`, the gpt-oss
 * grammar. Iteration 6 promoted a **Qwen3-4B** router served through vLLM's
 * `--tool-call-parser hermes`, which wraps its intent in `<tool_call>{json}
 * </tool_call>` and frequently precedes it with a sentence of deliberation.
 * Measured in the dock on 2026-09-08, in the Sessions list and the header
 * chip, verbatim:
 *
 *   <tool_call> Okay, the user asked, "Who works here? Show me the staff
 *   list." I need to…
 *
 * Two causes, one fix. The title WRITER asks the chat model for a name, and
 * the chat model is now a tool-router fine-tune whose whole training signal is
 * "emit a tool call" — so a request for prose comes back as tool-call
 * preamble. And the READ path must strip it anyway, because rows written
 * before this landed already hold it (cohort law 4: a stored title reaches
 * paint only through `displaySessionTitle`).
 *
 * An unterminated `<tool_call>` is the common shape (the parser consumed the
 * closing tag), so the open tag alone must drop everything after it: what
 * follows is deliberation, never a name.
 */
function stripHermesToolCalls(text: string): string {
  return text
    // Complete block, including any JSON payload.
    .replace(/<tool_call>[^]*?<\/tool_call>/g, ' ')
    // Stray closer left by a parser that ate the opener.
    .replace(/<\/tool_call>/g, ' ')
    // Unterminated opener: everything after it is model deliberation.
    .replace(/<tool_call>[^]*$/, ' ')
    // `<think>` reasoning blocks — same class, same answer.
    .replace(/<think>[^]*?<\/think>/g, ' ')
    .replace(/<\/?think>[^]*$/, ' ');
}

/**
 * Strip a title down to a bare name: no Harmony markup, no markdown, no
 * quotes, no trailing punctuation, single-spaced, capped. Returns `''` when
 * nothing legible is left — a pure-`analysis` reply reduces to empty, which is
 * correct, and the caller decides the fallback.
 */
export function sanitizeSessionTitle(raw: string): string {
  const cleaned = stripInlineMarkdown(
    stripHermesToolCalls(stripHarmony(raw))
      .replace(/[\r\n]+/g, ' ')
      .replace(/^\s*(?:title\s*[:\-]\s*)/i, ''),
  )
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
