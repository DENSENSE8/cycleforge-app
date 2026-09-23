/**
 * The signature pad's geometry is a RATIO, and this pins the two ways that can
 * quietly stop being true.
 *
 * 1. **The class and the law must agree.** Tailwind can only see a literal
 *    (`aspect-[5/1]`), so the token cannot be interpolated from
 *    `SIGNATURE_CAPTURE_ASPECT`. Same split as `KIOSK_POS_AT_MD`, same fix: a
 *    test that reads the literal back out and compares it to the constant.
 * 2. **No pad may re-grow a fixed height.** The defect was `PAD_HEIGHT = 200`
 *    applied as an inline `style`, which made the capture aspect a function of
 *    whichever measure the pad happened to be mounted at (operator 2026-09-15:
 *    *"it will display off the page when printed out … more width than
 *    height"*). A height literal back in that component re-opens it.
 *
 * A source-shape test rather than a render test on purpose: this repo has no
 * React test renderer, and the invariant is "which constant owns the geometry".
 * The printed result is measured in `signature-geometry.test.ts`.
 *
 *   npx tsx --test src/app/kiosk/kiosk-signature-pad.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  REPAIR_SIGNATURE_GUIDE_CLASS,
  REPAIR_SIGNATURE_PAD_CLASS,
  SIGNATURE_CAPTURE_ASPECT,
} from '@/lib/repair/signature-geometry';

const PAD = 'src/components/repair/SignaturePad.tsx';
const CANVAS = 'src/components/repair/signature-canvas.ts';
const read = (p: string) => readFileSync(p, 'utf8');

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

test('the pad owns no height of its own, and exports the ink', () => {
  const src = read(PAD);
  assert.doesNotMatch(src, /PAD_HEIGHT/, 'the fixed-height literal is retired');
  assert.doesNotMatch(
    src,
    /style=\{fill \? undefined : \{ height/,
    'an inline pad height is the 2026-09-15 defect',
  );
  assert.match(src, /REPAIR_SIGNATURE_PAD_CLASS/, 'the pad box comes from the repair geometry law');
  assert.match(src, /REPAIR_SIGNATURE_GUIDE_CLASS/, 'the ruled guide comes from the repair geometry law');
  // The export is the crop, not the canvas — `toDataURL` survives only as the
  // no-ink fallback passed into it, and the crop bounds are the geometry law.
  assert.match(src, /exportSignaturePng\(canvas, data/);
  assert.match(read(CANVAS), /signatureInkBox/, 'the crop must come from the geometry law');
  // And the in-canvas caption that ate the band is gone.
  assert.doesNotMatch(src, /Sign above/);
});

/**
 * The deliberate half of the decision the handoff asked for: fullscreen is
 * NOT exempt from the aspect law, and `fillHeight` is not an escape hatch
 * from it either — it survives only so the two fixed-height STAFF wrappers
 * (`RepairIntakeForm`, `RepairPickupFlow`) keep their own layout, which this
 * change was not about. Widening `fill` back to `|| expanded` re-creates the
 * viewport-tall canvas.
 */
test('fullscreen takes the aspect law; only the staff wrappers still fill', () => {
  const src = read(PAD);
  assert.match(
    src,
    /const fill = Boolean\(fillHeight\) && !expanded;/,
    'fullscreen must not re-enter the fill branch',
  );
  assert.doesNotMatch(src, /fillHeight \|\| expanded/, 'that is the tall-canvas defect');
  // Whichever box is chosen, the export is the same crop — the print fix is
  // not variant- or mount-dependent.
  for (const mount of [
    'src/components/repair/RepairIntakeForm.tsx',
    'src/components/repair/RepairPickupFlow.tsx',
  ]) {
    assert.match(read(mount), /fillHeight/, `${mount} is why the prop still exists`);
  }
});
