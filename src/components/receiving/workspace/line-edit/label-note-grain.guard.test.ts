/**
 * Hard law: the operator's ITEM NOTE and the PRINTED LABEL FACE are two
 * durable columns, and the notes composer may not PATCH the other's column.
 *
 *   receiving_line.notes       — the operator's durable item note (Zoho /
 *                                receive). On Unbox overview the live draft
 *                                also drives the carton sticker center.
 *   receiving_line.label_note  — durable printed face center (Testing reprint,
 *                                LabelEditPopover / As Listed). Stamped from
 *                                the dock draft on Unbox carton print.
 *
 * Until 2026-07-31 these were ONE column (`notes`). Migration
 * `2026-07-31b_receiving_lines_label_note.sql` splits them and backfills
 * `label_note := notes`. Unbox overview (2026-08-04) live-wires the dock draft
 * into the carton face center without re-merging the persist writers.
 *
 * Why a SOURCE guard rather than a behavioral test: the split lives in React
 * controller wiring — which state buffer is handed to which editor, and which
 * column each persist path patches. That is exactly the shape that silently
 * regresses (one identifier swapped back), and it cannot be seen by a unit test
 * of the pure face SoT (`receivingPayloadToFace`), which only ever sees the
 * string it is handed. The same reasoning as `lookup-scan-wiring.guard.test.ts`.
 *
 * Run: `npx tsx --test src/components/receiving/workspace/line-edit/label-note-grain.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

/** Strip comments so prose ABOUT the law can never satisfy the law. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const SCHEMA = code(sourceOf('../../../../lib/drizzle/schema.ts'));
const UNBOX_CONTROLLER = code(sourceOf('./hooks/useUnboxLineController.ts'));
const TESTING_CONTROLLER = code(sourceOf('../../../tech/hooks/useTestingLineController.ts'));
const NOTES_CARD = code(sourceOf('./WorkspaceNotesCard.tsx'));
const PREVIEW = code(sourceOf('../../../labels/LabelFacePreview.tsx'));
const LINES_ROUTE = code(sourceOf('../../../../app/api/receiving-lines/route.ts'));

/**
 * The full argument text of the first call to `name(`, brace/paren-depth aware
 * so a nested call's parens cannot truncate it. The `const name = ...`
 * declaration is skipped.
 */
function firstCallArgs(src: string, name: string): string {
  const needle = `${name}(`;
  let from = 0;
  for (;;) {
    const at = src.indexOf(needle, from);
    if (at === -1) return '';
    from = at + needle.length;
    const before = src.slice(Math.max(0, at - 40), at);
    if (/(?:const|let|var|function)\s+$/.test(before)) continue;

    let depth = 1;
    let i = from;
    for (; i < src.length && depth > 0; i += 1) {
      const ch = src[i];
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
    }
    return src.slice(from, i - 1);
  }
}

/** The body of a `pgTable('<name>', { ... })` declaration. */
function pgTableBody(src: string, tableName: string): string {
  const at = src.indexOf(`pgTable('${tableName}'`);
  if (at === -1) return '';
  const open = src.indexOf('{', at);
  let depth = 1;
  let i = open + 1;
  for (; i < src.length && depth > 0; i += 1) {
    const ch = src[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
  }
  return src.slice(open + 1, i - 1);
}

test('the note/label split lives PER LINE ITEM, never on the carton', () => {
  // A carton-level label note would force every line on a multi-line PO to
  // print the same face — the opposite of the grain this split expresses. A
  // carton-wide remark belongs in receiving_carton.support_notes.
  const line = pgTableBody(SCHEMA, 'receiving_line');
  const carton = pgTableBody(SCHEMA, 'receiving_carton');
  assert.notEqual(line, '', 'expected a receiving_line pgTable');
  assert.notEqual(carton, '', 'expected a receiving_carton pgTable');

  assert.match(line, /label_note/, 'label_note belongs on the LINE');
  assert.doesNotMatch(
    carton,
    /label_note/,
    'label_note must never be hoisted to the carton — see source-of-truth.md → Note vs label grain',
  );
  // The carton keeps its own, differently-grained note fields.
  assert.match(carton, /support_notes/, 'carton-wide remarks stay on support_notes');
});

test('the two buffers hydrate from their OWN columns', () => {
  // An item-note echo must not re-seed the face, and vice versa — so each
  // buffer reads a distinct column.
  assert.match(
    UNBOX_CONTROLLER,
    /useState\(row\.notes \?\? ''\)/,
    'itemNote must hydrate from row.notes',
  );
  assert.match(
    UNBOX_CONTROLLER,
    /useState\(row\.label_note \?\? ''\)/,
    'labelNote must hydrate from row.label_note — not from row.notes',
  );
});

test('the carton label editor is fed the PRINTED buffer, never the item note', () => {
  const args = firstCallArgs(UNBOX_CONTROLLER, 'useCartonLabelEditor');
  assert.notEqual(args, '', 'expected a useCartonLabelEditor call in the unbox controller');
  assert.match(
    args,
    /notes:\s*labelNote\b/,
    'useCartonLabelEditor `notes` IS the printed center slot — pass labelNote',
  );
  assert.doesNotMatch(
    args,
    /notes:\s*(?:itemNote\b|row\.notes)/,
    'feeding the item note to the label editor reprints the exact conflation this split removed',
  );
});

test('Unbox overview carton face center is live-driven by the dock draft', () => {
  // Overview preview + Print · Receive must read itemNote for the center so
  // typing in the dock updates the sticker without waiting for label_note.
  assert.match(
    UNBOX_CONTROLLER,
    /liveCartonPayload/,
    'expected a liveCartonPayload that overrides carton notes with the dock draft',
  );
  assert.match(
    UNBOX_CONTROLLER,
    /notes:\s*itemNote\b/,
    'liveCartonPayload.notes must be the dock draft (itemNote)',
  );
  assert.match(
    UNBOX_CONTROLLER,
    /cartonPayload:\s*liveCartonPayload\b/,
    'labelCtx must use liveCartonPayload so activeLabelFace.center tracks the dock',
  );
});

test('carton print stamps label_note from the dock draft', () => {
  // After overview carton print, Testing / reprint / LabelEditPopover must see
  // the text that just printed — without the notes composer PATCHing label_note.
  assert.match(
    UNBOX_CONTROLLER,
    /persistLabelNote\(itemNote\)/,
    'carton print must stamp label_note from itemNote',
  );
});

test('Testing prints the same face as Unbox', () => {
  // Both surfaces reprint the same carton through one face SoT. If Testing read
  // `notes` while Unbox read `label_note`, the two would print different faces
  // the moment either buffer was edited.
  const args = firstCallArgs(TESTING_CONTROLLER, 'useCartonLabelEditor');
  assert.notEqual(args, '', 'expected a useCartonLabelEditor call in the testing controller');
  assert.match(
    args,
    /notes:\s*\(row\.label_note \|\| ''\)\.trim\(\)/,
    'Testing must seed the carton face from row.label_note',
  );
});

test('each persist path writes only its own column', () => {
  assert.match(
    UNBOX_CONTROLLER,
    /persistLabelNote\s*=[\s\S]{0,220}?core\.patch\(\{\s*label_note/,
    'persistLabelNote must patch label_note',
  );
  assert.match(
    UNBOX_CONTROLLER,
    /persistItemNote\s*=[\s\S]{0,220}?core\.patch\(\{\s*notes/,
    'persistItemNote must patch notes',
  );
});

test('the notes composer never writes the printed face', () => {
  assert.match(NOTES_CARD, /c\.patch\(\{\s*notes:/, 'the composer saves the item note');
  assert.doesNotMatch(
    NOTES_CARD,
    /label_note/,
    'the item-note composer must not touch the printed face column',
  );
  assert.doesNotMatch(
    NOTES_CARD,
    /c\.labelNote\b/,
    'the item-note composer must read itemNote, not the label buffer',
  );
});

test('LabelFacePreview patches text slots instead of rebuilding srcDoc on center change', () => {
  assert.match(
    PREVIEW,
    /patchLabelFaceDocument/,
    'preview must mutate face slots in place for flash-free dock typing',
  );
  // Rebuild effect deps must be matrix/kind identity — not model.center.
  assert.match(
    PREVIEW,
    /matrixValue,\s*model\.matrix\.symbology,\s*model\.matrix\.scale,\s*model\.kind/,
    'full iframe rebuild must key only on matrix/kind identity',
  );
});

test('the line PATCH route accepts label_note as its own field', () => {
  // Without this the label editor's save is silently dropped and the face
  // reverts to the backfilled value on the next hydrate.
  assert.match(
    LINES_ROUTE,
    /\['label_note',\s*String\(body\?\.label_note/,
    'receiving-lines PATCH must carry label_note in its text fields',
  );
  const normalizer = code(
    sourceOf('../../../../lib/receiving/lines/normalize-row.ts'),
  );
  assert.match(
    normalizer,
    /label_note:\s*\(row\.label_note as string \| null\) \?\? null/,
    'normalizeRow must expose label_note so the controller can hydrate it',
  );
});
