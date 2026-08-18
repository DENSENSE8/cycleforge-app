/**
 * Hard law: the photo-aspect vocabulary is declared ONCE, in two places that
 * must agree byte-for-byte.
 *
 * `PHOTO_ASPECTS` (TypeScript) and the `photos_photo_aspect_chk` CHECK list
 * (SQL) are the same vocabulary written twice, because neither language can
 * read the other. That is the exact shape of drift this repo has paid for
 * before — `reason_codes_flow_context_chk` was redefined by five migrations,
 * several of which dropped values a previous one added, and only the
 * last-sorting filename happening to re-affirm the full union saved it
 * (`.claude/rules/polymorphic-tables.md`).
 *
 * A drift here is not a type error, it is a 500 at the write waist for exactly
 * the aspects one side knows about — so it is caught here, in CI, and never at
 * the bench.
 *
 * Run: `node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *        --test src/lib/photos/photo-aspect-vocabulary.guard.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ASPECTS_BY_STAGE,
  PHOTO_ASPECTS,
  isAspectLegalForStage,
  parsePhotoAspect,
  parsePhotoAspectList,
  photoAspectLabel,
  type PhotoAspect,
} from './photo-aspects';
import { PHOTO_EVIDENCE_STAGES } from './stages';

const MIGRATION = join(
  fileURLToPath(new URL('../..', import.meta.url)),
  'lib/migrations/2026-08-01b_photo_aspect.sql',
);

/**
 * The values inside `CHECK (… photo_aspect IN ( … ))`.
 *
 * Read from the birth migration by name rather than "whichever file mentions
 * photo_aspect": a later migration that legitimately extends the vocabulary
 * must extend THIS list too (the runner makes applied files immutable, so an
 * extension is a new file — and that new file's job is to redefine the whole
 * constraint, which is why re-affirming the full union is the convention).
 */
function checkListInMigration(): string[] {
  const sql = readFileSync(MIGRATION, 'utf8');
  const m = /photo_aspect\s+IN\s*\(([^)]*)\)/i.exec(sql);
  assert.ok(m, `no "photo_aspect IN ( … )" CHECK found in ${MIGRATION}`);
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}

test('the TS union and the DB CHECK list are the same vocabulary', () => {
  const inSql = checkListInMigration();
  assert.deepEqual(
    [...inSql].sort(),
    [...PHOTO_ASPECTS].sort(),
    'PHOTO_ASPECTS and photos_photo_aspect_chk disagree. Extend BOTH in one change — ' +
      'a value only TypeScript knows 500s at the write waist; a value only Postgres ' +
      'knows is unreachable and reads as supported.',
  );
});

test('the CHECK list has no duplicates', () => {
  const inSql = checkListInMigration();
  assert.equal(new Set(inSql).size, inSql.length, `duplicate value in the CHECK list: ${inSql}`);
});

test('every aspect is legal for at least one stage', () => {
  for (const aspect of PHOTO_ASPECTS) {
    const stages = PHOTO_EVIDENCE_STAGES.filter((s) => isAspectLegalForStage(aspect, s));
    assert.ok(
      stages.length > 0,
      `"${aspect}" is declared but legal nowhere — the write waist would 400 every ` +
        'attempt to use it, so it is vocabulary that reads as supported and is not.',
    );
  }
});

test('every stage names only declared aspects', () => {
  for (const stage of PHOTO_EVIDENCE_STAGES) {
    for (const aspect of ASPECTS_BY_STAGE[stage]) {
      assert.ok(
        (PHOTO_ASPECTS as readonly string[]).includes(aspect),
        `stage "${stage}" allows "${aspect}", which is not in PHOTO_ASPECTS`,
      );
    }
    assert.equal(
      new Set(ASPECTS_BY_STAGE[stage]).size,
      ASPECTS_BY_STAGE[stage].length,
      `stage "${stage}" lists an aspect twice`,
    );
  }
});

test('the arrival stage carries only PRE-OPENING aspects', () => {
  // `arrival_package` is the only stage the `require_one` receive gate counts.
  // An interior or item aspect there would describe a photo taken after the box
  // was open, which is the control that gate exists to be.
  assert.deepEqual([...ASPECTS_BY_STAGE.arrival_package].sort(), [
    'box_exterior',
    'shipping_label',
  ]);
});

test('every aspect has a label — no call site types one', () => {
  for (const aspect of PHOTO_ASPECTS) {
    const label = photoAspectLabel(aspect);
    assert.ok(label && label.trim() === label && label.length > 0, `no label for "${aspect}"`);
  }
});

test('parsePhotoAspect has NO default — unknown is null', () => {
  for (const raw of ['', '   ', 'nope', 'SHIPPING-LABEL', 'receiving_package', null, undefined]) {
    assert.equal(
      parsePhotoAspect(raw),
      null,
      `parsePhotoAspect(${JSON.stringify(raw)}) must be null. An aspect is a CLAIM about ` +
        'what a photo shows; a defaulted claim is the bug that shipped twice here ' +
        '(intakeSurface, scanKind).',
    );
  }
  assert.equal(parsePhotoAspect('  Shipping_Label '), 'shipping_label', 'trim + lowercase only');
});

test('parsePhotoAspectList drops unknowns instead of defaulting them', () => {
  assert.deepEqual(parsePhotoAspectList('included, serial'), ['included', 'serial']);
  assert.deepEqual(parsePhotoAspectList('included, nope, serial'), ['included', 'serial']);
  assert.deepEqual(parsePhotoAspectList('included included'), ['included'], 'set, not a bag');
  assert.deepEqual(parsePhotoAspectList(''), []);
  assert.deepEqual(parsePhotoAspectList('nope'), [], 'a fully junk list is empty, not a default');
});

test('the org default for required item aspects is legal on the item stage', () => {
  // The registry ships `included,serial`; both must be item-stage aspects or the
  // shipped default makes `item_photos` un-completable.
  for (const aspect of ['included', 'serial'] as PhotoAspect[]) {
    assert.ok(
      isAspectLegalForStage(aspect, 'unbox_item'),
      `the shipped default requires "${aspect}", which is illegal on unbox_item`,
    );
  }
});
