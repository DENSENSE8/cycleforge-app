/**
 * Prose normalizer — generation-side coercion for assistant replies.
 *
 * The display language has a fixed shape (one H2 title, H3 sections, bullets
 * at most two levels deep). Models mostly produce it, but not always: an H1
 * slips out, a list is tab-indented, a list runs straight into a paragraph
 * (GitHub markdown then glues the list onto the paragraph as text), or a
 * third bullet level appears. This module coerces the NEAR-misses without
 * touching anything else — tables, code fences, and inline styles pass
 * through byte-for-byte.
 *
 * Pure string → string, no imports; runs before extractGfmTables in
 * AssistantReply so artifact extraction sees the same text the renderer does.
 */

/** ATX heading at column 0 (GFM: needs a space or end-of-line after #s). */
const HEADING_RE = /^(#{1,6})(\s|$)/;
/** List item with its leading indent captured (bullets and ordered). */
const LIST_RE = /^(\s*)([-*+]|\d{1,9}[.)])(\s|$)/;
/** Fence delimiter at ≤3 leading spaces (``` or ~~~). */
const FENCE_RE = /^\s{0,3}(```|~~~)/;

type LineKind = 'blank' | 'heading' | 'list' | 'other';

function classify(line: string, inFence: boolean): LineKind {
  if (line.trim() === '') return 'blank';
  if (inFence) return 'other';
  if (HEADING_RE.test(line)) return 'heading';
  if (LIST_RE.test(line)) return 'list';
  return 'other';
}

/**
 * Per-line rewrites (clamps and indents). Fenced code is skipped entirely.
 */
function rewriteLine(line: string, inFence: boolean): string {
  if (inFence) return line;
  // H1 clamps to H2; deeper headings are already in contract.
  if (/^#(\s|$)/.test(line)) return `##${line.slice(1)}`;
  if (!LIST_RE.test(line)) return line;
  // Tabs in list indentation → 2 spaces each.
  const detabbed = line.replace(/^\t+/, (tabs) => ' '.repeat(tabs.length * 2));
  const indent = detabbed.length - detabbed.trimStart().length;
  // Bullets deeper than the child tier re-indent to the child tier
  // (level = floor(indent / 2); anything past level 1 is level 1).
  if (Math.floor(indent / 2) >= 2) {
    return `  ${detabbed.trimStart()}`;
  }
  return detabbed;
}

/**
 * Blank-line insertion around heading and list blocks. Adjacent lines of the
 * SAME block kind stay compact (a heading stack, a run of list items);
 * every other transition into or out of a heading/list block gets exactly
 * one blank line, which is what keeps the pass idempotent.
 */
function insertBlanks(lines: string[]): string[] {
  const out: string[] = [];
  let inFence = false;
  let prevKind: LineKind = 'blank';
  for (const line of lines) {
    const kind = classify(line, inFence);
    if (FENCE_RE.test(line)) inFence = !inFence;
    if (kind !== 'blank' && prevKind !== 'blank') {
      const sameBlock =
        (kind === prevKind && (kind === 'heading' || kind === 'list'));
      const crossesBoundary =
        kind === 'heading' || kind === 'list' || prevKind === 'heading' || prevKind === 'list';
      if (crossesBoundary && !sameBlock) out.push('');
    }
    out.push(line);
    prevKind = kind;
  }
  return out;
}

/**
 * Normalize assistant markdown to the display-language contract:
 *  1. any H1 clamps to H2 (deeper headings are untouched);
 *  2. tab indentation in list items becomes 2 spaces;
 *  3. heading and list blocks get a blank line before/after;
 *  4. bullets nested deeper than two levels demote to the child level.
 */
export function normalizeAssistantProse(md: string): string {
  const rewritten: string[] = [];
  let inFence = false;
  for (const line of md.split('\n')) {
    rewritten.push(rewriteLine(line, inFence));
    if (FENCE_RE.test(line)) inFence = !inFence;
  }
  return insertBlanks(rewritten).join('\n');
}
