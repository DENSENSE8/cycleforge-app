/**
 * Personal MRU phrase bank for Unbox label-note ghost autocomplete.
 *
 * Device-local (`localStorage`) — Command-bar style. Never writes
 * `receiving_line.label_note`; the dock still patches `notes` and print stamps
 * the face.
 */

export const LABEL_NOTE_PHRASES_MAX = 40;
export const LABEL_NOTE_PHRASE_MIN_LEN = 3;

const LABEL_NOTE_PHRASES_STORAGE_KEY = 'unbox:label-note-phrases';
const LABEL_NOTE_PHRASE_MAX_LEN = 200;

export type LabelNotePhraseEntry = {
  phrase: string;
  lastUsedAt: number;
};

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function normalizePhrase(raw: string): string | null {
  const trimmed = raw.trim().slice(0, LABEL_NOTE_PHRASE_MAX_LEN).trim();
  if (trimmed.length < LABEL_NOTE_PHRASE_MIN_LEN) return null;
  return trimmed;
}

/** Coerce unknown storage JSON into a clean MRU list (MRU-first). */
export function parseLabelNotePhrases(raw: unknown): LabelNotePhraseEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: LabelNotePhraseEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const phrase =
      typeof (item as { phrase?: unknown }).phrase === 'string'
        ? normalizePhrase((item as { phrase: string }).phrase)
        : null;
    if (!phrase) continue;
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const lastUsedAt =
      typeof (item as { lastUsedAt?: unknown }).lastUsedAt === 'number' &&
      Number.isFinite((item as { lastUsedAt: number }).lastUsedAt)
        ? (item as { lastUsedAt: number }).lastUsedAt
        : 0;
    out.push({ phrase, lastUsedAt });
    if (out.length >= LABEL_NOTE_PHRASES_MAX) break;
  }
  return out;
}

/**
 * Bump `phrase` to the front of the MRU list (case-insensitive dedupe).
 * Returns the next list; does not touch storage.
 */
export function applyRememberLabelNotePhrase(
  entries: readonly LabelNotePhraseEntry[],
  phrase: string,
  now: number = Date.now(),
): LabelNotePhraseEntry[] {
  const normalized = normalizePhrase(phrase);
  if (!normalized) return [...entries];
  const key = normalized.toLowerCase();
  const rest = entries.filter((e) => e.phrase.toLowerCase() !== key);
  return [{ phrase: normalized, lastUsedAt: now }, ...rest].slice(0, LABEL_NOTE_PHRASES_MAX);
}

/**
 * Case-insensitive prefix match. Prefers extras (session context), then MRU
 * stored entries. Returns the canonical full phrase, or null.
 */
export function matchLabelNotePhraseFrom(
  entries: readonly LabelNotePhraseEntry[],
  input: string,
  extras: readonly (string | null | undefined)[] = [],
): string | null {
  const typed = input; // preserve leading/trailing as typed for prefix length
  if (!typed) return null;

  const typedLower = typed.toLowerCase();
  const candidates: string[] = [];
  const seen = new Set<string>();

  for (const extra of extras) {
    const n = typeof extra === 'string' ? extra.trim() : '';
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(n);
  }

  for (const entry of entries) {
    const key = entry.phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(entry.phrase);
  }

  for (const phrase of candidates) {
    const phraseLower = phrase.toLowerCase();
    if (phraseLower === typedLower) continue; // already complete
    if (!phraseLower.startsWith(typedLower)) continue;
    return phrase;
  }
  return null;
}

function readLabelNotePhrases(): LabelNotePhraseEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(LABEL_NOTE_PHRASES_STORAGE_KEY);
    if (!raw) return [];
    return parseLabelNotePhrases(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

export function rememberLabelNotePhrase(phrase: string): LabelNotePhraseEntry[] {
  const next = applyRememberLabelNotePhrase(readLabelNotePhrases(), phrase);
  if (!isBrowser()) return next;
  try {
    window.localStorage.setItem(LABEL_NOTE_PHRASES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode — in-memory result still returned */
  }
  return next;
}

/** Match against the device bank plus optional live extras (e.g. previous line). */
export function matchLabelNotePhrase(
  input: string,
  extras: readonly (string | null | undefined)[] = [],
): string | null {
  return matchLabelNotePhraseFrom(readLabelNotePhrases(), input, extras);
}

/** Ghost suffix to paint after the typed value (empty when no match).
 *  When `input` is empty and a full preview phrase is supplied as the match
 *  (Recent hover), the whole phrase paints as the placeholder ghost.
 */
export function labelNoteGhostSuffix(input: string, matchedPhrase: string | null): string {
  if (!matchedPhrase) return '';
  if (!input) return matchedPhrase;
  if (matchedPhrase.length <= input.length) return '';
  return matchedPhrase.slice(input.length);
}
