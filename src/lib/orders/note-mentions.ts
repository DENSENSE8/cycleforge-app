/**
 * Order-note @mentions. Encoding (stored verbatim in `order_notes.note_text`):
 *
 *   @[Display Name](staff:42)
 *
 * The name is a render hint only; the id is authoritative. `]` and `(` are not
 * allowed inside the name so the token stays unambiguous to parse.
 */

const MENTION_RE = /@\[([^\]\n(]{1,80})\]\(staff:(\d{1,9})\)/g;

/** Build the stored token for one staff member. */
export function formatNoteMention(name: string, staffId: number): string {
  const safe = name.replace(/[\]\n(]/g, ' ').trim() || `staff ${staffId}`;
  return `@[${safe}](staff:${staffId})`;
}

/** Distinct positive staff ids mentioned in `text`, in first-seen order. */
export function parseNoteMentions(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(MENTION_RE)) {
    const id = Number(m[2]);
    if (id > 0 && !out.includes(id)) out.push(id);
  }
  return out;
}

export type NoteSegment =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; name: string; staffId: number };

/** Split note text into plain runs and mention tokens for rendering. */
export function splitNoteMentions(text: string): NoteSegment[] {
  const out: NoteSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: 'text', text: text.slice(last, at) });
    out.push({ kind: 'mention', name: m[1].trim(), staffId: Number(m[2]) });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

/** Plain-text face of a note (`@Name` instead of the token) — for previews. */
export function noteMentionsToPlain(text: string): string {
  return text.replace(MENTION_RE, (_m, name: string) => `@${name.trim()}`);
}

export interface PickedMention {
  staffId: number;
  name: string;
}

/**
 * The composer edits the friendly face (`@Ana`) and keeps the picked staff
 * beside it; the stored text carries tokens. Decode = stored → face + picks.
 */
export function decodeNoteMentions(text: string): { display: string; picked: PickedMention[] } {
  const picked: PickedMention[] = [];
  const display = text.replace(MENTION_RE, (_m, name: string, id: string) => {
    const staffId = Number(id);
    const clean = name.trim();
    if (!picked.some((p) => p.staffId === staffId)) picked.push({ staffId, name: clean });
    return `@${clean}`;
  });
  return { display, picked };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Encode = face + picks → stored text. Only `@Name` still present (and not followed by a word char) becomes a token. */
export function encodeNoteMentions(display: string, picked: readonly PickedMention[]): string {
  let out = display;
  // Longest names first so "@Ana Maria" wins over "@Ana".
  const sorted = [...picked].sort((a, b) => b.name.length - a.name.length);
  for (const p of sorted) {
    const re = new RegExp(`(^|[^\\w\\]])@${escapeRegExp(p.name)}(?![\\w])(?!\\]\\()`, 'g');
    out = out.replace(re, (_m, lead: string) => `${lead}${formatNoteMention(p.name, p.staffId)}`);
  }
  return out;
}

/** The `@query` being typed at `caret`, or null. `@` must start the text or follow whitespace. */
export function activeMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(before[at - 1])) return null;
  const query = before.slice(at + 1);
  if (query.length > 40 || /[\n@]/.test(query) || /\s{2}/.test(query)) return null;
  return { start: at, query };
}
