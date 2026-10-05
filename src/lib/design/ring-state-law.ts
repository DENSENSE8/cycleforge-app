/**
 * RING-STATE LAW: a list item's selected / open / active / current state is
 * painted as GEOMETRY, never as a Tailwind `ring-*`.
 *
 * `ring-*` is a box-shadow painted outside the border box (or, for
 * `ring-inset`, at its edge). Any scroll container — `overflow-y-auto` turns
 * the other axis to `auto` too — clips it, so the selection hairline goes
 * missing at the list's edge. The recipe is a real border on an overlay span
 * inside the item: `STATE_OUTLINE_CLASS` in
 * `src/design-system/components/record-card/record-card-outline.ts`.
 *
 * Pure text audit, line-based, no TypeScript parse (the gate stays
 * sub-second). Consumers:
 *   1. `ring-state-law.test.ts` — the boundaries (verify's *Unit tests*).
 *   2. `scripts/ring-state-guard.ts` — verify `Ring state` (`always`), with the
 *      shrink-only baseline `scripts/ring-state.baseline.json`.
 *
 * A hit is one source LINE that applies a ring utility as a state outline:
 *   - through a state variant: `aria-selected:` `aria-current:` `aria-pressed:`
 *     `aria-checked:` `aria-expanded:`, a data attribute naming a state word
 *     (`data-[state=…]:` `data-[selected…]:` `data-selected:`
 *     `data-[active=true]:` `data-[owns-current=true]:` …), and their `group-`
 *     / `peer-` forms (any `group-aria-*:` / `peer-aria-*:`);
 *   - or as a class string chosen by a state boolean on the same line —
 *     `selected && '…ring…'`, `row.isSelected ? '…ring…' : '…'` (either branch).
 * Not hits: `focus:` / `focus-visible:` / `focus-within:` / `hover:` rings
 * (focus recipes live in `src/design-system/tokens/focus-ring.ts`), static
 * rings, `ring-0`, comments. Escape: `ds-allow-ring: <reason>` on the line or
 * the line above suppresses that line's hit.
 */

/** The fix every refusal prints — one place, so the gate and the test agree. */
export const RING_STATE_FIX =
  'paint state as geometry — an overlay `<span aria-hidden className={cn(STATE_OUTLINE_CLASS, …)} />` (src/design-system/components/record-card/record-card-outline.ts), or `ds-allow-ring: <reason>`';

export const RING_STATE_LAW = `A STATE outline (selected / open / active / current / checked) drawn with Tailwind \`ring-*\` is box-shadow paint: a scroll container clips it, so the hairline goes missing at the list's edge. Fix: ${RING_STATE_FIX}.`;

export interface RingStateHit {
  file: string;
  line: number;
  /** The offending class tokens on the line, in source order. */
  classes: string[];
}

/** Files that state the patterns this scan refuses. */
export const RING_STATE_SCAN_EXEMPT: readonly string[] = [
  'src/lib/design/ring-state-law.ts',
  'src/lib/design/ring-state-law.test.ts',
];

/** Whether a repo-relative source file is subject to the scan. */
export function ringStateScanApplies(file: string): boolean {
  return /^src\/.*\.(ts|tsx)$/.test(file) && !file.endsWith('.d.ts') && !RING_STATE_SCAN_EXEMPT.includes(file);
}

/** The state words a data attribute may carry (`data-[state=open]`, `data-[active=true]`, `data-[owns-current]`, `data-selected`). */
const DATA_STATE = '(?:[\\w-]+-)?(?:state|selected|active|open|checked|current|highlighted|focused|pressed)';
const STATE_ATTRIBUTE = `(?:aria-(?:selected|current|pressed|checked|expanded)|aria-\\[(?:selected|current|pressed|checked|expanded)[^\\]]*\\]|data-${DATA_STATE}|data-\\[${DATA_STATE}[^\\]]*\\])`;
/** A state variant, bare or as `group-*` / `peer-*` (any `group-aria-*`), optionally named (`/card`). */
const STATE_VARIANT_RE = new RegExp(
  `^(?:(?:group|peer)-aria-(?:[\\w-]+|\\[[^\\]]*\\])|(?:(?:group|peer)-)?${STATE_ATTRIBUTE})(?:\\/[\\w-]+)?$`,
);
const INTERACTION_VARIANT_RE = /^(?:(?:group|peer)-)?(?:focus(?:-visible|-within)?|hover)(?:\/[\w-]+)?$/;
const RING_UTILITY_RE = /^ring(?:-.+)?$/;
const RING_NOOP_RE = /^ring(?:-offset)?-0$/;
/** Cheap pre-filter: a `ring` class token somewhere (`string`, `focusRing`, `--focus-ring` are not). */
const RING_WORD_RE = /(?<![\w-])ring(?!\w)/;

const STATE_BOOLEAN =
  '(?:selected|isSelected|active|isActive|open|isOpen|checked|isChecked|current|isCurrent|on|highlighted|focused)';
/** `selected &&` / `row.isSelected ?` — the boolean is the last segment of an optional member chain. */
const STATE_GUARD_RE = new RegExp(
  `(?<![\\w$.])(?:[\\w$]+\\??\\.)*${STATE_BOOLEAN}(?![\\w$])\\s*(?:&&|\\?(?![.?]))\\s*(?=['"\`])`,
  'g',
);
const TOKEN_SPLIT_RE = /[\s'"`{}(),;]+/;

/** Split a class token into its variants and its utility, ignoring `:` inside `[…]`. */
function splitVariants(token: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < token.length; i++) {
    const ch = token[i];
    if (ch === '[') depth++;
    else if (ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === ':' && depth === 0) {
      parts.push(token.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(token.slice(start));
  return parts;
}

type RingKind = 'state-variant' | 'plain' | null;

/** Classify one class token: a ring under a state variant, a plain (variant-free / non-interaction) ring, or neither. */
function classifyRingToken(token: string): RingKind {
  const parts = splitVariants(token);
  const utility = parts.pop()!.replace(/^!|!$/g, '');
  if (!RING_UTILITY_RE.test(utility) || RING_NOOP_RE.test(utility)) return null;
  if (parts.some((v) => INTERACTION_VARIANT_RE.test(v))) return null;
  return parts.some((v) => STATE_VARIANT_RE.test(v)) ? 'state-variant' : 'plain';
}

/** The string / template literal starting at `at` on one line (to the line's end if it never closes). */
function readLiteral(line: string, at: number): { body: string; end: number } {
  const quote = line[at];
  let i = at + 1;
  while (i < line.length && line[i] !== quote) i += line[i] === '\\' ? 2 : 1;
  return { body: line.slice(at + 1, i), end: Math.min(i + 1, line.length) };
}

/**
 * Replace every comment with spaces, keeping newlines and columns, so the
 * scan never reads prose. Strings and templates (with `${…}` nesting) are
 * tracked so a `//` inside a URL is not a comment; a quote string never spans
 * a line, which bounds the damage of an apostrophe in JSX text.
 */
export function blankComments(text: string): string {
  const out = text.split('');
  type Mode = 'code' | 'sq' | 'dq' | 'tpl' | 'line' | 'block';
  let mode: Mode = 'code';
  let brace = 0;
  const interpolations: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    switch (mode) {
      case 'code':
        if (ch === '/' && next === '/') {
          mode = 'line';
          out[i] = out[i + 1] = ' ';
          i++;
        } else if (ch === '/' && next === '*') {
          mode = 'block';
          out[i] = out[i + 1] = ' ';
          i++;
        } else if (ch === "'") mode = 'sq';
        else if (ch === '"') mode = 'dq';
        else if (ch === '`') mode = 'tpl';
        else if (ch === '{') brace++;
        else if (ch === '}') {
          if (interpolations.length > 0 && interpolations[interpolations.length - 1] === brace) {
            interpolations.pop();
            mode = 'tpl';
          } else brace--;
        }
        break;
      case 'line':
        if (ch === '\n') mode = 'code';
        else out[i] = ' ';
        break;
      case 'block':
        if (ch === '*' && next === '/') {
          out[i] = out[i + 1] = ' ';
          i++;
          mode = 'code';
        } else if (ch !== '\n') out[i] = ' ';
        break;
      case 'sq':
      case 'dq':
        if (ch === '\\' && next !== '\n') i++;
        else if (ch === '\n' || ch === (mode === 'sq' ? "'" : '"')) mode = 'code';
        break;
      case 'tpl':
        if (ch === '\\') i++;
        else if (ch === '`') mode = 'code';
        else if (ch === '$' && next === '{') {
          interpolations.push(brace);
          i++;
          mode = 'code';
        }
        break;
    }
  }
  return out.join('');
}

const ESCAPE_RE = /ds-allow-ring:(.*)$/;

/** `ds-allow-ring: <reason>` — a bare tag with no reason is not an escape. */
function hasRingEscape(line: string | undefined): boolean {
  const m = line === undefined ? null : ESCAPE_RE.exec(line);
  if (!m) return false;
  return m[1].replace(/\*\/.*$/, '').replace(/[\s}]+$/, '').trim().length > 0;
}

/** Ring state outlines on one comment-blanked line. */
function ringStateClasses(code: string): string[] {
  const found = new Set<string>();
  for (const token of code.split(TOKEN_SPLIT_RE)) {
    if (token.includes(':') && classifyRingToken(token) === 'state-variant') found.add(token);
  }
  for (const guard of code.matchAll(STATE_GUARD_RE)) {
    const consequent = readLiteral(code, guard.index + guard[0].length);
    const bodies = [consequent.body];
    if (!guard[0].includes('&&')) {
      const alternate = /^\s*:\s*(?=['"`])/.exec(code.slice(consequent.end));
      if (alternate) bodies.push(readLiteral(code, consequent.end + alternate[0].length).body);
    }
    for (const body of bodies) {
      for (const token of body.split(TOKEN_SPLIT_RE)) {
        if (token && classifyRingToken(token) !== null) found.add(token);
      }
    }
  }
  return [...found];
}

/** Pure text audit of one file — no fs, so the test and the guard share one implementation. */
export function auditRingStateSource(file: string, text: string): RingStateHit[] {
  if (!ringStateScanApplies(file) || !RING_WORD_RE.test(text)) return [];
  const raw = text.split('\n');
  const code = blankComments(text).split('\n');
  const hits: RingStateHit[] = [];
  for (let i = 0; i < code.length; i++) {
    if (!RING_WORD_RE.test(code[i])) continue;
    const classes = ringStateClasses(code[i]);
    if (classes.length === 0) continue;
    if (hasRingEscape(raw[i]) || hasRingEscape(raw[i - 1])) continue;
    hits.push({ file, line: i + 1, classes });
  }
  return hits;
}

/** One-line face of a hit: file:line, the offending class, the fix. */
export function formatRingStateHit(hit: RingStateHit): string {
  return `${hit.file}:${hit.line} — ${hit.classes.map((c) => `\`${c}\``).join(' ')} — ${RING_STATE_FIX}`;
}

// ── Shrink-only baseline ────────────────────────────────────────────────────

export interface RingStateBaseline {
  files: Record<string, number>;
}

export interface RingStateFinding {
  severity: 'error' | 'advisory';
  file: string;
  message: string;
  /** Every current hit in the file — the new one is among them. */
  hits: RingStateHit[];
}

export function countRingStateHits(hits: readonly RingStateHit[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const hit of hits) counts[hit.file] = (counts[hit.file] ?? 0) + 1;
  return counts;
}

/** New file or a count increase → error; a count drop → advisory: shrink the baseline. */
export function compareRingStateBaseline(
  hits: readonly RingStateHit[],
  baseline: RingStateBaseline,
): RingStateFinding[] {
  const counts = countRingStateHits(hits);
  const findings: RingStateFinding[] = [];
  const files = new Set([...Object.keys(counts), ...Object.keys(baseline.files)]);
  for (const file of [...files].sort()) {
    const now = counts[file] ?? 0;
    const frozen = baseline.files[file] ?? 0;
    const inFile = hits.filter((h) => h.file === file);
    if (now > frozen) {
      findings.push({
        severity: 'error',
        file,
        message:
          frozen === 0
            ? `${now} ring state outline(s) in a file outside the baseline.`
            : `${now} ring state outline(s), baseline ${frozen} — the new one(s) must not ship.`,
        hits: inFile,
      });
    } else if (now < frozen) {
      findings.push({
        severity: 'advisory',
        file,
        message: `${now} ring state outline(s), baseline ${frozen} — shrink the baseline (tsx scripts/ring-state-guard.ts --write-baseline).`,
        hits: inFile,
      });
    }
  }
  return findings;
}
