import { test } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert';

import { bandDecides, deriveStepPassed, passBandLabel, stepValueFields } from './qc-step';

test('band verdict is inclusive at both edges and fails just outside', () => {
  const band = { pass_min: '12', pass_max: '15' };
  strictEqual(deriveStepPassed(band, { valueNum: 12 }), true);
  strictEqual(deriveStepPassed(band, { valueNum: 15 }), true);
  strictEqual(deriveStepPassed(band, { valueNum: 11.99 }), false);
  strictEqual(deriveStepPassed(band, { valueNum: 15.01 }), false);
});

test('an open-ended band judges only its one side', () => {
  strictEqual(deriveStepPassed({ pass_min: 80 }, { valueNum: 80 }), true);
  strictEqual(deriveStepPassed({ pass_min: 80 }, { valueNum: 1e9 }), true);
  strictEqual(deriveStepPassed({ pass_min: 80 }, { valueNum: 79 }), false);
  strictEqual(deriveStepPassed({ pass_max: 3 }, { valueNum: -50 }), true);
  strictEqual(deriveStepPassed({ pass_max: 3 }, { valueNum: 3.5 }), false);
});

test('the band overrides an explicit pass; without a band the explicit answer stands', () => {
  strictEqual(deriveStepPassed({ pass_min: 10 }, { passed: true, valueNum: 5 }), false);
  strictEqual(deriveStepPassed({ pass_min: 10 }, { passed: false, valueNum: 50 }), true);
  strictEqual(deriveStepPassed({}, { passed: false, valueNum: 5 }), false);
  strictEqual(deriveStepPassed({ pass_min: 10 }, { passed: true }), true);
  strictEqual(deriveStepPassed({}, { valueNum: 5 }), null);
});

test('a malformed bound counts as no band', () => {
  strictEqual(deriveStepPassed({ pass_min: 'abc' }, { valueNum: 1 }), null);
  strictEqual(passBandLabel({ pass_min: 'abc' }), null);
});

test('band label covers both sides, one side, and the implied percent unit', () => {
  strictEqual(passBandLabel({ pass_min: '12', pass_max: '15', value_unit: 'V' }), '12–15 V');
  strictEqual(passBandLabel({ pass_min: 80, value_kind: 'PERCENT' }), '≥ 80 %');
  strictEqual(passBandLabel({ pass_max: 3, value_kind: 'NUMBER' }), '≤ 3');
  strictEqual(passBandLabel({ pass_min: 0, pass_max: 0 }), '0–0');
  strictEqual(passBandLabel({ value_kind: 'NUMBER', value_unit: 'V' }), null);
});

test('only a numeric step with a band is judged by its reading', () => {
  strictEqual(bandDecides({ value_kind: 'NUMBER', pass_min: 1 }), true);
  strictEqual(bandDecides({ value_kind: 'NUMBER' }), false);
  strictEqual(bandDecides({ value_kind: 'ENUM', pass_min: 1 }), false);
});

test('a reading maps to the POST field its kind takes', () => {
  deepStrictEqual(stepValueFields({ value_kind: 'PERCENT' }, ' 87.5 '), { ok: true, fields: { valueNum: 87.5 } });
  deepStrictEqual(stepValueFields({ value_kind: 'NUMBER' }, '  '), { ok: false, reason: 'empty' });
  deepStrictEqual(stepValueFields({ value_kind: 'NUMBER' }, '12v'), { ok: false, reason: 'invalid' });
  deepStrictEqual(stepValueFields({ value_kind: 'ENUM' }, ' Grade A '), { ok: true, fields: { valueText: 'Grade A' } });
  deepStrictEqual(stepValueFields({ value_kind: 'TEXT' }, '  '), { ok: true, fields: { valueText: null } });
});
