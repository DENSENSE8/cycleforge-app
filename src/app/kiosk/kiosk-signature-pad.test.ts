/**
 * The signature pad's geometry is a RATIO, and this pins the way that can
 * quietly stop being true.
 *
 * 1. **The class and the law must agree.** Tailwind can only see a literal
 *    (`aspect-[5/1]`), so the token cannot be interpolated from
 *    `SIGNATURE_CAPTURE_ASPECT`. Same split as `KIOSK_POS_AT_MD`, same fix: a
 *    test that reads the literal back out and compares it to the constant.
 * The printed result is measured in `signature-geometry.test.ts`.
 *
 *   npx tsx --test src/app/kiosk/kiosk-signature-pad.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REPAIR_SIGNATURE_GUIDE_CLASS,
  REPAIR_SIGNATURE_PAD_CLASS,
  SIGNATURE_CAPTURE_ASPECT,
} from '@/lib/repair/signature-geometry';
test('the aspect class is exactly the geometry law it mirrors', () => {
  const match = /aspect-\[(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\]/.exec(REPAIR_SIGNATURE_PAD_CLASS);
  assert.ok(match, `${REPAIR_SIGNATURE_PAD_CLASS} carries no aspect literal`);
  assert.equal(Number(match[1]) / Number(match[2]), SIGNATURE_CAPTURE_ASPECT);
  // Wider than tall is the operator's words, and the whole point.
  assert.ok(SIGNATURE_CAPTURE_ASPECT > 1);
  // A ceiling only — it may flatten the pad, never make it taller than wide.
  assert.match(REPAIR_SIGNATURE_PAD_CLASS, /max-h-full/);
  assert.doesNotMatch(REPAIR_SIGNATURE_PAD_CLASS, /\bh-\d/, 'a fixed height is the defect');
});

test('the signable band is most of the pad at every measure', () => {
  const guide = /bottom-\[(\d+)%\]/.exec(REPAIR_SIGNATURE_GUIDE_CLASS);
  assert.ok(guide, 'the ruled guide must sit at a PERCENTAGE, not a px step');
  // `bottom-10` (40px) was a fifth of a 200px pad and nearly half of the fixed
  // one — the customer would have been signing in a third of the box.
  assert.ok(Number(guide[1]) <= 25, `the guide takes ${guide[1]}% of the pad`);
});
