/**
 * The answer's prose, made scannable for triage (operator, 2026-09-27):
 *
 *  - IDENTIFIERS the turn's tools returned (SKU, FNSKU, bin, order, serial…) become
 *    click-to-copy chips. Only those — the set is built from the turn's own
 *    artifact data ({@link answerCopyIds}), never a regex over free text, so a
 *    string that merely looks like a SKU is never offered as one.
 *  - NUMBERS WITH UNITS ("41 units", "2 bins", "$1,200", "35%") and a bare
 *    quantity in parentheses after a value ("C-03-12-3 (41)") turn bold.
 *
 * Pure markdown → markdown: ids are wrapped as inline code (the renderer turns
 * a code span whose text is a known id into a chip) and numbers as `**…**`.
 * Existing code spans and fenced blocks are left untouched.
 */

import type { IdentityIdLabel, SessionArtifact } from './ui-artifacts';

/** An identifier kind the answer copies — the identity header's labels. */
export type AnswerIdKind = IdentityIdLabel;

/** Table columns whose cells are identifiers, by normalized header. */
const ID_COLUMNS: Readonly<Record<string, AnswerIdKind>> = {
  sku: 'SKU',
  fnsku: 'FNSKU',
  bin: 'Bin',
  location: 'Bin',
  lpn: 'LPN',
  upc: 'UPC',
  serial: 'Serial',
  tracking: 'Tracking',
};

/** The kind of identifier a table column holds, or null. */
export function idColumnKind(column: string): AnswerIdKind | null {
  const key = column.toLowerCase().replace(/[^a-z]/g, '');
  return Object.hasOwn(ID_COLUMNS, key) ? ID_COLUMNS[key] : null;
}

/** Shorter values are too likely to collide with ordinary words or numbers. */
const MIN_ID_LENGTH = 3;

/** Every identifier the turn's artifacts carry → its kind. */
export function answerCopyIds(artifacts: readonly SessionArtifact[]): Map<string, AnswerIdKind> {
  const ids = new Map<string, AnswerIdKind>();
  const add = (value: unknown, kind: AnswerIdKind) => {
    if (typeof value !== 'string') return;
    const v = value.trim();
    if (v.length >= MIN_ID_LENGTH && !ids.has(v)) ids.set(v, kind);
  };
  for (const artifact of artifacts) {
    if (artifact.kind !== 'table' && artifact.kind !== 'record') continue;
    for (const id of artifact.identity?.ids ?? []) add(id.value, id.label);
    if (artifact.kind !== 'table') continue;
    for (const column of artifact.columns) {
      const kind = idColumnKind(column);
      if (kind) for (const row of artifact.rows) add(row[column], kind);
    }
  }
  return ids;
}

const UNITS =
  'units?|pcs|pieces?|products?|bins?|SKUs?|LPNs?|boxes|box|orders?|items?|lines?|cartons?|packers?|tickets?|follow-ups?|minutes?|mins?|min|hours?|hrs?|days?|on hand';

/** A number that carries its unit — not a digit run inside an identifier (lookbehind). */
const NUMBER_WITH_UNIT = new RegExp(
  `(?<![\\w\\-*.$/])(?:\\$\\d[\\d,]*(?:\\.\\d+)?|\\d[\\d,]*(?:\\.\\d+)?(?:\\s?%|\\s(?:${UNITS})\\b))(?!\\*)`,
  'gi',
);

/** "(41)" after a value — the quantity the model put beside a bin. */
const PAREN_QTY = /\((\d[\d,]*)\)/g;

/** Code spans and fenced blocks: passed through verbatim. */
const CODE = /(```[\s\S]*?(?:```|$)|`[^`\n]*`)/;

export function emphasizeAnswer(markdown: string, ids: ReadonlyMap<string, AnswerIdKind>): string {
  const idRe =
    ids.size > 0
      ? new RegExp(
          `(?<![\\w\\-/])(${[...ids.keys()]
            .sort((a, b) => b.length - a.length)
            .map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('|')})(?![\\w\\-/])`,
          'g',
        )
      : null;
  return markdown
    .split(CODE)
    .map((part, i) => {
      if (i % 2 === 1) return part;
      let out = part.replace(NUMBER_WITH_UNIT, '**$&**').replace(PAREN_QTY, '(**$1**)');
      if (idRe) out = out.replace(idRe, '`$1`');
      return out;
    })
    .join('');
}
