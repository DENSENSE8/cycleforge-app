import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CONDITION_GRADE_TONE,
  conditionGradeStatusChip,
} from '@/lib/condition-tone';

describe('CONDITION_GRADE_TONE', () => {
  it('active faces stay flat (shadow-none) — same ops-chrome grammar as classify pills', () => {
    for (const [grade, tone] of Object.entries(CONDITION_GRADE_TONE)) {
      assert.match(
        tone.active,
        /\bshadow-none\b/,
        `${grade} active must cite shadow-none`,
      );
      assert.doesNotMatch(
        tone.active,
        /\bshadow-sm\b/,
        `${grade} active must not keep soft drop shadows`,
      );
    }
  });
});

describe('conditionGradeStatusChip', () => {
  it('maps NEW through BRAND_NEW yellow badge + dot', () => {
    const chip = conditionGradeStatusChip('NEW');
    assert.ok(chip);
    assert.equal(chip.label, 'NEW');
    assert.match(chip.toneClass, /bg-yellow-50/);
    assert.match(chip.toneClass, /text-yellow-700/);
    assert.doesNotMatch(chip.toneClass, /\bring-/);
    assert.equal(chip.dotClass, 'bg-yellow-500');
  });

  it('keeps bare USED on the neutral fallback (no A/B/C claim)', () => {
    const chip = conditionGradeStatusChip('USED');
    assert.ok(chip);
    assert.equal(chip.label, 'USED');
    assert.match(chip.toneClass, /text-text-muted/);
    assert.match(chip.dotClass, /bg-slate-700/);
  });

  it('uses graded table faces A/B/C with registered hues', () => {
    const a = conditionGradeStatusChip('USED_A');
    assert.ok(a);
    assert.equal(a.label, 'A');
    assert.match(a.toneClass, /bg-emerald-50/);
    assert.equal(a.dotClass, 'bg-emerald-600');
  });

  it('returns null for empty / dash so callers keep the set control', () => {
    assert.equal(conditionGradeStatusChip(null), null);
    assert.equal(conditionGradeStatusChip(''), null);
    assert.equal(conditionGradeStatusChip('N/A'), null);
    assert.equal(conditionGradeStatusChip('--'), null);
  });
});
