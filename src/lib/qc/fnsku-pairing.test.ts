import { test } from 'node:test';
import { deepEqual, deepStrictEqual, equal } from 'node:assert/strict';

import type { QcFnskuCandidate } from './fnsku-pairing';
import { qcFnskuFace, rankQcFnskuCandidates, resolveQcFnsku } from './fnsku-pairing';

const SKU = 306;
const candidate = (over: Partial<QcFnskuCandidate>): QcFnskuCandidate => ({
  fnsku: 'X0TEST00000',
  product_title: 'Bose Companion 2 Series III',
  asin: 'B0D123456X',
  sku: '00072-BK',
  condition: 'B+ Used - Very Good',
  label_mark: null,
  paired_to: SKU,
  paired_grade: 'USED_B',
  ...over,
});

test('paired: the FNSKU bound to exactly (SKU, unit grade)', () => {
  const rows = [
    candidate({ fnsku: 'X0A', paired_grade: 'USED_A' }),
    candidate({ fnsku: 'X0B', paired_grade: 'USED_B' }),
  ];
  deepStrictEqual(resolveQcFnsku(rows, SKU, 'USED_B'), { kind: 'paired', candidate: rows[1] });
  deepStrictEqual(resolveQcFnsku(rows, SKU, 'USED_A'), { kind: 'paired', candidate: rows[0] });
});

test('the Amazon condition words never decide — only the explicit grade pairing does', () => {
  // condition says "Used - Good" (≈ USED_B) but the pairing binds it to LIKE_NEW
  const rows = [candidate({ condition: 'B Used - Good', paired_grade: 'LIKE_NEW' })];
  equal(resolveQcFnsku(rows, SKU, 'USED_B').kind, 'unpaired');
  equal(resolveQcFnsku(rows, SKU, 'LIKE_NEW').kind, 'paired');
});

test('legacy SKU-only pairing (no grade) and other SKUs never auto-print', () => {
  equal(resolveQcFnsku([candidate({ paired_grade: null })], SKU, 'USED_B').kind, 'unpaired');
  equal(resolveQcFnsku([candidate({ paired_to: 999 })], SKU, 'USED_B').kind, 'unpaired');
});

test('no catalog row or no grade → unpaired', () => {
  equal(resolveQcFnsku([candidate({})], null, 'USED_B').kind, 'unpaired');
  equal(resolveQcFnsku([candidate({})], SKU, null).kind, 'unpaired');
  equal(resolveQcFnsku(null, SKU, 'USED_B').kind, 'unpaired');
});

test('rank: paired-at-grade, then this SKU, then search hits; server order inside a group', () => {
  const rows = [
    candidate({ fnsku: 'X0HIT1', paired_to: null, paired_grade: null }),
    candidate({ fnsku: 'X0SKU', paired_grade: 'USED_A' }),
    candidate({ fnsku: 'X0HIT2', paired_to: 777, paired_grade: 'USED_B' }),
    candidate({ fnsku: 'X0GRADE', paired_grade: 'USED_B' }),
    candidate({ fnsku: '  ' }),
  ];
  deepEqual(
    rankQcFnskuCandidates(rows, SKU, 'USED_B').map((c) => c.fnsku),
    ['X0GRADE', 'X0SKU', 'X0HIT1', 'X0HIT2'],
  );
});

test('qcFnskuFace: title falls back to the line title; mark rides along', () => {
  deepStrictEqual(qcFnskuFace(candidate({ product_title: null, label_mark: 'Black' }), 'Line title'), {
    fnsku: 'X0TEST00000',
    title: 'Line title',
    condition: 'B+ Used - Very Good',
    mark: 'Black',
  });
});
